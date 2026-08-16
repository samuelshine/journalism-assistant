"""OpenAlex — free, keyless scholarly-works search. Used to back a claim
with academic literature rather than just news coverage."""
from __future__ import annotations

import httpx

from .base import Source, Tool, ToolResult
from .web_ua import GENERIC_UA

SCHEMA = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "Research topic to search academic literature for."},
        "max_results": {"type": "integer", "default": 5},
    },
    "required": ["query"],
}


async def run(query: str, max_results: int = 5) -> ToolResult:
    max_results = max(1, min(max_results, 15))
    params = {"search": query, "per-page": str(max_results), "sort": "relevance_score:desc"}
    headers = {"User-Agent": GENERIC_UA}
    try:
        async with httpx.AsyncClient(timeout=12, headers=headers) as client:
            r = await client.get("https://api.openalex.org/works", params=params)
        r.raise_for_status()
        results = r.json().get("results", [])
    except Exception as e:  # noqa: BLE001
        return ToolResult(ok=False, summary="OpenAlex search failed", error=str(e))

    sources = []
    for w in results:
        year = w.get("publication_year")
        title = w.get("title") or "(untitled)"
        oa_url = (w.get("open_access") or {}).get("oa_url") or w.get("id", "")
        host = ((w.get("primary_location") or {}).get("source") or {}).get("display_name", "")
        sources.append(
            Source(
                title=f"{title} ({year})" if year else title,
                url=oa_url,
                snippet=host,
                published_at=str(year) if year else None,
                tool="openalex_search",
            )
        )
    return ToolResult(
        ok=True,
        summary=f"Found {len(sources)} academic works for '{query}'",
        sources=sources,
        data={"count": len(sources)},
    )


TOOL = Tool(
    name="openalex_search",
    description="Search academic/scholarly literature for research backing a claim or providing deeper context.",
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1-2s",
)
