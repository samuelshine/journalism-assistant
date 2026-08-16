"""Shared types every tool module implements. A Tool is a self-describing
unit: a JSON schema the model sees, plus a run() coroutine. Provenance is
structural — run() returns Source records, not just text, so nothing a tool
finds can silently become an uncited claim downstream.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable


@dataclass
class Source:
    title: str
    url: str
    snippet: str = ""
    published_at: str | None = None
    tool: str = ""
    fetched_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "published_at": self.published_at,
            "tool": self.tool,
            "fetched_at": self.fetched_at,
        }


@dataclass
class ToolResult:
    ok: bool
    summary: str
    sources: list[Source] = field(default_factory=list)
    data: Any = None
    error: str | None = None


RunFn = Callable[..., Awaitable[ToolResult]]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    run: RunFn
    cost_hint: str = "network call, <2s typical"
    requires_key: str | None = None  # config.has_key() name; None = always on

    def schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
