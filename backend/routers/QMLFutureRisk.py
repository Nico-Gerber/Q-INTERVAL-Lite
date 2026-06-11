import importlib.util
from pathlib import Path
from typing import Any, List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile


router = APIRouter(tags=["QMLFutureRisk"])

REPO_ROOT = Path(__file__).resolve().parents[2]
QESFRP_BACKEND_PATH = REPO_ROOT / "Future Risk QML" / "SequentialPrediction" / "QeSFRP-Backend.py"

_qesfrp_backend: Any = None
_qesfrp_loaded = False


def _load_qesfrp_backend():
    global _qesfrp_backend

    if _qesfrp_backend is not None:
        return _qesfrp_backend

    if not QESFRP_BACKEND_PATH.exists():
        raise FileNotFoundError(f"Missing QeSFRP backend script: {QESFRP_BACKEND_PATH}")

    spec = importlib.util.spec_from_file_location("qesfrp_backend", QESFRP_BACKEND_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import QeSFRP backend script: {QESFRP_BACKEND_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _qesfrp_backend = module
    return module


def _ensure_qesfrp_artifacts_loaded():
    global _qesfrp_loaded

    module = _load_qesfrp_backend()
    if not _qesfrp_loaded:
        module.startup_event()
        _qesfrp_loaded = True
    return module


@router.get("/qml-future-risk-view-aware/health")
def health():
    try:
        module = _ensure_qesfrp_artifacts_loaded()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"QeSFRP model failed to load: {exc}")

    return module.health()


@router.post("/qml-future-risk-view-aware/")
async def qml_future_risk_view_aware(
    metadata_json: str = Form(...),
    files: List[UploadFile] = File(...),
):
    try:
        module = _ensure_qesfrp_artifacts_loaded()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"QeSFRP model failed to load: {exc}")

    return await module.qml_future_risk_view_aware(
        metadata_json=metadata_json,
        files=files,
    )
