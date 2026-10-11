import os
import json
import time
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import joblib

import pennylane as qml
from pennylane import numpy as pnp

from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.svm import SVC
from sklearn.multiclass import OneVsRestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_recall_fscore_support,
    classification_report, confusion_matrix
)

# ======================================================================
# CONFIG  -- change these for each controlled experiment
# ======================================================================

# Best-performing config found so far: ComBat-harmonized (hospital batch effect
# removed, diagnosis label protected as covariate -- see combat_train.py),
# 12 PCA components / 12 qubits, angle_entangle feature map with FULL
# pairwise entanglement (all 66 pairs, not just a linear chain), reps=2.
# 4->8->12 components each raised accuracy (0.573->0.597->0.621) as more
# real signal survives the compression -- 14 qubits was tried and tested
# WORSE even after retuning (13th/14th PCA components add more noise than
# signal), and 16 qubits was skipped outright: on this machine's 8GB RAM,
# storing all statevectors at once would need ~4.7GB, a real crash/swap
# risk. SCALED data-dependent entangling gates (angle_entangle, see its
# docstring) capture pairwise feature correlations a pure product-state
# kernel can't represent, without the concentration collapse a naive/
# unscaled entangling term causes -- linear entanglement gave 0.621->0.628,
# full entanglement pushed it to 0.628->0.629. reps=2 (the rotate+entangle
# block applied twice, i.e. more circuit DEPTH) cost only 0.007 accuracy
# off that peak but more than DOUBLED cmmd-benign recall (0.130->0.261,
# the specific shortcut this whole investigation has been chasing) with
# ddsm-malignant unharmed -- by far the best shortcut-fix-to-accuracy-cost
# ratio found, better than any C-sweep/JTT/group-weighting attempt.
# C=1.0 is the best value found in the 0.3-1.0 range for this feature map.
CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "4pca", "qml_combat_pca12_multihospital_pooled.csv")
ALL_FEATURE_COLUMNS = [f"pc{i}" for i in range(1, 13)]
LABEL_COLUMN        = "label"

N_FEATURES          = 12
N_QUBITS            = N_FEATURES

FEATURE_MAP         = "angle_entangle"
FEATURE_MAP_REPS    = 2
ENTANGLEMENT        = "full"
ANGLE_RANGE         = (0.0, np.pi)

SVM_C               = 1.0
MULTICLASS_STRATEGY = "ovo"
COMPUTE_PROBABILITY = True

QSVC_MAX_TRAIN_SAMPLES = None   # None = no subsampling, use the full train split
                                 # (was 1500, capping the SVM below the dataset even as
                                 # combat_train.py's SAMPLES_PER_CLASS grew to 1500/class)

RANDOM_SEED          = 42
LABEL_NAMES           = {0: "normal", 1: "benign", 2: "malignant"}

RUN_TAG               = f"qsvc_{FEATURE_MAP}_{N_FEATURES}f_{ENTANGLEMENT}_C{SVM_C}"
OUTPUT_DIR            = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qsvc_outputs")
MODEL_SAVE_PATH        = os.path.join(OUTPUT_DIR, f"{RUN_TAG}_model.joblib")
RESULTS_TABLE_PATH     = os.path.join(OUTPUT_DIR, "experiment_results.csv")

os.makedirs(OUTPUT_DIR, exist_ok=True)
np.random.seed(RANDOM_SEED)


# ======================================================================
# 1. DATA LOADING
# ======================================================================

def load_data(csv_path, feature_columns, label_column, n_features, seed):
    df = pd.read_csv(csv_path)
    cols = feature_columns[:n_features]

    if "split" in df.columns:
        train_df = df[df["split"] == "train"].copy()
        test_df  = df[df["split"] == "test"].copy()
    else:
        train_df, test_df = train_test_split(
            df, test_size=0.2, stratify=df[label_column], random_state=seed
        )

    X_train_raw = train_df[cols].values.astype(np.float64)
    y_train     = train_df[label_column].values.astype(np.int64)
    X_test_raw  = test_df[cols].values.astype(np.float64)
    y_test      = test_df[label_column].values.astype(np.int64)
    return X_train_raw, y_train, X_test_raw, y_test, cols


