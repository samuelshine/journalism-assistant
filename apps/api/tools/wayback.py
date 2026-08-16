"""Wayback Machine availability check — Phase 0 probed this live and hit a
429. Treated as best-effort per the plan: retry with backoff a couple of
times, cache successes for the process lifetime, and degrade to ok=False
rather than ever blocking the run."""
from __future__ import annotations

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .base import Source, Tool, ToolResult

SCHEMA = {
    "type": "object",
    "properties": {
        "url": {"type": "string", "description": "URL to check for an archived snapshot."},
    },
    "required": ["url"],
}

_cache: dict[str, ToolResult] = {}


class _RetryableStatus(Exception):
    pass


@retry(
    retry=retry_if_exception_type(_RetryableStatus),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=6),
    reraise=True,
)
async def _fetch(url: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get("https://archive.org/wayback/available", params={"url": url})
    if r.status_code == 429 or r.status_code >= 500:
        raise _RetryableStatus(f"status {r.status_code}")
    r.raise_for_status()
    return r.json()


async def run(url: str) -> ToolResult:
    if url in _cache:
        return _cache[url]

    try:
        payload = await _fetch(url)
    except Exception as e:  # noqa: BLE001 - best-effort tool, never blocks the run
        result = ToolResult(ok=False, summary="Wayback Machine unavailable right now", error=str(e))
        return result  # not cached — worth retrying on a later call

    snapshot = (payload.get("archived_snapshots") or {}).get("closest")
    if not snapshot:
        result = ToolResult(ok=True, summary=f"No archived snapshot found for {url}", data={"found": False})
    else:
        source = Source(
            title=f"Archived snapshot ({snapshot.get('timestamp', '')})",
            url=snapshot.get("url", ""),
            snippet="Wayback Machine snapshot",
            tool="wayback_snapshot",
        )
        result = ToolResult(
            ok=True,
            summary=f"Archived snapshot from {snapshot.get('timestamp', '')}: {snapshot.get('url', '')}",
            sources=[source],
            data={"found": True, "timestamp": snapshot.get("timestamp")},
        )
    _cache[url] = result
    return result


TOOL = Tool(
    name="wayback_snapshot",
    description="Check whether a URL has an archived Wayback Machine snapshot — useful for verifying a source hasn't been altered or taken down.",
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1-4s, may be rate-limited",
)
