import numpy as np
import pandas as pd
import pennylane as qml
from pennylane import numpy as pnp
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import joblib
import matplotlib.pyplot as plt

# ============================================================
# CONFIG
# ============================================================

CSV_PATH          = "QML/8pca/qml_15000_pca8_multiclass.csv"
LABEL_COLUMN      = "label"
FEATURE_COLUMNS   = [f"pc{i}" for i in range(1, 9)]

RANDOM_SEED       = 42
TEST_SIZE         = 0.2
N_QUBITS          = 8
N_LAYERS          = 3
N_CLASSES         = 3
EPOCHS            = 60
BATCH_SIZE        = 16
LEARNING_RATE     = 0.003
PATIENCE          = 10      # early stopping

MODEL_SAVE_PATH   = "vqc_15000_pca8_multiclass_improved.joblib"
HISTORY_SAVE_PATH = "vqc_15000_pca8_multiclass_improved_history.joblib"

LABEL_NAMES = {0: "normal", 1: "benign", 2: "malignant"}

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

@qml.qnode(dev, interface="autograd")
def circuit(x, weights):
    for layer in range(N_LAYERS):
        # data re-upload at every layer
        for i in range(N_QUBITS):
            qml.RY(x[i], wires=i)
            qml.RZ(x[i], wires=i)

        # variational layer
        qml.templates.StronglyEntanglingLayers(
            weights[layer:layer + 1],
            wires=range(N_QUBITS)
        )

    # proper expectation value outputs — not qml.probs
    return [qml.expval(qml.PauliZ(i)) for i in range(N_QUBITS)]


def predict_probs(x, weights):
    raw     = circuit(x, weights)[:N_CLASSES]
    raw     = pnp.array(raw)
    shifted = raw - pnp.max(raw)
    exp_v   = pnp.exp(shifted)
    return exp_v / pnp.sum(exp_v)

def predict_label(x, weights):
    return int(pnp.argmax(predict_probs(x, weights)))

def multiclass_cross_entropy(y_true, y_pred_probs):
    return -pnp.log(y_pred_probs[int(y_true)] + 1e-10)

def cost(weights, X_batch, y_batch):
    losses = [
        multiclass_cross_entropy(y, predict_probs(x, weights))
        for x, y in zip(X_batch, y_batch)
    ]
    return sum(losses) / len(losses)

def evaluate(X, y, weights):
    probs = np.array([
        np.array(predict_probs(x, weights), dtype=np.float64) for x in X
    ])
    preds = np.argmax(probs, axis=1)
    return accuracy_score(y, preds), probs, preds

# ============================================================
# WEIGHT INITIALISATION
# ============================================================

weights = pnp.array(
    np.random.uniform(-np.pi, np.pi, size=(N_LAYERS, N_QUBITS, 3)),
    requires_grad=True
)

opt = qml.AdamOptimizer(stepsize=LEARNING_RATE)

# ============================================================
# TRAINING LOOP
# ============================================================

train_loss_history = []
test_loss_history  = []
train_acc_history  = []
test_acc_history   = []

best_test_acc  = -1.0
best_test_loss = float("inf")
best_epoch     = -1
best_weights   = None
no_improve     = 0

num_train   = len(X_train)
num_batches = int(np.ceil(num_train / BATCH_SIZE))

print(f"\nStarting improved VQC training...")
print(f"Training samples : {num_train}")
print(f"Batches per epoch: {num_batches}")
print(f"Epochs           : {EPOCHS}")
print(f"Early stopping   : patience={PATIENCE}\n")

