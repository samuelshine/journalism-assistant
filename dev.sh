#!/usr/bin/env bash
# One-command dev launch: API (FastAPI, :8000) + web (Vite, :5173).
# Requires: uv (python), node/npm, ollama running with the models in
# apps/api/config.py pulled. Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# uv installs here by default; a non-interactive shell won't have sourced
# the user's rc file, so make sure it's on PATH regardless.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found on PATH — install it: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama not found on PATH — install it first (https://ollama.com)." >&2
  exit 1
fi

if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "Ollama isn't responding on :11434 — start it with 'ollama serve' (or open the app) first." >&2
  exit 1
fi

cleanup() {
  echo "stopping…"
  kill "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ starting API on :8000"
(cd "$ROOT/apps/api" && uv run uvicorn main:app --reload --port 8000) &
API_PID=$!

echo "→ starting web on :5173"
(cd "$ROOT/apps/web" && npm run dev -- --port 5173) &
WEB_PID=$!

echo ""
echo "  NEWSROOM running:"
echo "    web    http://localhost:5173"
echo "    api    http://localhost:8000/api/health"
echo ""

wait
