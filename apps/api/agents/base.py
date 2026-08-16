"""An Agent is a role: a system prompt plus a restricted tool list plus an
identity color for the UI. Restricting tools per-agent is deliberate — it's
what makes 'agent' mean something more specific than 'the model with every
tool bolted on'."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Agent:
    id: str
    name: str
    description: str
    system_prompt: str
    tools: list[str]
    color: str  # CSS custom-property name, e.g. 'agent-researcher'
