from pathlib import Path

import numpy as np
import pandas as pd
import pennylane as qml
from pennylane import numpy as pnp
import matplotlib.pyplot as plt

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)




SCRIPT_DIR = Path(__file__).resolve().parent
DATASET_ROOT = Path(__file__).resolve().parent

DATASET_CSV = DATASET_ROOT / "CSV_Files" / "qml_image_risk_dataset.csv"
MODEL_DIR = SCRIPT_DIR / "model_files"

MODEL_DIR.mkdir(parents=True, exist_ok=True)



FEATURE_COLS = ["pca_1", "pca_2", "pca_3", "pca_4"]

N_QUBITS = 4
N_LAYERS = 3
BATCH_SIZE = 16
EPOCHS = 60
LEARNING_RATE = 0.01



CANCER_CLASSES = ["Normal", "Benign", "Malignant"]
DENSITY_CLASSES = ["A", "B", "C", "D"]
BIRADS_CLASSES = [1, 2, 3, 4, 5]



CANCER_RISK_MAP = {
    "Normal": 0,
    "Benign": 30,
    "Malignant": 100,
}

DENSITY_RISK_MAP = {
    "A": 25,
    "B": 50,
    "C": 75,
    "D": 100,
}

BIRADS_RISK_MAP = {
    1: 0,
    2: 25,
    3: 50,
    4: 75,
    5: 100,
}


def risk_level(score: float) -> str:
    if score < 34:
        return "Low Risk"
    elif score < 67:
        return "Medium Risk"
    return "High Risk"


#helpers
def softmax_np(logits):
    logits = np.array(logits, dtype=float)
    logits = logits - np.max(logits)
    exp_values = np.exp(logits)
    return exp_values / np.sum(exp_values)


def softmax_pnp(logits):
    logits = logits - pnp.max(logits)
    exp_values = pnp.exp(logits)
    return exp_values / pnp.sum(exp_values)


def cross_entropy_from_logits(logits, target_index):
    probs = softmax_pnp(logits)
    return -pnp.log(probs[int(target_index)] + 1e-8)


def initialise_weights(seed=42):
    rng = np.random.default_rng(seed)

    return pnp.array(
        rng.normal(0, 0.1, size=(N_LAYERS, N_QUBITS, 2)),
        requires_grad=True,
    )


def make_batch(X, y):
    batch_size = min(BATCH_SIZE, len(X))

    indices = np.random.choice(
        len(X),
        size=batch_size,
        replace=False,
    )

    return X[indices], y[indices]


def load_base_dataset():
    if not DATASET_CSV.exists():
        raise FileNotFoundError(
            f"Could not find dataset CSV:\n{DATASET_CSV}\n\n"
            "Expected file location:\n"
            "Mammo-Bench/mammo-bench_v2/CSV_Files/qml_image_risk_dataset.csv"
        )

    df = pd.read_csv(DATASET_CSV)
    df.columns = [str(c).strip() for c in df.columns]

    required_cols = FEATURE_COLS + [
        "classification",
        "density",
        "BIRADS",
        "risk_target_norm",
        "formula_risk_score",
        "split",
    ]

    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    return df


def get_split_arrays(df, label_col):
    train_df = df[df["split"] == "train"].copy()
    val_df = df[df["split"] == "val"].copy()
    test_df = df[df["split"] == "test"].copy()

    X_train = train_df[FEATURE_COLS].values.astype(float)
    X_val = val_df[FEATURE_COLS].values.astype(float)
    X_test = test_df[FEATURE_COLS].values.astype(float)

    y_train = train_df[label_col].values
    y_val = val_df[label_col].values
    y_test = test_df[label_col].values

    return train_df, val_df, test_df, X_train, X_val, X_test, y_train, y_val, y_test


def print_dataset_info(name, train_df, val_df, test_df, label_col):
    print(f"\n{name}")
    print("=" * 70)
    print("Train rows:", len(train_df))
    print("Val rows:  ", len(val_df))
    print("Test rows: ", len(test_df))
    print("\nLabel counts:")
    print(pd.concat([train_df, val_df, test_df])[label_col].value_counts())
    print("")


