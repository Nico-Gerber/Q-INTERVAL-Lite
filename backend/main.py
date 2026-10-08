import logging
import os

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

for noisy in ("httpx", "httpcore", "asyncio", "pennylane", "urllib3", "PIL", "matplotlib", "numba"):
    logging.getLogger(noisy).setLevel(logging.WARNING)
config.validate_for_production()
if config.TORCH_NUM_THREADS > 0:
    import torch
    torch.set_num_threads(config.TORCH_NUM_THREADS)
    logging.getLogger(__name__).info("PyTorch CPU threads: %d", config.TORCH_NUM_THREADS)
logging.getLogger(__name__).info(
    "Explanation models: text=%s (fallbacks=%s) vlm=%s (fallbacks=%s)",
    config.OPENROUTER_TEXT_MODEL, config.OPENROUTER_TEXT_FALLBACKS,
    config.OPENROUTER_VLM_MODEL, config.OPENROUTER_VLM_FALLBACKS,
)

def _startup_checks():
    """Fail loudly if a library the models depend on is missing.

    Some code (e.g. the future-risk feature extractor) quietly skips work when an optional library is absent
    and still returns confident, wrong answers. In production we refuse to start instead; elsewhere we log an ERROR.
    """
    import importlib
    import importlib.metadata as md

    log = logging.getLogger(__name__)
    required = {"skimage": "scikit-image", "scipy": "scipy", "sklearn": "scikit-learn", "matplotlib": "matplotlib",
                "cv2": "opencv-python-headless", "torch": "torch", "torchvision": "torchvision",
                "pennylane": "pennylane", "joblib": "joblib", "pandas": "pandas",
                "albumentations": "albumentations", "pytorch_grad_cam": "grad-cam"}
    if os.getenv("FUTURE_RISK_ENGINE", "v2c").strip().lower() == "v2d":
        required["omegaconf"] = "omegaconf"   # the V2D checkpoint cannot be unpickled without it
    missing = []
    for module, package in required.items():
        try:
            importlib.import_module(module)
        except Exception as exc:   # ImportError, or a broken native library
            missing.append(f"{package} ({type(exc).__name__})")
    versions = []
    for package in ("torch", "numpy", "scikit-learn", "scikit-image", "scipy", "pennylane", "fastapi"):
        try:
            versions.append(f"{package}={md.version(package)}")
        except md.PackageNotFoundError:
            pass
    log.info("Library versions: %s", ", ".join(versions))
    if missing:
        message = "Missing or broken libraries: " + ", ".join(missing) + ". Check backend/requirements.txt."
        if config.IS_PRODUCTION:
            raise RuntimeError(message)
        log.error(message)


_startup_checks()
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
