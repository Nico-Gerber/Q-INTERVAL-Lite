"""Formal model-engine contract for all Future Risk implementations.

AI/model engineers should only need to implement:

    initialise()
    run_inference(model_input)

The router and React application must not care whether the implementation is
Classical, Quantum, CNN, LSTM, radiomic, or something else.
"""

from typing import Dict, List, Optional, TypedDict


VIEW_KEYS = ("L-CC", "R-CC", "L-MLO", "R-MLO")


class ExamInput(TypedDict):
    exam_id: str
    exam_date: str
    views: Dict[str, Optional[bytes]]


class FutureRiskInput(TypedDict):
    patient_age: Optional[float]
    exams: List[ExamInput]


class ExamResult(TypedDict):
    exam_id: str
    exam_date: str
    contribution_percent: Optional[float]


class FutureRiskEngineResult(TypedDict):
    yearly_risk: Dict[str, float]
    risk_level: str
    exams: List[ExamResult]
