"""Readability scoring — the one tool in the registry that's pure local
computation, no network call. Deliberately included so the Trace pane shows
students that not every agent step is a web request; some are just math."""
from __future__ import annotations

import re

from .base import Tool, ToolResult

SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "Draft text to score for readability."},
    },
    "required": ["text"],
}

VOWELS = "aeiouy"


def _count_syllables(word: str) -> int:
    word = word.lower().strip(".,!?;:\"'()")
    if not word:
        return 0
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups)
    if word.endswith("e") and not word.endswith("le") and count > 1:
        count -= 1
    return max(count, 1)


async def run(text: str) -> ToolResult:
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    words = re.findall(r"[A-Za-z']+", text)
    if not sentences or not words:
        return ToolResult(ok=False, summary="Not enough text to score", error="empty_input")

    syllables = sum(_count_syllables(w) for w in words)
    n_words = len(words)
    n_sentences = len(sentences)

    words_per_sentence = n_words / n_sentences
    syllables_per_word = syllables / n_words

    flesch_ease = 206.835 - 1.015 * words_per_sentence - 84.6 * syllables_per_word
    fk_grade = 0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59

    if flesch_ease >= 70:
        band = "plain-language — accessible to a broad general audience"
    elif flesch_ease >= 50:
        band = "standard news writing — comparable to most daily-newspaper copy"
    elif flesch_ease >= 30:
        band = "fairly difficult — closer to trade/academic writing"
    else:
        band = "very difficult — dense, technical prose"

    summary = (
        f"Flesch Reading Ease {flesch_ease:.0f}/100 ({band}); "
        f"Flesch-Kincaid grade level ~{fk_grade:.1f}; "
        f"{n_words} words, {n_sentences} sentences, avg {words_per_sentence:.1f} words/sentence."
    )
    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "flesch_reading_ease": round(flesch_ease, 1),
            "fk_grade_level": round(fk_grade, 1),
            "word_count": n_words,
            "sentence_count": n_sentences,
        },
    )


TOOL = Tool(
    name="readability_score",
    description=(
        "Score a piece of draft text for readability (Flesch Reading Ease + Flesch-Kincaid grade "
        "level). Pure calculation, no network call — use before finalizing a lede or headline."
    ),
    parameters=SCHEMA,
    run=run,
    cost_hint="local computation, instant",
)
