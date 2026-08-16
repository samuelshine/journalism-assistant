"""Fetch a specific URL and extract clean article text (strips nav/ads/
boilerplate via trafilatura). Used when a search tool surfaces a URL and the
agent needs the actual article content, not just a snippet."""
from __future__ import annotations

import httpx
import trafilatura

from .base import Source, Tool, ToolResult
from .web_ua import GENERIC_UA

SCHEMA = {
    "type": "object",
    "properties": {
        "url": {"type": "string", "description": "Full article URL to fetch and extract text from."},
    },
    "required": ["url"],
}

MAX_CHARS = 4000


async def run(url: str) -> ToolResult:
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": GENERIC_UA}, follow_redirects=True) as client:
            r = await client.get(url)
        r.raise_for_status()
    except Exception as e:  # noqa: BLE001
        return ToolResult(ok=False, summary=f"Could not fetch {url}", error=str(e))

    text = trafilatura.extract(r.text, url=url, favor_precision=True) or ""
    if not text:
        return ToolResult(ok=False, summary=f"Could not extract article text from {url}", error="extraction_empty")

    truncated = text[:MAX_CHARS]
    metadata = trafilatura.extract_metadata(r.text)
    title = (metadata.title if metadata else None) or url
    published = metadata.date if metadata else None

    source = Source(title=title, url=url, snippet=truncated[:400], published_at=published, tool="fetch_url")
    return ToolResult(
        ok=True,
        summary=truncated,
        sources=[source],
        data={"full_length": len(text), "truncated": len(text) > MAX_CHARS},
    )


TOOL = Tool(
    name="fetch_url",
    description="Fetch a webpage and extract its clean article text (no ads/nav). Use on a specific URL found by another tool.",
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1-3s",
)
