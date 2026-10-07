from routers.future_risk_shared.router_factory import create_future_risk_router
#from . import run
from . import engine
router = create_future_risk_router(
    engine=engine,
    path="/future-risk",
    health_path="/future-risk/health",
    tag="future-risk-classical",
)