# Future Risk — Drop-In AI Model Contract

## What an AI/model engineer must provide

For an existing model package, the engineer should only need to replace:

```text
run.py
models/...
```

They do **not** need to understand:
- FastAPI multipart parsing
- React
- Classical-vs-Quantum response adapters
- CORS
- response formatting
- HTTP exceptions

## Mandatory functions in `run.py`

### 1. `initialise()`

```python
def initialise():
    ...
```

Purpose: load model weights/artifacts once.

If the model requires no setup:

```python
def initialise():
    pass
```

Do **not** invent `_ensure_model_loaded()` in the router. The generic router owns
the once-only lifecycle guard.

### 2. `run_inference(model_input)`

Every engine gets exactly:

```python
{
    "patient_age": float | None,
    "exams": [
        {
            "exam_id": str,
            "exam_date": "YYYY-MM-DD",
            "views": {
                "L-CC": bytes | None,
                "R-CC": bytes | None,
                "L-MLO": bytes | None,
                "R-MLO": bytes | None,
            }
        }
    ]
}
```

Every engine returns exactly:

```python
{
    "yearly_risk": {
        "1_year": float,
        "2_year": float,
        "3_year": float,
        "4_year": float,
        "5_year": float,
    },
    "risk_level": str,
    "exams": [
        {
            "exam_id": str,
            "exam_date": "YYYY-MM-DD",
            "contribution_percent": float | None,
        }
    ],
}
```

All risk values are percentage points.

## Optional `health()`

Recommended:

```python
def health():
    return {
        "status": "ok",
        "model_loaded": True,
    }
```

If omitted, the generic router still returns a basic health response.

## Router

The live classical package routes through `future_risk_classical/engine.py`, which picks `run.py` (v2c, default) or
`run_v2d.py` via the `FUTURE_RISK_ENGINE` env var. The quantum package uses its `run.py` directly, as below.

The model-specific router should contain no model logic.

Example:

```python
from routers.future_risk_shared.router_factory import create_future_risk_router
from . import run

router = create_future_risk_router(
    engine=run,
    path="/future-risk",
    health_path="/future-risk/health",
    tag="future-risk-classical",
)
```

## Register in `main.py` (security: do not skip the dependencies)

Add the import next to the other routers, then include it **with the `inference` dependencies**:

```python
from routers.my_future_risk.router import router as my_router

app.include_router(my_router, dependencies=inference)
```

`inference` is defined in `main.py` and enforces an approved login, that the model files are ready, and one analysis
at a time (memory). A router included without it is **open to anyone and has no concurrency limit**.

## Frontend

Add the new path to `ENDPOINTS` in `src/config/api.js` and call it from the matching upload/analysis page.
Only replacing the `run.py` of an existing engine needs no frontend change.

## Why `initialise()` always exists

Different engines have different setup needs:

- Quantum may load a pickle and rebuild a PennyLane circuit.
- Classical may load PyTorch checkpoints.
- A future remote/API model may have nothing to load.

The router should not know any of that. It simply calls `initialise()` once.

If setup is unnecessary, this is valid:

```python
def initialise():
    pass
```

## Drop-in rule

> If your new model can consume the standard `model_input` object and return the
> standard engine result, it can replace the existing `run.py` without any React
> changes and without rewriting the HTTP route.
