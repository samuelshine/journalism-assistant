"""The Guardian Open Platform — a single, well-edited newspaper's archive,
as opposed to GDELT's broad multi-outlet sweep. Free with registration:
https://open-platform.theguardian.com/access/. Self-disables if
GUARDIAN_API_KEY isn't set — see tools/registry.py's requires_key gate,
the same mechanism every optional-key tool in this app uses. Every other
tool works without it; this one just adds a source when it's there.
"""
from __future__ import annotations

import httpx

import config
from .base import Source, Tool, ToolResult

SCHEMA = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "Search query."},
        "max_records": {
            "type": "integer",
            "description": "Max articles to return (1-20).",
            "default": 10,
        },
    },
    "required": ["query"],
}


async def run(query: str, max_records: int = 10) -> ToolResult:
    max_records = max(1, min(max_records, 20))
    params = {
        "q": query,
        "api-key": config.GUARDIAN_API_KEY,
        "order-by": "newest",
        "page-size": str(max_records),
        "show-fields": "trailText",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get("https://content.guardianapis.com/search", params=params)
        r.raise_for_status()
        payload = r.json()
    except Exception as e:  # noqa: BLE001
        return ToolResult(ok=False, summary="Guardian search failed", error=str(e) or type(e).__name__)

    results = payload.get("response", {}).get("results", []) or []
    sources = [
        Source(
            title=a.get("webTitle", "(untitled)"),
            url=a.get("webUrl", ""),
            snippet=(a.get("fields") or {}).get("trailText", ""),
            published_at=a.get("webPublicationDate"),
            tool="guardian_search",
        )
        for a in results
        if a.get("webUrl")
    ]
    return ToolResult(
        ok=True,
        summary=f"Found {len(sources)} Guardian articles for '{query}'",
        sources=sources,
        data={"count": len(sources)},
    )


TOOL = Tool(
    name="guardian_search",
    description=(
        "Search The Guardian's article archive for a topic — one well-edited paper's coverage, "
        "good alongside gdelt_search's broader multi-outlet sweep for a second, more consistent voice."
    ),
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1-2s",
    requires_key="guardian",
)
