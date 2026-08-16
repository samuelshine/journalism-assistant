"""Typed SSE event schema — the contract between the orchestrator loop and
the Trace pane. Every event the agent loop emits is one of these. Keep this
file the single source of truth; the frontend TypeScript types mirror it by
hand (apps/web/src/types/events.ts) since the surface is small and stable.
"""
from __future__ import annotations

import time
from typing import Any, Literal

from pydantic import BaseModel, Field


def _now() -> float:
    return time.time()


class BaseEvent(BaseModel):
    type: str
    run_id: str
    ts: float = Field(default_factory=_now)


class ThinkingEvent(BaseEvent):
    """Model is reasoning before deciding on an action."""

    type: Literal["thinking"] = "thinking"
    agent: str
    text: str


class ToolCallEvent(BaseEvent):
    """Agent decided to call a tool. Emitted before the call executes."""

    type: Literal["tool_call"] = "tool_call"
    agent: str
    step: int
    tool: str
    args: dict[str, Any]
    cost_hint: str | None = None


class ToolResultEvent(BaseEvent):
    """Result of a tool call. `ok=False` -> error surfaced verbatim, never hidden."""

    type: Literal["tool_result"] = "tool_result"
    agent: str
    step: int
    tool: str
    ok: bool
    summary: str
    sources: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None


class HandoffEvent(BaseEvent):
    """One agent hands the task to another (Phase 2+)."""

    type: Literal["handoff"] = "handoff"
    from_agent: str
    to_agent: str
    reason: str


class ModelSelectedEvent(BaseEvent):
    """Router picked a model for this step — the badge shown in the UI."""

    type: Literal["model_selected"] = "model_selected"
    agent: str
    model: str
    task_kind: str
    rationale: str


class AnswerTokenEvent(BaseEvent):
    """Streamed token of the final answer."""

    type: Literal["answer_token"] = "answer_token"
    agent: str
    text: str


class AnswerDoneEvent(BaseEvent):
    """Final answer complete. Carries the full text + resolved claim/source map."""

    type: Literal["answer_done"] = "answer_done"
    agent: str
    text: str
    sources: list[dict[str, Any]] = Field(default_factory=list)


class ErrorEvent(BaseEvent):
    type: Literal["error"] = "error"
    message: str
    fatal: bool = False


class RunDoneEvent(BaseEvent):
    type: Literal["run_done"] = "run_done"
    steps: int
    tool_calls: int


AgentEvent = (
    ThinkingEvent
    | ToolCallEvent
    | ToolResultEvent
    | HandoffEvent
    | ModelSelectedEvent
    | AnswerTokenEvent
    | AnswerDoneEvent
    | ErrorEvent
    | RunDoneEvent
)


def sse_format(event: BaseEvent) -> dict[str, str]:
    """Shape for sse_starlette: {"event": <type>, "data": <json>}."""
    return {"event": event.type, "data": event.model_dump_json()}
