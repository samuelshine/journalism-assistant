"""NEWSROOM API — FastAPI app.

Phase 0: health check proving the whole stack is wired (Ollama reachable,
required models present, sqlite-vec loaded, one live external API reachable).
Phase 1: /api/run streams the agent loop (orchestrator.py) as SSE events —
this is the endpoint the Trace pane consumes.
"""
from __future__ import annotations

import time
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import agents
import config
import ollama_client
import orchestrator
from events import sse_format
from store import db
from tools.web_ua import WIKIMEDIA_UA

app = FastAPI(title="NEWSROOM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

REQUIRED_MODELS = {config.MODEL_REASONING, config.MODEL_LONGCTX, config.MODEL_FAST, config.MODEL_EMBED}


def _bare_name(name: str) -> str:
    """Ollama's /api/tags appends ':latest' when no tag was given at pull
    time — normalize it away so 'nomic-embed-text' (config) matches
    'nomic-embed-text:latest' (API response)."""
    return name.removesuffix(":latest")


@app.get("/api/health")
async def health():
    checks: dict[str, dict] = {}

    # Ollama reachability + model presence
    try:
        models = await ollama_client.list_models()
        names = {_bare_name(m["name"]) for m in models}
        required = {_bare_name(m) for m in REQUIRED_MODELS}
        missing = sorted(required - names)
        checks["ollama"] = {
            "ok": not missing,
            "models_present": sorted(required & names),
            "missing": missing,
        }
    except Exception as e:  # noqa: BLE001 - health check surfaces any failure verbatim
        checks["ollama"] = {"ok": False, "error": str(e)}

    # sqlite-vec
    try:
        version = db.sqlite_vec_version()
        checks["sqlite_vec"] = {"ok": True, "version": version}
    except Exception as e:  # noqa: BLE001
        checks["sqlite_vec"] = {"ok": False, "error": str(e)}

    # one live external API (Wikipedia REST — keyless, no rate-limit worries)
    try:
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": WIKIMEDIA_UA}) as client:
            r = await client.get(
                "https://en.wikipedia.org/api/rest_v1/page/summary/Journalism"
            )
        checks["external_api"] = {
            "ok": r.status_code == 200,
            "status": r.status_code,
            "latency_ms": round((time.monotonic() - t0) * 1000),
            "probe": "wikipedia",
        }
    except Exception as e:  # noqa: BLE001
        checks["external_api"] = {"ok": False, "error": str(e)}

    overall_ok = all(c.get("ok") for c in checks.values())
    return {"ok": overall_ok, "checks": checks, "demo_mode": config.DEMO_MODE}


@app.on_event("startup")
async def warm_models():
    """Fire-and-forget warm of the primary reasoning model so the demo's
    first request isn't eaten by a cold load."""
    import asyncio

    async def _warm():
        try:
            await ollama_client.warm(config.MODEL_REASONING)
        except Exception:
            pass  # health page will surface the real problem if any

    asyncio.create_task(_warm())


@app.get("/api/agents")
async def list_agents():
    return [
        {"id": a.id, "name": a.name, "description": a.description, "color": a.color, "tools": a.tools}
        for a in agents.AGENTS.values()
    ]


class RunRequest(BaseModel):
    prompt: str
    agent: str = "researcher"


@app.post("/api/run")
async def run_agent(req: RunRequest):
    agent = agents.get(req.agent)

    async def event_stream():
        async for event in orchestrator.run(req.prompt, agent):
            yield sse_format(event)

    return EventSourceResponse(event_stream())


# --- static serve of built frontend (demo mode / single-command run) ---
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
if WEB_DIST.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIST), html=True), name="web")
