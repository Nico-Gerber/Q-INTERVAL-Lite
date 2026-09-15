"""
Mammo-Bench Preprocessing / PCA Audit Script

Purpose: isolate whether your 40-50% accuracy ceiling comes from
(1) image resolution, (2) missing standardization, (3) PCA component
count, or (4) something upstream of the quantum models entirely --
using ONLY classical classifiers, which train in seconds and give you
a ground-truth ceiling to compare your quantum results against.

Outputs (all written next to this script):
    audit_results.csv          -- one row per (resolution, k, classifier) combo
    pca_component_images.png   -- top-4 PCA loadings reshaped as images
    pca_scatter.png            -- 2D PCA projection colored by class
    variance_vs_accuracy.png   -- explained variance & accuracy vs k, per resolution
    audit_summary.txt          -- plain-English readout of what the numbers mean
"""

import os
import time
import itertools
import warnings

import numpy as np
import pandas as pd
from PIL import Image

from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import accuracy_score, f1_score, silhouette_score, confusion_matrix

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

warnings.filterwarnings("ignore")

# CONFIG
BASE_DIR = "/Volumes/Jack HD/Mammo_Bench_v2"
CSV_PATH = os.path.join(BASE_DIR, "mammo-bench.csv")
IMAGE_BASE_FOLDER = BASE_DIR

OUTPUT_DIR = "/Users/jackguo/Documents/GitHub/Q-INTERVAL-Lite/QML/QSVC/QSVC_diagnosis/QSVC_diagnosis_output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

IMAGE_COLUMN = "preprocessed_image_path"
LABEL_COLUMN = "classification"

SAMPLES_PER_CLASS = 300
RANDOM_SEED = 42
TEST_SIZE = 0.2

# The three things this script sweeps over
RESOLUTIONS = [(16, 16), (32, 32), (64, 64)]
PCA_COMPONENTS = [2, 4, 8, 16, 32, 64]
CLASSIFIERS = {
    "LogReg": lambda: LogisticRegression(max_iter=2000, random_state=RANDOM_SEED),
    "SVM_RBF": lambda: SVC(kernel="rbf", random_state=RANDOM_SEED),
    "RandomForest": lambda: RandomForestClassifier(n_estimators=300, random_state=RANDOM_SEED),
    "kNN": lambda: KNeighborsClassifier(n_neighbors=7),
}

np.random.seed(RANDOM_SEED)


# STEP 0: Label handling (same normalization logic as your script)
def normalize_label(label_value: str) -> str:
    value = str(label_value).strip().lower()
    if value in {"normal", "no finding", "negative"}:
        return "normal"
    elif value in {"benign", "benign lesion"}:
        return "benign"
    elif value in {"malignant", "cancer", "malignant lesion"}:
        return "malignant"
    return value


def resolve_image_path(image_ref: str, image_base_folder: str) -> str:
    image_ref = str(image_ref).strip().replace("\\", os.sep).replace("/", os.sep)
    if os.path.isabs(image_ref) and os.path.exists(image_ref):
        return image_ref
    return os.path.join(image_base_folder, image_ref)


