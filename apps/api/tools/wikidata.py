"""Wikidata entity lookup — structured facts (description + key claims) on
people, organizations, and places. Good complement to wikipedia_summary's
prose: this gives dates/IDs/relations a fact-checker can cross-reference."""
from __future__ import annotations

import httpx

from .base import Source, Tool, ToolResult
from .web_ua import WIKIMEDIA_UA

SCHEMA = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "Entity name to search for, e.g. 'Tamil Nadu' or 'M. K. Stalin'."},
    },
    "required": ["query"],
}

# a handful of high-value properties to surface when present, human-labelled
KEY_PROPS = {
    "P31": "instance of",
    "P569": "date of birth",
    "P39": "position held",
    "P17": "country",
    "P571": "inception",
    "P1082": "population",
}


async def run(query: str) -> ToolResult:
    headers = {"User-Agent": WIKIMEDIA_UA}
    async with httpx.AsyncClient(timeout=10, headers=headers) as client:
        try:
            search = await client.get(
                "https://www.wikidata.org/w/api.php",
                params={
                    "action": "wbsearchentities",
                    "search": query,
                    "language": "en",
                    "limit": "1",
                    "format": "json",
                },
            )
            search.raise_for_status()
            hits = search.json().get("search", [])
        except Exception as e:  # noqa: BLE001
            return ToolResult(ok=False, summary="Wikidata search failed", error=str(e))

        if not hits:
            return ToolResult(ok=False, summary=f"No Wikidata entity found for '{query}'", error="not_found")

        qid = hits[0]["id"]
        label = hits[0].get("label", query)
        description = hits[0].get("description", "")

        try:
            entity = await client.get(
                "https://www.wikidata.org/w/api.php",
                params={
                    "action": "wbgetentities",
                    "ids": qid,
                    "props": "claims|labels",
                    "languages": "en",
                    "format": "json",
                },
            )
            entity.raise_for_status()
            claims = entity.json().get("entities", {}).get(qid, {}).get("claims", {})
        except Exception:
            claims = {}

    facts: list[str] = []
    for pid, label_name in KEY_PROPS.items():
        if pid in claims:
            n = len(claims[pid])
            facts.append(f"{label_name}: {n} statement(s) on record" if n > 1 else f"{label_name}: recorded")

    url = f"https://www.wikidata.org/wiki/{qid}"
    summary = f"{label} — {description}" + (f" ({'; '.join(facts)})" if facts else "")
    source = Source(title=f"{label} (Wikidata)", url=url, snippet=summary[:400], tool="wikidata_entity")
    return ToolResult(ok=True, summary=summary, sources=[source], data={"qid": qid, "facts": facts})


TOOL = Tool(
    name="wikidata_entity",
    description="Look up structured facts (dates, roles, relations) about a named entity via Wikidata.",
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1-2s (2 requests)",
)
