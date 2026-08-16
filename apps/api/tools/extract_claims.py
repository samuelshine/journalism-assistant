"""Candidate claim extraction — a cheap, local, deterministic first pass
that hands the Fact-Checker a numbered shortlist of sentences worth
checking, rather than leaving 'read the whole draft and decide what's
checkable' entirely to the model's judgement. Heuristic, not NLP: a
sentence is a candidate if it carries a concrete assertion (a number, a
date, a named quantity, or a reporting/assertion verb). No network call —
sits alongside readability_score as proof that not every tool is a fetch."""
from __future__ import annotations

import re

from .base import Tool, ToolResult

SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "Draft or claim text to scan for checkable factual assertions."},
    },
    "required": ["text"],
}

SIGNAL_RE = re.compile(
    r"""
    \d                                  # any digit — stats, counts, years
    | %                                 # percentages
    | \b(19|20)\d{2}\b                  # a year
    | \b(percent|million|billion|thousand|dozens?|hundreds?)\b
    | \b(said|according to|reported|announced|found|shows?|confirmed|denied|claims?)\b
    | \b(increased|decreased|dropped|rose|fell|doubled|halved)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


async def run(text: str) -> ToolResult:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    candidates = [s for s in sentences if SIGNAL_RE.search(s) and len(s.split()) >= 4]

    if not candidates:
        return ToolResult(
            ok=True,
            summary="No sentences with concrete, checkable assertions found — text may be entirely opinion/description.",
            data={"claims": []},
        )

    numbered = [f"{i}. {c}" for i, c in enumerate(candidates, start=1)]
    return ToolResult(
        ok=True,
        summary=f"Found {len(candidates)} checkable candidate claim(s):\n" + "\n".join(numbered),
        data={"claims": candidates},
    )


TOOL = Tool(
    name="extract_claims",
    description=(
        "Scan a piece of text and pull out sentences that make a concrete, checkable factual "
        "assertion (numbers, dates, named events, reporting verbs) — use this first, before "
        "researching, to get a shortlist of what actually needs verification."
    ),
    parameters=SCHEMA,
    run=run,
    cost_hint="local computation, instant",
)
