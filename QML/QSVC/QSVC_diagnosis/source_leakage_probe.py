import os
import sys
import importlib.util
import numpy as np
import pandas as pd
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# =========================================================
# CONFIG
# =========================================================
QSVC_MODULE_PATH = "/Users/jackguo/Documents/GitHub/Q-INTERVAL-Lite/QML/QSVC/qsvc.py"

CSV_PATHS = {
    "baseline (frozen CNN)":
        "/Users/jackguo/Documents/GitHub/Q-INTERVAL-Lite/QML/4pca/qml_cnn_pca4_multiclass_pooled.csv"
}

FEATURE_MAP = "angle"
REPS = 1
ENTANGLEMENT = "linear"
TEST_SIZE = 0.2
RANDOM_SEED = 42

spec = importlib.util.spec_from_file_location("qsvc_module", QSVC_MODULE_PATH)
qsvc_module = importlib.util.module_from_spec(spec)
sys.modules["qsvc_module"] = qsvc_module
spec.loader.exec_module(qsvc_module)


def run_probe(csv_path, tag):
    print(f"\n{'=' * 70}")
    print(f"PROBE: {tag}")
    print(f"{'=' * 70}")

    if not os.path.exists(csv_path):
        print(f"  [skip] file not found: {csv_path}")
        return None

    df = pd.read_csv(csv_path)
    feature_cols = [c for c in df.columns if c.startswith("pc")]
    n_features = len(feature_cols)
    print(f"  Features: {feature_cols} ({n_features} qubits)")

    X = df[feature_cols].values.astype(np.float64)
    src_raw = df["source_dataset"].values

    le = LabelEncoder()
    y_source = le.fit_transform(src_raw)
    n_sources = len(le.classes_)
    chance = 1.0 / n_sources
    print(f"  Sources: {list(le.classes_)} ({n_sources} classes, chance={chance:.3f})")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_source, test_size=TEST_SIZE, stratify=y_source, random_state=RANDOM_SEED
    )

    # Classical probe (Logistic Regression), on the same features
    clf = LogisticRegression(max_iter=2000)
    clf.fit(X_train, y_train)
    classical_acc = accuracy_score(y_test, clf.predict(X_test))
    print(f"\n  Classical (Logistic Regression) probe accuracy: {classical_acc:.4f}")

    # QSVC probe: same quantum kernel machinery, label = source
    statevector_fn = qsvc_module.build_statevector_fn(FEATURE_MAP, n_features, REPS, ENTANGLEMENT)
    print(f"  Computing quantum statevectors for QSVC probe "
          f"({len(X_train)} train + {len(X_test)} test, {2**n_features}-dim)...")
    S_train = qsvc_module.compute_statevectors(X_train, statevector_fn)
    S_test = qsvc_module.compute_statevectors(X_test, statevector_fn)
    K_train = qsvc_module.fidelity_kernel(S_train, S_train)
    K_test = qsvc_module.fidelity_kernel(S_test, S_train)

    qsvc_clf = SVC(kernel="precomputed", C=1.0, random_state=RANDOM_SEED)
    qsvc_clf.fit(K_train, y_train)
    qsvc_acc = accuracy_score(y_test, qsvc_clf.predict(K_test))
    print(f"  QSVC (quantum kernel) probe accuracy:            {qsvc_acc:.4f}")

    gap = qsvc_acc - classical_acc
    print(f"\n  Gap (QSVC - classical): {gap:+.4f}")

    return {"tag": tag, "classical_acc": classical_acc, "qsvc_acc": qsvc_acc,
            "chance": chance, "n_sources": n_sources}


def main():
    results = []
    for tag, path in CSV_PATHS.items():
        r = run_probe(path, tag)
        if r:
            results.append(r)

    print("\n" + "=" * 70)
    print("SUMMARY: classical vs. QSVC source-leakage probe, side by side")
    print("=" * 70)
    print(f"{'Dataset':<40} {'Classical':>10} {'QSVC':>10} {'Chance':>8}")
    for r in results:
        print(f"{r['tag']:<40} {r['classical_acc']:>10.4f} {r['qsvc_acc']:>10.4f} {r['chance']:>8.3f}")


if __name__ == "__main__":
    main()