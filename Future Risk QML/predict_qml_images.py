import argparse
import json
import pickle
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import joblib
except ImportError:
    joblib = None

from qml_common import (
    DATASET_ROOT,
    CANCER_CLASSES,
    DENSITY_CLASSES,
    BIRADS_CLASSES,
    CANCER_RISK_MAP,
    DENSITY_RISK_MAP,
    BIRADS_RISK_MAP,
    risk_level,
    softmax_np,
    make_classifier_circuit,
    make_birads_classifier_circuit,
    make_risk_circuit,
)


# ============================================================
# PATHS
# ============================================================
# Expected structure:
#
# Mammo-Bench/
# └── mammo-bench_v2/
#     ├── CSV_Files/
#     │   ├── qml_image_risk_dataset.csv
#     │   ├── qml_image_risk_pca.pkl
#     │   └── qml_image_risk_scaler.pkl
#     ├── Preprocessed_Dataset/
#     └── Future Risk/
#         ├── qml_common.py
#         ├── predict_qml_images.py
#         └── model_files/
#             ├── qml_cancer_classifier_weights.npz
#             ├── qml_density_classifier_weights.npz
#             ├── qml_birads_classifier_weights.npz
#             └── qml_risk_regressor_weights.npz

SCRIPT_DIR = Path(__file__).resolve().parent


MODEL_DIR = SCRIPT_DIR / "mammo-bench models"

OBJECTS_DIR = MODEL_DIR / "objects"

PCA_PATH = OBJECTS_DIR / "qml_image_risk_pca.pkl"
SCALER_PATH = OBJECTS_DIR / "qml_image_risk_scaler.pkl"

CANCER_WEIGHTS_PATH = MODEL_DIR / "qml_cancer_classifier_weights.npz"
DENSITY_WEIGHTS_PATH = MODEL_DIR / "qml_density_classifier_weights.npz"
BIRADS_WEIGHTS_PATH = MODEL_DIR / "qml_birads_classifier_weights.npz"
RISK_WEIGHTS_PATH = MODEL_DIR / "qml_risk_regressor_weights.npz"

IMAGE_SIZE = 32


# ============================================================
# LOAD HELPERS
# ============================================================
def load_pickle_object(path: Path):
    if not path.exists():
        raise FileNotFoundError(
            f"Missing file:\n{path}\n\n"
            "Run your preprocessing script first so it creates:\n"
            "qml_image_risk_pca.pkl and qml_image_risk_scaler.pkl"
        )

    if joblib is not None:
        try:
            return joblib.load(path)
        except Exception:
            pass

    with open(path, "rb") as f:
        return pickle.load(f)


def load_weights(path: Path):
    if not path.exists():
        raise FileNotFoundError(
            f"Missing model weights:\n{path}\n\n"
            "Train the model first before running prediction."
        )

    data = np.load(path, allow_pickle=True)
    return data["weights"]


# ============================================================
# IMAGE PREPROCESSING
# ============================================================
def preprocess_image(image_path: Path, pca, scaler):
    """
    Must match the training preprocessing:
    grayscale -> resize 32x32 -> normalize -> flatten -> PCA -> scale to 0-pi.
    """

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    image = Image.open(image_path).convert("L")
    image = image.resize((IMAGE_SIZE, IMAGE_SIZE))

    arr = np.asarray(image, dtype=np.float32) / 255.0
    flat = arr.flatten().reshape(1, -1)

    pca_features = pca.transform(flat)
    qml_features = scaler.transform(pca_features)

    return qml_features[0].astype(float)


# ============================================================
# PROBABILITY HELPERS
# ============================================================
def probs_to_dict(classes, probs_percent):
    return {
        str(cls): round(float(prob), 2)
        for cls, prob in zip(classes, probs_percent)
    }


def expected_risk_from_probs(classes, probs_percent, risk_map):
    total = 0.0

    for cls, prob_percent in zip(classes, probs_percent):
        total += (float(prob_percent) / 100.0) * float(risk_map[cls])

    return total


