# Session Analysis — Drop-in Implementation Guide

Each session analysis engine lives in its own package. The shared infrastructure
handles all HTTP wiring and response building. You only write two files: `run.py`
(your model logic) and `router.py` (3 lines of registration).

---

## Shared files (do not modify)

| File | Purpose |
|---|---|
| `session_analysis/schemas.py` | Pydantic response models returned to the frontend |
| `session_analysis/response_builder.py` | Turns the internal dict into `SessionAnalysisResponse` |
| `session_analysis/router_factory.py` | Handles all FastAPI wiring — file uploads, validation, error wrapping |

---

## What you create

```
routers/my_engine_session_analysis/
    __init__.py
    run.py        ← your model logic (required)
    router.py     ← 5-line registration (required)
    models/       ← your model weights
```

---

## `run.py` — the only function you must implement

```python
from typing import Optional

def run(views: dict, age: Optional[float]) -> dict:
    """
    Args:
        views  — {"L-CC": bytes, "L-MLO": bytes, "R-CC": bytes, "R-MLO": bytes}
        age    — patient age in years, or None if not supplied

    Returns:
        A model_result dict matching the contract below.
    """
    ...
```

### Return value contract

```python
{
    "views": {
        "L-CC":  <ViewDict>,   # all four keys required
        "L-MLO": <ViewDict>,
        "R-CC":  <ViewDict>,
        "R-MLO": <ViewDict>,
    },
    "mammo_risk": {
        "score": float | None,  # e.g. 0.23; None when not applicable
        "level": str,           # "Low" | "Moderate" | "High" | "Not Applicable"
    },
}
```

#### ViewDict

```python
{
    "result": "Normal" | "Benign" | "Malignant",
    "score":  float,                          # confidence for the predicted class, 0.0–1.0
    "class_probabilities": {
        "Normal":    float,
        "Benign":    float,
        "Malignant": float,
    },
    "explainability": {
        "base_image_base64": str,             # original image as PNG base64
        "heatmap_base64":    str,             # saliency / CAM heatmap as PNG base64
        "overlay_base64":    str | None,      # blended overlay — optional, can be ""
    },
    "density": str | None,                    # e.g. "A"–"D"; None if not predicted
    "birads":  int | None,                    # e.g. 0–6; None if not predicted
}
```

---

## `router.py` — 5 lines

```python
from routers.session_analysis.router_factory import create_session_analysis_router
from . import run

router = create_session_analysis_router(
    engine=run,
    prefix="/my-engine-session-analysis",
    tag="MyEngineSessionAnalysis",
    model_name="MyEngine",
)
```

`model_name` is returned as-is in the `SessionAnalysisResponse.model` field.
Use any string that identifies your engine to the frontend.

---

## Register in `main.py`

```python
from routers.my_engine_session_analysis.router import router as my_session_router

app.include_router(my_session_router)
```

That is the entire integration surface. The frontend receives the same
`SessionAnalysisResponse` shape regardless of which engine produced it.

---

## Working examples

See `classical_session_analysis/run.py` and `quantum_session_analysis/run.py`
for reference implementations. Both `router.py` files are identical in structure
to the skeleton above.
