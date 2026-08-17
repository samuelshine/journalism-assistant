# NEWSROOM

An agentic AI newsroom desk built to *show its work*. It's a teaching tool as much as a
functioning app: instead of hiding the agent loop behind a framework (LangGraph, CrewAI,
whatever), NEWSROOM's tool-calling loop is hand-rolled in plain Python against Ollama's
`/api/chat` endpoint — every "the AI is thinking / calling a tool / handing off to another
agent" step is a real event you can read, not a marketing simplification. It was built for a
BA Media & Journalism class to demystify what "agentic AI" actually is, one visible step at a
time.

Everything runs on infrastructure a student (or anyone) can get for free: local models via
[Ollama](https://ollama.com), and a handful of no-signup or free-tier-instant-approval news
and reference APIs. No OpenAI/Anthropic API key, no credit card, anywhere in this repo.

## What it does

- **The Desk** — ask a question, watch a crew of specialist agents (or one agent directly)
  research, check facts, and write, with every tool call and handoff narrated in plain
  English and full technical detail one click away.
- **Draft** — promote a finished answer into a persistent, editable article: hand-edit it
  directly, ask the desk to add a section or propose a revision (never applied without your
  explicit accept), and export to Markdown, plain text, or a real `.docx`.
- **Studio** — drop in (or record) audio, get a transcript with speaker turns, send any
  segment straight to the Fact-Checker or Interviewer.
- **Compare** — a hallucination-detection lab: feed the same prompt to different models side
  by side and see where they diverge from the sourced facts.
- **Beats** — schedule a recurring topic and get a fresh sourced brief on an interval,
  without re-asking.

Seven agents split the work: **Desk Chief** (routes a request to the right staff, in the right
order), **Scout** (what's moving right now), **Researcher** (sourced dossiers and timelines),
**Fact-Checker** (verdicts against live sources, not vibes), **Interviewer** (questions from a
transcript or brief), **Editor** (shapes material it's actually given — never invents a
source to fill a gap), and **Ethicist** (flags loaded language, missing context, fairness
issues).

## Architecture, briefly

- **Backend**: FastAPI + SSE (`sse_starlette`) streaming every agent event to the browser as
  it happens. `apps/api/orchestrator.py` is the entire agent loop — no framework — plus a
  `SourceRegistry` that keeps citation numbers stable and continuous across a whole run or
  pipeline.
- **Frontend**: React + Vite + Tailwind, an editorial (not dev-console) design system —
  masthead red, serif typesetting, drop caps on generated copy — so it reads like a
  newsroom, not a terminal.
- **Models**: routed by task kind (`apps/api/router.py`) across a small local roster —
  reasoning, long-context, and fast models, picked per step and shown to the user with the
  reason why.
- **Storage**: SQLite, zero setup, file-based (`apps/api/store/`).

## Setup

**Prerequisites**: [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python),
[Node.js](https://nodejs.org/) 20+, and [Ollama](https://ollama.com) running locally.

Pull the models NEWSROOM expects (matches the defaults in `apps/api/config.py` — override any
of them in `.env` if you'd rather use something else your machine already has):

```bash
ollama pull qwen2.5:14b        # reasoning — routing, fact-checking, synthesis
ollama pull mistral-nemo:12b   # long-context — big dossiers, long transcripts
ollama pull gemma4:e4b         # fast — quick classification steps
ollama pull nomic-embed-text   # embeddings — memory search
```

> If a model name above doesn't match what you actually pulled (Ollama silently appends
> `:latest` to an untagged pull, and model catalogs change), check `ollama list` and set the
> matching `MODEL_*` variable in `.env` — see `.env.example`.

Then, from the repo root:

```bash
cp .env.example .env   # optional — every value has a working default
./dev.sh
```

That starts the API on `:8000` and the web app on `:5173`. Open the latter.

### Optional free API keys

None of these are required — every tool self-disables gracefully without a key and the app
runs fully on Wikipedia, Wikidata, GDELT, OpenAlex, Nominatim, RSS, and the Wayback Machine
alone. Add any of these to `.env` to unlock one more source:

| Key | Unlocks | Get one |
|---|---|---|
| `GUARDIAN_API_KEY` | A real `guardian_search` tool (Researcher, Scout, Fact-Checker) — The Guardian's archive alongside GDELT's broader sweep | [open-platform.theguardian.com](https://open-platform.theguardian.com/access/) — free, instant |
| `DATA_GOV_IN_KEY` | Reserved for a future tool — nothing reads it yet | [data.gov.in](https://data.gov.in/user/register) — free, instant |
| `NEWSAPI_KEY` | Reserved for a future tool — nothing reads it yet | [newsapi.org](https://newsapi.org/register) — free dev tier |
| `YOUTUBE_API_KEY` | Reserved for a future tool — nothing reads it yet (YouTube *links* already work in Studio via `yt-dlp`, no key needed) | [console.cloud.google.com](https://console.cloud.google.com/) — free, needs a Google Cloud project |

### Demo Mode — no network required

Set `DEMO_MODE=1` (or run `DEMO_MODE=1 ./dev.sh`) to serve every tool call from recorded
fixtures (`seed/fixtures/demo_fixtures.json`) instead of live APIs — the whole app, all seven
agents, works identically with zero network access. This is what you want for a live
classroom demo where conference wifi is not to be trusted. `apps/api/scripts/dress_rehearsal.py`
is the automated version of the same check — it drives all five agent paths with the network
hard-blocked and confirms nothing broke.

## Repo layout

```
apps/api/    FastAPI backend — agents, tools, orchestrator, SQLite store
apps/web/    React frontend — Vite, Tailwind, SSE client
seed/        Demo Mode fixtures
dev.sh       One-command dev launch (API + web)
```

## Troubleshooting

- **"Ollama isn't responding on :11434"** — start it (`ollama serve`, or open the desktop app)
  before running `dev.sh`.
- **A run comes back oddly off-topic or truncated** — the model's context window may be
  smaller than expected; `MODEL_NUM_CTX` in `.env` raises it (default `8192`).
- **A model name in `.env` doesn't match anything Ollama has** — run `ollama list` and check
  for a `:latest` suffix Ollama silently added to an untagged pull.
