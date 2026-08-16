"""Demo Mode fixture lookup. Every fixture in seed/fixtures/demo_fixtures.json
is a real recorded tool output (see scripts/record_fixtures.py) — Demo Mode
is 'this specific rehearsed demo works with the network cable pulled', not
a general offline cache. A tool call that doesn't match a fixture falls
through to the real network call, which will simply fail offline the same
way it always does — handled the same as any other tool failure.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent.parent
FIXTURES_PATH = ROOT / "seed" / "fixtures" / "demo_fixtures.json"

_fixtures: dict[str, list[dict[str, Any]]] | None = None


def _load() -> dict[str, list[dict[str, Any]]]:
    global _fixtures
    if _fixtures is None:
        _fixtures = json.loads(FIXTURES_PATH.read_text()) if FIXTURES_PATH.exists() else {}
    return _fixtures


def lookup(tool_name: str, args: dict[str, Any]) -> dict[str, Any] | None:
    entries = _load().get(tool_name, [])
    haystack = " ".join(str(v) for v in args.values()).lower()
    for entry in entries:
        if all(str(keyword).lower() in haystack for keyword in entry["match"]):
            return entry["result"]
    return None
