"""Semantic memory — every agent's final answer gets embedded and stored so
later runs (this session or a future one; it's a file on disk) can recall
"have we looked into this before?" via cosine similarity, not just keyword
match. Backed by the memory / memory_vec tables in db.py (sqlite-vec).
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import sqlite_vec

import config
import ollama_client
from store.db import cursor


@dataclass
class MemoryHit:
    id: int
    run_id: str | None
    kind: str
    text: str
    created_at: float
    distance: float


async def save(run_id: str | None, kind: str, text: str) -> int | None:
    """Embed and store one piece of memory. Best-effort: a failure here
    (e.g. embedding model not pulled) must never break the run it came
    from, so it's caught and swallowed rather than raised."""
    if not text.strip():
        return None
    try:
        vector = await ollama_client.embed(config.MODEL_EMBED, text)
    except Exception:
        return None

    with cursor() as cur:
        cur.execute(
            "INSERT INTO memory (run_id, kind, text, created_at) VALUES (?, ?, ?, ?)",
            (run_id, kind, text, time.time()),
        )
        memory_id = cur.lastrowid
        cur.execute(
            "INSERT INTO memory_vec (memory_id, embedding) VALUES (?, ?)",
            (memory_id, sqlite_vec.serialize_float32(vector)),
        )
    return memory_id


async def search(query: str, limit: int = 5) -> list[MemoryHit]:
    if not query.strip():
        return []
    try:
        vector = await ollama_client.embed(config.MODEL_EMBED, query)
    except Exception:
        return []

    with cursor() as cur:
        rows = cur.execute(
            """
            SELECT m.id, m.run_id, m.kind, m.text, m.created_at, v.distance
            FROM memory_vec v
            JOIN memory m ON m.id = v.memory_id
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY v.distance
            """,
            (sqlite_vec.serialize_float32(vector), limit),
        ).fetchall()

    return [
        MemoryHit(id=r["id"], run_id=r["run_id"], kind=r["kind"], text=r["text"], created_at=r["created_at"], distance=r["distance"])
        for r in rows
    ]
