"""Fetch a specific URL and extract clean article text (strips nav/ads/
boilerplate via trafilatura). Used when a search tool surfaces a URL and the
agent needs the actual article content, not just a snippet."""
from __future__ import annotations

from urllib.parse import urljoin

import httpx
import trafilatura

from .base import Source, Tool, ToolResult
from .ssrf_guard import UnsafeURLError, assert_safe_url
from .web_ua import GENERIC_UA

SCHEMA = {
    "type": "object",
    "properties": {
        "url": {"type": "string", "description": "Full article URL to fetch and extract text from."},
    },
    "required": ["url"],
}

MAX_CHARS = 4000
MAX_REDIRECTS = 5


async def run(url: str) -> ToolResult:
    # follow_redirects handles this automatically, but that would only check
    # the URL the model gave us — a URL that itself resolves safely can still
    # 302 to an internal address. Follow redirects manually so every hop gets
    # re-checked, not just the first one.
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": GENERIC_UA}, follow_redirects=False) as client:
            current = url
            for _ in range(MAX_REDIRECTS + 1):
                assert_safe_url(current)
                r = await client.get(current)
                if r.is_redirect and "location" in r.headers:
                    current = urljoin(current, r.headers["location"])
                    continue
                break
            else:
                return ToolResult(ok=False, summary=f"Too many redirects fetching {url}", error="redirect_loop")
        r.raise_for_status()
    except UnsafeURLError as e:
        return ToolResult(ok=False, summary=f"Refusing to fetch {url}", error=str(e))
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
