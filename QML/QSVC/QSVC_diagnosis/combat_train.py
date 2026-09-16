import os
import sys
import importlib.util
import numpy as np
import pandas as pd

import torch
import torch.nn as nn
from torchvision import models, transforms

from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

from neuroCombat import neuroCombat


def apply_combat_from_training(dat, batch, estimates):
    batch = np.array(batch, dtype="str")
    new_levels = np.unique(batch)
    old_levels = np.array(estimates["batches"], dtype="str")
    missing_levels = np.setdiff1d(new_levels, old_levels)
    if missing_levels.shape[0] != 0:
        raise ValueError(f"The batches {missing_levels} are not part of the training dataset")

    wh = [int(np.where(old_levels == x)[0][0]) for x in batch]

    var_pooled = estimates["var.pooled"]
    stand_mean = estimates["stand.mean"][:, 0]
    mod_mean = estimates["mod.mean"]
    gamma_star = estimates["gamma.star"]
    delta_star = estimates["delta.star"]
    n_array = dat.shape[1]
    stand_mean = stand_mean + mod_mean.mean(axis=1)
    stand_mean = np.transpose([stand_mean] * n_array)

    bayesdata = np.subtract(dat, stand_mean) / np.sqrt(var_pooled)
    gamma = np.transpose(gamma_star[wh, :])
    delta = np.transpose(delta_star[wh, :])
    bayesdata = np.subtract(bayesdata, gamma) / np.sqrt(delta)
    bayesdata = bayesdata * np.sqrt(var_pooled) + stand_mean
    return bayesdata

# reuse the exact sampling / image-loading helpers already validated in dann_train.py
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("dann_train_module", os.path.join(THIS_DIR, "dann_train.py"))
dann_module = importlib.util.module_from_spec(spec)
sys.modules["dann_train_module"] = dann_module
spec.loader.exec_module(dann_module)

# =========================================================
# CONFIG 
# =========================================================
SAMPLES_PER_CLASS = 1500   
N_COMPONENTS = 12  
TEST_SIZE = 0.2
RANDOM_SEED = 42
ANGLE_RANGE = (0.0, np.pi)
MIN_BATCH_SIZE_WARNING = 30

REPO_ROOT = os.path.dirname(THIS_DIR)
OUTPUT_DIR = os.path.join(REPO_ROOT, "4pca")
POOLED_OUTPUT_CSV = os.path.join(OUTPUT_DIR, f"qml_combat_pca{N_COMPONENTS}_multiclass_pooled.csv")
BASELINE_POOLED_CSV = os.path.join(OUTPUT_DIR, "qml_cnn_pca4_multiclass_pooled.csv")
QSVC_MODULE_PATH = os.path.join(os.path.dirname(THIS_DIR), "qsvc.py")

HARMONIZED_CACHE = os.path.join(OUTPUT_DIR, f"combat_harmonized_cache_{SAMPLES_PER_CLASS}pc.npz")

os.makedirs(OUTPUT_DIR, exist_ok=True)
np.random.seed(RANDOM_SEED)
torch.manual_seed(RANDOM_SEED)


# =========================================================
# FROZEN CNN FEATURE EXTRACTION (raw 512-dim)
# =========================================================

def build_frozen_extractor(device):
    model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
    model.fc = nn.Identity()
    model.eval()
    for p in model.parameters():
        p.requires_grad = False
    return model.to(device)


@torch.no_grad()
def extract_raw_embeddings(model, X, device, batch_size=64):
    model.eval()
    out = []
    for start in range(0, len(X), batch_size):
        xb = X[start:start + batch_size].to(device)
        out.append(model(xb).cpu().numpy())
    return np.concatenate(out, axis=0).astype(np.float64)


# =========================================================
# COMBAT HARMONIZATION
# =========================================================

