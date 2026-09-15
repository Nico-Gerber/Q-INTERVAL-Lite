"""
Follow up to source_skewness_check.py. That check found source_dataset
is strongly statistically dependent on classification label, with two
sources (cmmd, kau-bcmd) each nearly single-class. This script:

STEP 1: Directly confirms whether PCA(4) whole image space is
    organized primarily by source_dataset rather than by pathology.
    Trains a classifier to predict source_dataset (not classification)
    from the exact same PCA(4) features, and computes silhouette score
    using source_dataset as the grouping. If source_dataset is highly
    predictable / has strongly positive silhouette in the same space
    where classification had negative silhouette, that confirms the
    PCA space encodes scanner signature, not pathology.

STEP 2: Reruns the 3-class classification experiment restricted to
    ONLY the two well-balanced sources (ddsm, cdd-cesm), removing
    the trivial source-based shortcut by construction. Compares
    accuracy and silhouette to the full pooled-source result. This
    tells you whether there is any genuine class signal left once the
    confound is removed, even if the resulting accuracy is lower.

STEP 3 (diagnostic, not a recommended final method): trains on
    ddsm+cdd-cesm and tests on kau-bcmd, to illustrate how badly a
    pooled model would fail to generalize across scanners if it were
    relying on the source-dataset shortcut.
"""

import os
import numpy as np
import pandas as pd
from PIL import Image

from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, silhouette_score, f1_score

# CONFIG
BASE_DIR = "/Volumes/Jack HD/Mammo_Bench_v2"
CSV_PATH = os.path.join(BASE_DIR, "mammo-bench.csv")
IMAGE_BASE_FOLDER = BASE_DIR

IMAGE_COLUMN = "preprocessed_image_path"
LABEL_COLUMN = "classification"
SOURCE_COLUMN = "source_dataset"

RESIZE_TO = (64, 64)
SAMPLES_PER_CLASS = 300
N_COMPONENTS = 4
RANDOM_SEED = 42
TEST_SIZE = 0.2

BALANCED_SOURCES = ["ddsm", "cdd-cesm"]
HOLDOUT_SOURCE = "kau-bcmd"

np.random.seed(RANDOM_SEED)


def normalize_label(v):
    v = str(v).strip().lower()
    if v in {"normal", "no finding", "negative"}:
        return "normal"
    elif v in {"benign", "benign lesion"}:
        return "benign"
    elif v in {"malignant", "cancer", "malignant lesion"}:
        return "malignant"
    return v


def resolve_image_path(ref, base_folder):
    ref = str(ref).strip().replace("\\", os.sep).replace("/", os.sep)
    if os.path.isabs(ref) and os.path.exists(ref):
        return ref
    return os.path.join(base_folder, ref)


def load_images(rows_df, resize_to):
    X, y_label, y_source = [], [], []
    for _, row in rows_df.iterrows():
        img_path = resolve_image_path(row[IMAGE_COLUMN], IMAGE_BASE_FOLDER)
        if not os.path.exists(img_path):
            continue
        try:
            img = Image.open(img_path).convert("L").resize(resize_to)
            X.append(np.array(img, dtype=np.float32).flatten() / 255.0)
            y_label.append(row[LABEL_COLUMN])
            y_source.append(row[SOURCE_COLUMN])
        except Exception:
            continue
    return np.array(X, dtype=np.float32), np.array(y_label), np.array(y_source)


def sample_balanced(df, classes, n_per_class, seed, sources=None):
    pool = df.copy()
    if sources is not None:
        pool = pool[pool[SOURCE_COLUMN].isin(sources)]
    parts = []
    for cls in classes:
        cls_df = pool[pool[LABEL_COLUMN] == cls]
        n = min(len(cls_df), n_per_class)
        if n < n_per_class:
            print(f"  [warning] only {n} available for class '{cls}'"
                  + (f" within sources {sources}" if sources else ""))
        parts.append(cls_df.sample(n=n, random_state=seed))
    return pd.concat(parts).sample(frac=1, random_state=seed).reset_index(drop=True)


