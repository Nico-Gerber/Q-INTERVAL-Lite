import io
import pickle
from pathlib import Path
from typing import List

import numpy as np
from PIL import Image
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import pennylane as qml
from pennylane import numpy as pnp

router = APIRouter(prefix="/qml-future-risk", tags=["QMLFutureRisk"])

# =========================
# PATHS
# =========================
SCRIPT_DIR     = Path(__file__).resolve().parent
ARTIFACTS_PATH = SCRIPT_DIR / "dep" / "qmlFutureRisk.pkl"

# =========================
# HELPERS
# =========================
def risk_level(score_percent: float) -> str:
    if score_percent < 33:
        return "Low Risk"
    if score_percent < 66:
        return "Medium Risk"
    return "High Risk"


def yearly_dict_from_probs(probs, horizon_years: list) -> dict:
    probs = np.maximum.accumulate(np.asarray(probs, dtype=float))
    return {
        f"{year}_year": round(float(probs[i] * 100), 2)
        for i, year in enumerate(horizon_years)
    }


def aggregate_yearly_probs(prob_matrix, method: str) -> np.ndarray:
    prob_matrix = np.asarray(prob_matrix, dtype=float)
    if method == "highest image risk":
        return np.max(prob_matrix, axis=0)
    if method == "average image risk":
        return np.mean(prob_matrix, axis=0)
    if method == "noisy-or image risk":
        return 1 - np.prod(1 - prob_matrix, axis=0)
    raise ValueError(f"Unknown aggregation method: {method}")


def calculate_image_contributions(prob_matrix, final_probs, aggregation_method: str) -> list:
    prob_matrix = np.asarray(prob_matrix, dtype=float)
    final_5y    = float(final_probs[-1])
    drops = []
    for i in range(len(prob_matrix)):
        remaining = np.delete(prob_matrix, i, axis=0)
        risk_without = float(aggregate_yearly_probs(remaining, aggregation_method)[-1]) if len(remaining) else 0.0
        drops.append(max(final_5y - risk_without, 0.0))
    drops = np.asarray(drops, dtype=float)
    if drops.sum() <= 0:
        five_year = prob_matrix[:, -1]
        contributions = five_year / five_year.sum() if five_year.sum() > 0 else np.ones(len(prob_matrix)) / len(prob_matrix)
    else:
        contributions = drops / drops.sum()
    return [round(float(x * 100), 2) for x in contributions]


# =========================
# LOAD MODEL AT STARTUP
# =========================
class EmbedQMLYearlyPredictor:
    def __init__(self, artifacts_path: Path):
        if not artifacts_path.exists():
            raise FileNotFoundError(f"Missing model artifacts: {artifacts_path}")

        with open(artifacts_path, "rb") as f:
            artifacts = pickle.load(f)

        self.pca              = artifacts["pca"]
        self.standard_scaler  = artifacts["standard_scaler"]
        self.angle_scaler     = artifacts["angle_scaler"]
        self.weights          = pnp.array(artifacts["weights"],  requires_grad=False)
        self.head_w           = pnp.array(artifacts["head_w"],   requires_grad=False)
        self.head_b           = pnp.array(artifacts["head_b"],   requires_grad=False)
        self.image_size       = int(artifacts["image_size_for_qml"])
        self.pca_components   = int(artifacts["pca_components"])
        self.n_qubits         = int(artifacts["n_qubits"])
        self.n_layers         = int(artifacts["n_layers"])
        self.horizon_years    = list(artifacts["horizon_years"])
        self.threshold        = float(artifacts.get("threshold", 0.5))

        self.dev     = qml.device("default.qubit", wires=self.n_qubits)
        self.circuit = self._build_circuit()

        print(f"QML Future Risk loaded | qubits: {self.n_qubits} | layers: {self.n_layers} | horizon: {self.horizon_years}")

    def _build_circuit(self):
        n_qubits = self.n_qubits
        n_layers = self.n_layers
        dev      = self.dev

        @qml.qnode(dev, interface="autograd")
        def circuit(inputs, weights):
            for i in range(n_qubits):
                qml.RY(inputs[i], wires=i)
            for layer in range(n_layers):
                for q in range(n_qubits):
                    qml.RY(weights[layer, q, 0], wires=q)
                    qml.RZ(weights[layer, q, 1], wires=q)
                for q in range(n_qubits - 1):
                    qml.CNOT(wires=[q, q + 1])
                qml.CNOT(wires=[n_qubits - 1, 0])
            return [qml.expval(qml.PauliZ(i)) for i in range(n_qubits)]

        return circuit

    @staticmethod
    def _sigmoid(x):
        return 1 / (1 + pnp.exp(-x))

    def preprocess(self, image_bytes: bytes) -> np.ndarray:
        img  = Image.open(io.BytesIO(image_bytes)).convert("L")
        img  = img.resize((self.image_size, self.image_size))
        arr  = np.asarray(img, dtype=np.float32) / 255.0
        flat = arr.flatten().reshape(1, -1)
        x    = self.angle_scaler.transform(self.pca.transform(self.standard_scaler.transform(flat)))
        return x[0].astype(float)

    def predict_probs(self, image_bytes: bytes) -> np.ndarray:
        x      = self.preprocess(image_bytes)
        q_out  = pnp.array(self.circuit(pnp.array(x, requires_grad=False), self.weights))
        logits = pnp.dot(q_out, self.head_w) + self.head_b
        return np.array(self._sigmoid(logits), dtype=float)

    def predict_single(self, image_bytes: bytes, filename: str = None) -> tuple[dict, np.ndarray]:
        probs       = self.predict_probs(image_bytes)
        yearly_risk = yearly_dict_from_probs(probs, self.horizon_years)
        final_year  = self.horizon_years[-1]
        final_score = yearly_risk[f"{final_year}_year"]

        result = {
            "yearly_future_risk":       yearly_risk,
            "1_year_risk_score":        yearly_risk.get("1_year"),
            "2_year_risk_score":        yearly_risk.get("2_year"),
            "3_year_risk_score":        yearly_risk.get("3_year"),
            "4_year_risk_score":        yearly_risk.get("4_year"),
            "5_year_risk_score":        yearly_risk.get("5_year"),
            "final_5_year_risk_score":  final_score,
            "final_5_year_risk_level":  risk_level(final_score),
            "future_risk_score":        final_score,
            "risk_level":               risk_level(final_score),
        }

        if filename:
            result["filename"] = filename

        return result, probs


