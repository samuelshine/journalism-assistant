"""Article operations — 'add a section' and 'ask for a revision' both reuse
orchestrator.run() against the Editor persona with a purpose-built prompt,
rather than a new agent role: Editor's whole job is already shaping
material it's handed, and both operations hand it the full current article
as that material. Citation numbering continues from the article's existing
sources (seeded into a SourceRegistry before the run) so new citations
append rather than restart at [1] — the same continuation mechanism
crew.py already uses for multi-stage pipelines.

Editor has no live research tools (fetch_url / wikipedia_summary /
readability_score only, see agents/editor.py) — deliberately, it's a
shaping role, not a researching one. That means 'add a section' can't
always genuinely research something new; both prompts below are explicit
that Editor must say what it can't verify rather than invent it, the same
anti-fabrication standard the rest of the app holds to.
"""
from __future__ import annotations

from typing import AsyncIterator

import agents
import orchestrator
from events import BaseEvent
from orchestrator import SourceRegistry
from store.articles import Article
from tools.base import Source


_SOURCE_FIELDS = {"title", "url", "snippet", "published_at", "tool", "fetched_at"}


def _seed_registry(article: Article) -> SourceRegistry:
    """Re-adds the article's stored sources in their original index order so
    add_many() re-assigns the same numbering — stored sources carry an
    'index' key (from SourceRegistry.as_dicts()) that Source's constructor
    doesn't accept, so that key is stripped here rather than passed through."""
    registry = SourceRegistry()
    ordered = sorted(article.sources, key=lambda s: s.get("index", 0))
    registry.add_many([Source(**{k: v for k, v in s.items() if k in _SOURCE_FIELDS}) for s in ordered])
    return registry


def _section_prompt(article: Article, instruction: str) -> str:
    return (
        f"Here is the current article:\n\n{article.body_markdown}\n\n---\n"
        f"Write ONLY a new section for this request: {instruction}\n\n"
        "Do not rewrite, repeat, or summarise the existing article above — write just the new "
        "section, ready to append to the end. Reuse the [n] numbers already established above "
        "for anything you're citing that's already sourced there; use fetch_url or "
        "wikipedia_summary if you need to check something specific, and cite whatever number "
        "the tool gives you. You have no live news search here — if the request needs a fact "
        "you can't verify with what you have, say plainly what's missing (\"this needs a "
        "reporter to confirm X\") rather than writing it as if it were established. Never "
        "attach a [n] citation marker to a claim you couldn't actually verify — an unverified "
        "sentence gets no marker at all, not a number borrowed from a source that doesn't "
        "support it."
    )


def _revision_prompt(article: Article, instruction: str) -> str:
    return (
        f"Here is the current article, in full:\n\n{article.body_markdown}\n\n---\n"
        f"Apply this change: {instruction}\n\n"
        "Your reply will directly REPLACE the entire article above — whatever you don't "
        "include in your reply is gone, not \"left as is\". So: copy every paragraph, "
        "heading, and section from the article above into your reply VERBATIM except for "
        "the specific part the instruction asks you to change. Do not summarise, "
        "compress, or describe the unchanged parts instead of including them — write them "
        "out in full, exactly as they were. Do not silently rewrite or \"improve\" "
        "sentences the instruction didn't ask about. Your reply should be the same overall "
        "length as the original, plus or minus whatever the requested change adds or removes."
    )


async def add_section(article: Article, instruction: str, run_id: str | None = None) -> AsyncIterator[BaseEvent]:
    registry = _seed_registry(article)
    editor = agents.get("editor")
    async for event in orchestrator.run(_section_prompt(article, instruction), editor, run_id=run_id, registry=registry):
        yield event


async def propose_revision(article: Article, instruction: str, run_id: str | None = None) -> AsyncIterator[BaseEvent]:
    registry = _seed_registry(article)
    editor = agents.get("editor")
    async for event in orchestrator.run(_revision_prompt(article, instruction), editor, run_id=run_id, registry=registry):
        yield event