#metrics
def classifier_metrics_text(model_name, y_true, y_pred, class_names):
    acc = accuracy_score(y_true, y_pred)

    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true,
        y_pred,
        average="weighted",
        zero_division=0,
    )

    report = classification_report(
        y_true,
        y_pred,
        target_names=[str(c) for c in class_names],
        zero_division=0,
    )

    cm = confusion_matrix(y_true, y_pred)

    lines = []
    lines.append(f"{model_name} Metrics")
    lines.append("=" * 70)
    lines.append(f"Accuracy:  {acc:.4f}")
    lines.append(f"Precision: {precision:.4f}")
    lines.append(f"Recall:    {recall:.4f}")
    lines.append(f"F1-score:  {f1:.4f}")
    lines.append("")
    lines.append("Classification Report:")
    lines.append(report)
    lines.append("")
    lines.append("Confusion Matrix:")
    lines.append(str(cm))
    lines.append("")

    return "\n".join(lines)


def risk_metrics_text(y_true_percent, y_pred_percent):
    mae = mean_absolute_error(y_true_percent, y_pred_percent)
    rmse = np.sqrt(mean_squared_error(y_true_percent, y_pred_percent))
    r2 = r2_score(y_true_percent, y_pred_percent)

    lines = []
    lines.append("QML Risk Regressor Metrics")
    lines.append("=" * 70)
    lines.append(f"MAE:  {mae:.4f}")
    lines.append(f"RMSE: {rmse:.4f}")
    lines.append(f"R2:   {r2:.4f}")
    lines.append("")

    return "\n".join(lines), mae, rmse, r2

#CIRCUITS
def make_classifier_circuit(n_outputs):
    if n_outputs > N_QUBITS:
        raise ValueError(
            f"n_outputs={n_outputs} is greater than N_QUBITS={N_QUBITS}. "
            "Use make_birads_classifier_circuit() for BI-RADS."
        )

    dev = qml.device("default.qubit", wires=N_QUBITS)

    @qml.qnode(dev)
    def circuit(x, weights):
        for i in range(N_QUBITS):
            qml.RY(x[i], wires=i)

        for layer in range(N_LAYERS):
            for qubit in range(N_QUBITS):
                qml.RY(weights[layer, qubit, 0], wires=qubit)
                qml.RZ(weights[layer, qubit, 1], wires=qubit)

            for qubit in range(N_QUBITS - 1):
                qml.CNOT(wires=[qubit, qubit + 1])

            qml.CNOT(wires=[N_QUBITS - 1, 0])

        return [qml.expval(qml.PauliZ(i)) for i in range(n_outputs)]

    return circuit


def make_birads_classifier_circuit():
    dev = qml.device("default.qubit", wires=N_QUBITS)

    @qml.qnode(dev)
    def circuit(x, weights):
        for i in range(N_QUBITS):
            qml.RY(x[i], wires=i)

        for layer in range(N_LAYERS):
            for qubit in range(N_QUBITS):
                qml.RY(weights[layer, qubit, 0], wires=qubit)
                qml.RZ(weights[layer, qubit, 1], wires=qubit)

            for qubit in range(N_QUBITS - 1):
                qml.CNOT(wires=[qubit, qubit + 1])

            qml.CNOT(wires=[N_QUBITS - 1, 0])

        return [
            qml.expval(qml.PauliZ(0)),
            qml.expval(qml.PauliZ(1)),
            qml.expval(qml.PauliZ(2)),
            qml.expval(qml.PauliZ(3)),
            qml.expval(qml.PauliX(0)),
        ]

    return circuit


