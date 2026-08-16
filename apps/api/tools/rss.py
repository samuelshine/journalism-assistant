"""RSS bundle — India-first news sources, keyless. feedparser is sync, so
runs in a thread. Feeds probed live: all 200 (scroll.in via redirect)."""
from __future__ import annotations

import asyncio

import feedparser
import httpx

from .base import Source, Tool, ToolResult
from .web_ua import GENERIC_UA

FEEDS = {
    "the_hindu": "https://www.thehindu.com/news/national/feeder/default.rss",
    "indian_express": "https://indianexpress.com/section/india/feed/",
    "scroll": "https://scroll.in/feed",
    "the_wire": "https://thewire.in/feed/",
    "livemint": "https://www.livemint.com/rss/news",
}

SCHEMA = {
    "type": "object",
    "properties": {
        "source": {
            "type": "string",
            "enum": [*FEEDS.keys(), "all"],
            "description": "Which India news outlet's feed to read, or 'all' for every outlet.",
        },
        "keyword": {
            "type": "string",
            "description": "Optional keyword to filter headlines/summaries by (case-insensitive substring).",
        },
        "limit": {"type": "integer", "description": "Max entries per feed.", "default": 8},
    },
    "required": ["source"],
}


async def _fetch_one(client: httpx.AsyncClient, name: str, url: str) -> list[dict]:
    try:
        r = await client.get(url, follow_redirects=True)
        r.raise_for_status()
    except Exception:
        return []
    parsed = await asyncio.to_thread(feedparser.parse, r.content)
    entries = []
    for e in parsed.entries:
        entries.append(
            {
                "outlet": name,
                "title": e.get("title", "(untitled)"),
                "url": e.get("link", ""),
                "summary": e.get("summary", "")[:280],
                "published": e.get("published", e.get("updated")),
            }
        )
    return entries


async def run(source: str, keyword: str | None = None, limit: int = 8) -> ToolResult:
    targets = FEEDS if source == "all" else {source: FEEDS.get(source, "")}
    targets = {k: v for k, v in targets.items() if v}
    if not targets:
        return ToolResult(ok=False, summary=f"Unknown source '{source}'", error="unknown source")

    async with httpx.AsyncClient(timeout=12, headers={"User-Agent": GENERIC_UA}) as client:
        results = await asyncio.gather(*(_fetch_one(client, n, u) for n, u in targets.items()))

    all_entries = [e for group in results for e in group]
    if keyword:
        kw = keyword.lower()
        all_entries = [e for e in all_entries if kw in e["title"].lower() or kw in e["summary"].lower()]

    all_entries = all_entries[: limit * max(1, len(targets))]
    sources = [
        Source(
            title=f"[{e['outlet']}] {e['title']}",
            url=e["url"],
            snippet=e["summary"],
            published_at=e["published"],
            tool="rss_fetch",
        )
        for e in all_entries
        if e["url"]
    ]
    return ToolResult(
        ok=True,
        summary=f"Read {len(sources)} headlines from {', '.join(targets)}",
        sources=sources,
        data={"count": len(sources)},
    )


TOOL = Tool(
    name="rss_fetch",
    description=(
        "Read live headlines from major India news outlets (The Hindu, Indian Express, Scroll, "
        "The Wire, Livemint). Use to check what India's press is currently covering on a topic."
    ),
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1-2s",
)
