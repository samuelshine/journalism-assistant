from .base import Agent
from .editor import AGENT as EDITOR
from .researcher import AGENT as RESEARCHER

AGENTS: dict[str, Agent] = {a.id: a for a in [RESEARCHER, EDITOR]}


def get(agent_id: str) -> Agent:
    return AGENTS.get(agent_id, RESEARCHER)
