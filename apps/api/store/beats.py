"""Beat storage — a beat is a standing topic the desk monitors; a brief is
one research pass over it. Plain sqlite reads/writes, no ORM — this app's
data layer stays deliberately small.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from typing import Any

from store.db import cursor


@dataclass
class Beat:
    id: str
    topic: str
    interval_minutes: int
    created_at: float
    last_run_at: float | None


@dataclass
class Brief:
    id: str
    beat_id: str
    created_at: float
    text: str
    sources: list[dict[str, Any]]


def _row_to_beat(r) -> Beat:
    return Beat(id=r["id"], topic=r["topic"], interval_minutes=r["interval_minutes"], created_at=r["created_at"], last_run_at=r["last_run_at"])


def _row_to_brief(r) -> Brief:
    return Brief(id=r["id"], beat_id=r["beat_id"], created_at=r["created_at"], text=r["text"], sources=json.loads(r["sources"]))


def create_beat(topic: str, interval_minutes: int) -> Beat:
    beat = Beat(id=uuid.uuid4().hex[:10], topic=topic, interval_minutes=interval_minutes, created_at=time.time(), last_run_at=None)
    with cursor() as cur:
        cur.execute(
            "INSERT INTO beats (id, topic, interval_minutes, created_at, last_run_at) VALUES (?, ?, ?, ?, ?)",
            (beat.id, beat.topic, beat.interval_minutes, beat.created_at, beat.last_run_at),
        )
    return beat


def list_beats() -> list[Beat]:
    with cursor() as cur:
        rows = cur.execute("SELECT * FROM beats ORDER BY created_at DESC").fetchall()
    return [_row_to_beat(r) for r in rows]


def get_beat(beat_id: str) -> Beat | None:
    with cursor() as cur:
        row = cur.execute("SELECT * FROM beats WHERE id = ?", (beat_id,)).fetchone()
    return _row_to_beat(row) if row else None


def delete_beat(beat_id: str) -> None:
    with cursor() as cur:
        cur.execute("DELETE FROM briefs WHERE beat_id = ?", (beat_id,))
        cur.execute("DELETE FROM beats WHERE id = ?", (beat_id,))


def touch_beat(beat_id: str, when: float | None = None) -> None:
    with cursor() as cur:
        cur.execute("UPDATE beats SET last_run_at = ? WHERE id = ?", (when or time.time(), beat_id))


def save_brief(beat_id: str, text: str, sources: list[dict[str, Any]]) -> Brief:
    brief = Brief(id=uuid.uuid4().hex[:10], beat_id=beat_id, created_at=time.time(), text=text, sources=sources)
    with cursor() as cur:
        cur.execute(
            "INSERT INTO briefs (id, beat_id, created_at, text, sources) VALUES (?, ?, ?, ?, ?)",
            (brief.id, brief.beat_id, brief.created_at, brief.text, json.dumps(sources)),
        )
    return brief


def list_briefs(beat_id: str) -> list[Brief]:
    with cursor() as cur:
        rows = cur.execute("SELECT * FROM briefs WHERE beat_id = ? ORDER BY created_at DESC", (beat_id,)).fetchall()
    return [_row_to_brief(r) for r in rows]