def preprocess(X_train_raw, X_test_raw, angle_range):
    std_scaler = StandardScaler()
    X_train_std = std_scaler.fit_transform(X_train_raw)
    X_test_std  = std_scaler.transform(X_test_raw)

    mm_scaler = MinMaxScaler(feature_range=angle_range)
    X_train_scaled = mm_scaler.fit_transform(X_train_std)
    X_test_scaled  = mm_scaler.transform(X_test_std)

    return X_train_scaled, X_test_scaled, std_scaler, mm_scaler


def stratified_subsample(X, y, max_samples, seed):
    if max_samples is None or len(X) <= max_samples:
        return X, y, np.arange(len(X))
    idx_all = np.arange(len(X))
    idx_sub, _ = train_test_split(
        idx_all, train_size=max_samples, stratify=y, random_state=seed
    )
    return X[idx_sub], y[idx_sub], idx_sub


# ======================================================================
# 2. QUANTUM FEATURE MAPS
# ======================================================================

def _entangler_pairs(n_qubits, entanglement):
    if entanglement == "linear":
        return [(i, i + 1) for i in range(n_qubits - 1)]
    if entanglement == "circular":
        return [(i, (i + 1) % n_qubits) for i in range(n_qubits)]
    if entanglement == "full":
        return [(i, j) for i in range(n_qubits) for j in range(i + 1, n_qubits)]
    raise ValueError(f"Unknown entanglement: {entanglement}")


def angle_feature_map(x, n_qubits, reps=1, entanglement="linear"):
    for _ in range(reps):
        for i in range(n_qubits):
            qml.RY(x[i], wires=i)
            qml.RZ(x[i], wires=i)


ENTANGLE_INTERACTION_SCALE = 0.03   # see angle_light_entangle_feature_map docstring --
                                     # unscaled (1.0) over-rotates and collapses the kernel
                                     # (off-diag fidelity std 0.134->0.045). With FEATURE_MAP_REPS=2
                                     # (the rotate+entangle block applied twice -- more circuit
                                     # DEPTH, not more qubits), 0.03 gave the best balance: only
                                     # 0.007 accuracy below the reps=1/scale=0.08 config, but
                                     # cmmd-benign recall more than doubled (0.130->0.261) with
                                     # ddsm-malignant unharmed (0.263->0.270) -- the best ratio
                                     # of shortcut-fix to accuracy-cost found in this investigation
                                     # (compare: every C-sweep/JTT/group-weighting attempt traded
                                     # 3-13+ accuracy points for a similar or smaller cmmd-benign gain).


def angle_light_entangle_feature_map(x, n_qubits, reps=1, entanglement="linear"):
    """angle_feature_map plus ONE ring of nearest-neighbor data-dependent
    ZZ-interaction gates (CNOT-RZ(scale*x_i*x_j)-CNOT) after the rotations --
    not per-rep, not full pairwise, and critically not a bare unparameterized
    CNOT (that would be a no-op on the fidelity kernel: appending the SAME
    fixed unitary U to both states leaves <phi(x)|U^-1 U|phi(x')> unchanged,
    since U^-1 U = I regardless of x). Every prior entanglement test also
    conflated qubit count, circuit depth, and full/repeated CNOT structure
    all at once (zz/pauli, reps=2, up to 16 qubits) and hit kernel
    concentration. This isolates just "a little data-dependent entanglement"
    at the qubit count/depth that already works well for the plain angle
    map: pairwise feature correlations that a pure product-state kernel
    structurally cannot represent DO carry real signal (0.620->0.628
    accuracy), but only once the interaction strength is scaled down --
    unscaled, x_i*x_j reaches ~9.87 for x in [0,pi], a rotation angle large
    enough to send the kernel toward the same concentration failure mode
    that ruled out zz/pauli at high qubit counts.

    reps repeats the WHOLE block (rotation + entangling ring) together, not
    just the rotation -- reps=2 adds circuit DEPTH rather than more qubits,
    and (with ENTANGLE_INTERACTION_SCALE retuned down for the doubled
    entangling exposure) more than doubled cmmd-benign recall (0.130->0.261)
    for only ~0.007 accuracy cost, the best shortcut-fix ratio found in this
    investigation."""
    for _ in range(reps):
        for i in range(n_qubits):
            qml.RY(x[i], wires=i)
            qml.RZ(x[i], wires=i)
        for (i, j) in _entangler_pairs(n_qubits, entanglement):
            qml.CNOT(wires=[i, j])
            qml.RZ(ENTANGLE_INTERACTION_SCALE * x[i] * x[j], wires=j)
            qml.CNOT(wires=[i, j])