# ============================================================
# SINGLE IMAGE PREDICTION
# ============================================================
def predict_single_image(
    image_path: Path,
    pca,
    scaler,
    cancer_circuit,
    density_circuit,
    birads_circuit,
    risk_circuit,
    cancer_weights,
    density_weights,
    birads_weights,
    risk_weights,
):
    x = preprocess_image(image_path, pca, scaler)

    # Cancer prediction
    cancer_logits = cancer_circuit(x, cancer_weights)
    cancer_probs = softmax_np(cancer_logits) * 100.0
    cancer_idx = int(np.argmax(cancer_probs))
    predicted_cancer_class = CANCER_CLASSES[cancer_idx]
    cancer_confidence = float(np.max(cancer_probs))
    cancer_risk_score = expected_risk_from_probs(
        CANCER_CLASSES,
        cancer_probs,
        CANCER_RISK_MAP,
    )

    # Density prediction
    density_logits = density_circuit(x, density_weights)
    density_probs = softmax_np(density_logits) * 100.0
    density_idx = int(np.argmax(density_probs))
    predicted_density = DENSITY_CLASSES[density_idx]
    density_confidence = float(np.max(density_probs))
    density_risk_score = expected_risk_from_probs(
        DENSITY_CLASSES,
        density_probs,
        DENSITY_RISK_MAP,
    )

    # BI-RADS prediction
    birads_logits = birads_circuit(x, birads_weights)
    birads_probs = softmax_np(birads_logits) * 100.0
    birads_idx = int(np.argmax(birads_probs))
    predicted_birads = int(BIRADS_CLASSES[birads_idx])
    birads_confidence = float(np.max(birads_probs))
    birads_risk_score = expected_risk_from_probs(
        BIRADS_CLASSES,
        birads_probs,
        BIRADS_RISK_MAP,
    )

    # Formula final risk
    formula_final_risk_score = (
        0.60 * cancer_risk_score
        + 0.15 * density_risk_score
        + 0.25 * birads_risk_score
    )

    # Direct QML risk regressor
    raw_risk = risk_circuit(x, risk_weights)
    qml_direct_risk_score = float((raw_risk + 1.0) / 2.0) * 100.0
    qml_direct_risk_score = max(0.0, min(100.0, qml_direct_risk_score))

    return {
        "image_name": image_path.name,
        "image_path": str(image_path),

        "predicted_cancer_class": predicted_cancer_class,
        "cancer_confidence": round(cancer_confidence, 2),
        "cancer_probabilities": probs_to_dict(CANCER_CLASSES, cancer_probs),
        "cancer_risk_score": round(cancer_risk_score, 2),

        "predicted_density": predicted_density,
        "density_confidence": round(density_confidence, 2),
        "density_probabilities": probs_to_dict(DENSITY_CLASSES, density_probs),
        "density_risk_score": round(density_risk_score, 2),

        "predicted_birads": predicted_birads,
        "birads_confidence": round(birads_confidence, 2),
        "birads_probabilities": probs_to_dict(BIRADS_CLASSES, birads_probs),
        "birads_risk_score": round(birads_risk_score, 2),

        "formula_final_risk_score": round(formula_final_risk_score, 2),
        "formula_risk_level": risk_level(formula_final_risk_score),

        "qml_direct_risk_score": round(qml_direct_risk_score, 2),
        "qml_direct_risk_level": risk_level(qml_direct_risk_score),
    }


# ============================================================
# MULTIPLE IMAGE SUMMARY
# ============================================================
def make_patient_summary(image_results):
    formula_scores = [
        float(item["formula_final_risk_score"])
        for item in image_results
    ]

    qml_scores = [
        float(item["qml_direct_risk_score"])
        for item in image_results
    ]

    highest_formula = max(formula_scores)
    average_formula = float(np.mean(formula_scores))

    highest_qml = max(qml_scores)
    average_qml = float(np.mean(qml_scores))

    return {
        "number_of_images": len(image_results),

        "average_formula_risk_score": round(average_formula, 2),
        "highest_formula_risk_score": round(highest_formula, 2),
        "final_patient_formula_risk_score": round(highest_formula, 2),
        "final_patient_formula_risk_level": risk_level(highest_formula),

        "average_qml_direct_risk_score": round(average_qml, 2),
        "highest_qml_direct_risk_score": round(highest_qml, 2),
        "final_patient_qml_direct_risk_score": round(highest_qml, 2),
        "final_patient_qml_direct_risk_level": risk_level(highest_qml),

        "aggregation_method": "highest image risk",
    }


# ============================================================
# CLI
# ============================================================
def collect_image_paths(args):
    image_paths = []

    if args.images:
        image_paths.extend([Path(p) for p in args.images])

    if args.folder:
        folder = Path(args.folder)

        if not folder.exists():
            raise FileNotFoundError(f"Folder not found: {folder}")

        valid_exts = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}

        for path in sorted(folder.iterdir()):
            if path.suffix.lower() in valid_exts:
                image_paths.append(path)

    if len(image_paths) == 0:
        raise ValueError(
            "No images provided.\n\n"
            "Use either:\n"
            "python predict_qml_images.py --images image1.png image2.png\n"
            "or:\n"
            "python predict_qml_images.py --folder path/to/images"
        )

    return image_paths


def main():
    parser = argparse.ArgumentParser(
        description="Run QML prediction on one or multiple mammogram images."
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
        default=str(MODEL_DIR / "qml_image_predictions.json"),
        help="Output JSON path.",
    )

    args = parser.parse_args()

    image_paths = collect_image_paths(args)

    print("Loading PCA and scaler...")
    pca = load_pickle_object(PCA_PATH)
    scaler = load_pickle_object(SCALER_PATH)

    print("Loading QML weights...")
    cancer_weights = load_weights(CANCER_WEIGHTS_PATH)
    density_weights = load_weights(DENSITY_WEIGHTS_PATH)
    birads_weights = load_weights(BIRADS_WEIGHTS_PATH)
    risk_weights = load_weights(RISK_WEIGHTS_PATH)

    print("Building QML circuits...")
    cancer_circuit = make_classifier_circuit(n_outputs=3)
    density_circuit = make_classifier_circuit(n_outputs=4)
    birads_circuit = make_birads_classifier_circuit()
    risk_circuit = make_risk_circuit()

    print(f"Running prediction on {len(image_paths)} image(s)...")

    image_results = []

    for image_path in image_paths:
        print(f"Predicting: {image_path}")
        result = predict_single_image(
            image_path=image_path,
            pca=pca,
            scaler=scaler,
            cancer_circuit=cancer_circuit,
            density_circuit=density_circuit,
            birads_circuit=birads_circuit,
            risk_circuit=risk_circuit,
            cancer_weights=cancer_weights,
            density_weights=density_weights,
            birads_weights=birads_weights,
            risk_weights=risk_weights,
        )
        image_results.append(result)

    output = {
        "image_results": image_results,
        "patient_summary": make_patient_summary(image_results),
        "important_limitation": (
            "This is a Mammo-Bench image-based QML risk prototype. "
            "It is not a clinically validated future cancer probability model."
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
