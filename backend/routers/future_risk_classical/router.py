"""Classical Future Risk HTTP route.

Do not add model-specific logic here. Put it in run.py.
"""

from routers.future_risk_shared.router_factory import create_future_risk_router
from . import run


router = create_future_risk_router(
    engine=run,
    path="/future-risk",
    health_path="/future-risk/health",
    tag="future-risk-classical",
)
