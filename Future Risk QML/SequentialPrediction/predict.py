"""
predict_embed_qml_yearly_images.py

Run the trained EMBED yearly QML future-risk model on one image, multiple images,
or a folder of images.

This works like your Mammo-Bench predict_qml_images.py script.

Examples:

1 image:
    python predict_embed_qml_yearly_images.py --images test1.png

Multiple images:
    python predict_embed_qml_yearly_images.py --images test1.png test2.png test3.png

Folder:
    python predict_embed_qml_yearly_images.py --folder "path/to/images"

Custom output:
    python predict_embed_qml_yearly_images.py --folder "path/to/images" --output output.json

Required trained model file:
    embed_qml_future_risk_yearly_outputs/qmlFutureRisk.pkl
"""

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
from PIL import Image

import pennylane as qml
from pennylane import numpy as pnp


# ============================================================
# PATHS
# ============================================================

SCRIPT_DIR = Path(__file__).resolve().parent

ARTIFACTS_PATH = SCRIPT_DIR / "qmlFutureRisk.pkl"

DEFAULT_OUTPUT_PATH = SCRIPT_DIR / "qml_sequential_predictions.json"

VALID_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}


# ============================================================
# GENERAL HELPERS
# ============================================================

def risk_level(score_percent):
    if score_percent < 33:
        return "Low Risk"
    if score_percent < 66:
        return "Medium Risk"
    return "High Risk"


def collect_image_paths(args):
    image_paths = []

    if args.images:
        image_paths.extend([Path(p) for p in args.images])

    if args.folder:
        folder = Path(args.folder)

        if not folder.exists():
            raise FileNotFoundError(f"Folder not found: {folder}")

        for path in sorted(folder.iterdir()):
            if path.suffix.lower() in VALID_IMAGE_EXTS:
                image_paths.append(path)

    if len(image_paths) == 0:
        raise ValueError(
            "No images provided.\n\n"
            "Use either:\n"
            "python predict_embed_qml_yearly_images.py --images image1.png image2.png\n"
            "or:\n"
            "python predict_embed_qml_yearly_images.py --folder path/to/images"
        )

    for path in image_paths:
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {path}")

    return image_paths


def load_artifacts(path: Path):
    if not path.exists():
        raise FileNotFoundError(
            f"Missing trained model artifacts:\n{path}\n\n"
            "Train the yearly QML model first:\n"
            "python train_embed_qml_future_risk_YEARLY.py"
        )

    with open(path, "rb") as f:
        return pickle.load(f)


def yearly_dict_from_probs(probs, horizon_years):
    probs = np.asarray(probs, dtype=float)
    probs = np.maximum.accumulate(probs)

    return {
        f"{year}_year": round(float(probs[i] * 100), 2)
        for i, year in enumerate(horizon_years)
    }


def aggregate_yearly_probs(prob_matrix, method):
    prob_matrix = np.asarray(prob_matrix, dtype=float)

    if method == "highest image risk":
        return np.max(prob_matrix, axis=0)

    if method == "average image risk":
        return np.mean(prob_matrix, axis=0)

    if method == "noisy-or image risk":
        return 1 - np.prod(1 - prob_matrix, axis=0)

    raise ValueError(f"Unknown aggregation method: {method}")


def calculate_image_contribution_percent(prob_matrix, final_probs, aggregation_method):
    prob_matrix = np.asarray(prob_matrix, dtype=float)
    final_5y = float(final_probs[-1])

    drops = []

    for i in range(len(prob_matrix)):
        remaining = np.delete(prob_matrix, i, axis=0)

        if len(remaining) == 0:
            risk_without_i = 0.0
        else:
            risk_without_i = float(
                aggregate_yearly_probs(remaining, aggregation_method)[-1]
            )

        drops.append(max(final_5y - risk_without_i, 0.0))

    drops = np.asarray(drops, dtype=float)

    if drops.sum() <= 0:
        five_year_probs = prob_matrix[:, -1]
        if five_year_probs.sum() <= 0:
            contributions = np.ones(len(prob_matrix)) / len(prob_matrix)
        else:
            contributions = five_year_probs / five_year_probs.sum()
    else:
        contributions = drops / drops.sum()

    return [round(float(x * 100), 2) for x in contributions]


