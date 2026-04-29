import pennylane as qml
import pandas as pd
import numpy as np
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, ConfusionMatrixDisplay, roc_curve, auc
from sklearn.preprocessing import label_binarize
import matplotlib.pyplot as plt
import joblib

# Settings
CSV_PATH = "QML/dataset/qml_900_pca4_multiclass.csv"
FEATURE_COLUMNS = ["pc1", "pc2", "pc3", "pc4"]
LABEL_COLUMN = "label"

N_QUBITS = 4
RANDOM_SEED = 42

class_names = ["Normal", "Benign", "Malignant"]

np.random.seed(RANDOM_SEED)


# Load Data
df = pd.read_csv(CSV_PATH)

if "split" in df.columns:
    train_df = df[df["split"] == "train"]
    test_df = df[df["split"] == "test"]
else:
    raise ValueError("Dataset must include 'split' column from PCA preprocessing step.")

X_train = train_df[FEATURE_COLUMNS].values.astype(np.float64)
y_train = train_df[LABEL_COLUMN].values.astype(np.int64)

X_test = test_df[FEATURE_COLUMNS].values.astype(np.float64)
y_test = test_df[LABEL_COLUMN].values.astype(np.int64)

print("Train shape:", X_train.shape)
print("Test shape:", X_test.shape)


# Quantum Device
dev = qml.device("default.qubit", wires=N_QUBITS)


# Feature Map
def feature_map(x):
    for i in range(N_QUBITS):
        qml.RY(x[i], wires=i)
        qml.RZ(x[i], wires=i)

    # entanglement layer
    for i in range(N_QUBITS):
        for j in range(i+1, N_QUBITS):
            qml.CNOT(wires=[i, j])


# Quamtum Kernel
@qml.qnode(dev)
def quantum_kernel(x1, x2):
    feature_map(x1)
    qml.adjoint(feature_map)(x2)
    return qml.probs(wires=range(N_QUBITS))

def kernel_function(x1, x2):
    return float(quantum_kernel(x1, x2)[0])


# Kernel Matrix
def compute_kernel_matrix(X1, X2):
    n1, n2 = len(X1), len(X2)
    kernel_matrix = np.zeros((n1, n2))

    print(f"Computing kernel matrix: {n1} x {n2}")

    for i in range(n1):
        for j in range(n2):
            kernel_matrix[i, j] = kernel_function(X1[i], X2[j])

    return kernel_matrix


# Train QSVM
print("\nBuilding training kernel matrix...")
K_train = compute_kernel_matrix(X_train, X_train)

print("Training SVM...")
model = SVC(kernel="precomputed", probability=True)
model.fit(K_train, y_train)


# Prediction
print("\nBuilding test kernel matrix...")
K_test = compute_kernel_matrix(X_test, X_train)

y_pred = model.predict(K_test)


# Evaluation
acc = accuracy_score(y_test, y_pred)

print("\n------------------------")
print("QSVM RESULTS")
print("------------------------")
print(f"Accuracy: {acc:.4f}\n")

print("Classification Report:")
print(classification_report(y_test, y_pred, digits=4))

print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

#ROC graph
y_test_bin = label_binarize(y_test, classes=[0, 1, 2])
y_score = model.predict_proba(K_test)

plt.figure()

for i in range(3):
    fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_score[:, i])
    roc_auc = auc(fpr, tpr)

    plt.plot(fpr, tpr, label=f"{class_names[i]} AUC = {roc_auc:.2f}")

plt.plot([0, 1], [0, 1], "--")
plt.title("QSVM Multiclass ROC")
plt.legend()
plt.show()

# Confusion matrix plot
ConfusionMatrixDisplay.from_predictions(y_test, y_pred)
plt.title("QSVM Confusion Matrix")
plt.show()


# Save Model
joblib.dump(
    {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "n_qubits": N_QUBITS
    },
    "qsvm_model_v0.0.1.joblib"
)

print("\nSaved QSVM model to qsvm_model_v0.0.1.joblib")

joblib.dump(X_train, "X_train.joblib")
print("Saved X_train to X_train.joblib")
