"""Beat monitoring — a beat is a standing topic; the scheduler periodically
checks which beats are due and runs the Scout agent against them in the
background, landing a brief in the Beat Inbox with no one watching. This is
the one part of the app that's agentic *without* a human in the loop at
all — everything else in NEWSROOM is a human asking, an agent answering.

A background beat firing on its own schedule during a short class demo
isn't practical to wait for live, so /api/beats/{id}/run-now exists as the
'trigger it right now, streamed' path Sam actually uses on stage — the
periodic scheduler below is the real automation the run-now button is
standing in for.
"""
from __future__ import annotations

import asyncio
import time

from apscheduler.schedulers.asyncio import AsyncIOScheduler

import agents
import orchestrator
from store import beats as beats_store

CHECK_INTERVAL_SECONDS = 60
_scheduler: AsyncIOScheduler | None = None


async def _run_beat_silently(beat: beats_store.Beat) -> None:
    text = ""
    sources: list[dict] = []
    async for event in orchestrator.run(f"What's new on: {beat.topic}", agents.get("scout")):
        if event.type == "answer_done":
            text = event.text
            sources = event.sources
    if text:
        beats_store.save_brief(beat.id, text, sources)
    beats_store.touch_beat(beat.id)


async def _check_due_beats() -> None:
    now = time.time()
    for beat in beats_store.list_beats():
        due_at = (beat.last_run_at or beat.created_at) + beat.interval_minutes * 60
        if now >= due_at:
            asyncio.create_task(_run_beat_silently(beat))


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(_check_due_beats, "interval", seconds=CHECK_INTERVAL_SECONDS, id="beat_check")
    _scheduler.start()


async def run_beat_now(beat_id: str):
    """Manual trigger — streams the Scout run live (see /api/beats/{id}/run-now),
    then saves the result the same way the background scheduler would."""
    beat = beats_store.get_beat(beat_id)
    if beat is None:
        return
    text = ""
    sources: list[dict] = []
    async for event in orchestrator.run(f"What's new on: {beat.topic}", agents.get("scout")):
        if event.type == "answer_done":
            text = event.text
            sources = event.sources
        yield event
    if text:
        beats_store.save_brief(beat.id, text, sources)
    beats_store.touch_beat(beat.id)