# ============================================================
# MODEL CLASS
# ============================================================

class EmbedQMLYearlyPredictor:
    def __init__(self, artifacts_path: Path):
        artifacts = load_artifacts(artifacts_path)

        self.pca = artifacts["pca"]
        self.standard_scaler = artifacts["standard_scaler"]
        self.angle_scaler = artifacts["angle_scaler"]

        self.weights = pnp.array(artifacts["weights"], requires_grad=False)
        self.head_w = pnp.array(artifacts["head_w"], requires_grad=False)
        self.head_b = pnp.array(artifacts["head_b"], requires_grad=False)

        self.image_size_for_qml = int(artifacts["image_size_for_qml"])
        self.pca_components = int(artifacts["pca_components"])
        self.n_qubits = int(artifacts["n_qubits"])
        self.n_layers = int(artifacts["n_layers"])
        self.horizon_years = list(artifacts["horizon_years"])
        self.threshold = float(artifacts.get("threshold", 0.5))

        self.dev = qml.device("default.qubit", wires=self.n_qubits)
        self.quantum_circuit = self._make_quantum_circuit()

    def _make_quantum_circuit(self):
        n_qubits = self.n_qubits
        n_layers = self.n_layers
        dev = self.dev

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
    def sigmoid(x):
        return 1 / (1 + pnp.exp(-x))

    def preprocess_image(self, image_path: Path):
        image = Image.open(image_path).convert("L")
        image = image.resize((self.image_size_for_qml, self.image_size_for_qml))

        arr = np.asarray(image, dtype=np.float32) / 255.0
        flat = arr.flatten().reshape(1, -1)

        x_std = self.standard_scaler.transform(flat)
        x_pca = self.pca.transform(x_std)
        x_angle = self.angle_scaler.transform(x_pca)

        return x_angle[0].astype(float)

    def predict_probs(self, image_path: Path):
        x = self.preprocess_image(image_path)
        q_out = pnp.array(
            self.quantum_circuit(
                pnp.array(x, requires_grad=False),
                self.weights,
            )
        )

        logits = pnp.dot(q_out, self.head_w) + self.head_b
        probs = self.sigmoid(logits)

        return np.array(probs, dtype=float)

    def predict_single_image(self, image_path: Path):
        probs = self.predict_probs(image_path)
        yearly_risk = yearly_dict_from_probs(probs, self.horizon_years)

        final_year = self.horizon_years[-1]
        final_score = yearly_risk[f"{final_year}_year"]

        result = {
            "image_name": image_path.name,
            "image_path": str(image_path),

            "qml_yearly_future_risk": yearly_risk,

            "qml_1_year_risk_score": yearly_risk.get("1_year"),
            "qml_2_year_risk_score": yearly_risk.get("2_year"),
            "qml_3_year_risk_score": yearly_risk.get("3_year"),
            "qml_4_year_risk_score": yearly_risk.get("4_year"),
            "qml_5_year_risk_score": yearly_risk.get("5_year"),

            "qml_final_5_year_risk_score": final_score,
            "qml_final_5_year_risk_level": risk_level(final_score),

            "raw_model_probabilities": {
                f"{year}_year": round(float(probs[i] * 100), 2)
                for i, year in enumerate(self.horizon_years)
            },
        }

        return result, probs


# ============================================================
# SUMMARY
# ============================================================

