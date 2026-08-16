"""The agent loop. This is the file the whole app exists to make visible:
plan -> call tool -> observe -> (repeat) -> answer, with every step emitted
as a typed event before, during, and after it happens.

Deliberately hand-rolled against Ollama's chat API rather than routed
through an agent framework — a framework would hide exactly the mechanism
this app is built to teach.
"""
from __future__ import annotations

import json
import re
import uuid
from typing import Any, AsyncIterator

import config
import ollama_client
from agents import Agent
from events import (
    AnswerDoneEvent,
    BaseEvent,
    ErrorEvent,
    ModelSelectedEvent,
    RunDoneEvent,
    ThinkingEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from router import select_model
from store import memory
from tools import fixtures
from tools.base import Source, ToolResult
from tools.registry import available, dispatch, schemas_for


class SourceRegistry:
    """Stable, run-scoped numbering for citations. First-seen order, deduped
    by URL, so the model's [n] references stay consistent across the whole
    run even as later tool calls add more sources."""

    def __init__(self) -> None:
        self._by_url: dict[str, int] = {}
        self._sources: list[Source] = []

    def add_many(self, sources: list[Source]) -> list[tuple[int, Source]]:
        added = []
        for s in sources:
            if not s.url or s.url in self._by_url:
                continue
            self._sources.append(s)
            idx = len(self._sources)
            self._by_url[s.url] = idx
            added.append((idx, s))
        return added

    def all(self) -> list[tuple[int, Source]]:
        return list(enumerate(self._sources, start=1))

    def as_dicts(self) -> list[dict[str, Any]]:
        return [{"index": i, **s.to_dict()} for i, s in self.all()]


_LEAKED_TOOL_CALL_RE = re.compile(r'</?tool_call>|\{\s*"name"\s*:\s*"')


def _looks_like_leaked_tool_call(text: str) -> bool:
    """Ollama's chat template is supposed to parse a tool-call attempt into
    message.tool_calls, never into plain content — but a malformed attempt
    (confirmed live: qwen2.5:14b emitting raw '{"name": ..., "arguments":
    ...}' JSON plus stray tokens, wrapped in a literal </tool_call>) can
    leak through as ordinary text instead. Treating that as a real answer
    would surface garbage to the user with no indication anything went
    wrong — worth catching and retrying the same way a genuinely empty
    completion already is."""
    return bool(_LEAKED_TOOL_CALL_RE.search(text))


def _tool_result_content(summary: str, ok: bool, error: str | None, cited: list[tuple[int, Source]]) -> str:
    lines = [summary if ok else f"FAILED: {error or summary}"]
    if cited:
        lines.append("")
        lines.append("New sources you can now cite by number:")
        for idx, src in cited:
            lines.append(f"[{idx}] {src.title} — {src.url}")
    return "\n".join(lines)


async def run(
    prompt: str, agent: Agent, run_id: str | None = None, registry: SourceRegistry | None = None
) -> AsyncIterator[BaseEvent]:
    """registry: pass a shared SourceRegistry when chaining agents (see
    crew.py) so citation numbers stay unique across the whole pipeline —
    without this, a second agent's sources would restart at [1] and
    collide with the first agent's [1] in the combined evidence view."""
    run_id = run_id or uuid.uuid4().hex[:12]
    registry = registry if registry is not None else SourceRegistry()
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": agent.system_prompt},
        {"role": "user", "content": prompt},
    ]
    schemas = schemas_for(agent.tools)
    tool_calls_used = 0
    step = 0
    # A 14B model under deadline pressure will sometimes retry an identical
    # call (same tool, same args) hoping for a different answer — that just
    # burns tool budget and, worse, can re-trip an external rate limit
    # (observed live with GDELT). Serve repeats from this run's own cache
    # instead of re-dispatching, and don't charge them against the budget.
    call_cache: dict[tuple[str, str], ToolResult] = {}

    try:
        for iteration in range(config.MAX_AGENT_ITERATIONS):
            task_kind = "plan" if iteration == 0 else "reason"
            model, rationale = select_model(task_kind)  # type: ignore[arg-type]
            yield ModelSelectedEvent(run_id=run_id, agent=agent.id, model=model, task_kind=task_kind, rationale=rationale)
            yield ThinkingEvent(run_id=run_id, agent=agent.id, text="Deciding next step…")

            budget_left = config.MAX_TOOL_CALLS_PER_RUN - tool_calls_used
            active_schemas = schemas if budget_left > 0 else []

            # Rare but real: the model occasionally returns a genuinely
            # empty completion — no content, no tool_calls, but a non-zero
            # eval_count (confirmed live via dress-rehearsal debugging: it
            # generated ~170 tokens that never surfaced as content). Most
            # consistent explanation is a malformed tool-call attempt Ollama's
            # template silently drops. A same-conditions retry reproduces the
            # same failure; dropping the tools schema on retry — we only need
            # plain text at this point anyway — reliably breaks the loop.
            #
            # A related failure (also confirmed live, on the Interviewer):
            # the malformed attempt isn't always dropped — sometimes it leaks
            # through as content instead, e.g. raw '{"name": "wikidata_entity",
            # "arguments": {...}}' text wrapped in a literal </tool_call>.
            # That's not a real answer either, so it gets the same retry.
            message, tool_calls, text = {}, [], ""
            nudged = False
            for attempt in range(3):
                retry_schemas = [] if attempt > 0 else active_schemas
                response = await ollama_client.chat(model, messages, tools=retry_schemas)
                message = response.get("message", {})
                tool_calls = message.get("tool_calls") or []
                text = message.get("content", "").strip()
                usable = bool(tool_calls) or (bool(text) and not _looks_like_leaked_tool_call(text))
                if usable:
                    if nudged:
                        messages.pop()  # drop the nudge — the real turn continues normally from here
                    break
                if attempt < 2:
                    reason = "Got a garbled response — asking again…" if text else "Got an empty response — asking again…"
                    yield ThinkingEvent(run_id=run_id, agent=agent.id, text=reason)
                    if not nudged:
                        messages.append({"role": "user", "content": "Please provide your answer now, in plain text."})
                        nudged = True
            else:
                yield ErrorEvent(run_id=run_id, message="Model returned an unusable answer after 3 attempts.", fatal=True)
                break

            if not tool_calls and text:
                yield AnswerDoneEvent(run_id=run_id, agent=agent.id, text=text, sources=registry.as_dicts())
                await memory.save(run_id, agent.id, text)
                break

            messages.append({"role": "assistant", "content": message.get("content", ""), "tool_calls": tool_calls})

            for tc in tool_calls:
                fn = tc.get("function", {})
                name = fn.get("name", "")
                args = fn.get("arguments", {}) or {}
                cache_key = (name, json.dumps(args, sort_keys=True, default=str))
                repeated = cache_key in call_cache

                if not repeated and tool_calls_used >= config.MAX_TOOL_CALLS_PER_RUN:
                    messages.append(
                        {"role": "tool", "content": "Tool budget for this run is exhausted — answer with what you have."}
                    )
                    continue

                step += 1
                tool = next((t for t in available(agent.tools) if t.name == name), None)
                is_demo_fixture = (
                    not repeated and config.DEMO_MODE and fixtures.lookup(name, args) is not None
                )

                if repeated:
                    cost_hint = "repeated call — reusing prior result, no new network cost"
                elif is_demo_fixture:
                    cost_hint = "🎬 Demo Mode — served from a recorded fixture, no live network call"
                else:
                    cost_hint = tool.cost_hint if tool else None

                yield ToolCallEvent(run_id=run_id, agent=agent.id, step=step, tool=name, args=args, cost_hint=cost_hint)

                if repeated:
                    result = call_cache[cache_key]
                else:
                    result = await dispatch(name, args)
                    call_cache[cache_key] = result
                    tool_calls_used += 1
                cited = registry.add_many(result.sources)

                yield ToolResultEvent(
                    run_id=run_id,
                    agent=agent.id,
                    step=step,
                    tool=name,
                    ok=result.ok,
                    summary=result.summary,
                    sources=[{"index": i, **s.to_dict()} for i, s in cited],
                    error=result.error,
                )

                messages.append(
                    {
                        "role": "tool",
                        "content": _tool_result_content(result.summary, result.ok, result.error, cited),
                    }
                )
        else:
            yield ErrorEvent(run_id=run_id, message="Hit the iteration limit before reaching a final answer.", fatal=True)
    except Exception as e:  # noqa: BLE001 - surface any failure to the trace instead of a bare 500
        yield ErrorEvent(run_id=run_id, message=f"Run failed: {e}", fatal=True)
        return

    yield RunDoneEvent(run_id=run_id, steps=step, tool_calls=tool_calls_used)
