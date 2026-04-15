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