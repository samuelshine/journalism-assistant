"""SQLite + sqlite-vec store. One file DB, WAL mode, vector table for
semantic memory (Phase 2). Kept intentionally small — this is a teaching
app, not a production data layer.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

import sqlite_vec

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    started_at REAL NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    tool TEXT NOT NULL,
    url TEXT,
    title TEXT,
    snippet TEXT,
    published_at TEXT,
    fetched_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS beats (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    interval_minutes INTEGER NOT NULL,
    created_at REAL NOT NULL,
    last_run_at REAL
);

CREATE TABLE IF NOT EXISTS briefs (
    id TEXT PRIMARY KEY,
    beat_id TEXT NOT NULL REFERENCES beats(id),
    created_at REAL NOT NULL,
    text TEXT NOT NULL,
    sources TEXT NOT NULL
);
"""


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    # vec0 virtual table for memory embeddings (768-dim: nomic-embed-text)
    conn.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
            memory_id INTEGER PRIMARY KEY,
            embedding FLOAT[768]
        )
        """
    )
    conn.commit()
    return conn


_conn: sqlite3.Connection | None = None


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = _connect(config.DB_PATH)
    return _conn


@contextmanager
def cursor():
    conn = get_conn()
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    finally:
        cur.close()


def sqlite_vec_version() -> str:
    conn = get_conn()
    (version,) = conn.execute("SELECT vec_version()").fetchone()
    return version