for epoch in range(EPOCHS):
    print(f"--- Epoch {epoch + 1}/{EPOCHS} ---")

    indices          = np.random.permutation(num_train)
    X_train_shuffled = X_train[indices]
    y_train_shuffled = y_train[indices]

    for batch_num, start in enumerate(range(0, num_train, BATCH_SIZE), start=1):
        end     = start + BATCH_SIZE
        X_batch = X_train_shuffled[start:end]
        y_batch = y_train_shuffled[start:end]

        weights = opt.step(lambda w: cost(w, X_batch, y_batch), weights)

        # Fix 4: only print every 50 batches — reduces noise and speeds up training
        if batch_num % 50 == 0:
            batch_loss = float(cost(weights, X_batch, y_batch))
            print(f"  Batch {batch_num}/{num_batches} - Loss: {batch_loss:.4f}")

    train_acc, _, _ = evaluate(X_train, y_train, weights)
    test_acc,  _, _ = evaluate(X_test,  y_test,  weights)
    train_loss = float(cost(weights, X_train, y_train))
    test_loss  = float(cost(weights, X_test,  y_test))

    train_loss_history.append(train_loss)
    test_loss_history.append(test_loss)
    train_acc_history.append(train_acc)
    test_acc_history.append(test_acc)

    improved = (test_acc > best_test_acc) or \
               (test_acc == best_test_acc and test_loss < best_test_loss)

    if improved:
        best_test_acc  = test_acc
        best_test_loss = test_loss
        best_epoch     = epoch + 1
        best_weights   = pnp.array(weights, requires_grad=True)
        no_improve     = 0
        print(f"  ✓ New best — test acc: {best_test_acc:.4f}")
    else:
        no_improve += 1

    print(
        f"Epoch {epoch + 1:02d}/{EPOCHS} | "
        f"Train Loss: {train_loss:.4f} | Test Loss: {test_loss:.4f} | "
        f"Train Acc: {train_acc:.4f} | Test Acc: {test_acc:.4f}"
    )

    # Fix 5: early stopping
    if no_improve >= PATIENCE:
        print(f"\nEarly stopping at epoch {epoch + 1} — no improvement for {PATIENCE} epochs.")
        break

    print()

# ============================================================
# FINAL EVALUATION
# ============================================================

weights = best_weights
print(f"\nBest epoch : {best_epoch}")
print(f"Best test acc  : {best_test_acc:.4f}")
print(f"Best test loss : {best_test_loss:.4f}")

train_acc, train_probs, train_preds = evaluate(X_train, y_train, weights)
test_acc,  test_probs,  test_preds  = evaluate(X_test,  y_test,  weights)

print(f"\nFinal Train Accuracy : {train_acc:.4f}")
print(f"Final Test Accuracy  : {test_acc:.4f}")
print(f"Overfitting gap      : {train_acc - test_acc:.4f}")

print("\nClassification Report:")
print(classification_report(
    y_test, test_preds,
    target_names=[LABEL_NAMES[i] for i in range(N_CLASSES)],
    digits=4
))

cm = confusion_matrix(y_test, test_preds)
print("Confusion Matrix:")
print(cm)

# ============================================================
# SAVE
# ============================================================

joblib.dump(
    {
        "weights":        np.array(weights, dtype=np.float64),
        "feature_columns": FEATURE_COLUMNS,
        "n_qubits":       N_QUBITS,
        "n_layers":       N_LAYERS,
        "n_classes":      N_CLASSES,
        "label_column":   LABEL_COLUMN,
        "label_names":    LABEL_NAMES,
        "best_epoch":     best_epoch,
        "best_test_acc":  best_test_acc,
        "best_test_loss": best_test_loss,
    },
    MODEL_SAVE_PATH
)

joblib.dump(
    {
        "train_loss_history": train_loss_history,
        "test_loss_history":  test_loss_history,
        "train_acc_history":  train_acc_history,
        "test_acc_history":   test_acc_history,
        "test_probs":         test_probs,
        "test_preds":         test_preds,
        "y_test":             y_test,
        "confusion_matrix":   cm,
    },
    HISTORY_SAVE_PATH
)

print(f"\nSaved model   → {MODEL_SAVE_PATH}")
print(f"Saved history → {HISTORY_SAVE_PATH}")

# ============================================================
# PLOTS
# ============================================================

epochs_range = range(1, len(train_loss_history) + 1)

plt.figure()
plt.plot(epochs_range, train_loss_history, label="Train Loss")
plt.plot(epochs_range, test_loss_history,  label="Test Loss")
plt.xlabel("Epoch")
plt.ylabel("Loss")
plt.title("Improved VQC — Loss")
plt.legend()
plt.tight_layout()
plt.savefig("vqc_improve_v2_loss.png")
plt.show()

plt.figure()
plt.plot(epochs_range, train_acc_history, label="Train Accuracy")
plt.plot(epochs_range, test_acc_history,  label="Test Accuracy")
plt.xlabel("Epoch")
plt.ylabel("Accuracy")
plt.title("Improved VQC — Accuracy")
plt.legend()
plt.tight_layout()
plt.savefig("vqc_improve_v2_accuracy.png")
plt.show()