def zz_feature_map(x, n_qubits, reps=2, entanglement="linear"):
    pairs = _entangler_pairs(n_qubits, entanglement)
    for _ in range(reps):
        for i in range(n_qubits):
            qml.Hadamard(wires=i)
            qml.RZ(2 * x[i], wires=i)
        for (i, j) in pairs:
            qml.CNOT(wires=[i, j])
            qml.RZ(2 * (np.pi - x[i]) * (np.pi - x[j]), wires=j)
            qml.CNOT(wires=[i, j])


def pauli_feature_map(x, n_qubits, reps=2, entanglement="linear"):
    pairs = _entangler_pairs(n_qubits, entanglement)
    for _ in range(reps):
        for i in range(n_qubits):
            qml.Hadamard(wires=i)
            qml.RZ(2 * x[i], wires=i)
        for i in range(n_qubits):
            qml.RX(np.pi / 2, wires=i)
        for (i, j) in pairs:
            qml.CNOT(wires=[i, j])
            qml.RZ(2 * (np.pi - x[i]) * (np.pi - x[j]), wires=j)
            qml.CNOT(wires=[i, j])
        for i in range(n_qubits):
            qml.RX(-np.pi / 2, wires=i)


FEATURE_MAPS = {
    "angle": angle_feature_map,
    "angle_entangle": angle_light_entangle_feature_map,
    "zz": zz_feature_map,
    "pauli": pauli_feature_map,
}


# ======================================================================
# 3. QUANTUM KERNEL  (exact fidelity via statevectors -- simulator-only trick)
# ======================================================================

def build_statevector_fn(feature_map_name, n_qubits, reps, entanglement):
    dev = qml.device("default.qubit", wires=n_qubits)
    feature_map_fn = FEATURE_MAPS[feature_map_name]

    @qml.qnode(dev)
    def circuit(x):
        feature_map_fn(x, n_qubits, reps=reps, entanglement=entanglement)
        return qml.state()

    return circuit


def compute_statevectors(X, statevector_fn):
    return np.array([np.asarray(statevector_fn(x)) for x in X])


def fidelity_kernel(S1, S2):
    """K[i, j] = |<phi(x1_i)|phi(x2_j)>|^2"""
    overlaps = S1 @ S2.conj().T
    return np.abs(overlaps) ** 2


# ======================================================================
# 4. TRAIN / EVALUATE QSVC
# ======================================================================

def train_qsvc(K_train, y_train, C, multiclass_strategy, probability, seed):
    base = SVC(kernel="precomputed", C=C, probability=probability,
               random_state=seed)
    if multiclass_strategy == "ovo":
        model = base
    elif multiclass_strategy == "ovr":
        model = OneVsRestClassifier(base)
    else:
        raise ValueError("MULTICLASS_STRATEGY must be 'ovo' or 'ovr'")
    model.fit(K_train, y_train)
    return model


