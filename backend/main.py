from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --- Session Analysis (classification + BI-RADS/density composite risk) ---
from routers.classical_session_analysis.router import router as classical_session_router
from routers.quantum_session_analysis.classifier_router import router as quantum_classifier_router
from routers.quantum_session_analysis.composite_risk_router import router as quantum_composite_router

# --- Future Risk Analysis (longitudinal 5-year projection) ---
from routers.classical_future_risk.router import router as classical_future_risk_router

from routers.future_risk_qml.router import router as quantum_future_risk_router

# --- Shared LLM explanation endpoints ---
from routers.shared.Explain import (
    router as explain_router,
    future_risk_router as explain_future_risk_router,
)

app = FastAPI(title="Q-Interval Lite API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Quantum Session Analysis
app.include_router(quantum_classifier_router)   # /QMLPredictV2
app.include_router(quantum_composite_router)    # /qml-mammo-risk
# Classical Session Analysis
app.include_router(classical_session_router)    # /session-analysis
# Future Risk Analysis
app.include_router(quantum_future_risk_router)  # /qml-future-risk-view-aware
app.include_router(classical_future_risk_router)  # /future-risk
# Shared LLM explanations
app.include_router(explain_router)              # /explain
app.include_router(explain_future_risk_router)  # /explain-future-risk


@app.get("/health")
def health():
    return {"status": "ok"}