def make_patient_summary(image_results, prob_matrix, horizon_years, aggregation_method):
    final_probs = aggregate_yearly_probs(prob_matrix, aggregation_method)
    final_probs = np.maximum.accumulate(final_probs)

    patient_yearly_risk = yearly_dict_from_probs(final_probs, horizon_years)
    final_5y_score = patient_yearly_risk.get("5_year")

    five_year_scores = [
        float(item["qml_final_5_year_risk_score"])
        for item in image_results
    ]

    highest_idx = int(np.argmax(five_year_scores)) if five_year_scores else None

    return {
        "number_of_images": len(image_results),

        "average_qml_5_year_risk_score": round(float(np.mean(five_year_scores)), 2),
        "highest_qml_5_year_risk_score": round(float(np.max(five_year_scores)), 2),
        "highest_risk_image_name": (
            image_results[highest_idx]["image_name"]
            if highest_idx is not None
            else None
        ),

        "final_patient_qml_yearly_future_risk": patient_yearly_risk,

        "final_patient_qml_1_year_risk_score": patient_yearly_risk.get("1_year"),
        "final_patient_qml_2_year_risk_score": patient_yearly_risk.get("2_year"),
        "final_patient_qml_3_year_risk_score": patient_yearly_risk.get("3_year"),
        "final_patient_qml_4_year_risk_score": patient_yearly_risk.get("4_year"),
        "final_patient_qml_5_year_risk_score": patient_yearly_risk.get("5_year"),

        "final_patient_qml_risk_level": risk_level(final_5y_score),
        "aggregation_method": aggregation_method,
    }


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Run EMBED yearly QML future-risk prediction on one or multiple mammogram images."
    )

    parser.add_argument(
        "--images",
        nargs="+",
        help="One or more image paths.",
    )

    parser.add_argument(
        "--folder",
        help="Folder containing images.",
    )

    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help="Output JSON path.",
    )

    parser.add_argument(
        "--artifacts",
        default=str(ARTIFACTS_PATH),
        help="Path to qmlFutureRisk.pkl.",
    )

    parser.add_argument(
        "--aggregation",
        default="highest image risk",
        choices=["highest image risk", "average image risk", "noisy-or image risk"],
        help="How to combine multiple image risks into final patient risk.",
    )

    args = parser.parse_args()

    image_paths = collect_image_paths(args)

    print("Loading trained EMBED yearly QML model...")
    predictor = EmbedQMLYearlyPredictor(Path(args.artifacts))

    print(f"Running prediction on {len(image_paths)} image(s)...")

    image_results = []
    prob_rows = []

    for image_path in image_paths:
        print(f"Predicting: {image_path}")
        result, probs = predictor.predict_single_image(image_path)
        image_results.append(result)
        prob_rows.append(probs)

    prob_matrix = np.asarray(prob_rows, dtype=float)

    final_probs = aggregate_yearly_probs(prob_matrix, args.aggregation)
    final_probs = np.maximum.accumulate(final_probs)

    image_contributions = calculate_image_contribution_percent(
        prob_matrix=prob_matrix,
        final_probs=final_probs,
        aggregation_method=args.aggregation,
    )

    for i, contribution in enumerate(image_contributions):
        image_results[i]["image_contribution_percent"] = contribution

    output = {
        "image_results": image_results,

        "patient_summary": make_patient_summary(
            image_results=image_results,
            prob_matrix=prob_matrix,
            horizon_years=predictor.horizon_years,
            aggregation_method=args.aggregation,
        ),

        "model_info": {
            "model_type": "EMBED QML multi-horizon future-risk model",
            "horizon_years": predictor.horizon_years,
            "pca_components": predictor.pca_components,
            "n_qubits": predictor.n_qubits,
            "n_layers": predictor.n_layers,
            "threshold": predictor.threshold,
        },

        "important_limitation": (
            "This is an EMBED QML future-risk prototype. "
            "The 1-5 year risk outputs are trained from days_to_cancer labels, "
            "but this is not a clinically validated future cancer probability model."
        ),
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=4)

    print("\nPrediction complete.")
    print(f"Saved JSON output to: {output_path}")

    print("\nPatient summary:")
    print(json.dumps(output["patient_summary"], indent=4))


if __name__ == "__main__":
    main()