def check_batch_sizes(sources, label_names, tag):
    print(f"\n[{tag}] Per-hospital sample counts (batches ComBat will estimate a correction for):")
    counts = pd.Series(sources).value_counts()
    for src, n in counts.items():
        marker = "  <-- below usual ComBat stability guidance (~30)" if n < MIN_BATCH_SIZE_WARNING else ""
        print(f"    {src:>12}: {n:>4}{marker}")
    print(f"\n[{tag}] Per-hospital x diagnosis breakdown (ComBat's covariate design matrix):")
    ct = pd.crosstab(sources, label_names)
    print(ct.to_string())
    small_cells = (ct.values > 0) & (ct.values < 5)
    if small_cells.any():
        print(f"[{tag}] [caveat] some (hospital, diagnosis) cells have <5 samples -- ComBat's "
              "covariate effect for those is estimated mostly from OTHER hospitals' data for that "
              "class, which is expected (that's how it borrows strength), but worth knowing.")


def run_combat(train_feats, train_sources, train_labels, test_feats, test_sources):
    """Fit ComBat on TRAIN only"""
    train_covars = pd.DataFrame({"source_dataset": train_sources, "label_name": train_labels})

    print("\nFitting ComBat on TRAIN data only (batch=source_dataset, protected covariate=diagnosis)...")
    combat_fit = neuroCombat(
        dat=train_feats.T,
        covars=train_covars,
        batch_col="source_dataset",
        categorical_cols=["label_name"],
    )
    train_harmonized = combat_fit["data"].T
    estimates = combat_fit["estimates"]

    print("Applying fitted ComBat estimates to TEST data (out-of-sample, no label leakage)...")
    test_harmonized_T = apply_combat_from_training(
        dat=test_feats.T,
        batch=np.asarray(test_sources),
        estimates=estimates,
    )
    test_harmonized = test_harmonized_T.T

    return train_harmonized, test_harmonized


# =========================================================
# CSV WRITER (StandardScaler + PCA(4) + MinMax, fit on harmonized TRAIN only
# =========================================================

def fit_and_write_csv(X_train, X_test, y_train, y_test, f_train, f_test,
                       src_train, src_test, label_ids, output_csv, tag):
    scaler = StandardScaler()
    X_train_std = scaler.fit_transform(X_train)
    X_test_std = scaler.transform(X_test)

    n_comp = min(N_COMPONENTS, X_train_std.shape[0] - 1, X_train_std.shape[1])
    pca = PCA(n_components=n_comp, random_state=RANDOM_SEED)
    X_train_pca = pca.fit_transform(X_train_std)
    X_test_pca = pca.transform(X_test_std)
    print(f"[{tag}] PCA (post-ComBat): k={n_comp}, cumulative explained variance="
          f"{pca.explained_variance_ratio_.sum():.4f}")

    mm_scaler = MinMaxScaler(feature_range=ANGLE_RANGE)
    X_train_qml = mm_scaler.fit_transform(X_train_pca)
    X_test_qml = mm_scaler.transform(X_test_pca)

    inverse_label_map = {v: k for k, v in label_ids.items()}
    feature_cols = [f"pc{i+1}" for i in range(n_comp)]

    train_df = pd.DataFrame(X_train_qml, columns=feature_cols)
    train_df["label"] = y_train
    train_df["label_name"] = [inverse_label_map[i] for i in y_train]
    train_df["filename"] = f_train
    train_df["source_dataset"] = src_train
    train_df["split"] = "train"

    test_df = pd.DataFrame(X_test_qml, columns=feature_cols)
    test_df["label"] = y_test
    test_df["label_name"] = [inverse_label_map[i] for i in y_test]
    test_df["filename"] = f_test
    test_df["source_dataset"] = src_test
    test_df["split"] = "test"

    out_df = pd.concat([train_df, test_df], ignore_index=True)
    out_df.to_csv(output_csv, index=False)
    print(f"[{tag}] Saved: {output_csv}  (train={len(train_df)}, test={len(test_df)})")