predictor = EmbedQMLYearlyPredictor(ARTIFACTS_PATH)


# =========================
# PATIENT SUMMARY
# =========================
def make_patient_summary(image_results, prob_matrix, aggregation_method: str) -> dict:
    final_probs         = np.maximum.accumulate(aggregate_yearly_probs(prob_matrix, aggregation_method))
    patient_yearly_risk = yearly_dict_from_probs(final_probs, predictor.horizon_years)
    final_5y_score      = patient_yearly_risk.get("5_year")

    five_year_scores = [float(r["final_5_year_risk_score"]) for r in image_results]
    highest_idx      = int(np.argmax(five_year_scores))

    return {
        "number_of_images":                len(image_results),
        "average_5_year_risk_score":       round(float(np.mean(five_year_scores)), 2),
        "highest_5_year_risk_score":       round(float(np.max(five_year_scores)), 2),
        "highest_risk_image_name":         image_results[highest_idx].get("filename"),
        "final_patient_yearly_future_risk": patient_yearly_risk,
        "final_patient_1_year_risk_score": patient_yearly_risk.get("1_year"),
        "final_patient_2_year_risk_score": patient_yearly_risk.get("2_year"),
        "final_patient_3_year_risk_score": patient_yearly_risk.get("3_year"),
        "final_patient_4_year_risk_score": patient_yearly_risk.get("4_year"),
        "final_patient_5_year_risk_score": patient_yearly_risk.get("5_year"),
        "future_risk_score":               final_5y_score,
        "risk_level":                      risk_level(final_5y_score),
        "aggregation_method":              aggregation_method,
    }


# =========================
# ROUTES
# =========================
@router.post("/predict/single")
async def predict_single(file: UploadFile = File(...)):
    """Run QML future risk inference on a single mammography image."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="File must be an image.")
    try:
        contents        = await file.read()
        result, _       = predictor.predict_single(contents, filename=file.filename)
        result["model_info"] = {
            "model_type":    "quantum",
            "n_qubits":      predictor.n_qubits,
            "n_layers":      predictor.n_layers,
            "horizon_years": predictor.horizon_years,
        }
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Prediction failed: {str(e)}")


@router.post("/predict/multi")
async def predict_multi(
    files: List[UploadFile] = File(...),
    aggregation: str = "highest image risk",
):
    """Run QML future risk inference across multiple mammography images for the same patient."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if aggregation not in {"highest image risk", "average image risk", "noisy-or image risk"}:
        raise HTTPException(status_code=400, detail=f"Invalid aggregation method: {aggregation}")

    image_results = []
    prob_rows     = []

    for f in files:
        if not f.content_type.startswith("image/"):
            raise HTTPException(status_code=415, detail=f"{f.filename} is not an image.")
        try:
            contents        = await f.read()
            result, probs   = predictor.predict_single(contents, filename=f.filename)
            image_results.append(result)
            prob_rows.append(probs)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed on {f.filename}: {str(e)}")

    prob_matrix   = np.asarray(prob_rows, dtype=float)
    final_probs   = np.maximum.accumulate(aggregate_yearly_probs(prob_matrix, aggregation))
    contributions = calculate_image_contributions(prob_matrix, final_probs, aggregation)

    for i, pct in enumerate(contributions):
        image_results[i]["image_contribution_percent"] = pct

    summary = make_patient_summary(image_results, prob_matrix, aggregation)

    return JSONResponse(content={
        "number_of_images":    len(files),
        "image_level_results": image_results,
        "patient_summary":     summary,
        "model_info": {
            "model_type":    "quantum",
            "n_qubits":      predictor.n_qubits,
            "n_layers":      predictor.n_layers,
            "horizon_years": predictor.horizon_years,
            "aggregation":   aggregation,
        },
    })