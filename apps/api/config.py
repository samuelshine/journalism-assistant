"""Central config. Reads .env; every value has a safe local default so the
app runs with zero setup. Optional API keys are read here and nowhere else —
tools check `settings.has_key(name)` and self-disable rather than erroring."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT / ".env")

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

# Ollama defaults to num_ctx=4096 for every model regardless of what it was
# trained with — a verbose tool result (a batch of RSS headlines, a fetched
# article) can silently push the system prompt and the original question
# out of the model's effective window. 8192 is comfortable on 24GB unified
# memory for one 12-14B model resident at a time; raise via .env if needed.
MODEL_NUM_CTX = int(os.getenv("MODEL_NUM_CTX", "8192"))

# task-kind -> model. See apps/api/router.py for the rationale shown to users.
MODEL_REASONING = os.getenv("MODEL_REASONING", "qwen2.5:14b")
MODEL_LONGCTX = os.getenv("MODEL_LONGCTX", "mistral-nemo:12b")
MODEL_FAST = os.getenv("MODEL_FAST", "gemma4:e4b")
MODEL_EMBED = os.getenv("MODEL_EMBED", "nomic-embed-text")

DB_PATH = ROOT / "apps" / "api" / "store" / "newsroom.db"

# Optional free-tier keys. All tools work without these; presence just
# unlocks a richer source.
GUARDIAN_API_KEY = os.getenv("GUARDIAN_API_KEY", "")
DATA_GOV_IN_KEY = os.getenv("DATA_GOV_IN_KEY", "")
NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

DEMO_MODE = os.getenv("DEMO_MODE", "0") == "1"

MAX_AGENT_ITERATIONS = int(os.getenv("MAX_AGENT_ITERATIONS", "8"))
MAX_TOOL_CALLS_PER_RUN = int(os.getenv("MAX_TOOL_CALLS_PER_RUN", "12"))


def has_key(name: str) -> bool:
    return bool(
        {
            "guardian": GUARDIAN_API_KEY,
            "data_gov_in": DATA_GOV_IN_KEY,
            "newsapi": NEWSAPI_KEY,
            "youtube": YOUTUBE_API_KEY,
        }.get(name, "")
    )
