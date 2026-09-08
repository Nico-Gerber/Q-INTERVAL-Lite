from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .response_builder import build_session_response
from .schemas import SessionAnalysisResponse


def create_session_analysis_router(
    *,
    engine,
    prefix: str,
    tag: str,
    model_name: str,
) -> APIRouter:
    """Create a complete Session Analysis router around a compliant run.py module.

    Required engine function:
        engine.run(views: dict[str, bytes], age: float | None) -> dict
    """

    router = APIRouter(prefix=prefix, tags=[tag])

    @router.post("/predict-four-views", response_model=SessionAnalysisResponse)
    async def predict_four_views(
        l_cc: UploadFile = File(...),
        l_mlo: UploadFile = File(...),
        r_cc: UploadFile = File(...),
        r_mlo: UploadFile = File(...),
        age: Optional[float] = Form(None),
    ):
        uploads = {"L-CC": l_cc, "L-MLO": l_mlo, "R-CC": r_cc, "R-MLO": r_mlo}

        for slot, upload in uploads.items():
            if not upload.content_type or not upload.content_type.startswith("image/"):
                raise HTTPException(
                    status_code=400,
                    detail=f"{slot} must be an image file.",
                )

        views = {slot: await upload.read() for slot, upload in uploads.items()}

        try:
            model_result = engine.run(views, age)
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"{model_name} session analysis failed: {exc}",
            ) from exc

        try:
            return build_session_response(model_result, model_name)
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Engine returned an invalid result. Check the implementer contract: {exc}",
            ) from exc

    return router
