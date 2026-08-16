"""NEWSROOM API — FastAPI app.

Phase 0: health check proving the whole stack is wired (Ollama reachable,
required models present, sqlite-vec loaded, one live external API reachable).
Phase 1: /api/run streams the agent loop (orchestrator.py) as SSE events —
this is the endpoint the Trace pane consumes.
"""
from __future__ import annotations

import time
from pathlib import Path

import shutil
import uuid

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import agents
import config
import crew
import media_pipeline
import ollama_client
import orchestrator
from events import sse_format
from media.transcribe import is_warm as whisper_is_warm
from media.transcribe import warm as warm_whisper
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

    # ffmpeg — required for every media/studio pipeline step
    ffmpeg_path = shutil.which("ffmpeg")
    checks["ffmpeg"] = {"ok": ffmpeg_path is not None, "path": ffmpeg_path}

    # whisper — reports whether the model is warm, not just installed;
    # not being warm yet isn't a failure (it loads on first real use), so
    # this doesn't count toward overall_ok the way the other checks do
    checks["whisper"] = {"ok": True, "warm": whisper_is_warm(), "model": config.WHISPER_MODEL_SIZE}

    overall_ok = all(c.get("ok") for k, c in checks.items() if k != "whisper")
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
    asyncio.create_task(warm_whisper())


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


class CrewRequest(BaseModel):
    prompt: str


@app.post("/api/crew")
async def run_crew(req: CrewRequest):
    async def event_stream():
        async for event in crew.run_crew(req.prompt):
            yield sse_format(event)

    return EventSourceResponse(event_stream())


@app.post("/api/media/upload")
async def media_upload(file: UploadFile = File(...)):
    """Handles both a dropped file and a browser mic recording — a
    MediaRecorder blob (webm/opus) is just another ffmpeg-readable input,
    so there's no separate mic endpoint."""
    config.MEDIA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix or ".webm"
    dest = config.MEDIA_UPLOAD_DIR / f"upload_{uuid.uuid4().hex[:10]}{suffix}"
    contents = await file.read()
    if not contents:
        raise HTTPException(400, "Empty upload")
    dest.write_bytes(contents)

    async def event_stream():
        async for event in media_pipeline.process_upload(dest, file.filename or dest.name):
            yield sse_format(event)

    return EventSourceResponse(event_stream())


class MediaUrlRequest(BaseModel):
    url: str


@app.post("/api/media/youtube")
async def media_youtube(req: MediaUrlRequest):
    async def event_stream():
        async for event in media_pipeline.process_url(req.url):
            yield sse_format(event)

    return EventSourceResponse(event_stream())


# --- static serve of built frontend (demo mode / single-command run) ---
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
if WEB_DIST.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIST), html=True), name="web")
