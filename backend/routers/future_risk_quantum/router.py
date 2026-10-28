"""Quantum Future Risk HTTP route.

Do not add model-specific logic here. Put it in run.py.
"""

from routers.future_risk_shared.router_factory import create_future_risk_router
from . import run


router = create_future_risk_router(
    engine=run,
    path="/qml-future-risk-view-aware/",
    health_path="/qml-future-risk-view-aware/health",
    tag="future-risk-quantum",
)
