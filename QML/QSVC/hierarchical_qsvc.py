"""Two-stage quantum classifier: normal vs abnormal, then benign vs malignant.

Uses the same fine-tuned ResNet18 features as nocombat_qsvc.py (no ComBat, so no source
label is needed). The two stages share one set of quantum statevectors -- the 12-dim
angle-encoded features are identical regardless of which stage uses them, so the expensive
quantum simulation runs once, not twice.

Stage 1 (gate):      normal (0)  vs  abnormal (benign or malignant)   -- all 6000 train images
Stage 2 (sub-split):  benign (1)  vs  malignant (2)                    -- abnormal train images only
Final prediction:     normal if stage 1 says normal, else stage 2's benign/malignant call.
"""
import os
import sys
import time
import importlib.util

import numpy as np
from sklearn.decomposition import PCA
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, confusion_matrix,
                              f1_score, precision_recall_fscore_support, recall_score)
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.svm import SVC

THIS_DIR = os.path.dirname(os.path.abspath(__file__))


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(THIS_DIR, filename))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


qsvc = load_module("qsvc_module", "qsvc.py")

CACHE = os.path.join(THIS_DIR, "finetune_outputs", "finetuned_combat_cache.npz")
LABEL_IDS = {"normal": 0, "benign": 1, "malignant": 2}
LABEL_NAMES = {0: "normal", 1: "benign", 2: "malignant"}
SEED = 42

N_QUBITS = 12
FEATURE_MAP = "angle_entangle"
REPS = 2
ENTANGLEMENT = "full"
ANGLE_RANGE = (0.0, np.pi)
SVM_C = 1.0


