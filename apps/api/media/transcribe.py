"""faster-whisper transcription + pause-based speaker labeling.

The speaker labels are a heuristic, not verified voice identification: a
label flips whenever a real silence gap (from audio.detect_silences) falls
right before a segment. This is disclosed as such in the UI — it's useful
for a two-person interview with normal turn-taking pauses, and wrong for
overlapping speech, a single narrator pausing mid-thought, or more than
two speakers taking turns in a way that happens to alternate.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

from faster_whisper import WhisperModel

import config
from media.audio import SilenceGap, detect_silences

_model: WhisperModel | None = None
_model_lock = asyncio.Lock()


async def get_model() -> WhisperModel:
    """Lazy-loaded singleton — first call pays the HF download/load cost
    (~10s), every call after is instant. Call warm() at server startup so
    the demo's first real transcription isn't the one that pays it."""
    global _model
    if _model is None:
        async with _model_lock:
            if _model is None:
                _model = await asyncio.to_thread(
                    WhisperModel,
                    config.WHISPER_MODEL_SIZE,
                    device=config.WHISPER_DEVICE,
                    compute_type=config.WHISPER_COMPUTE_TYPE,
                )
    return _model


async def warm() -> None:
    try:
        await get_model()
    except Exception:
        pass  # first real transcription will surface the real problem


def is_warm() -> bool:
    return _model is not None


@dataclass
class Segment:
    start: float
    end: float
    text: str
    speaker: str


@dataclass
class TranscriptResult:
    segments: list[Segment]
    language: str
    duration: float
    full_text: str


_BOUNDARY_TOLERANCE = 0.7  # seconds — Whisper's own segment boundaries lag
# ffmpeg's true silence windows by up to ~0.5-0.7s in practice (confirmed
# against a synthetic two-speaker test clip where ffmpeg found the silence
# ending before Whisper's segment boundary landed) — an exact-overlap check
# missed every real speaker change, so this uses a tolerance window instead.


def _assign_speakers(raw_segments: list[tuple[float, float, str]], silences: list[SilenceGap]) -> list[Segment]:
    speakers = ["Speaker A", "Speaker B"]
    current = 0
    out: list[Segment] = []
    remaining = list(silences)
    prev_end: float | None = None

    for start, end, text in raw_segments:
        if prev_end is not None:
            window_start, window_end = prev_end - _BOUNDARY_TOLERANCE, start + _BOUNDARY_TOLERANCE
            matched_idx = next(
                (i for i, g in enumerate(remaining) if g.start <= window_end and g.end >= window_start),
                None,
            )
            if matched_idx is not None:
                current = 1 - current
                del remaining[matched_idx]
        out.append(Segment(start=start, end=end, text=text.strip(), speaker=speakers[current]))
        prev_end = end

    return out


async def transcribe(path: Path) -> TranscriptResult:
    model = await get_model()

    def _run() -> tuple[list[tuple[float, float, str]], str, float]:
        segments, info = model.transcribe(str(path), vad_filter=True)
        raw = [(s.start, s.end, s.text) for s in segments]
        return raw, info.language, info.duration

    raw_segments, language, duration = await asyncio.to_thread(_run)
    silences = await detect_silences(path)
    segments = _assign_speakers(raw_segments, silences)
    full_text = " ".join(s.text for s in segments)

    return TranscriptResult(segments=segments, language=language, duration=duration, full_text=full_text)
