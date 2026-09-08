from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Session Analysis
from routers.classical_session_analysis.router import router as classical_session_router
from routers.quantum_session_analysis.router import router as quantum_session_router

# Future Risk Analysis
from routers.future_risk_classical.router import router as classical_future_risk_router
from routers.future_risk_qml.router import router as quantum_future_risk_router

# Shared LLM explanation endpoints
from routers.shared.Explain import (
    router as explain_router,
    future_risk_router as explain_future_risk_router,
)

app = FastAPI(
    title="Q-Interval Lite API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session Analysis
app.include_router(classical_session_router)
app.include_router(quantum_session_router)

# Future Risk Analysis
app.include_router(classical_future_risk_router)
app.include_router(quantum_future_risk_router)

# LLM explanations
app.include_router(explain_router)
app.include_router(explain_future_risk_router)


@app.get("/health")
def health():
    return {"status": "ok"}