import io
import numpy as np
import joblib
import pennylane as qml
from PIL import Image
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

# =========================
# SETTINGS
# =========================
BASE_DIR = Path(__file__).parent.parent  # points to backend/
PCA_PATH = BASE_DIR / "dataset/pca_model.joblib"
SCALER_PATH = BASE_DIR / "dataset/qml_scaler.joblib"
QSVM_MODEL_PATH = BASE_DIR / "dataset/qsvm_model_v0.0.1.joblib"
X_TRAIN_PATH = BASE_DIR / "dataset/X_train.joblib"

RESIZE_TO = (16, 16)

class_names = ["Normal", "Benign", "Malignant"]

# =========================
# LOAD MODELS 
# =========================
pca = joblib.load(PCA_PATH)
scaler = joblib.load(SCALER_PATH)
qsvm_data = joblib.load(QSVM_MODEL_PATH)
model = qsvm_data["model"]
n_qubits = qsvm_data["n_qubits"]
X_train = joblib.load(X_TRAIN_PATH)

print(f"QSVM loaded, n_qubits: {n_qubits}, PCA components: {pca.n_components_}")


# =========================
# QUANTUM DEVICE
# =========================
dev = qml.device("default.qubit", wires=n_qubits)

# =========================
# FEATURE MAP
# =========================
def feature_map(x):
    for i in range(n_qubits):
        qml.RY(x[i], wires=i)
        qml.RZ(x[i], wires=i)

    # entanglement layer
    for i in range(n_qubits):
        for j in range(i+1, n_qubits):
            qml.CNOT(wires=[i, j])

# =========================
# QUANTUM KERNEL
# =========================
@qml.qnode(dev)
def quantum_kernel(x1, x2):
    feature_map(x1)
    qml.adjoint(feature_map)(x2)
    return qml.probs(wires=range(n_qubits))

def kernel_function(x1, x2):
    return quantum_kernel(x1, x2)[0]

def compute_kernel_vector(x):
    return np.array([
        kernel_function(x, x_train_sample)
        for x_train_sample in X_train
    ]).reshape(1, -1)

# =========================
# PREPROCESS IMAGE
# =========================
def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = img.resize(RESIZE_TO, Image.Resampling.LANCZOS)
    
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = arr.flatten().reshape(1, -1)
    
    arr_pca = pca.transform(arr)
    arr_scaled = scaler.transform(arr_pca)
    
    return arr_scaled[0]

# =========================
# ROUTER
# =========================
router = APIRouter(prefix="/QMLPredict", tags=["predict"])

@router.post("")
async def predict(file: UploadFile = File(...)):
    
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    contents = await file.read()

    try:
        features = preprocess_image(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {str(e)}")

    # =========================
    # QSVM PREDICTION
    # =========================
    K_test = compute_kernel_vector(features)
    probs = model.predict_proba(K_test)[0]
    label_idx = int(np.argmax(probs))

    return JSONResponse(content={
        "probabilities": {
            class_names[i]: float(round(probs[i], 4))
            for i in range(len(class_names))
        },
        "prediction": label_idx,
        "result": class_names[label_idx]
    })
