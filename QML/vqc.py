import numpy as np
import pandas as pd
import pennylane as qml
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib   


CSV_PATH = "qml_100_pca8.csv"   
LABEL_COLUMN = "label"
FEATURE_COLUMNS = [f"pc{i}" for i in range(1, 9)]

RANDOM_SEED = 42
TEST_SIZE = 0.2
N_QUBITS = 8
N_LAYERS = 2
EPOCHS = 30
BATCH_SIZE = 8
LEARNING_RATE = 0.05

np.random.seed(RANDOM_SEED)

df = pd.read_csv(CSV_PATH)

#use existing split if not create new one
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

dev = qml.device("default.qubit", wires=N_QUBITS)

def variational_layer(weights):
    # weights shape for one layer (N_QUBITS, 2)
    for i in range(N_QUBITS):
        qml.RY(weights[i, 0], wires=i)
        qml.RZ(weights[i, 1], wires=i)

    # Ring entanglement
    for i in range(N_QUBITS):
        qml.CNOT(wires=[i, (i + 1) % N_QUBITS])

@qml.qnode(dev, interface="autograd")
def circuit(x, weights):
    # Angle encoding using your PCA features
    for i in range(N_QUBITS):
        qml.RY(x[i], wires=i)

    # Variational layers
    for layer in range(N_LAYERS):
        variational_layer(weights[layer])

    # Measure one qubit for binary classification
    return qml.expval(qml.PauliZ(0))


#helpers for model
def predict_score(x, weights):
    raw = circuit(x, weights)          # roughly in [-1, 1]
    prob = (raw + 1.0) / 2.0           # map to [0, 1]
    return np.clip(prob, 1e-7, 1 - 1e-7)

def predict_label(x, weights):
    return 1 if predict_score(x, weights) >= 0.5 else 0

def binary_cross_entropy(y_true, y_pred):
    return -(y_true * np.log(y_pred) + (1 - y_true) * np.log(1 - y_pred))

def cost(weights, X_batch, y_batch):
    losses = []
    for x, y in zip(X_batch, y_batch):
        pred = predict_score(x, weights)
        losses.append(binary_cross_entropy(y, pred))
    return np.mean(losses)

def evaluate(X, y, weights):
    probs = np.array([predict_score(x, weights) for x in X])
    preds = (probs >= 0.5).astype(int)
    acc = accuracy_score(y, preds)
    return acc, probs, preds

# INITIALIZE TRAINABLE WEIGHTS
# Shape: (N_LAYERS, N_QUBITS, 2)

weights = np.random.normal(
    loc=0.0,
    scale=0.1,
    size=(N_LAYERS, N_QUBITS, 2)
)

opt = qml.GradientDescentOptimizer(stepsize=LEARNING_RATE)

#main training loop

num_train = len(X_train)

for epoch in range(EPOCHS):
    # Shuffle each epoch
    indices = np.random.permutation(num_train)
    X_train_shuffled = X_train[indices]
    y_train_shuffled = y_train[indices]

    # Mini-batch training
    for start in range(0, num_train, BATCH_SIZE):
        end = start + BATCH_SIZE
        X_batch = X_train_shuffled[start:end]
        y_batch = y_train_shuffled[start:end]

        weights = opt.step(lambda w: cost(w, X_batch, y_batch), weights)

    train_acc, _, _ = evaluate(X_train, y_train, weights)
    test_acc, _, _ = evaluate(X_test, y_test, weights)
    train_loss = cost(weights, X_train, y_train)
    test_loss = cost(weights, X_test, y_test)

    print(
        f"Epoch {epoch + 1:02d}/{EPOCHS} | "
        f"Train Loss: {train_loss:.4f} | Test Loss: {test_loss:.4f} | "
        f"Train Acc: {train_acc:.4f} | Test Acc: {test_acc:.4f}"
    )



# Save model
joblib.dump(
    {
        "weights": weights,
        "feature_columns": FEATURE_COLUMNS,
        "n_qubits": N_QUBITS,
        "n_layers": N_LAYERS,
        "label_column": LABEL_COLUMN,
        "threshold": 0.5
    },
    "vqc_v0.0.1.joblib"
)

print("\nSaved trained model to vqc_v0.0.1.joblib")