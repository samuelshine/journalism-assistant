from .base import Agent
from .desk_chief import AGENT as DESK_CHIEF
from .editor import AGENT as EDITOR
from .ethicist import AGENT as ETHICIST
from .factchecker import AGENT as FACTCHECKER
from .interviewer import AGENT as INTERVIEWER
from .researcher import AGENT as RESEARCHER
from .scout import AGENT as SCOUT

AGENTS: dict[str, Agent] = {
    a.id: a for a in [DESK_CHIEF, SCOUT, RESEARCHER, FACTCHECKER, INTERVIEWER, EDITOR, ETHICIST]
}


def get(agent_id: str) -> Agent:
    return AGENTS.get(agent_id, RESEARCHER)
