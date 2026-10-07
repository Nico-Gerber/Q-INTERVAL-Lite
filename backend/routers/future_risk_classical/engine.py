"""Select the configured classical future-risk inference engine."""

from __future__ import annotations

import os
from typing import Any

from . import run as v2c
from . import run_v2d as v2d


ENGINE_ENVIRONMENT_VARIABLE = "FUTURE_RISK_ENGINE"

_ENGINE_ALIASES = {
    "v2c": "v2c",
    "v2d": "v2d",
}

_ENGINES = {
    "v2c": v2c,
    "v2d": v2d,
}


def _selected_engine_name() -> str:
    configured = os.getenv(
        ENGINE_ENVIRONMENT_VARIABLE,
        "v2c",
    ).strip().lower()

    selected = _ENGINE_ALIASES.get(configured)

    if selected is None:
        supported = ", ".join(
            sorted(_ENGINE_ALIASES)
        )
        raise RuntimeError(
            f"Unsupported {ENGINE_ENVIRONMENT_VARIABLE}="
            f"{configured!r}. Supported values: {supported}."
        )

    return selected


SELECTED_ENGINE = _selected_engine_name()
_engine = _ENGINES[SELECTED_ENGINE]

MIN_SESSIONS = _engine.MIN_SESSIONS
MAX_SESSIONS = _engine.MAX_SESSIONS


def initialise() -> None:
    _engine.initialise()


def health() -> dict[str, Any]:
    result = dict(_engine.health())
    result["selected_engine"] = SELECTED_ENGINE
    return result


def run_inference(model_input: Any) -> dict[str, Any]:
    return _engine.run_inference(model_input)