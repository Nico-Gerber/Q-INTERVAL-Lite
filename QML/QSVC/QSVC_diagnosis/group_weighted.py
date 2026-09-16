import sys
import importlib.util
import numpy as np
import pandas as pd
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split

# =========================================================
# CONFIG
# =========================================================
QSVC_MODULE_PATH = "/Users/jackguo/Documents/GitHub/Q-INTERVAL-Lite/QML/QSVC/qsvc.py"
CSV_PATH_OVERRIDE = "/Users/jackguo/Documents/GitHub/Q-INTERVAL-Lite/QML/4pca/qml_cnn_pca4_multiclass_pooled.csv"

N_FEATURES = 4
FEATURE_MAP = "angle"
REPS = 1
ENTANGLEMENT = "linear"
WINNING_C = 2.0
TEST_SIZE = 0.2
MIN_GROUP_SIZE = 15
RANDOM_SEED_FOR_KERNEL = 42

SEEDS_TO_TEST = [0, 1, 42, 101, 202, 303, 404]

# =========================================================
spec = importlib.util.spec_from_file_location("qsvc_module", QSVC_MODULE_PATH)
qsvc_module = importlib.util.module_from_spec(spec)
sys.modules["qsvc_module"] = qsvc_module
spec.loader.exec_module(qsvc_module)


def group_ids(y, src):
    return np.array([f"{s}__{cls}" for s, cls in zip(src, y)])


def static_group_balanced_weights(y, src):
    groups = group_ids(y, src)
    counts = pd.Series(groups).value_counts()
    raw_weights = np.array([1.0 / counts[g] for g in groups])
    return raw_weights / raw_weights.mean()


def worst_group_recall(y_true, y_pred, src, min_group_size=MIN_GROUP_SIZE):
    groups = group_ids(y_true, src)
    stats = {}
    for g in sorted(set(groups)):
        mask = groups == g
        n = int(mask.sum())
        recall = accuracy_score(y_true[mask], y_pred[mask]) if n > 0 else float("nan")
        stats[g] = {"recall": recall, "n": n}
    eligible = {g: s for g, s in stats.items() if s["n"] >= min_group_size}
    if not eligible:
        eligible = stats
    worst_group = min(eligible, key=lambda g: eligible[g]["recall"])
    return worst_group, eligible[worst_group]["recall"], eligible[worst_group]["n"]


def load_full_pool_and_kernel():
    df = pd.read_csv(CSV_PATH_OVERRIDE)
    feature_cols = [f"pc{i}" for i in range(1, N_FEATURES + 1)]
    X = df[feature_cols].values.astype(np.float64)
    y = df[qsvc_module.LABEL_COLUMN].values.astype(np.int64)
    src = df["source_dataset"].values

    statevector_fn = qsvc_module.build_statevector_fn(FEATURE_MAP, N_FEATURES, REPS, ENTANGLEMENT)
    print(f"Computing quantum statevectors ONCE for all {len(X)} pooled samples "
          f"(reused across every seed's split below)...")
    S_all = qsvc_module.compute_statevectors(X, statevector_fn)
    K_all = qsvc_module.fidelity_kernel(S_all, S_all)  # full N x N kernel matrix

    return K_all, y, src


def run_split(K_all, y, src, train_idx, test_idx, use_group_weights, svm_c):
    K_train = K_all[np.ix_(train_idx, train_idx)]
    K_test = K_all[np.ix_(test_idx, train_idx)]
    y_train, y_test = y[train_idx], y[test_idx]
    src_train, src_test = src[train_idx], src[test_idx]

    sample_weight = static_group_balanced_weights(y_train, src_train) if use_group_weights else None

    model = SVC(kernel="precomputed", C=svm_c, random_state=RANDOM_SEED_FOR_KERNEL)
    model.fit(K_train, y_train, sample_weight=sample_weight)
    preds = model.predict(K_test)

    acc = accuracy_score(y_test, preds)
    f1 = f1_score(y_test, preds, average="macro")
    worst_group, worst_recall, worst_n = worst_group_recall(y_test, preds, src_test)

    return {"test_acc": acc, "test_f1": f1, "worst_group": worst_group,
            "worst_group_recall": worst_recall, "worst_group_n": worst_n}


def main():
    K_all, y, src = load_full_pool_and_kernel()
    n = len(y)

    unweighted_results, weighted_results = [], []

    for seed in SEEDS_TO_TEST:
        idx = np.arange(n)
        train_idx, test_idx = train_test_split(
            idx, test_size=TEST_SIZE, stratify=y, random_state=seed
        )

        r_unweighted = run_split(K_all, y, src, train_idx, test_idx,
                                  use_group_weights=False, svm_c=WINNING_C)
        r_weighted = run_split(K_all, y, src, train_idx, test_idx,
                                use_group_weights=True, svm_c=WINNING_C)

        r_unweighted["seed"] = seed
        r_weighted["seed"] = seed
        unweighted_results.append(r_unweighted)
        weighted_results.append(r_weighted)

        print(f"\nseed={seed}")
        print(f"  Unweighted: acc={r_unweighted['test_acc']:.4f}  "
              f"worst_group='{r_unweighted['worst_group']}' (n={r_unweighted['worst_group_n']})  "
              f"worst_recall={r_unweighted['worst_group_recall']:.4f}")
        print(f"  Weighted:   acc={r_weighted['test_acc']:.4f}  "
              f"worst_group='{r_weighted['worst_group']}' (n={r_weighted['worst_group_n']})  "
              f"worst_recall={r_weighted['worst_group_recall']:.4f}")

    df_u = pd.DataFrame(unweighted_results)
    df_w = pd.DataFrame(weighted_results)

    print("\n" + "=" * 70)
    print("SUMMARY ACROSS SEEDS (genuinely different train/test splits each time)")
    print("=" * 70)
    print(f"\nUNWEIGHTED (C={WINNING_C}):")
    print(f"  test accuracy:       mean={df_u['test_acc'].mean():.4f}  std={df_u['test_acc'].std():.4f}")
    print(f"  worst-group recall:  mean={df_u['worst_group_recall'].mean():.4f}  "
          f"std={df_u['worst_group_recall'].std():.4f}  "
          f"range=[{df_u['worst_group_recall'].min():.4f}, {df_u['worst_group_recall'].max():.4f}]")

    print(f"\nSTATIC GROUP-BALANCED WEIGHTS (C={WINNING_C}):")
    print(f"  test accuracy:       mean={df_w['test_acc'].mean():.4f}  std={df_w['test_acc'].std():.4f}")
    print(f"  worst-group recall:  mean={df_w['worst_group_recall'].mean():.4f}  "
          f"std={df_w['worst_group_recall'].std():.4f}  "
          f"range=[{df_w['worst_group_recall'].min():.4f}, {df_w['worst_group_recall'].max():.4f}]")

    acc_delta = df_w['test_acc'].mean() - df_u['test_acc'].mean()
    recall_delta = df_w['worst_group_recall'].mean() - df_u['worst_group_recall'].mean()

    print("\n" + "=" * 70)
    print("VERDICT")
    print("=" * 70)
    print(f"  Mean overall accuracy change:      {acc_delta:+.4f}")
    print(f"  Mean worst-group recall change:    {recall_delta:+.4f}")


if __name__ == "__main__":
    main()