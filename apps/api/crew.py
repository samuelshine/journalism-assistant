"""Desk Chief routing — the top-level 'auto-pilot' mode. One fast
classification call decides which specialist(s) handle a request and in
what order; then each runs its full orchestrator.run() loop in sequence,
with a HandoffEvent marking every transition and each agent's output
threaded forward as context for the next. This is what makes 'agent' mean
a crew with defined roles, not one model wearing different hats.
"""
from __future__ import annotations

import json
import re
import uuid
from typing import AsyncIterator

import agents
import ollama_client
import orchestrator
from events import BaseEvent, HandoffEvent, ModelSelectedEvent, RouteDecidedEvent, ThinkingEvent
from orchestrator import SourceRegistry
from router import select_model

MAX_CREW_SIZE = 4
DEFAULT_PLAN = ["researcher"]

ROUTER_SYSTEM_PROMPT = """You are a routing classifier for a newsroom desk. Given a request, \
decide which specialist(s) should handle it, in order. Available specialists:

- scout: what's happening right now on a topic — live news checking, "is this a story today"
- researcher: builds a sourced background dossier, timeline, or context pack
- factchecker: verifies specific claims in a given piece of text as Supported/Contested/Unverified
- interviewer: prepares interview questions about a subject (usually needs a dossier first)
- editor: shapes a draft into headline/lede/structure (usually needs source material first)
- ethicist: reviews a draft for loaded language, sourcing gaps, privacy/fairness issues

Typical patterns: a bare research question -> ["researcher"]. "is X happening / trending" -> \
["scout"]. "check this draft for accuracy" -> ["factchecker"]. "prep interview questions about \
X" -> ["researcher", "interviewer"]. "turn this into a story" / "write this up" -> \
["researcher", "editor"]. "write this up and make sure it's clean" -> \
["researcher", "editor", "ethicist"]. Never chain more than 3 specialists. If genuinely \
unclear, default to ["researcher"].

Respond with ONLY a JSON object, no other text: {"agents": ["id", ...], "rationale": "one short sentence"}"""


def _parse_route(raw: str) -> tuple[list[str], str]:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return DEFAULT_PLAN, "Could not parse a routing decision — defaulting to Researcher."
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return DEFAULT_PLAN, "Could not parse a routing decision — defaulting to Researcher."

    routable = set(agents.AGENTS) - {"desk_chief"}
    chosen = [a for a in data.get("agents", []) if a in routable]
    # dedupe while preserving order, cap length
    seen: set[str] = set()
    deduped = []
    for a in chosen:
        if a not in seen:
            deduped.append(a)
            seen.add(a)
    deduped = deduped[:MAX_CREW_SIZE]

    rationale = str(data.get("rationale", "")).strip() or "Routed based on the request."
    return deduped or DEFAULT_PLAN, rationale


async def decide_route(prompt: str) -> tuple[list[str], str]:
    model, _ = select_model("route")
    response = await ollama_client.chat(
        model,
        [
            {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    raw = response.get("message", {}).get("content", "")
    return _parse_route(raw)


def _build_subprompt(original: str, idx: int, plan: list[str], prior_outputs: dict[str, str]) -> str:
    if idx == 0:
        return original
    prev_id = plan[idx - 1]
    prev_agent = agents.get(prev_id)
    prev_text = prior_outputs.get(prev_id, "")
    return (
        f"{original}\n\n---\n"
        f"Here is the {prev_agent.name}'s output to work from — use it, don't redo their work:\n\n"
        f"{prev_text}"
    )


async def run_crew(prompt: str, run_id: str | None = None) -> AsyncIterator[BaseEvent]:
    run_id = run_id or uuid.uuid4().hex[:12]
    chief_model, chief_rationale = select_model("route")

    yield ModelSelectedEvent(run_id=run_id, agent="desk_chief", model=chief_model, task_kind="route", rationale=chief_rationale)
    yield ThinkingEvent(run_id=run_id, agent="desk_chief", text="Reading the request and deciding who on the desk handles it…")

    plan, rationale = await decide_route(prompt)
    yield RouteDecidedEvent(run_id=run_id, chosen=plan, rationale=rationale)

    prior_outputs: dict[str, str] = {}
    prev_agent_id = "desk_chief"
    shared_registry = SourceRegistry()
    for idx, agent_id in enumerate(plan):
        agent = agents.get(agent_id)
        yield HandoffEvent(
            run_id=run_id,
            from_agent=prev_agent_id,
            to_agent=agent.id,
            reason=rationale if idx == 0 else f"next in the pipeline after {agents.get(prev_agent_id).name}",
        )
        sub_prompt = _build_subprompt(prompt, idx, plan, prior_outputs)
        async for event in orchestrator.run(sub_prompt, agent, run_id=run_id, registry=shared_registry):
            yield event
            if event.type == "answer_done":
                prior_outputs[agent.id] = event.text
        prev_agent_id = agent.id