def load_and_sample():
    df = pd.read_csv(CSV_PATH)
    print("CSV columns:", df.columns.tolist())

    if IMAGE_COLUMN not in df.columns or LABEL_COLUMN not in df.columns:
        raise ValueError("Missing IMAGE_COLUMN or LABEL_COLUMN in CSV")

    raw_counts = df[LABEL_COLUMN].value_counts(dropna=False)
    print("\n[AUDIT] Raw label value_counts BEFORE normalization:")
    print(raw_counts)

    df = df[[IMAGE_COLUMN, LABEL_COLUMN]].copy()
    df = df.dropna(subset=[IMAGE_COLUMN, LABEL_COLUMN]).copy()
    df = df.drop_duplicates(subset=[IMAGE_COLUMN]).reset_index(drop=True)
    df[LABEL_COLUMN] = df[LABEL_COLUMN].apply(normalize_label)

    target_classes = ["normal", "benign", "malignant"]
    mapped = df[df[LABEL_COLUMN].isin(target_classes)].copy()
    dropped = df[~df[LABEL_COLUMN].isin(target_classes)]
    if len(dropped) > 0:
        print(f"\n[AUDIT] {len(dropped)} rows dropped as unmapped labels. "
              f"Unique unmapped values: {dropped[LABEL_COLUMN].unique()[:20]}")

    valid_rows = []
    for _, row in mapped.iterrows():
        img_path = resolve_image_path(row[IMAGE_COLUMN], IMAGE_BASE_FOLDER)
        if os.path.exists(img_path):
            valid_rows.append({"image_ref": row[IMAGE_COLUMN],
                                "label_name": row[LABEL_COLUMN],
                                "img_path": img_path})
    valid_df = pd.DataFrame(valid_rows)
    if valid_df.empty:
        raise ValueError("No valid image files found. Check paths.")

    sampled_parts = []
    for cls in target_classes:
        class_df = valid_df[valid_df["label_name"] == cls]
        if len(class_df) < SAMPLES_PER_CLASS:
            raise ValueError(f"Not enough images for class '{cls}': {len(class_df)} < {SAMPLES_PER_CLASS}")
        sampled_parts.append(class_df.sample(n=SAMPLES_PER_CLASS, random_state=RANDOM_SEED))

    sampled_df = pd.concat(sampled_parts).sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)
    print("\n[AUDIT] Balanced sample distribution:")
    print(sampled_df["label_name"].value_counts())
    return sampled_df


# =========================================================
# STEP 1: Load images at a given resolution
# =========================================================
def load_images_at_resolution(sampled_df, resize_to):
    label_map = {"normal": 0, "benign": 1, "malignant": 2}
    X, y = [], []
    for _, row in sampled_df.iterrows():
        try:
            img = Image.open(row["img_path"]).convert("L")
            img = img.resize(resize_to)
            arr = np.array(img, dtype=np.float32) / 255.0
            X.append(arr.flatten())
            y.append(label_map[row["label_name"]])
        except Exception as e:
            print(f"  [skip] {row['img_path']}: {e}")
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64)


# =========================================================
# STEP 2: For one resolution -- split, standardize, sweep PCA dims, sweep classifiers
# =========================================================
def run_resolution_experiment(X, y, resize_to, results, pca_components_cache):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_SEED
    )

    # Baseline A: raw pixels, no scaling, no PCA
    for clf_name, clf_fn in CLASSIFIERS.items():
        clf = clf_fn()
        clf.fit(X_train, y_train)
        acc = accuracy_score(y_test, clf.predict(X_test))
        f1 = f1_score(y_test, clf.predict(X_test), average="macro")
        results.append({
            "resolution": f"{resize_to[0]}x{resize_to[1]}", "stage": "raw_pixels_no_pca",
            "n_components": X.shape[1], "classifier": clf_name,
            "test_accuracy": acc, "macro_f1": f1, "cum_explained_var": 1.0,
        })

    # Baseline B: StandardScaler only, no PCA
    scaler_only = StandardScaler().fit(X_train)
    Xtr_s, Xte_s = scaler_only.transform(X_train), scaler_only.transform(X_test)
    for clf_name, clf_fn in CLASSIFIERS.items():
        clf = clf_fn()
        clf.fit(Xtr_s, y_train)
        acc = accuracy_score(y_test, clf.predict(Xte_s))
        f1 = f1_score(y_test, clf.predict(Xte_s), average="macro")
        results.append({
            "resolution": f"{resize_to[0]}x{resize_to[1]}", "stage": "standardized_no_pca",
            "n_components": X.shape[1], "classifier": clf_name,
            "test_accuracy": acc, "macro_f1": f1, "cum_explained_var": 1.0,
        })

    # Main sweep: StandardScaler -> PCA(k) -> MinMax -> classifier
    scaler = StandardScaler().fit(X_train)
    X_train_std = scaler.transform(X_train)
    X_test_std = scaler.transform(X_test)

    max_k = min(X_train_std.shape[0], X_train_std.shape[1])
    valid_ks = [k for k in PCA_COMPONENTS if k < max_k]

    for k in valid_ks:
        pca = PCA(n_components=k, random_state=RANDOM_SEED)
        X_train_pca = pca.fit_transform(X_train_std)
        X_test_pca = pca.transform(X_test_std)
        cum_var = float(np.sum(pca.explained_variance_ratio_))

        mm = MinMaxScaler(feature_range=(0, np.pi))
        X_train_qml = mm.fit_transform(X_train_pca)
        X_test_qml = mm.transform(X_test_pca)

        # cache k=4 (or closest) at native resolution for scatter/component plots later
        if resize_to == RESOLUTIONS[0] and k == 4:
            pca_components_cache["pca_obj"] = pca
            pca_components_cache["resize_to"] = resize_to
            pca_components_cache["X_train_pca"] = X_train_pca
            pca_components_cache["y_train"] = y_train

        # Silhouette score on the PCA representation (train split, true labels as "clusters")
        try:
            sil = silhouette_score(X_train_pca, y_train)
        except Exception:
            sil = np.nan

        for clf_name, clf_fn in CLASSIFIERS.items():
            clf = clf_fn()
            clf.fit(X_train_qml, y_train)
            train_acc = accuracy_score(y_train, clf.predict(X_train_qml))
            test_acc = accuracy_score(y_test, clf.predict(X_test_qml))
            f1 = f1_score(y_test, clf.predict(X_test_qml), average="macro")
            cm = confusion_matrix(y_test, clf.predict(X_test_qml))

            results.append({
                "resolution": f"{resize_to[0]}x{resize_to[1]}", "stage": "standardized_pca",
                "n_components": k, "classifier": clf_name,
                "train_accuracy": train_acc, "test_accuracy": test_acc,
                "macro_f1": f1, "cum_explained_var": cum_var, "silhouette": sil,
                "confusion_matrix": cm.tolist(),
            })

        print(f"  [{resize_to}] k={k:>3}  cum_var={cum_var:.3f}  silhouette={sil:.3f}  "
              f"best_acc={max(r['test_accuracy'] for r in results if r.get('n_components')==k and r['resolution']==f'{resize_to[0]}x{resize_to[1]}'):.3f}")


