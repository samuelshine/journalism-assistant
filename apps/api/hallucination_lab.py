"""Hallucination Lab — the same question asked two ways, side by side: once
with no tools (the model answering purely from training data, the way a
bare chatbot would), once through the Researcher (grounded, cited, tool-
verified). This is the single clearest demonstration of what 'agentic'
actually buys you over 'a chatbot' — deliberately not instructed to
fabricate anything; ordinary unaided LLM behavior on a specific/current
question is the lesson on its own.
"""
from __future__ import annotations

import uuid
from typing import AsyncIterator

import agents
import orchestrator
from events import AnswerDoneEvent, BaseEvent, HandoffEvent, ModelSelectedEvent, ThinkingEvent
from router import select_model

UNGROUNDED_AGENT_ID = "ungrounded"

UNGROUNDED_SYSTEM_PROMPT = (
    "You are a helpful, knowledgeable assistant. Answer the user's question directly and "
    "concisely, from what you already know. Always answer in English."
)


async def run_lab(prompt: str, run_id: str | None = None) -> AsyncIterator[BaseEvent]:
    import ollama_client

    run_id = run_id or uuid.uuid4().hex[:12]
    model, _ = select_model("reason")

    yield ModelSelectedEvent(
        run_id=run_id,
        agent=UNGROUNDED_AGENT_ID,
        model=model,
        task_kind="reason",
        rationale="same model, no tools, no sources — answering from training data alone",
    )
    yield ThinkingEvent(run_id=run_id, agent=UNGROUNDED_AGENT_ID, text="Answering directly, no research…")

    response = await ollama_client.chat(
        model,
        [
            {"role": "system", "content": UNGROUNDED_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    text = response.get("message", {}).get("content", "").strip() or "(empty response)"
    yield AnswerDoneEvent(run_id=run_id, agent=UNGROUNDED_AGENT_ID, text=text, sources=[])

    yield HandoffEvent(
        run_id=run_id,
        from_agent=UNGROUNDED_AGENT_ID,
        to_agent="researcher",
        reason="Now the same question, researched and cited.",
    )
    async for event in orchestrator.run(prompt, agents.get("researcher"), run_id=run_id):
        yield event
