"""Semantic recall over everything the desk has produced before — this is
what makes memory more than a chat-history scrollback: it's a search, so a
differently-worded question about a topic already researched still finds
it. No external network call; the only cost is a local embedding pass."""
from __future__ import annotations

from store import memory as memory_store

from .base import Source, Tool, ToolResult

SCHEMA = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "What to recall — a topic, name, or question."},
        "limit": {"type": "integer", "default": 5},
    },
    "required": ["query"],
}


async def run(query: str, limit: int = 5) -> ToolResult:
    hits = await memory_store.search(query, limit=limit)
    if not hits:
        return ToolResult(ok=True, summary="No prior research found on this in memory.", data={"count": 0})

    sources = [
        Source(
            # synthetic, non-fetchable URL — memory hits aren't a live web
            # source, but the SourceRegistry only numbers sources that have
            # a url, and these deserve a citation number too (they're real
            # prior research, just recalled instead of re-fetched).
            title=f"Past {h.kind} (this desk, earlier)",
            url=f"memory://{h.id}",
            snippet=h.text[:400],
            tool="search_memory",
        )
        for h in hits
    ]
    return ToolResult(
        ok=True,
        summary=f"Found {len(hits)} prior item(s) in memory related to '{query}'.",
        sources=sources,
        data={"count": len(hits)},
    )


TOOL = Tool(
    name="search_memory",
    description="Search this desk's own memory of past research and drafts for anything related to a topic — check before re-researching from scratch.",
    parameters=SCHEMA,
    run=run,
    cost_hint="local embedding + vector search, instant",
)