# =========================================================
# STEP 3: Diagnostic plots
# =========================================================
def make_component_image_plot(pca_components_cache):
    if "pca_obj" not in pca_components_cache:
        return
    pca = pca_components_cache["pca_obj"]
    h, w = pca_components_cache["resize_to"]
    n_show = min(4, pca.components_.shape[0])

    fig, axes = plt.subplots(1, n_show, figsize=(3 * n_show, 3))
    if n_show == 1:
        axes = [axes]
    for i in range(n_show):
        comp = pca.components_[i].reshape(h, w)
        axes[i].imshow(comp, cmap="coolwarm")
        axes[i].set_title(f"PC{i+1}")
        axes[i].axis("off")
    fig.suptitle("PCA loading vectors reshaped as images")
    fig.tight_layout()
    fig.savefig(os.path.join(OUTPUT_DIR, "pca_component_images.png"), dpi=150)   
    plt.close(fig)
    print("\nSaved pca_component_images.png")


def make_scatter_plot(pca_components_cache):
    if "X_train_pca" not in pca_components_cache:
        return
    X = pca_components_cache["X_train_pca"]
    y = pca_components_cache["y_train"]
    label_names = {0: "normal", 1: "benign", 2: "malignant"}
    colors = {0: "tab:green", 1: "tab:orange", 2: "tab:red"}

    fig, ax = plt.subplots(figsize=(6, 6))
    for cls in [0, 1, 2]:
        mask = y == cls
        ax.scatter(X[mask, 0], X[mask, 1], label=label_names[cls],
                   color=colors[cls], alpha=0.5, s=15)
    ax.set_xlabel("PC1")
    ax.set_ylabel("PC2")
    ax.set_title("PCA(k=4) projection, first 2 components, colored by class")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(OUTPUT_DIR, "pca_scatter.png"), dpi=150)
    plt.close(fig)
    print("Saved pca_scatter.png")


