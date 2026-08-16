"""Phase 4 gate check: prove the demo survives with zero network access.

This is a stronger guarantee than physically unplugging a cable — it patches
httpx so *any* outbound request to a non-localhost host raises a connection
error, then runs the actual rehearsed demo prompts through the real
orchestrator/crew/media pipeline with DEMO_MODE on. If a fixture is missing
for something these prompts need, this fails loudly instead of the demo
finding out live on stage.

Run before every class: `uv run python scripts/dress_rehearsal.py`
"""
from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

import config  # noqa: E402

config.DEMO_MODE = True

_real_send = httpx.AsyncClient.send


async def _guarded_send(self, request, *args, **kwargs):
    host = request.url.host
    if host not in ("localhost", "127.0.0.1"):
        raise httpx.ConnectError(f"[dress rehearsal] network blocked — tried to reach {host}")
    return await _real_send(self, request, *args, **kwargs)


async def run_case(label: str, agen) -> bool:
    print(f"\n=== {label} ===")
    ok = True
    answer_count = 0
    last_args: dict[int, dict] = {}
    async for event in agen:
        if event.type == "tool_call":
            last_args[event.step] = event.args
        if event.type == "error":
            print(f"  ERROR: {event.message}")
            ok = False
        elif event.type == "tool_result" and not event.ok:
            print(f"  tool failed: {event.tool}({last_args.get(event.step)}) — {event.error}")
        elif event.type in ("answer_done", "transcript_ready"):
            answer_count += 1
    if answer_count == 0:
        print("  no answer/transcript produced")
        ok = False
    print("  PASS" if ok else "  FAIL")
    return ok


async def main() -> None:
    import agents
    import crew
    import media_pipeline
    import orchestrator

    results = []

    with patch.object(httpx.AsyncClient, "send", _guarded_send):
        results.append(
            await run_case(
                "Researcher — canonical dossier prompt",
                orchestrator.run("Build me a dossier on water scarcity in Chennai", agents.get("researcher")),
            )
        )
        results.append(
            await run_case(
                "Fact-Checker — true+fabricated claim",
                orchestrator.run(
                    'Fact-check this draft: "Chennai is the capital of Tamil Nadu and has over seven million '
                    'residents. In March 2024 the United Nations passed a binding law forcing India to triple '
                    "Chennai's desalination capacity within six months.\"",
                    agents.get("factchecker"),
                ),
            )
        )
        results.append(
            await run_case(
                "Ethicist — loaded language paragraph",
                orchestrator.run(
                    'Review this paragraph before we publish it: "Disgraced councilman Raj Sharma was slammed by '
                    "furious residents after sources say he secretly diverted water funds to his brother's company.\"",
                    agents.get("ethicist"),
                ),
            )
        )
        results.append(
            await run_case(
                "Desk Chief crew — research + write it up",
                crew.run_crew("Research Chennai water scarcity and write it up as a short news story"),
            )
        )

        # copy into the scratch uploads dir rather than pointing the pipeline
        # at the seed file directly — normalize_to_wav writes a sibling
        # .norm.wav next to whatever path it's given, and seed/ should stay
        # exactly what's committed.
        seed_audio = Path(__file__).resolve().parent.parent.parent.parent / "seed" / "sample_audio" / "chennai_water_interview.wav"
        config.MEDIA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        scratch_audio = config.MEDIA_UPLOAD_DIR / "dress_rehearsal_sample.wav"
        shutil.copy(seed_audio, scratch_audio)
        results.append(
            await run_case(
                "Studio — local sample clip (no network needed at all)",
                media_pipeline.process_upload(scratch_audio, seed_audio.name),
            )
        )

    print(f"\n{'=' * 40}")
    if all(results):
        print(f"ALL {len(results)} CASES PASSED with zero network access.")
        sys.exit(0)
    else:
        failed = len(results) - sum(results)
        print(f"{failed}/{len(results)} CASE(S) FAILED — fix before class. See scripts/record_fixtures.py.")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
