"""Nominatim (OpenStreetMap) geocoding — resolve a place name to coordinates
and administrative context. Requires a descriptive UA per OSM policy or the
request is rejected with 403."""
from __future__ import annotations

import httpx

from .base import Source, Tool, ToolResult
from .web_ua import NOMINATIM_UA

SCHEMA = {
    "type": "object",
    "properties": {
        "place": {"type": "string", "description": "Place name to geocode, e.g. 'Chennai' or 'Marina Beach, Chennai'."},
    },
    "required": ["place"],
}


async def run(place: str) -> ToolResult:
    headers = {"User-Agent": NOMINATIM_UA}
    params = {"q": place, "format": "jsonv2", "limit": "1", "addressdetails": "1"}
    try:
        async with httpx.AsyncClient(timeout=10, headers=headers) as client:
            r = await client.get("https://nominatim.openstreetmap.org/search", params=params)
        r.raise_for_status()
        hits = r.json()
    except Exception as e:  # noqa: BLE001
        return ToolResult(ok=False, summary="Geocoding failed", error=str(e))

    if not hits:
        return ToolResult(ok=False, summary=f"No location found for '{place}'", error="not_found")

    hit = hits[0]
    display_name = hit.get("display_name", place)
    lat, lon = hit.get("lat"), hit.get("lon")
    osm_url = f"https://www.openstreetmap.org/{hit.get('osm_type', 'node')}/{hit.get('osm_id', '')}"
    source = Source(title=display_name, url=osm_url, snippet=f"lat {lat}, lon {lon}", tool="nominatim_geocode")
    return ToolResult(
        ok=True,
        summary=f"{display_name} — {lat}, {lon}",
        sources=[source],
        data={"lat": lat, "lon": lon, "display_name": display_name},
    )


TOOL = Tool(
    name="nominatim_geocode",
    description="Resolve a place name to coordinates and administrative context (district/state/country).",
    parameters=SCHEMA,
    run=run,
    cost_hint="network, ~1s",
)
