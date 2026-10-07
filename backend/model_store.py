"""Makes sure model weights are really on disk before inference runs.

Railway does not pull Git LFS, so LFS-tracked weights arrive as ~130-byte pointer stubs. At startup we
look at every file in models_manifest.json and download any that are missing or are still a stub,
from a private Hugging Face repo (HF_MODEL_REPO + HF_TOKEN) or a public URL. Downloads run in a
background thread so the server (and Railway's healthcheck) comes up immediately; inference
endpoints answer 503 "still loading" until everything is in place.

Local development: real files are already present, so this is a no-op.
"""
import json
import logging
import os
import threading
from pathlib import Path

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BACKEND_DIR / "models_manifest.json"
_LFS_MAGIC = b"version https://git-lfs"

_state = {"status": "pending", "error": None}   # pending | downloading | ready | failed
_lock = threading.Lock()


def _is_usable(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size == 0:
        return False
    with path.open("rb") as f:
        return not f.read(len(_LFS_MAGIC)).startswith(_LFS_MAGIC)


def _source_url(entry: dict) -> tuple[str, dict]:
    if entry.get("url"):
        return entry["url"], {}
    repo, token = os.getenv("HF_MODEL_REPO"), os.getenv("HF_TOKEN")
    if not repo:
        raise RuntimeError(f"{entry['path']} is missing and HF_MODEL_REPO is not set")
    revision = os.getenv("HF_MODEL_REVISION", "main")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return f"https://huggingface.co/{repo}/resolve/{revision}/{entry['hf']}", headers


def _download(entry: dict, dest: Path) -> None:
    url, headers = _source_url(entry)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    logger.info("Downloading %s", dest.name)
    with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=httpx.Timeout(30.0, read=300.0)) as r:
        if r.status_code != 200:
            raise RuntimeError(f"download of {dest.name} failed with HTTP {r.status_code}")
        with tmp.open("wb") as f:
            for chunk in r.iter_bytes(1024 * 1024):
                f.write(chunk)
    tmp.replace(dest)   # atomic: a half-written file is never mistaken for a model
    if not _is_usable(dest):
        raise RuntimeError(f"{dest.name} downloaded but is not a valid file")


def ensure_models() -> None:
    entries = json.loads(MANIFEST_PATH.read_text())["files"] if MANIFEST_PATH.exists() else []
    missing = [(e, BACKEND_DIR / e["path"]) for e in entries if not _is_usable(BACKEND_DIR / e["path"])]
    if not missing:
        logger.info("All %d model files present", len(entries))
        _state.update(status="ready", error=None)
        return
    _state.update(status="downloading", error=None)
    logger.info("%d of %d model files need downloading", len(missing), len(entries))
    try:
        for entry, dest in missing:
            _download(entry, dest)
    except Exception as exc:
        logger.exception("Model download failed")
        _state.update(status="failed", error=str(exc))
        return
    logger.info("Model files ready")
    _state.update(status="ready", error=None)


def start_background_download() -> None:
    with _lock:
        if _state["status"] != "pending":
            return
        _state["status"] = "downloading"
    threading.Thread(target=ensure_models, name="model-download", daemon=True).start()


async def require_models_ready():
    """Dependency for inference routes."""
    if _state["status"] == "ready":
        return
    if _state["status"] == "failed":
        raise HTTPException(503, "The analysis models are unavailable. Please contact an administrator.")
    raise HTTPException(503, "The analysis models are still loading. Please try again in a minute.")