def pca_pipeline(X_train, X_test):
    scaler = StandardScaler().fit(X_train)
    X_train_s, X_test_s = scaler.transform(X_train), scaler.transform(X_test)
    pca = PCA(n_components=N_COMPONENTS, random_state=RANDOM_SEED)
    X_train_p = pca.fit_transform(X_train_s)
    X_test_p = pca.transform(X_test_s)
    return X_train_p, X_test_p, pca


def evaluate_classifiers(X_train, y_train, X_test, y_test):
    results = {}
    for name, clf in [("LogReg", LogisticRegression(max_iter=2000)),
                       ("SVM_RBF", SVC(kernel="rbf"))]:
        clf.fit(X_train, y_train)
        preds = clf.predict(X_test)
        results[name] = {
            "test_acc": accuracy_score(y_test, preds),
            "macro_f1": f1_score(y_test, preds, average="macro"),
        }
    return results


def step1_source_signature_check(df):
    print("\n" + "=" * 60)
    print("STEP 1: Is PCA(4) space organized by source_dataset?")
    print("=" * 60)

    df_norm = df.copy()
    df_norm[LABEL_COLUMN] = df_norm[LABEL_COLUMN].apply(normalize_label)
    df_norm = df_norm[df_norm[LABEL_COLUMN].isin(["normal", "benign", "malignant"])]
    df_norm = df_norm.dropna(subset=[IMAGE_COLUMN]).drop_duplicates(subset=[IMAGE_COLUMN])

    sample_df = sample_balanced(df_norm, ["normal", "benign", "malignant"],
                                 SAMPLES_PER_CLASS, RANDOM_SEED)
    X, y_label, y_source = load_images(sample_df, RESIZE_TO)
    print(f"Loaded {len(X)} images")
    print(f"Source distribution in this sample: {pd.Series(y_source).value_counts().to_dict()}")

    source_ids = {s: i for i, s in enumerate(sorted(set(y_source)))}
    y_source_num = np.array([source_ids[s] for s in y_source])
    label_ids = {"normal": 0, "benign": 1, "malignant": 2}
    y_label_num = np.array([label_ids[l] for l in y_label])

    X_train, X_test, ysrc_train, ysrc_test, ylab_train, ylab_test = train_test_split(
        X, y_source_num, y_label_num, test_size=TEST_SIZE,
        stratify=y_label_num, random_state=RANDOM_SEED
    )
    X_train_p, X_test_p, _ = pca_pipeline(X_train, X_test)

    # Predict source_dataset from PCA(4) features
    clf = LogisticRegression(max_iter=2000)
    clf.fit(X_train_p, ysrc_train)
    src_acc = accuracy_score(ysrc_test, clf.predict(X_test_p))
    n_sources = len(source_ids)
    chance = 1.0 / n_sources

    sil_by_source = silhouette_score(X_train_p, ysrc_train)
    sil_by_label = silhouette_score(X_train_p, ylab_train)

    print(f"\nPredicting source_dataset from PCA(4) features:")
    print(f"  accuracy = {src_acc:.3f}  (chance level with {n_sources} sources = {chance:.3f})")
    print(f"\nSilhouette score in the SAME PCA(4) space:")
    print(f"  grouped by source_dataset:   {sil_by_source:.4f}")
    print(f"  grouped by classification:   {sil_by_label:.4f}")

