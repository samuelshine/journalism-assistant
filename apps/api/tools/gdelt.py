"""GDELT v2 doc API — global news search across 65 languages, keyless. No
API key, but GDELT enforces an undocumented ~1 request/5s throttle and
returns a 429 with a plain-text (non-JSON) body if you exceed it — the
module-level lock below keeps every gdelt_search call, even across
concurrent runs, at least 5.5s apart. https://blog.gdeltproject.org/gdelt-doc-2-0-api/
"""
from __future__ import annotations

import asyncio
import time

import httpx

from .base import Source, Tool, ToolResult

_last_call_lock = asyncio.Lock()
_last_call_ts = 0.0
_MIN_INTERVAL = 5.5


async def _throttle() -> None:
    global _last_call_ts
    async with _last_call_lock:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_call_ts)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call_ts = time.monotonic()

SCHEMA = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "Search query. Supports GDELT operators, e.g. 'water scarcity sourcecountry:IN'.",
        },
        "max_records": {
            "type": "integer",
            "description": "Max articles to return (1-25).",
            "default": 10,
        },
        "timespan": {
            "type": "string",
            "description": "How far back to search, e.g. '1d', '7d', '1m'. Default 7d.",
            "default": "7d",
        },
    },
    "required": ["query"],
}


async def run(query: str, max_records: int = 10, timespan: str = "7d") -> ToolResult:
    max_records = max(1, min(max_records, 25))
    params = {
        "query": query,
        "mode": "ArtList",
        "maxrecords": str(max_records),
        "format": "json",
        "sort": "DateDesc",
        "timespan": timespan,
    }
    await _throttle()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get("https://api.gdeltproject.org/api/v2/doc/doc", params=params)
        if r.status_code == 429:
            return ToolResult(ok=False, summary="GDELT rate limit hit — try again shortly", error="rate_limited")
        r.raise_for_status()
        payload = r.json()
    except Exception as e:  # noqa: BLE001
        return ToolResult(ok=False, summary="GDELT search failed", error=str(e) or type(e).__name__)

    articles = payload.get("articles", []) or []
    sources = [
        Source(
            title=a.get("title", "(untitled)"),
            url=a.get("url", ""),
            snippet=f"{a.get('domain', '')} · {a.get('sourcecountry', '')} · {a.get('language', '')}",
            published_at=a.get("seendate"),
            tool="gdelt_search",
        )
        for a in articles
        if a.get("url")
    ]
    return ToolResult(
        ok=True,
        summary=f"Found {len(sources)} articles for '{query}'",
        sources=sources,
        data={"count": len(sources)},
    )


TOOL = Tool(
    name="gdelt_search",
    description=(
        "Search global news coverage (65 languages, updated every 15 min) for a topic. "
        "Best first call for 'what's happening with X' or 'recent coverage of Y'."
    ),
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1-3s",
)
