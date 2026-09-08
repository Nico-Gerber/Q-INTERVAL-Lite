from routers.session_analysis.router_factory import create_session_analysis_router
from . import run

router = create_session_analysis_router(
    engine=run,
    prefix="/quantum-session-analysis",
    tag="QuantumSessionAnalysis",
    model_name="Quantum",
)
