"""Dev-only utility: record real tool outputs for the canonical demo
prompts into seed/fixtures/demo_fixtures.json. Not imported by the running
app — run manually (`uv run python scripts/record_fixtures.py`) whenever
the demo topic changes or a fixture goes stale. Every fixture here is a
real recorded response, not hand-written data — Demo Mode should degrade
gracefully to 'this specific rehearsed demo works offline', not pretend to
be a general offline cache.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools import fetch_url, nominatim, openalex, rss, wikidata, wikipedia  # noqa: E402
from tools.base import ToolResult  # noqa: E402

FIXTURES_PATH = Path(__file__).resolve().parent.parent.parent.parent / "seed" / "fixtures" / "demo_fixtures.json"

# (tool_name, match_keywords, run_coro_factory)
JOBS = [
    ("wikipedia_summary", ["chennai"], lambda: wikipedia.run(title="Chennai")),
    ("wikipedia_summary", ["tamil", "nadu"], lambda: wikipedia.run(title="Tamil Nadu")),
    ("wikidata_entity", ["chennai"], lambda: wikidata.run(query="Chennai")),
    ("wikidata_entity", ["tamil", "nadu"], lambda: wikidata.run(query="Tamil Nadu")),
    ("nominatim_geocode", ["chennai"], lambda: nominatim.run(place="Chennai, Tamil Nadu")),
    ("openalex_search", ["water", "chennai"], lambda: openalex.run(query="water scarcity Chennai")),
    ("openalex_search", ["water", "tamil", "nadu"], lambda: openalex.run(query="water management Tamil Nadu")),
    ("rss_fetch", ["all"], lambda: rss.run(source="all")),
    (
        "fetch_url",
        ["timesofindia", "poondi"],
        lambda: fetch_url.run(
            url="https://timesofindia.indiatimes.com/city/chennai/poondi-reservoir-gets-a-boost-as-andhra-doubles-krishna-water-release/articleshow/133244905.cms"
        ),
    ),
]


def result_to_dict(result: ToolResult) -> dict:
    return {
        "ok": result.ok,
        "summary": result.summary,
        "sources": [s.to_dict() for s in result.sources],
        "data": result.data,
        "error": result.error,
    }


async def main() -> None:
    fixtures: dict[str, list[dict]] = {}
    if FIXTURES_PATH.exists():
        fixtures = json.loads(FIXTURES_PATH.read_text())

    for tool_name, match, factory in JOBS:
        print(f"recording {tool_name} match={match} ...", end=" ", flush=True)
        try:
            result = await factory()
        except Exception as e:  # noqa: BLE001
            print(f"FAILED: {e}")
            continue
        if not result.ok:
            print(f"skipped (tool returned ok=False: {result.error})")
            continue
        fixtures.setdefault(tool_name, []).append({"match": match, "result": result_to_dict(result)})
        print(f"ok — {len(result.sources)} source(s)")
        await asyncio.sleep(1)  # be polite to the real APIs while recording

    FIXTURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES_PATH.write_text(json.dumps(fixtures, indent=2))
    print(f"\nwrote {FIXTURES_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
