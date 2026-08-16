"""Tool registry — one place that knows every tool that exists. Agents get
a restricted view of this (see agents/*.py) so a tool is a capability tied
to a role, not a global grab-bag."""
from __future__ import annotations

import config
from . import fetch_url, gdelt, nominatim, openalex, readability, rss, wayback, wikidata, wikipedia
from .base import Tool, ToolResult

ALL_TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        gdelt.TOOL,
        rss.TOOL,
        wikipedia.TOOL,
        wikidata.TOOL,
        nominatim.TOOL,
        wayback.TOOL,
        openalex.TOOL,
        fetch_url.TOOL,
        readability.TOOL,
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


async def dispatch(name: str, args: dict) -> ToolResult:
    tool = ALL_TOOLS.get(name)
    if tool is None:
        return ToolResult(ok=False, summary=f"Unknown tool '{name}'", error="unknown_tool")
    try:
        return await tool.run(**args)
    except TypeError as e:
        return ToolResult(ok=False, summary=f"Bad arguments for '{name}'", error=str(e))
    except Exception as e:  # noqa: BLE001 - tool failures surface to the trace, never crash the run
        return ToolResult(ok=False, summary=f"'{name}' failed", error=str(e))
