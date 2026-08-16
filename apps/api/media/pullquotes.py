"""Pull-quote selection — picks the most quotable transcript segments, \
verbatim. Every pull-quote is a direct copy of a real segment's text plus
its exact (start, end, speaker), so it always traces back to a real
transcript span; nothing here is paraphrased or generated.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from media.transcribe import Segment

QUOTABLE_RE = re.compile(
    r"""\b(I think|I believe|honestly|frankly|the truth is|what (we|I) need|
        never|always|worst|best|biggest|only|must|should|won'?t|can'?t)\b""",
    re.IGNORECASE | re.VERBOSE,
)


@dataclass
class PullQuote:
    text: str
    start: float
    end: float
    speaker: str
    score: float


def _score(segment: Segment) -> float:
    words = segment.text.split()
    n = len(words)
    if n < 6 or n > 60:
        return 0.0  # too short to be a real quote, too long to pull cleanly
    if segment.text.strip().endswith("?"):
        return 0.0  # questions aren't pull-quotes, answers are

    score = min(n, 30) / 30  # reward substance, saturate past ~30 words
    if QUOTABLE_RE.search(segment.text):
        score += 0.5
    if re.search(r"\d", segment.text):
        score += 0.2  # a concrete number makes a stronger pull-quote
    return score


def extract(segments: list[Segment], limit: int = 4) -> list[PullQuote]:
    scored = [(seg, _score(seg)) for seg in segments]
    scored = [(seg, s) for seg, s in scored if s > 0]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    top = scored[:limit]
    top.sort(key=lambda pair: pair[0].start)  # restore chronological order
    return [
        PullQuote(text=seg.text, start=seg.start, end=seg.end, speaker=seg.speaker, score=round(s, 2))
        for seg, s in top
    ]
