"""Article storage — a persisted, editable document a journalist promotes a
run's answer into. Distinct from a run (ephemeral, one question) and from
memory (unstructured semantic recall): an article is the actual deliverable,
with a stable id a journalist keeps coming back to. Plain sqlite reads/
writes, no ORM, same shape as store/beats.py.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from typing import Any

from store.db import cursor


@dataclass
class Article:
    id: str
    title: str
    body_markdown: str
    sources: list[dict[str, Any]]
    origin_run_id: str | None
    created_at: float
    updated_at: float


def _row_to_article(r) -> Article:
    return Article(
        id=r["id"],
        title=r["title"],
        body_markdown=r["body_markdown"],
        sources=json.loads(r["sources"]),
        origin_run_id=r["origin_run_id"],
        created_at=r["created_at"],
        updated_at=r["updated_at"],
    )


def create_article(title: str, body_markdown: str, sources: list[dict[str, Any]], origin_run_id: str | None) -> Article:
    now = time.time()
    article = Article(
        id=uuid.uuid4().hex[:10],
        title=title,
        body_markdown=body_markdown,
        sources=sources,
        origin_run_id=origin_run_id,
        created_at=now,
        updated_at=now,
    )
    with cursor() as cur:
        cur.execute(
            "INSERT INTO articles (id, title, body_markdown, sources, origin_run_id, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (article.id, article.title, article.body_markdown, json.dumps(sources), article.origin_run_id, now, now),
        )
    return article


def list_articles() -> list[Article]:
    with cursor() as cur:
        rows = cur.execute("SELECT * FROM articles ORDER BY updated_at DESC").fetchall()
    return [_row_to_article(r) for r in rows]


def get_article(article_id: str) -> Article | None:
    with cursor() as cur:
        row = cur.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    return _row_to_article(row) if row else None


def update_article(
    article_id: str,
    title: str | None = None,
    body_markdown: str | None = None,
    sources: list[dict[str, Any]] | None = None,
) -> Article | None:
    existing = get_article(article_id)
    if existing is None:
        return None
    new_title = title if title is not None else existing.title
    new_body = body_markdown if body_markdown is not None else existing.body_markdown
    new_sources = sources if sources is not None else existing.sources
    now = time.time()
    with cursor() as cur:
        cur.execute(
            "UPDATE articles SET title = ?, body_markdown = ?, sources = ?, updated_at = ? WHERE id = ?",
            (new_title, new_body, json.dumps(new_sources), now, article_id),
        )
    return get_article(article_id)


def delete_article(article_id: str) -> None:
    with cursor() as cur:
        cur.execute("DELETE FROM articles WHERE id = ?", (article_id,))
