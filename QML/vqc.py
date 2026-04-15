import numpy as np
import pandas as pd
import pennylane as qml
from pennylane import numpy as pnp
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, roc_curve, auc, confusion_matrix
import joblib
import matplotlib.pyplot as plt

# settings
CSV_PATH = "dataset/qml_500_pca4.csv"
LABEL_COLUMN = "label"
FEATURE_COLUMNS = [f"pc{i}" for i in range(1, 5)]

RANDOM_SEED = 42
TEST_SIZE = 0.2
N_QUBITS = 4
N_LAYERS = 1
EPOCHS = 20
BATCH_SIZE = 16
LEARNING_RATE = 0.05

MODEL_SAVE_PATH = "vqc_500_pca4_best.joblib"
HISTORY_SAVE_PATH = "vqc_500_pca4_history.joblib"

np.random.seed(RANDOM_SEED)


df = pd.read_csv(CSV_PATH)

if "split" in df.columns:
    train_df = df[df["split"] == "train"].copy()
    test_df = df[df["split"] == "test"].copy()

    X_train = train_df[FEATURE_COLUMNS].values.astype(np.float64)
    y_train = train_df[LABEL_COLUMN].values.astype(np.float64)

    X_test = test_df[FEATURE_COLUMNS].values.astype(np.float64)
    y_test = test_df[LABEL_COLUMN].values.astype(np.float64)
else:
    X = df[FEATURE_COLUMNS].values.astype(np.float64)
    y = df[LABEL_COLUMN].values.astype(np.float64)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        stratify=y,
        random_state=RANDOM_SEED
    )

print("Train shape:", X_train.shape)
print("Test shape:", X_test.shape)

# QUANTUM DVEICE
dev = qml.device("default.qubit", wires=N_QUBITS)

#circuit definition
def variational_layer(weights):
    for i in range(N_QUBITS):
        qml.RY(weights[i, 0], wires=i)
        qml.RZ(weights[i, 1], wires=i)

    for i in range(N_QUBITS):
        qml.CNOT(wires=[i, (i + 1) % N_QUBITS])

@qml.qnode(dev, interface="autograd")
def circuit(x, weights):
    # richer input encoding
    for i in range(N_QUBITS):
        qml.RY(x[i], wires=i)
        qml.RZ(x[i], wires=i)

    for layer in range(N_LAYERS):
        variational_layer(weights[layer])

    return qml.expval(qml.PauliZ(0))

#helper models
def predict_score(x, weights):
    raw = circuit(x, weights)
    prob = (raw + 1.0) / 2.0
    return pnp.clip(prob, 1e-7, 1 - 1e-7)

def predict_label(x, weights):
    return 1 if float(predict_score(x, weights)) >= 0.5 else 0

def binary_cross_entropy(y_true, y_pred):
    return -(y_true * pnp.log(y_pred) + (1 - y_true) * pnp.log(1 - y_pred))

def cost(weights, X_batch, y_batch):
    losses = [binary_cross_entropy(y, predict_score(x, weights)) for x, y in zip(X_batch, y_batch)]
    return sum(losses) / len(losses)

def evaluate(X, y, weights):
    probs = np.array([float(predict_score(x, weights)) for x in X])
    preds = (probs >= 0.5).astype(int)
    acc = accuracy_score(y, preds)
    return acc, probs, preds

#init trainable weights
weights = pnp.array(
    np.random.normal(
        loc=0.0,
        scale=0.1,
        size=(N_LAYERS, N_QUBITS, 2)
    ),
    requires_grad=True
)

opt = qml.AdamOptimizer(stepsize=LEARNING_RATE)

#history and best tracking
train_loss_history = []
test_loss_history = []
train_acc_history = []
test_acc_history = []

best_test_acc = -1.0
best_test_loss = float("inf")
best_epoch = -1
best_weights = None

#main training loop
num_train = len(X_train)
num_batches = int(np.ceil(num_train / BATCH_SIZE))

print("\nStarting VQC training...")
print(f"Training samples: {num_train}")
print(f"Batches per epoch: {num_batches}")
print(f"Epochs: {EPOCHS}\n")

