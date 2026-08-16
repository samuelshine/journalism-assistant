"""The agent loop. This is the file the whole app exists to make visible:
plan -> call tool -> observe -> (repeat) -> answer, with every step emitted
as a typed event before, during, and after it happens.

Deliberately hand-rolled against Ollama's chat API rather than routed
through an agent framework — a framework would hide exactly the mechanism
this app is built to teach.
"""
from __future__ import annotations

import json
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


def _tool_result_content(summary: str, ok: bool, error: str | None, cited: list[tuple[int, Source]]) -> str:
    lines = [summary if ok else f"FAILED: {error or summary}"]
    if cited:
        lines.append("")
        lines.append("New sources you can now cite by number:")
        for idx, src in cited:
            lines.append(f"[{idx}] {src.title} — {src.url}")
    return "\n".join(lines)


async def run(prompt: str, agent: Agent, run_id: str | None = None) -> AsyncIterator[BaseEvent]:
    run_id = run_id or uuid.uuid4().hex[:12]
    registry = SourceRegistry()
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
            response = await ollama_client.chat(model, messages, tools=active_schemas)
            message = response.get("message", {})
            tool_calls = message.get("tool_calls") or []

            if not tool_calls:
                text = message.get("content", "").strip()
                if not text:
                    yield ErrorEvent(run_id=run_id, message="Model returned an empty answer.", fatal=True)
                    break
                yield AnswerDoneEvent(run_id=run_id, agent=agent.id, text=text, sources=registry.as_dicts())
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

                yield ToolCallEvent(
                    run_id=run_id,
                    agent=agent.id,
                    step=step,
                    tool=name,
                    args=args,
                    cost_hint="repeated call — reusing prior result, no new network cost" if repeated else (tool.cost_hint if tool else None),
                )

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
