"""Thin wrapper over Ollama's OpenAI-compatible endpoint. No agent framework
sits between this and orchestrator.py — the loop in orchestrator.py calls
these functions directly so every reasoning/tool-call step is visible and
traceable, which is the whole point of the app.
"""
from __future__ import annotations

from typing import Any, AsyncIterator

import httpx

import config


class OllamaError(RuntimeError):
    pass


async def list_models() -> list[dict[str, Any]]:
    async with httpx.AsyncClient(base_url=config.OLLAMA_HOST, timeout=10) as client:
        r = await client.get("/api/tags")
        r.raise_for_status()
        return r.json().get("models", [])


async def warm(model: str) -> None:
    """Load a model into memory ahead of the demo so the first real request
    isn't eaten by a cold start. Uses the same num_ctx as real requests —
    Ollama reloads the model if a later request asks for a different
    context size, which would defeat the point of warming it."""
    async with httpx.AsyncClient(base_url=config.OLLAMA_HOST, timeout=120) as client:
        await client.post(
            "/api/generate",
            json={
                "model": model,
                "prompt": "",
                "keep_alive": "30m",
                "options": {"num_ctx": config.MODEL_NUM_CTX},
            },
        )


async def chat(
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    stream: bool = False,
) -> dict[str, Any]:
    """Non-streaming chat completion (used for tool-calling steps, where we
    need the whole message to inspect tool_calls before acting)."""
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "options": {"num_ctx": config.MODEL_NUM_CTX},
    }
    if tools:
        payload["tools"] = tools
    async with httpx.AsyncClient(base_url=config.OLLAMA_HOST, timeout=180) as client:
        r = await client.post("/api/chat", json=payload)
        r.raise_for_status()
        return r.json()


async def chat_stream(
    model: str, messages: list[dict[str, Any]]
) -> AsyncIterator[str]:
    """Streaming chat for the final answer (no tools) — used to drive
    answer_token SSE events token-by-token."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"num_ctx": config.MODEL_NUM_CTX},
    }
    async with httpx.AsyncClient(base_url=config.OLLAMA_HOST, timeout=180) as client:
        async with client.stream("POST", "/api/chat", json=payload) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line:
                    continue
                import json

                chunk = json.loads(line)
                msg = chunk.get("message", {})
                text = msg.get("content", "")
                if text:
                    yield text
                if chunk.get("done"):
                    break


async def embed(model: str, text: str) -> list[float]:
    async with httpx.AsyncClient(base_url=config.OLLAMA_HOST, timeout=60) as client:
        r = await client.post("/api/embeddings", json={"model": model, "prompt": text})
        r.raise_for_status()
        return r.json()["embedding"]
