"""Tool registry — one place that knows every tool that exists. Agents get
a restricted view of this (see agents/*.py) so a tool is a capability tied
to a role, not a global grab-bag."""
from __future__ import annotations

import config
from . import (
    extract_claims,
    fetch_url,
    fixtures,
    gdelt,
    guardian,
    nominatim,
    openalex,
    readability,
    rss,
    search_memory,
    wayback,
    wikidata,
    wikipedia,
)
from .base import Source, Tool, ToolResult

_NO_FIXTURE_TOOLS = {"extract_claims", "readability_score", "search_memory"}  # local, no network to replace

ALL_TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        gdelt.TOOL,
        guardian.TOOL,
        rss.TOOL,
        wikipedia.TOOL,
        wikidata.TOOL,
        nominatim.TOOL,
        wayback.TOOL,
        openalex.TOOL,
        fetch_url.TOOL,
        readability.TOOL,
        extract_claims.TOOL,
        search_memory.TOOL,
    ]
}


def available(names: list[str]) -> list[Tool]:
    """Tools by name, filtered to ones whose required key (if any) is present."""
    out = []
    for name in names:
        tool = ALL_TOOLS.get(name)
        if tool and (tool.requires_key is None or config.has_key(tool.requires_key)):
            out.append(tool)
    return out


def schemas_for(names: list[str]) -> list[dict]:
    return [t.schema() for t in available(names)]


def _fixture_to_result(fixture: dict) -> ToolResult:
    return ToolResult(
        ok=fixture["ok"],
        summary=fixture["summary"],
        sources=[Source(**s) for s in fixture.get("sources", [])],
        data=fixture.get("data"),
        error=fixture.get("error"),
    )


async def dispatch(name: str, args: dict) -> ToolResult:
    tool = ALL_TOOLS.get(name)
    if tool is None:
        return ToolResult(ok=False, summary=f"Unknown tool '{name}'", error="unknown_tool")

    if config.DEMO_MODE and name not in _NO_FIXTURE_TOOLS:
        fixture = fixtures.lookup(name, args)
        if fixture is not None:
            return _fixture_to_result(fixture)

    try:
        return await tool.run(**args)
    except TypeError as e:
        return ToolResult(ok=False, summary=f"Bad arguments for '{name}'", error=str(e))
    except Exception as e:  # noqa: BLE001 - tool failures surface to the trace, never crash the run
        return ToolResult(ok=False, summary=f"'{name}' failed", error=str(e))