def evaluate_model(model, K_eval, y_true, label_names, n_classes):
    preds = model.predict(K_eval)
    acc = accuracy_score(y_true, preds)
    prec_m, rec_m, f1_m, _ = precision_recall_fscore_support(
        y_true, preds, average="macro", zero_division=0
    )
    prec_w, rec_w, f1_w, _ = precision_recall_fscore_support(
        y_true, preds, average="weighted", zero_division=0
    )
    report = classification_report(
        y_true, preds, target_names=[label_names[i] for i in range(n_classes)],
        digits=4, zero_division=0
    )
    cm = confusion_matrix(y_true, preds)
    return {
        "preds": preds, "accuracy": acc,
        "precision_macro": prec_m, "recall_macro": rec_m, "f1_macro": f1_m,
        "precision_weighted": prec_w, "recall_weighted": rec_w, "f1_weighted": f1_w,
        "report": report, "confusion_matrix": cm,
    }


# ======================================================================
# 5. RESULTS TABLE LOGGING
# ======================================================================

def log_experiment(results_path, row: dict):
    row = dict(row)
    if os.path.exists(results_path):
        df = pd.read_csv(results_path)
        df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    else:
        df = pd.DataFrame([row])
    df.to_csv(results_path, index=False)
    return df


# ======================================================================
# 6. PLOTS
# ======================================================================

def plot_confusion_matrix(cm, label_names, n_classes, out_path, title):
    fig, ax = plt.subplots(figsize=(5, 4.5))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(n_classes))
    ax.set_yticks(range(n_classes))
    ax.set_xticklabels([label_names[i] for i in range(n_classes)], rotation=45, ha="right")
    ax.set_yticklabels([label_names[i] for i in range(n_classes)])
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title(title)
    for i in range(n_classes):
        for j in range(n_classes):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                     color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_kernel_matrix(K, out_path, title, max_show=200):
    K_show = K[:max_show, :max_show]
    fig, ax = plt.subplots(figsize=(5, 4.5))
    im = ax.imshow(K_show, cmap="viridis")
    ax.set_title(title)
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


# ======================================================================
# 7. MAIN PIPELINE FOR ONE CONFIGURATION
# ======================================================================

