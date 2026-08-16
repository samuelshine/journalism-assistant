"""Studio pipeline — the same 'make every step visible' philosophy as
orchestrator.py, applied to audio instead of an LLM tool loop: normalize ->
transcribe -> label speakers -> pull quotes, each step emitted as an event
before local media/* work happens (not agent reasoning, no model calls, no
citations — reuses the same event stream shape for a consistent Trace-style
UI without pretending this is an LLM agent).
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import AsyncIterator

from events import BaseEvent, ErrorEvent, RunDoneEvent, ThinkingEvent, ToolCallEvent, ToolResultEvent, TranscriptReadyEvent
from media import ingest
from media.audio import AudioError, duration_seconds, normalize_to_wav
from media.ingest import IngestError
from media.pullquotes import extract as extract_pull_quotes
from media.transcribe import transcribe as run_transcribe

AGENT_ID = "studio"


async def _process(path: Path, title: str, run_id: str) -> AsyncIterator[BaseEvent]:
    step = 0

    step += 1
    yield ToolCallEvent(run_id=run_id, agent=AGENT_ID, step=step, tool="normalize_audio", args={"file": path.name}, cost_hint="ffmpeg, local, <2s")
    normalized = path.with_suffix(".norm.wav")
    try:
        await normalize_to_wav(path, normalized)
        dur = await duration_seconds(normalized)
    except AudioError as e:
        yield ToolResultEvent(run_id=run_id, agent=AGENT_ID, step=step, tool="normalize_audio", ok=False, summary="Normalize failed", error=str(e))
        yield ErrorEvent(run_id=run_id, message=str(e), fatal=True)
        return
    yield ToolResultEvent(run_id=run_id, agent=AGENT_ID, step=step, tool="normalize_audio", ok=True, summary=f"Normalized to 16kHz mono, {dur:.0f}s")

    step += 1
    yield ThinkingEvent(run_id=run_id, agent=AGENT_ID, text="Transcribing — this can take a little while for a longer clip…")
    yield ToolCallEvent(run_id=run_id, agent=AGENT_ID, step=step, tool="transcribe_audio", args={"model": "whisper"}, cost_hint="local Whisper inference")
    try:
        result = await run_transcribe(normalized)
    except Exception as e:  # noqa: BLE001
        yield ToolResultEvent(run_id=run_id, agent=AGENT_ID, step=step, tool="transcribe_audio", ok=False, summary="Transcription failed", error=str(e))
        yield ErrorEvent(run_id=run_id, message=str(e), fatal=True)
        return
    yield ToolResultEvent(
        run_id=run_id,
        agent=AGENT_ID,
        step=step,
        tool="transcribe_audio",
        ok=True,
        summary=f"{len(result.segments)} segments, language={result.language}, {result.duration:.0f}s",
    )

    step += 1
    yield ToolCallEvent(run_id=run_id, agent=AGENT_ID, step=step, tool="extract_pull_quotes", args={}, cost_hint="local, instant")
    quotes = extract_pull_quotes(result.segments)
    yield ToolResultEvent(run_id=run_id, agent=AGENT_ID, step=step, tool="extract_pull_quotes", ok=True, summary=f"Found {len(quotes)} pull-quote candidate(s)")

    yield TranscriptReadyEvent(
        run_id=run_id,
        title=title,
        language=result.language,
        duration=result.duration,
        segments=[{"start": s.start, "end": s.end, "text": s.text, "speaker": s.speaker} for s in result.segments],
        pull_quotes=[{"text": q.text, "start": q.start, "end": q.end, "speaker": q.speaker} for q in quotes],
    )
    yield RunDoneEvent(run_id=run_id, steps=step, tool_calls=step)


async def process_upload(path: Path, title: str, run_id: str | None = None) -> AsyncIterator[BaseEvent]:
    run_id = run_id or uuid.uuid4().hex[:12]
    async for event in _process(path, title, run_id):
        yield event


async def process_url(url: str, run_id: str | None = None) -> AsyncIterator[BaseEvent]:
    run_id = run_id or uuid.uuid4().hex[:12]
    yield ToolCallEvent(run_id=run_id, agent=AGENT_ID, step=0, tool="yt_dlp_fetch", args={"url": url}, cost_hint="network, depends on clip length")
    try:
        path, title = await ingest.fetch_audio(url)
    except IngestError as e:
        yield ToolResultEvent(run_id=run_id, agent=AGENT_ID, step=0, tool="yt_dlp_fetch", ok=False, summary="Fetch failed", error=str(e))
        yield ErrorEvent(run_id=run_id, message=str(e), fatal=True)
        return
    yield ToolResultEvent(run_id=run_id, agent=AGENT_ID, step=0, tool="yt_dlp_fetch", ok=True, summary=f"Downloaded: {title}")

    async for event in _process(path, title, run_id):
        yield event
