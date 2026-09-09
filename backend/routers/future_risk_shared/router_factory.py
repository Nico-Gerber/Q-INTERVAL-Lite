"""Generic Future Risk FastAPI router factory."""

from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .contract import build_future_risk_response
from .request_parser import parse_future_risk_request


def create_future_risk_router(
    *,
    engine,
    path: str,
    tag: str,
    health_path: Optional[str] = None,
):
    """Create a complete Future Risk router around a compliant run.py module.

    Required engine functions:
        engine.initialise()
        engine.run_inference(model_input)

    Optional:
        engine.health()
    """

    router = APIRouter(tags=[tag])
    initialised = False

    def ensure_initialised():
        nonlocal initialised
        if initialised:
            return

        engine.initialise()
        initialised = True

    if health_path:
        @router.get(health_path)
        def model_health():
            try:
                ensure_initialised()
                if hasattr(engine, "health"):
                    return engine.health()
                return {"status": "ok", "model_loaded": True}
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail=f"Model failed to initialise: {exc}",
                ) from exc

    @router.post(path)
    async def predict(
        metadata_json: str = Form(...),
        files: List[UploadFile] = File(...),
    ):
        try:
            ensure_initialised()
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Model failed to initialise: {exc}",
            ) from exc

        model_input = await parse_future_risk_request(metadata_json, files)

        try:
            result = engine.run_inference(model_input)
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        try:
            return build_future_risk_response(
                yearly_risk=result["yearly_risk"],
                risk_level=result["risk_level"],
                exams=result["exams"],
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Model returned an invalid Future Risk engine result. "
                    f"Check the implementer contract: {exc}"
                ),
            ) from exc

    return router