def step2_balanced_source_experiment(df):
    print("\n" + "=" * 60)
    print(f"STEP 2: 3-class classification restricted to balanced sources {BALANCED_SOURCES}")
    print("=" * 60)

    df_norm = df.copy()
    df_norm[LABEL_COLUMN] = df_norm[LABEL_COLUMN].apply(normalize_label)
    df_norm = df_norm[df_norm[LABEL_COLUMN].isin(["normal", "benign", "malignant"])]
    df_norm = df_norm.dropna(subset=[IMAGE_COLUMN]).drop_duplicates(subset=[IMAGE_COLUMN])

    sample_df = sample_balanced(df_norm, ["normal", "benign", "malignant"],
                                 SAMPLES_PER_CLASS, RANDOM_SEED, sources=BALANCED_SOURCES)
    X, y_label, y_source = load_images(sample_df, RESIZE_TO)
    print(f"Loaded {len(X)} images, all from {set(y_source)}")

    label_ids = {"normal": 0, "benign": 1, "malignant": 2}
    y = np.array([label_ids[l] for l in y_label])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_SEED
    )
    X_train_p, X_test_p, _ = pca_pipeline(X_train, X_test)

    sil = silhouette_score(X_train_p, y_train)
    results = evaluate_classifiers(X_train_p, y_train, X_test_p, y_test)

    print(f"\nSilhouette (grouped by true class, confound-controlled): {sil:.4f}")
    for name, r in results.items():
        print(f"  {name}: test_acc={r['test_acc']:.3f}  macro_f1={r['macro_f1']:.3f}")



def step3_cross_source_generalization(df):
    print("\n" + "=" * 60)
    print(f"STEP 3 (diagnostic): train on {BALANCED_SOURCES}, test on {HOLDOUT_SOURCE}")
    print("=" * 60)

    df_norm = df.copy()
    df_norm[LABEL_COLUMN] = df_norm[LABEL_COLUMN].apply(normalize_label)
    df_norm = df_norm[df_norm[LABEL_COLUMN].isin(["normal", "benign", "malignant"])]
    df_norm = df_norm.dropna(subset=[IMAGE_COLUMN]).drop_duplicates(subset=[IMAGE_COLUMN])

    label_ids = {"normal": 0, "benign": 1, "malignant": 2}

    train_pool = df_norm[df_norm[SOURCE_COLUMN].isin(BALANCED_SOURCES)]
    test_pool = df_norm[df_norm[SOURCE_COLUMN] == HOLDOUT_SOURCE]

    train_df = sample_balanced(train_pool, ["normal", "benign", "malignant"],
                                SAMPLES_PER_CLASS, RANDOM_SEED)

    test_parts = []
    for cls in ["normal", "benign", "malignant"]:
        cls_df = test_pool[test_pool[LABEL_COLUMN] == cls]
        n = min(len(cls_df), 100)
        if n == 0:
            print(f"  [note] holdout source has ZERO '{cls}' examples -- cannot evaluate this class")
            continue
        test_parts.append(cls_df.sample(n=n, random_state=RANDOM_SEED))
    if not test_parts:
        print("  [STOP] holdout source has no usable rows for any class.")
        return
    test_df = pd.concat(test_parts)

    X_train, y_train_label, _ = load_images(train_df, RESIZE_TO)
    X_test, y_test_label, _ = load_images(test_df, RESIZE_TO)

    y_train = np.array([label_ids[l] for l in y_train_label])
    y_test = np.array([label_ids[l] for l in y_test_label])

    print(f"Train: {len(X_train)} images from {BALANCED_SOURCES}")
    print(f"Test:  {len(X_test)} images from {HOLDOUT_SOURCE} "
          f"(class counts: {pd.Series(y_test_label).value_counts().to_dict()})")

    scaler = StandardScaler().fit(X_train)
    X_train_s, X_test_s = scaler.transform(X_train), scaler.transform(X_test)
    pca = PCA(n_components=N_COMPONENTS, random_state=RANDOM_SEED).fit(X_train_s)
    X_train_p, X_test_p = pca.transform(X_train_s), pca.transform(X_test_s)

    clf = LogisticRegression(max_iter=2000)
    clf.fit(X_train_p, y_train)
    preds = clf.predict(X_test_p)
    acc = accuracy_score(y_test, preds)
    f1 = f1_score(y_test, preds, average="macro")

    print(f"\nCross-source test accuracy: {acc:.3f}  macro_f1: {f1:.3f}")



def main():
    df = pd.read_csv(CSV_PATH)
    step1_source_signature_check(df)
    step2_balanced_source_experiment(df)
    step3_cross_source_generalization(df)


if __name__ == "__main__":
    main()