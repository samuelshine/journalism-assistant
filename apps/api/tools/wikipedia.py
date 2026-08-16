"""Wikipedia REST summary — background/context lookups on people, orgs,
places, concepts. Needs the Wikimedia UA (see web_ua.py) or gets a 403."""
from __future__ import annotations

from urllib.parse import quote

import httpx

from .base import Source, Tool, ToolResult
from .web_ua import WIKIMEDIA_UA

SCHEMA = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "description": "Page title, e.g. 'Narendra Modi' or 'Chennai water crisis'. Best-effort match.",
        },
    },
    "required": ["title"],
}


async def run(title: str) -> ToolResult:
    headers = {"User-Agent": WIKIMEDIA_UA}
    async with httpx.AsyncClient(timeout=10, headers=headers) as client:
        # resolve to the closest real title first (summary endpoint is exact-match only)
        try:
            search = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "opensearch",
                    "search": title,
                    "limit": "1",
                    "namespace": "0",
                    "format": "json",
                },
            )
            search.raise_for_status()
            candidates = search.json()[1]
            resolved = candidates[0] if candidates else title
        except Exception:
            resolved = title

        try:
            r = await client.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(resolved.replace(' ', '_'))}"
            )
            if r.status_code == 404:
                return ToolResult(ok=False, summary=f"No Wikipedia page found for '{title}'", error="not_found")
            r.raise_for_status()
            data = r.json()
        except Exception as e:  # noqa: BLE001
            return ToolResult(ok=False, summary="Wikipedia lookup failed", error=str(e))

    extract = data.get("extract", "")
    page_url = data.get("content_urls", {}).get("desktop", {}).get("page", "")
    source = Source(
        title=data.get("title", resolved),
        url=page_url,
        snippet=extract[:400],
        tool="wikipedia_summary",
    )
    return ToolResult(ok=True, summary=extract[:600], sources=[source], data={"extract": extract})


TOOL = Tool(
    name="wikipedia_summary",
    description="Get a concise, sourced background summary of a person, organization, place, or concept.",
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1s",
)
