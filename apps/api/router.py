"""Task-kind -> model selection. This is deliberately a visible, tiny piece
of policy (not a black box) — every routing decision comes with a one-line
rationale that gets shown in the UI as a ModelBadge, so students see model
choice as an engineering decision rather than magic.

Only one model is kept hot at a time (24GB unified memory can't comfortably
hold two 12-14B models resident) — see media/ and orchestrator.py for the
keep_alive/warm-on-boot handling.
"""
from __future__ import annotations

from typing import Literal

import config

TaskKind = Literal[
    "plan", "reason", "factcheck", "edit", "longctx", "classify", "route", "embed"
]

_TABLE: dict[TaskKind, tuple[str, str]] = {
    "plan": (config.MODEL_REASONING, "planning needs the strongest reasoner"),
    "reason": (config.MODEL_REASONING, "multi-step reasoning, 32k context"),
    "factcheck": (config.MODEL_REASONING, "claim judgement needs care, not speed"),
    "edit": (config.MODEL_REASONING, "structural edits need strong reasoning"),
    "longctx": (config.MODEL_LONGCTX, "long transcript/document — biggest context window"),
    "classify": (config.MODEL_FAST, "quick tag/classify — cheapest model is enough"),
    "route": (config.MODEL_FAST, "routing decision — fast model, low stakes"),
    "embed": (config.MODEL_EMBED, "embedding model for semantic search"),
}


def select_model(task_kind: TaskKind) -> tuple[str, str]:
    """Returns (model_name, rationale)."""
    return _TABLE.get(task_kind, _TABLE["reason"])
