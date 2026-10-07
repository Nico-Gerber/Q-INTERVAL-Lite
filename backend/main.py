import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
import model_store
from guards import limit_analysis, require_approved_user

# Session Analysis
from routers.classical_session_analysis.router import router as classical_session_router
from routers.quantum_session_analysis.router import router as quantum_session_router

# Future Risk Analysis
from routers.future_risk_classical.router import router as classical_future_risk_router
from routers.future_risk_qml.router import router as quantum_future_risk_router

# Admin user management
from routers.admin.router import router as admin_router

# Shared LLM explanation endpoints
from routers.shared.Explain import (
    router as explain_router,
    future_risk_router as explain_future_risk_router,
)

logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
for noisy in ("httpx", "httpcore", "asyncio"):   # their debug output includes request URLs and user ids
    logging.getLogger(noisy).setLevel(logging.WARNING)
config.validate_for_production()
logging.getLogger(__name__).info(
    "Explanation models: text=%s (fallbacks=%s) vlm=%s (fallbacks=%s)",
    config.OPENROUTER_TEXT_MODEL, config.OPENROUTER_TEXT_FALLBACKS,
    config.OPENROUTER_VLM_MODEL, config.OPENROUTER_VLM_FALLBACKS,
)

model_store.start_background_download()   # fetch weights Git LFS can't provide; no-op locally

app = FastAPI(
    title="Q-Interval Lite API",
    version="0.1.0",
    # Interactive API docs are for development only.
    docs_url=None if config.IS_PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if config.IS_PRODUCTION else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Model inference: approved users only, and one analysis at a time (memory).
inference = [Depends(require_approved_user), Depends(model_store.require_models_ready), Depends(limit_analysis)]
app.include_router(classical_session_router, dependencies=inference)
app.include_router(quantum_session_router, dependencies=inference)
app.include_router(classical_future_risk_router, dependencies=inference)
app.include_router(quantum_future_risk_router, dependencies=inference)

# LLM explanations: approved users only.
app.include_router(explain_router, dependencies=[Depends(require_approved_user)])
app.include_router(explain_future_risk_router, dependencies=[Depends(require_approved_user)])

# Admin user management (each route additionally requires an approved admin)
app.include_router(admin_router)


@app.get("/health")
def health():
    """Public liveness check for Railway. Reveals nothing about the system."""
    return {"status": "ok"}
