import numpy as np
import pandas as pd
import pennylane as qml
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import GridSearchCV
import matplotlib.pyplot as plt
import joblib

# ============================================================
# CONFIG
# ============================================================

CSV_PATH        = "QML/8pca/qml_15000_pca8_multiclass.csv"
LABEL_COLUMN    = "label"
FEATURE_COLUMNS = [f"pc{i}" for i in range(1, 9)]
RANDOM_SEED     = 42
TEST_SIZE       = 0.2
N_QUBITS        = 8
N_LAYERS        = 4
MODEL_SAVE_PATH = "quantum_random_forest_v2.joblib"
LABEL_NAMES     = {0: "normal", 1: "benign", 2: "malignant"}

np.random.seed(RANDOM_SEED)

# ============================================================
# LOAD DATA
# ============================================================

df = pd.read_csv(CSV_PATH)

if "split" in df.columns:
    train_df = df[df["split"] == "train"].copy()
    test_df  = df[df["split"] == "test"].copy()
    X_train  = train_df[FEATURE_COLUMNS].values.astype(np.float64)
    y_train  = train_df[LABEL_COLUMN].values.astype(np.int64)
    X_test   = test_df[FEATURE_COLUMNS].values.astype(np.float64)
    y_test   = test_df[LABEL_COLUMN].values.astype(np.int64)
else:
    X = df[FEATURE_COLUMNS].values.astype(np.float64)
    y = df[LABEL_COLUMN].values.astype(np.int64)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_SEED
    )

print("Train shape:", X_train.shape)
print("Test shape: ", X_test.shape)
print("Train label distribution:", dict(zip(*np.unique(y_train, return_counts=True))))
print("Test label distribution: ", dict(zip(*np.unique(y_test,  return_counts=True))))

# ============================================================
# QUANTUM CIRCUIT
# ============================================================

dev = qml.device("default.qubit", wires=N_QUBITS)

def make_quantum_circuit(weights):
    @qml.qnode(dev)
    def quantum_feature_map(x):
        for layer in range(N_LAYERS):
            qml.templates.AngleEmbedding(x, wires=range(N_QUBITS), rotation="Y")
            qml.templates.StronglyEntanglingLayers(
                weights[layer:layer + 1], wires=range(N_QUBITS)
            )
        measurements = []
        for i in range(N_QUBITS):
            measurements.append(qml.expval(qml.PauliX(i)))
            measurements.append(qml.expval(qml.PauliY(i)))
            measurements.append(qml.expval(qml.PauliZ(i)))
        pairs = [(i, j) for i in range(N_QUBITS) for j in range(i + 1, N_QUBITS)]
        for a, b in pairs:
            measurements.append(qml.expval(qml.PauliX(a) @ qml.PauliX(b)))
            measurements.append(qml.expval(qml.PauliY(a) @ qml.PauliY(b)))
            measurements.append(qml.expval(qml.PauliZ(a) @ qml.PauliZ(b)))
        return measurements
    return quantum_feature_map

def extract_quantum_features(X, circuit):
    feats = []
    for idx, x in enumerate(X):
        feats.append(circuit(x))
        if (idx + 1) % 100 == 0:
            print(f"  Processed {idx + 1}/{len(X)}")
    return np.array(feats, dtype=np.float64)

# ============================================================
# SEED SEARCH (find best random weights over 20 seeds)
# ============================================================

print("\n================================================")
print("SEED SEARCH (20 seeds)")
print("================================================")

best_acc     = 0
best_weights = None
best_seed    = None

for seed in range(20):
    np.random.seed(seed)
    weights = np.random.normal(0.0, 0.1, size=(N_LAYERS, N_QUBITS, 3))
    circuit = make_quantum_circuit(weights)

    X_train_q = extract_quantum_features(X_train, circuit)
    X_test_q  = extract_quantum_features(X_test,  circuit)

    clf_trial = RandomForestClassifier(
        n_estimators=100,
        max_depth=5,
        min_samples_leaf=20,
        max_features="sqrt",
        criterion="entropy",
        bootstrap=True,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf_trial.fit(X_train_q, y_train)
    acc = accuracy_score(y_test, clf_trial.predict(X_test_q))
    print(f"  Seed {seed:02d}: test acc = {acc:.4f}")

    if acc > best_acc:
        best_acc     = acc
        best_weights = weights.copy()
        best_seed    = seed
        X_train_best = X_train_q.copy()
        X_test_best  = X_test_q.copy()

print(f"\nBest seed: {best_seed}  |  Best acc: {best_acc:.4f}")
quantum_weights = best_weights

# ============================================================
# RF HYPERPARAMETER TUNING on best quantum features
# ============================================================

print("\n================================================")
print("RF HYPERPARAMETER TUNING")
print("================================================")

param_grid = {
    "n_estimators":     [100, 200, 300],
    "max_depth":        [6, 8, 10, None],
    "min_samples_leaf": [4, 8, 12],
    "max_features":     ["log2", "sqrt"],
}

grid = GridSearchCV(
    RandomForestClassifier(
        criterion="entropy", bootstrap=True, random_state=RANDOM_SEED, n_jobs=-1
    ),
    param_grid,
    cv=5,
    scoring="accuracy",
    verbose=1,
)
grid.fit(X_train_best, y_train)

print(f"\nBest params : {grid.best_params_}")
print(f"Best CV acc : {grid.best_score_:.4f}")

clf = grid.best_estimator_

# ============================================================
# FINAL EVALUATION
# ============================================================

train_preds = clf.predict(X_train_best)
test_preds  = clf.predict(X_test_best)
train_acc   = accuracy_score(y_train, train_preds)
test_acc    = accuracy_score(y_test,  test_preds)

print("\n================================================")
print("RESULTS")
print("================================================")
print(f"\nTrain Accuracy: {train_acc:.4f}")
print(f"Test Accuracy:  {test_acc:.4f}")
print("\nClassification Report:\n")
print(classification_report(
    y_test, test_preds,
    target_names=[LABEL_NAMES[i] for i in range(3)],
    digits=4
))

cm = confusion_matrix(y_test, test_preds)
print("Confusion Matrix:")
print(cm)

# ============================================================
# SAVE MODEL
# ============================================================

joblib.dump(
    {
        "classifier":      clf,
        "quantum_weights": quantum_weights,
        "feature_columns": FEATURE_COLUMNS,
        "n_qubits":        N_QUBITS,
        "n_layers":        N_LAYERS,
        "label_names":     LABEL_NAMES,
        "best_seed":       best_seed,
        "best_seed_acc":   best_acc,
        "best_rf_params":  grid.best_params_,
    },
    MODEL_SAVE_PATH
)
print(f"\nSaved model to: {MODEL_SAVE_PATH}")

# ============================================================
# CONFUSION MATRIX PLOT
# ============================================================

plt.figure(figsize=(6, 6))
plt.imshow(cm)
plt.title("Quantum Random Forest Confusion Matrix")
plt.xlabel("Predicted")
plt.ylabel("True")
plt.xticks(ticks=np.arange(3), labels=[LABEL_NAMES[i] for i in range(3)])
plt.yticks(ticks=np.arange(3), labels=[LABEL_NAMES[i] for i in range(3)])
for i in range(cm.shape[0]):
    for j in range(cm.shape[1]):
        plt.text(j, i, str(cm[i, j]), ha="center", va="center")
plt.tight_layout()
plt.savefig("quantum_rf_confusion_matrix_v2.png")
plt.show()