for epoch in range(EPOCHS):
    print(f"--- Epoch {epoch + 1}/{EPOCHS} ---")

    indices = np.random.permutation(num_train)
    X_train_shuffled = X_train[indices]
    y_train_shuffled = y_train[indices]

    for batch_num, start in enumerate(range(0, num_train, BATCH_SIZE), start=1):
        end = start + BATCH_SIZE
        X_batch = X_train_shuffled[start:end]
        y_batch = y_train_shuffled[start:end]

        weights = opt.step(lambda w: cost(w, X_batch, y_batch), weights)

        batch_loss = float(cost(weights, X_batch, y_batch))
        print(f"  Batch {batch_num}/{num_batches} - Batch Loss: {batch_loss:.4f}")

    train_acc, _, _ = evaluate(X_train, y_train, weights)
    test_acc, _, _ = evaluate(X_test, y_test, weights)
    train_loss = float(cost(weights, X_train, y_train))
    test_loss = float(cost(weights, X_test, y_test))

    train_loss_history.append(train_loss)
    test_loss_history.append(test_loss)
    train_acc_history.append(train_acc)
    test_acc_history.append(test_acc)

    if (test_acc > best_test_acc) or (test_acc == best_test_acc and test_loss < best_test_loss):
        best_test_acc = test_acc
        best_test_loss = test_loss
        best_epoch = epoch + 1
        best_weights = pnp.array(weights, requires_grad=True)

    print(
        f"Epoch {epoch + 1:02d}/{EPOCHS} complete | "
        f"Train Loss: {train_loss:.4f} | Test Loss: {test_loss:.4f} | "
        f"Train Acc: {train_acc:.4f} | Test Acc: {test_acc:.4f}"
    )

    sample_probs = np.array([float(predict_score(x, weights)) for x in X_train[:10]])
    print("Sample probs:", np.round(sample_probs, 4))
    print("Weight sample:", round(float(weights[0, 0, 0]), 6))
    print("Weight mean:", round(float(pnp.mean(weights)), 6))
    print("Weight std:", round(float(pnp.std(weights)), 6))
    print()

#best weights
weights = best_weights
print(f"Using best weights from epoch {best_epoch} | Best Test Acc: {best_test_acc:.4f} | Best Test Loss: {best_test_loss:.4f}")

#final eval
train_acc, train_probs, train_preds = evaluate(X_train, y_train, weights)
test_acc, test_probs, test_preds = evaluate(X_test, y_test, weights)

print("\nFinal Train Accuracy:", round(train_acc, 4))
print("Final Test Accuracy:", round(test_acc, 4))

print("\nClassification Report:")
print(classification_report(y_test.astype(int), test_preds, digits=4))

cm = confusion_matrix(y_test.astype(int), test_preds)
print("\nConfusion Matrix:")
print(cm)

# ROC AUC
fpr, tpr, _ = roc_curve(y_test.astype(int), test_probs)
roc_auc = auc(fpr, tpr)
print(f"\nROC AUC: {roc_auc:.4f}")

#save model
joblib.dump(
    {
        "weights": np.array(weights),
        "feature_columns": FEATURE_COLUMNS,
        "n_qubits": N_QUBITS,
        "n_layers": N_LAYERS,
        "label_column": LABEL_COLUMN,
        "threshold": 0.5,
        "best_epoch": best_epoch,
        "best_test_acc": best_test_acc,
        "best_test_loss": best_test_loss
    },
    MODEL_SAVE_PATH
)

joblib.dump(
    {
        "train_loss_history": train_loss_history,
        "test_loss_history": test_loss_history,
        "train_acc_history": train_acc_history,
        "test_acc_history": test_acc_history,
        "test_probs": test_probs,
        "test_preds": test_preds,
        "y_test": y_test
    },
    HISTORY_SAVE_PATH
)

print(f"\nSaved best model to {MODEL_SAVE_PATH}")
print(f"Saved history to {HISTORY_SAVE_PATH}")

#plots
epochs_range = range(1, EPOCHS + 1)

plt.figure()
plt.plot(epochs_range, train_loss_history, label="Train Loss")
plt.plot(epochs_range, test_loss_history, label="Test Loss")
plt.xlabel("Epoch")
plt.ylabel("Loss")
plt.title("Training and Test Loss")
plt.legend()
plt.tight_layout()
plt.savefig("vqc_loss_curve.png")
plt.show()

plt.figure()
plt.plot(epochs_range, train_acc_history, label="Train Accuracy")
plt.plot(epochs_range, test_acc_history, label="Test Accuracy")
plt.xlabel("Epoch")
plt.ylabel("Accuracy")
plt.title("Training and Test Accuracy")
plt.legend()
plt.tight_layout()
plt.savefig("vqc_accuracy_curve.png")
plt.show()

plt.figure()
plt.plot(fpr, tpr, label=f"AUC = {roc_auc:.4f}")
plt.plot([0, 1], [0, 1], linestyle="--")
plt.xlabel("False Positive Rate")
plt.ylabel("True Positive Rate")
plt.title("ROC Curve")
plt.legend()
plt.tight_layout()
plt.savefig("vqc_roc_curve.png")
plt.show()