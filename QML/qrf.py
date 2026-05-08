import numpy as np
import pandas as pd
import pennylane as qml
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import matplotlib.pyplot as plt
import joblib

# ============================================================
# CONFIG
# ============================================================

CSV_PATH = "dataset/qml_900_pca4_multiclass.csv"

LABEL_COLUMN = "label"
FEATURE_COLUMNS = [f"pc{i}" for i in range(1, 5)]
RANDOM_SEED = 42
TEST_SIZE = 0.2
N_QUBITS = 4
N_LAYERS = 2
MODEL_SAVE_PATH = "quantum_random_forest.joblib"
LABEL_NAMES = {
    0: "normal",
    1: "benign",
    2: "malignant"
}

np.random.seed(RANDOM_SEED)

# ============================================================
# LOAD DATA
# ============================================================

df = pd.read_csv(CSV_PATH)

if "split" in df.columns:

    train_df = df[df["split"] == "train"].copy()
    test_df = df[df["split"] == "test"].copy()

    X_train = train_df[FEATURE_COLUMNS].values.astype(np.float64)
    y_train = train_df[LABEL_COLUMN].values.astype(np.int64)

    X_test = test_df[FEATURE_COLUMNS].values.astype(np.float64)
    y_test = test_df[LABEL_COLUMN].values.astype(np.int64)

else:

    X = df[FEATURE_COLUMNS].values.astype(np.float64)
    y = df[LABEL_COLUMN].values.astype(np.int64)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        stratify=y,
        random_state=RANDOM_SEED
    )

print("================================================")
print("DATASET")
print("================================================")

print("Train shape:", X_train.shape)
print("Test shape:", X_test.shape)

print(
    "Train label distribution:",
    dict(zip(*np.unique(y_train, return_counts=True)))
)

print(
    "Test label distribution:",
    dict(zip(*np.unique(y_test, return_counts=True)))
)


# ============================================================
# QUANTUM DEVICE
# ============================================================

dev = qml.device("default.qubit", wires=N_QUBITS)

# ============================================================
# RANDOM QUANTUM WEIGHTS
# ============================================================
quantum_weights = np.random.normal(
    loc=0.0,
    scale=0.1,
    size=(N_LAYERS, N_QUBITS, 3)
)

# ============================================================
# QUANTUM FEATURE MAP
# ============================================================
@qml.qnode(dev)
def quantum_feature_map(x):
    for layer in range(N_LAYERS):
        # Data Encoding
        qml.templates.AngleEmbedding(
            x,
            wires=range(N_QUBITS),
            rotation="Y"
        )

        # Variational Quantum Layer
        qml.templates.StronglyEntanglingLayers(
            quantum_weights[layer:layer + 1],
            wires=range(N_QUBITS)
        )

    measurements = []

    # Single-qubit observables
    for i in range(N_QUBITS):

        measurements.append(qml.expval(qml.PauliX(i)))
        measurements.append(qml.expval(qml.PauliY(i)))
        measurements.append(qml.expval(qml.PauliZ(i)))

    # Two-qubit correlations
    pairs = [
        (0,1),
        (0,2),
        (0,3),
        (1,2),
        (1,3),
        (2,3)
    ]

    for a, b in pairs:
        measurements.append(
            qml.expval(qml.PauliX(a) @ qml.PauliX(b))
        )
        measurements.append(
            qml.expval(qml.PauliY(a) @ qml.PauliY(b))
        )
        measurements.append(
            qml.expval(qml.PauliZ(a) @ qml.PauliZ(b))
        )

    return measurements

# ============================================================
# QUANTUM FEATURE EXTRACTION
# ============================================================
def extract_quantum_features(X):
    quantum_features = []
    for idx, x in enumerate(X):
        q_features = quantum_feature_map(x)
        quantum_features.append(q_features)
        if (idx + 1) % 100 == 0:
            print(
                f"Processed {idx + 1}/{len(X)} samples"
            )
    return np.array(quantum_features, dtype=np.float64)

# ============================================================
# EXTRACT QUANTUM FEATURES
# ============================================================
print("\n================================================")
print("EXTRACTING QUANTUM FEATURES")
print("================================================")

print("\nTraining set quantum features...")
X_train_quantum = extract_quantum_features(X_train)

print("\nTest set quantum features...")
X_test_quantum = extract_quantum_features(X_test)

print("\nQuantum feature shape:", X_train_quantum.shape)

# ============================================================
# RANDOM FOREST CLASSIFIER
# ============================================================
clf = RandomForestClassifier(
    n_estimators=120,
    max_depth=4,
    min_samples_split=10,
    min_samples_leaf=5,
    max_features="sqrt",
    criterion="entropy",
    random_state=RANDOM_SEED,
    n_jobs=-1
)


clf.fit(X_train_quantum, y_train)

# ============================================================
# EVALUATION
# ============================================================
train_preds = clf.predict(X_train_quantum)
test_preds = clf.predict(X_test_quantum)

train_probs = clf.predict_proba(X_train_quantum)
test_probs = clf.predict_proba(X_test_quantum)

train_acc = accuracy_score(y_train, train_preds)
test_acc = accuracy_score(y_test, test_preds)

print("\n================================================")
print("RESULTS")
print("================================================")

print(f"\nTrain Accuracy: {train_acc:.4f}")
print(f"Test Accuracy:  {test_acc:.4f}")

print("\nClassification Report:\n")

print(
    classification_report(
        y_test,
        test_preds,
        target_names=[LABEL_NAMES[i] for i in range(3)],
        digits=4
    )
)

# ============================================================
# CONFUSION MATRIX
# ============================================================
cm = confusion_matrix(y_test, test_preds)
print("\nConfusion Matrix:\n")
print(cm)

# ============================================================
# FEATURE IMPORTANCE
# ============================================================
feature_importances = clf.feature_importances_
print("\nQuantum Feature Importances:\n")
for idx, importance in enumerate(feature_importances):
    print(
        f"Feature {idx + 1}: {importance:.6f}"
    )

# ============================================================
# SAVE MODEL
# ============================================================
joblib.dump(
    {
        "classifier": clf,
        "quantum_weights": quantum_weights,
        "feature_columns": FEATURE_COLUMNS,
        "n_qubits": N_QUBITS,
        "n_layers": N_LAYERS,
        "label_names": LABEL_NAMES
    },
    MODEL_SAVE_PATH
)
print(f"\nSaved model to: {MODEL_SAVE_PATH}")

# ============================================================
# CONFUSION MATRIX
# ============================================================
plt.figure(figsize=(6, 6))
plt.imshow(cm)
plt.title("Quantum Random Forest Confusion Matrix")
plt.xlabel("Predicted")
plt.ylabel("True")
plt.xticks(
    ticks=np.arange(3),
    labels=[LABEL_NAMES[i] for i in range(3)]
)

plt.yticks(
    ticks=np.arange(3),
    labels=[LABEL_NAMES[i] for i in range(3)]
)

for i in range(cm.shape[0]):
    for j in range(cm.shape[1]):
        plt.text(
            j,
            i,
            str(cm[i, j]),
            ha="center",
            va="center"
        )

plt.tight_layout()
plt.savefig("quantum_rf_confusion_matrix.png")
plt.show()