def make_risk_circuit():
    dev = qml.device("default.qubit", wires=N_QUBITS)

    @qml.qnode(dev)
    def circuit(x, weights):
        for i in range(N_QUBITS):
            qml.RY(x[i], wires=i)

        for layer in range(N_LAYERS):
            for qubit in range(N_QUBITS):
                qml.RY(weights[layer, qubit, 0], wires=qubit)
                qml.RZ(weights[layer, qubit, 1], wires=qubit)

            for qubit in range(N_QUBITS - 1):
                qml.CNOT(wires=[qubit, qubit + 1])

            qml.CNOT(wires=[N_QUBITS - 1, 0])

        return qml.expval(qml.PauliZ(0))

    return circuit


#plot
def _safe_filename(title):
    return (
        title.lower()
        .replace(" ", "_")
        .replace("-", "_")
        .replace("/", "_")
    )


def save_classifier_training_plots(history, output_path, title):
    output_path = Path(output_path)
    output_path.mkdir(parents=True, exist_ok=True)

    epochs = history["epoch"]
    filename_title = _safe_filename(title)

    plt.figure()
    plt.plot(epochs, history["train_loss"], label="Training Loss")
    plt.plot(epochs, history["val_loss"], label="Validation Loss")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.title(f"{title} Loss Curve")
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(output_path / f"{filename_title}_loss_curve.png", dpi=300)
    plt.close()

    plt.figure()
    plt.plot(epochs, history["train_accuracy"], label="Training Accuracy")
    plt.plot(epochs, history["val_accuracy"], label="Validation Accuracy")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy")
    plt.title(f"{title} Accuracy Curve")
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(output_path / f"{filename_title}_accuracy_curve.png", dpi=300)
    plt.close()


def save_confusion_matrix_plot(cm, class_names, output_path, title):
    output_path = Path(output_path)
    output_path.mkdir(parents=True, exist_ok=True)

    filename_title = _safe_filename(title)

    plt.figure(figsize=(7, 6))
    plt.imshow(cm)
    plt.title(f"{title} Confusion Matrix")
    plt.xlabel("Predicted Label")
    plt.ylabel("True Label")
    plt.xticks(range(len(class_names)), [str(c) for c in class_names], rotation=45)
    plt.yticks(range(len(class_names)), [str(c) for c in class_names])

    for i in range(len(class_names)):
        for j in range(len(class_names)):
            plt.text(j, i, str(cm[i, j]), ha="center", va="center")

    plt.tight_layout()
    plt.savefig(output_path / f"{filename_title}_confusion_matrix.png", dpi=300)
    plt.close()


def save_risk_training_plots(history, output_path):
    output_path = Path(output_path)
    output_path.mkdir(parents=True, exist_ok=True)

    epochs = history["epoch"]

    plt.figure()
    plt.plot(epochs, history["train_mse"], label="Training MSE")
    plt.plot(epochs, history["val_mse"], label="Validation MSE")
    plt.xlabel("Epoch")
    plt.ylabel("MSE")
    plt.title("QML Risk Regressor MSE Curve")
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(output_path / "qml_risk_regressor_mse_curve.png", dpi=300)
    plt.close()


def save_risk_prediction_plots(actual_percent, predicted_percent, output_path):
    output_path = Path(output_path)
    output_path.mkdir(parents=True, exist_ok=True)

    actual_percent = np.asarray(actual_percent, dtype=float)
    predicted_percent = np.asarray(predicted_percent, dtype=float)
    errors = predicted_percent - actual_percent

    plt.figure()
    plt.scatter(actual_percent, predicted_percent)
    plt.xlabel("Actual Risk Score")
    plt.ylabel("Predicted QML Risk Score")
    plt.title("Actual vs Predicted QML Risk Score")
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(output_path / "qml_risk_actual_vs_predicted.png", dpi=300)
    plt.close()

    plt.figure()
    plt.scatter(actual_percent, errors)
    plt.axhline(0)
    plt.xlabel("Actual Risk Score")
    plt.ylabel("Prediction Error")
    plt.title("QML Risk Residual Error Plot")
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(output_path / "qml_risk_residual_error_plot.png", dpi=300)
    plt.close()