def make_variance_vs_accuracy_plot(results_df):
    fig, axes = plt.subplots(1, len(RESOLUTIONS), figsize=(6 * len(RESOLUTIONS), 5), sharey=False)
    if len(RESOLUTIONS) == 1:
        axes = [axes]

    for ax, res in zip(axes, RESOLUTIONS):
        res_str = f"{res[0]}x{res[1]}"
        sub = results_df[(results_df["resolution"] == res_str) & (results_df["stage"] == "standardized_pca")]
        if sub.empty:
            continue
        agg = sub.groupby("n_components").agg(
            cum_var=("cum_explained_var", "mean"),
            best_acc=("test_accuracy", "max"),
        ).reset_index().sort_values("n_components")

        ax2 = ax.twinx()
        ax.plot(agg["n_components"], agg["cum_var"], "o-", color="tab:blue", label="Cumulative explained variance")
        ax2.plot(agg["n_components"], agg["best_acc"], "s-", color="tab:red", label="Best classifier test accuracy")
        ax.set_xlabel("Number of PCA components")
        ax.set_ylabel("Cumulative explained variance", color="tab:blue")
        ax2.set_ylabel("Best test accuracy", color="tab:red")
        ax.set_title(f"Resolution {res_str}")
        ax.set_ylim(0, 1.05)
        ax2.set_ylim(0, 1.05)

    fig.suptitle("Explained variance vs. classification accuracy, per resolution")
    fig.tight_layout()
    fig.savefig(os.path.join(OUTPUT_DIR, "variance_vs_accuracy.png"), dpi=150)
    plt.close(fig)
    print("Saved variance_vs_accuracy.png")


# =========================================================
# STEP 4: Plain-English summary
# =========================================================
def write_summary(results_df):
    lines = []
    lines.append("AUDIT SUMMARY")
    lines.append("=" * 60)

    # Compare raw-pixel baseline vs PCA baseline at native (smallest) resolution
    native_res = f"{RESOLUTIONS[0][0]}x{RESOLUTIONS[0][1]}"
    raw = results_df[(results_df["resolution"] == native_res) & (results_df["stage"] == "raw_pixels_no_pca")]
    std_only = results_df[(results_df["resolution"] == native_res) & (results_df["stage"] == "standardized_no_pca")]
    pca4 = results_df[(results_df["resolution"] == native_res) &
                       (results_df["stage"] == "standardized_pca") &
                       (results_df["n_components"] == 4)]

    if not raw.empty:
        lines.append(f"\n[{native_res}] Raw pixels, no scaling, no PCA -- best test acc: "
                      f"{raw['test_accuracy'].max():.3f}")
    if not std_only.empty:
        lines.append(f"[{native_res}] StandardScaler only, no PCA -- best test acc: "
                      f"{std_only['test_accuracy'].max():.3f}")
    if not pca4.empty:
        lines.append(f"[{native_res}] StandardScaler -> PCA(4) -> MinMax -- best test acc: "
                      f"{pca4['test_accuracy'].max():.3f}  "
                      f"(cum. explained var: {pca4['cum_explained_var'].iloc[0]:.3f})")

    lines.append("\nAccuracy by resolution (best classifier, PCA path only):")
    for res in RESOLUTIONS:
        res_str = f"{res[0]}x{res[1]}"
        sub = results_df[(results_df["resolution"] == res_str) & (results_df["stage"] == "standardized_pca")]
        if sub.empty:
            continue
        best_row = sub.loc[sub["test_accuracy"].idxmax()]
        lines.append(f"  {res_str}: best acc {best_row['test_accuracy']:.3f} "
                      f"at k={int(best_row['n_components'])} using {best_row['classifier']}")

    summary_path = os.path.join(BASE_DIR, "audit_summary.txt")
    with open(summary_path, "w") as f:
        f.write("\n".join(lines))
    print(f"\nSaved audit_summary.txt")
    print("\n".join(lines))


# =========================================================
# MAIN
# =========================================================
def main():
    t0 = time.time()
    sampled_df = load_and_sample()

    all_results = []
    pca_cache = {}

    for resize_to in RESOLUTIONS:
        print(f"\n=== Resolution {resize_to} ===")
        X, y = load_images_at_resolution(sampled_df, resize_to)
        print(f"Loaded {len(X)} images, feature dim {X.shape[1]}")
        run_resolution_experiment(X, y, resize_to, all_results, pca_cache)

    results_df = pd.DataFrame(all_results)
    results_df.to_csv(os.path.join(BASE_DIR, "audit_results.csv"), index=False)
    print(f"\nSaved audit_results.csv ({len(results_df)} rows)")

    make_component_image_plot(pca_cache)
    make_scatter_plot(pca_cache)
    make_variance_vs_accuracy_plot(results_df)
    write_summary(results_df)

    print(f"\nDone in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()