from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from . import qesfrp_backend_v2


router = APIRouter(tags=["QMLFutureRisk"])

_artifacts_loaded = False


def _ensure_qesfrp_artifacts_loaded():
    """Load the QeSFRP model artifacts once, on first request."""
    global _artifacts_loaded
    if not _artifacts_loaded:
        qesfrp_backend_v2.startup_event()
        _artifacts_loaded = True
    return qesfrp_backend_v2


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
