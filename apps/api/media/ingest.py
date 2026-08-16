"""yt-dlp-backed URL ingest — paste a YouTube/podcast URL, get back a local
audio file ready for transcribe.py. A duration cap keeps a mis-pasted
3-hour video from silently taking the rest of class to process.
"""
from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

import config

MAX_DURATION_SECONDS = 20 * 60  # 20 min — plenty for a press conference clip


class IngestError(RuntimeError):
    pass


def _probe_sync(url: str) -> dict:
    import yt_dlp

    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
        return ydl.extract_info(url, download=False)


def _download_sync(url: str, out_stem: Path) -> Path:
    import yt_dlp

    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(out_stem) + ".%(ext)s",
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav", "preferredquality": "192"}],
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    result = out_stem.with_suffix(".wav")
    if not result.exists():
        raise IngestError("yt-dlp reported success but no output file was found")
    return result


async def fetch_audio(url: str) -> tuple[Path, str]:
    """Returns (local wav path, source title)."""
    try:
        info = await asyncio.to_thread(_probe_sync, url)
    except Exception as e:  # noqa: BLE001
        raise IngestError(f"Could not read that URL: {e}") from None

    duration = info.get("duration") or 0
    if duration and duration > MAX_DURATION_SECONDS:
        raise IngestError(
            f"That's {duration // 60} minutes long — over the {MAX_DURATION_SECONDS // 60}-minute demo cap. "
            "Use a shorter clip."
        )

    config.MEDIA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    out_stem = config.MEDIA_UPLOAD_DIR / f"yt_{uuid.uuid4().hex[:10]}"
    try:
        path = await asyncio.to_thread(_download_sync, url, out_stem)
    except Exception as e:  # noqa: BLE001
        raise IngestError(f"Download failed: {e}") from None

    return path, info.get("title") or url