def domain_leakage_probe(csv_path, tag):
    if not os.path.exists(csv_path):
        print(f"[{tag}] probe skipped -- {csv_path} not found")
        return None
    df = pd.read_csv(csv_path)
    feature_cols = [c for c in df.columns if c.startswith("pc")]
    train_df = df[df["split"] == "train"]
    test_df = df[df["split"] == "test"]

    clf = LogisticRegression(max_iter=2000)
    clf.fit(train_df[feature_cols].values, train_df["source_dataset"].values)
    test_acc = clf.score(test_df[feature_cols].values, test_df["source_dataset"].values)
    n_domains = df["source_dataset"].nunique()
    print(f"[{tag}] hospital-source predictability from features: "
          f"{test_acc:.3f}  (chance ~= {1/n_domains:.3f} with {n_domains} domains)")
    return test_acc


# =========================================================
# MAIN
# =========================================================

def main():
    label_ids = {"normal": 0, "benign": 1, "malignant": 2}

    if os.path.exists(HARMONIZED_CACHE):
        print(f"Found cached harmonized embeddings at {HARMONIZED_CACHE} -- skipping image "
              "loading, CNN extraction, and the ComBat fit (identical for any N_COMPONENTS at "
              "this SAMPLES_PER_CLASS/seed; only the PCA step below actually varies).")
        cache = np.load(HARMONIZED_CACHE, allow_pickle=True)
        Z_train_harm, Z_test_harm = cache["Z_train_harm"], cache["Z_test_harm"]
        y_train_labels, y_test_labels = cache["y_train"], cache["y_test"]
        f_train, f_test = cache["f_train"], cache["f_test"]
        src_train, src_test = cache["src_train"], cache["src_test"]
    else:
        device = dann_module.get_device()
        print(f"Using device: {device}")

        df = pd.read_csv(dann_module.CSV_PATH)
        df[dann_module.LABEL_COLUMN] = df[dann_module.LABEL_COLUMN].apply(dann_module.normalize_label)
        df = df[df[dann_module.LABEL_COLUMN].isin(["normal", "benign", "malignant"])]
        df = df.dropna(subset=[dann_module.IMAGE_COLUMN]).drop_duplicates(subset=[dann_module.IMAGE_COLUMN])
        df = df[df[dann_module.SOURCE_COLUMN].isin(dann_module.ALL_SOURCES)]

        sample_df = dann_module.sample_balanced(df, ["normal", "benign", "malignant"], SAMPLES_PER_CLASS, RANDOM_SEED)
        print(f"\nBalanced sample: {len(sample_df)} images")
        print(f"Source breakdown: {sample_df[dann_module.SOURCE_COLUMN].value_counts().to_dict()}")

        transform = dann_module.build_preprocess_transform()
        print("\nPreloading image tensors...")
        X, y_label, filenames, sources = dann_module.load_image_tensors(
            sample_df, dann_module.IMAGE_BASE_FOLDER, transform
        )
        print(f"Loaded {len(y_label)} images successfully.")

        print("\nExtracting raw 512-dim frozen ResNet18 embeddings (pre-PCA, for ComBat)...")
        extractor = build_frozen_extractor(device)
        Z = extract_raw_embeddings(extractor, X, device)
        del X
        print(f"Embedding shape: {Z.shape}")

        print("\n" + "=" * 70)
        print("POOLED SPLIT: ComBat harmonization")
        print("=" * 70)
        idx_all = np.arange(len(y_label))
        idx_train, idx_test = train_test_split(
            idx_all, test_size=TEST_SIZE, stratify=y_label, random_state=RANDOM_SEED
        )

        check_batch_sizes(sources[idx_train], y_label[idx_train], "POOLED train")

        Z_train_harm, Z_test_harm = run_combat(
            Z[idx_train], sources[idx_train], y_label[idx_train],
            Z[idx_test], sources[idx_test],
        )
        y_train_labels, y_test_labels = y_label[idx_train], y_label[idx_test]
        f_train, f_test = filenames[idx_train], filenames[idx_test]
        src_train, src_test = sources[idx_train], sources[idx_test]

        np.savez(HARMONIZED_CACHE, Z_train_harm=Z_train_harm, Z_test_harm=Z_test_harm,
                 y_train=y_train_labels, y_test=y_test_labels,
                 f_train=f_train, f_test=f_test, src_train=src_train, src_test=src_test)
        print(f"Cached harmonized embeddings to {HARMONIZED_CACHE} for future N_COMPONENTS sweeps.")

    y_train_ids = np.array([label_ids[v] for v in y_train_labels])
    y_test_ids = np.array([label_ids[v] for v in y_test_labels])
    fit_and_write_csv(
        Z_train_harm, Z_test_harm, y_train_ids, y_test_ids,
        f_train, f_test, src_train, src_test,
        label_ids, POOLED_OUTPUT_CSV, "POOLED"
    )

    # =====================================================
    # DOMAIN-LEAKAGE PROBE
    # =====================================================
    print("\n" + "=" * 70)
    print("DOMAIN-LEAKAGE PROBE (logistic regression predicting hospital from features)")
    print("=" * 70)
    domain_leakage_probe(BASELINE_POOLED_CSV, "BEFORE (frozen CNN + PCA, pooled)")
    domain_leakage_probe(POOLED_OUTPUT_CSV, "AFTER  (ComBat + PCA, pooled)")

    # =====================================================
    # DOWNSTREAM QSVC EVALUATION + SHORTCUT CHECK
    # =====================================================
    print("\n" + "=" * 70)
    print("RUNNING qsvc.py ON THE COMBAT-HARMONIZED EMBEDDINGS")
    print("=" * 70)
    spec2 = importlib.util.spec_from_file_location("qsvc_module", QSVC_MODULE_PATH)
    qsvc_module = importlib.util.module_from_spec(spec2)
    sys.modules["qsvc_module"] = qsvc_module
    spec2.loader.exec_module(qsvc_module)
    qsvc_module.OUTPUT_DIR = os.path.join(THIS_DIR, "qsvc_outputs")
    qsvc_module.RESULTS_TABLE_PATH = os.path.join(qsvc_module.OUTPUT_DIR, "experiment_results.csv")
    os.makedirs(qsvc_module.OUTPUT_DIR, exist_ok=True)

    pooled_result = qsvc_module.run_qsvc_experiment(
        csv_path=POOLED_OUTPUT_CSV, tag="combat_pooled", make_plots=False
    )

    print("\n" + "=" * 70)
    print("SHORTCUT CHECK: cmmd-benign and ddsm-malignant recall (pooled ComBat model)")
    print("=" * 70)
    df_pooled = pd.read_csv(POOLED_OUTPUT_CSV)
    preds = pooled_result["test_metrics"]["preds"]
    test_df = df_pooled[df_pooled["split"] == "test"].reset_index(drop=True)
    test_df["pred"] = preds

    for src, true_label, label_id in [("cmmd", "benign", 1), ("ddsm", "malignant", 2)]:
        mask = (test_df["source_dataset"] == src) & (test_df["label"] == label_id)
        n = mask.sum()
        if n == 0:
            print(f"  {src}-{true_label}: no test samples in this split")
            continue
        recall = (test_df.loc[mask, "pred"] == label_id).mean()
        malignant_rate = (test_df.loc[mask, "pred"] == 2).mean()
        print(f"  {src}-{true_label} (n={n}): recall={recall:.3f}  predicted-malignant-rate={malignant_rate:.3f}")

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"POOLED (ComBat) test accuracy: {pooled_result['test_metrics']['accuracy']:.4f}  "
          f"macro-F1: {pooled_result['test_metrics']['f1_macro']:.4f}")
    print("\nCompare against:")
    print("  Single-hospital (ddsm only, frozen CNN):   0.528 +/- 0.011")
    print("  Multi-hospital POOLED (frozen CNN):        see qsvc_outputs/experiment_results.csv")
 


if __name__ == "__main__":
    main()