def main():
    print("Loading fine-tuned features (no ComBat)...")
    c = np.load(CACHE, allow_pickle=True)
    Z_train, Z_test = c["Z_train_raw"], c["Z_test_raw"]
    y_train = np.array([LABEL_IDS[v] for v in c["y_train"]])
    y_test = np.array([LABEL_IDS[v] for v in c["y_test"]])

    # same preprocessing chain as nocombat_qsvc.py / export_qsvc_model.py
    scaler = StandardScaler().fit(Z_train)
    pca = PCA(n_components=N_QUBITS, random_state=SEED).fit(scaler.transform(Z_train))
    mm = MinMaxScaler(feature_range=ANGLE_RANGE)
    X_train = mm.fit_transform(pca.transform(scaler.transform(Z_train)))
    X_test = mm.transform(pca.transform(scaler.transform(Z_test)))

    # one quantum simulation pass for everything: statevectors don't depend on labels
    print(f"Computing statevectors for {len(X_train)} train + {len(X_test)} test images "
          f"({FEATURE_MAP}, {N_QUBITS} qubits, reps={REPS}, {ENTANGLEMENT})...")
    statevector_fn = qsvc.build_statevector_fn(FEATURE_MAP, N_QUBITS, REPS, ENTANGLEMENT)
    t0 = time.time()
    S_train = qsvc.compute_statevectors(X_train, statevector_fn)
    S_test = qsvc.compute_statevectors(X_test, statevector_fn)
    print(f"  done in {time.time() - t0:.0f}s")

    K_train_full = qsvc.fidelity_kernel(S_train, S_train)   # (6000, 6000), reused by both stages
    K_test_full = qsvc.fidelity_kernel(S_test, S_train)      # (3000, 6000)

    # =========================================================
    # STAGE 1: normal vs abnormal
    # =========================================================
    print("\n=== Stage 1: normal vs abnormal ===")
    y1_train = (y_train != 0).astype(int)          # 0 = normal, 1 = abnormal
    y1_test = (y_test != 0).astype(int)

    stage1 = SVC(kernel="precomputed", C=SVM_C, random_state=SEED)
    stage1.fit(K_train_full, y1_train)
    pred1_train = stage1.predict(K_train_full)
    pred1_test = stage1.predict(K_test_full)

    acc1 = accuracy_score(y1_test, pred1_test)
    bal1 = balanced_accuracy_score(y1_test, pred1_test)
    print(f"Stage 1 test accuracy: {acc1:.4f}  balanced accuracy: {bal1:.4f}")
    cm1 = confusion_matrix(y1_test, pred1_test)
    print(f"Stage 1 confusion matrix (rows=true [normal,abnormal], cols=pred):\n{cm1}")
    normal_missed = cm1[0, 1]  # true normal predicted abnormal -- goes to stage 2 by mistake
    abnormal_missed = cm1[1, 0]  # true abnormal predicted normal -- lost before stage 2 sees it
    print(f"  true normal sent to stage 2 by mistake: {normal_missed}/{cm1[0].sum()}")
    print(f"  true abnormal wrongly cleared as normal (unrecoverable): {abnormal_missed}/{cm1[1].sum()}")

    # =========================================================
    # STAGE 2: benign vs malignant, trained on TRUE abnormal training images only
    # =========================================================
    print("\n=== Stage 2: benign vs malignant (trained on true-abnormal images) ===")
    idx_abn_train = np.where(y_train != 0)[0]
    y2_train = (y_train[idx_abn_train] == 2).astype(int)  # 0 = benign, 1 = malignant

    K2_train = K_train_full[np.ix_(idx_abn_train, idx_abn_train)]
    stage2 = SVC(kernel="precomputed", C=SVM_C, random_state=SEED)
    stage2.fit(K2_train, y2_train)

    # evaluate stage 2 in isolation, on TRUE abnormal test images (its own accuracy, no stage-1 error)
    idx_abn_test_true = np.where(y_test != 0)[0]
    y2_test_true = (y_test[idx_abn_test_true] == 2).astype(int)
    K2_test_true = K_test_full[np.ix_(idx_abn_test_true, idx_abn_train)]
    pred2_true = stage2.predict(K2_test_true)
    acc2 = accuracy_score(y2_test_true, pred2_true)
    print(f"Stage 2 test accuracy (given the true abnormal images): {acc2:.4f}")

    # =========================================================
    # END-TO-END PIPELINE: stage 1's own predictions decide who reaches stage 2
    # =========================================================
    print("\n=== End-to-end: stage 1's predictions feed stage 2 ===")
    final_pred = np.zeros_like(y_test)
    routed_to_stage2 = np.where(pred1_test == 1)[0]
    if len(routed_to_stage2) > 0:
        K2_route = K_test_full[np.ix_(routed_to_stage2, idx_abn_train)]
        pred2_route = stage2.predict(K2_route)
        final_pred[routed_to_stage2] = np.where(pred2_route == 1, 2, 1)  # 2=malignant, 1=benign
    # anything stage 1 called normal stays 0 (already initialised)

    acc_final = accuracy_score(y_test, final_pred)
    f1_final = f1_score(y_test, final_pred, average="macro")
    prec, rec, f1c, support = precision_recall_fscore_support(y_test, final_pred, zero_division=0)
    cm_final = confusion_matrix(y_test, final_pred)

    print(f"\nHierarchical pipeline test accuracy: {acc_final:.4f}  macro-F1: {f1_final:.4f}")
    print("Per-class (rows: normal, benign, malignant):")
    for i in range(3):
        print(f"  {LABEL_NAMES[i]:10s} precision={prec[i]:.3f}  recall={rec[i]:.3f}  "
              f"f1={f1c[i]:.3f}  n={support[i]}")
    print(f"Confusion matrix (rows=true, cols=pred, order normal/benign/malignant):\n{cm_final}")
    print(f"\nMalignant called benign: {cm_final[2, 1]}   Malignant called normal: {cm_final[2, 0]}")

    print("\n=== Comparison ===")
    print(f"Single 3-class QSVC (nocombat_qsvc.py):  accuracy 0.6710  malignant recall 0.628")
    print(f"Hierarchical QSVC:                       accuracy {acc_final:.4f}  "
          f"malignant recall {rec[2]:.3f}")
    print(f"Stage 1 alone (normal vs abnormal):      accuracy {acc1:.4f}")
    print(f"Stage 2 alone (given true abnormal):     accuracy {acc2:.4f}")
    print(f"Stage 1 error that stage 2 can never fix: {abnormal_missed} abnormal images "
          f"({100 * abnormal_missed / cm1[1].sum():.1f}% of all abnormal test images)")


if __name__ == "__main__":
    main()