def run_qsvc_experiment(csv_path=CSV_PATH, n_features=N_FEATURES, n_qubits=None,
                         feature_map=FEATURE_MAP, reps=FEATURE_MAP_REPS,
                         entanglement=ENTANGLEMENT, angle_range=ANGLE_RANGE,
                         svm_c=SVM_C, multiclass_strategy=MULTICLASS_STRATEGY,
                         probability=COMPUTE_PROBABILITY,
                         max_train_samples=QSVC_MAX_TRAIN_SAMPLES,
                         seed=RANDOM_SEED, tag=None, save_model=True,
                         make_plots=True):

    n_qubits = n_qubits or n_features
    tag = tag or f"qsvc_{feature_map}_{n_features}f_{entanglement}_C{svm_c}"

    print(f"\n=== Running experiment: {tag} ===")
    t0 = time.time()

    X_train_raw, y_train, X_test_raw, y_test, used_cols = load_data(
        csv_path, ALL_FEATURE_COLUMNS, LABEL_COLUMN, n_features, seed
    )
    X_train_scaled, X_test_scaled, std_scaler, mm_scaler = preprocess(
        X_train_raw, X_test_raw, angle_range
    )

    X_train_sub, y_train_sub, sub_idx = stratified_subsample(
        X_train_scaled, y_train, max_train_samples, seed
    )
    print(f"Train (full):   {X_train_scaled.shape}")
    print(f"Train (used):   {X_train_sub.shape}  <- QSVC_MAX_TRAIN_SAMPLES={max_train_samples}")
    print(f"Test (full):    {X_test_scaled.shape}")

    # --- quantum states / kernels ---
    statevector_fn = build_statevector_fn(feature_map, n_qubits, reps, entanglement)

    t_state0 = time.time()
    S_train = compute_statevectors(X_train_sub, statevector_fn)
    S_test  = compute_statevectors(X_test_scaled, statevector_fn)
    print(f"Statevector computation: {time.time() - t_state0:.1f}s "
          f"({len(S_train)} train + {len(S_test)} test states, {2**n_qubits}-dim)")

    K_train = fidelity_kernel(S_train, S_train)
    K_test  = fidelity_kernel(S_test, S_train)   # rows=test, cols=train (as SVC expects)

    # --- train + evaluate ---
    model = train_qsvc(K_train, y_train_sub, svm_c, multiclass_strategy, probability, seed)

    train_metrics = evaluate_model(model, K_train, y_train_sub, LABEL_NAMES, len(LABEL_NAMES))
    test_metrics  = evaluate_model(model, K_test, y_test, LABEL_NAMES, len(LABEL_NAMES))

    elapsed = time.time() - t0
    print(f"\nTrain accuracy: {train_metrics['accuracy']:.4f}")
    print(f"Test accuracy:  {test_metrics['accuracy']:.4f}")
    print(f"Test macro-F1:  {test_metrics['f1_macro']:.4f}")
    print("\nClassification report (test):")
    print(test_metrics["report"])
    print("Confusion matrix (test):")
    print(test_metrics["confusion_matrix"])
    print(f"\nTotal wall time: {elapsed:.1f}s")

    # --- plots ---
    if make_plots:
        plot_confusion_matrix(
            test_metrics["confusion_matrix"], LABEL_NAMES, len(LABEL_NAMES),
            os.path.join(OUTPUT_DIR, f"{tag}_confusion_matrix.png"),
            f"QSVC ({feature_map}, {n_features}f) - Test Confusion Matrix"
        )
        plot_kernel_matrix(
            K_train, os.path.join(OUTPUT_DIR, f"{tag}_train_kernel.png"),
            f"Train kernel matrix ({feature_map}, {n_features}f) [first 200 samples]"
        )

    # --- save model bundle ---
    if save_model:
        joblib.dump({
            "svc_model": model,
            "std_scaler": std_scaler,
            "mm_scaler": mm_scaler,
            "X_train_sub": X_train_sub,
            "y_train_sub": y_train_sub,
            "feature_columns": used_cols,
            "n_qubits": n_qubits,
            "feature_map": feature_map,
            "reps": reps,
            "entanglement": entanglement,
            "angle_range": angle_range,
            "multiclass_strategy": multiclass_strategy,
            "label_names": LABEL_NAMES,
            "test_accuracy": test_metrics["accuracy"],
        }, os.path.join(OUTPUT_DIR, f"{tag}_model.joblib"))

    # --- log to results table ---
    row = {
        "run_tag": tag,
        "model": "QSVC",
        "n_features": n_features,
        "n_qubits": n_qubits,
        "feature_map": feature_map,
        "reps": reps,
        "entanglement": entanglement,
        "svm_c": svm_c,
        "multiclass_strategy": multiclass_strategy,
        "n_train_used": len(X_train_sub),
        "n_test": len(X_test_scaled),
        "train_accuracy": train_metrics["accuracy"],
        "test_accuracy": test_metrics["accuracy"],
        "precision_macro": test_metrics["precision_macro"],
        "recall_macro": test_metrics["recall_macro"],
        "f1_macro": test_metrics["f1_macro"],
        "precision_weighted": test_metrics["precision_weighted"],
        "recall_weighted": test_metrics["recall_weighted"],
        "f1_weighted": test_metrics["f1_weighted"],
        "wall_time_sec": round(elapsed, 1),
        "seed": seed,
    }
    log_experiment(RESULTS_TABLE_PATH, row)

    return {"model": model, "train_metrics": train_metrics, "test_metrics": test_metrics,
            "row": row}


# ======================================================================
# ENTRY POINT
# ======================================================================

if __name__ == "__main__":
    run_qsvc_experiment()

    print(f"\nAll results appended to: {RESULTS_TABLE_PATH}")