import os
import sys
import copy
import importlib.util
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
from torch.autograd import Function
from torchvision import models, transforms

from sklearn.preprocessing import MinMaxScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score

# CONFIG 
BASE_DIR = "/Volumes/Jack HD/Mammo_Bench_v2"
CSV_PATH = os.path.join(BASE_DIR, "mammo-bench.csv")
IMAGE_BASE_FOLDER = BASE_DIR

IMAGE_COLUMN = "preprocessed_image_path"
LABEL_COLUMN = "classification"
SOURCE_COLUMN = "source_dataset"

ALL_SOURCES = ["ddsm", "cdd-cesm", "cmmd", "kau-bcmd", "inbreast", "dmid"]
HOLDOUT_SOURCE = "kau-bcmd"
SAMPLES_PER_CLASS = 500

N_FEATURES = 4
TEST_SIZE = 0.2
RANDOM_SEED = 42
ANGLE_RANGE = (0.0, np.pi)
BATCH_SIZE = 32

EPOCHS = 15
LR_BACKBONE = 1e-4
LR_HEADS = 1e-3
WEIGHT_DECAY = 1e-4
VAL_FRACTION = 0.15
LAMBDA_MAX = 1.0

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(THIS_DIR)
OUTPUT_DIR = os.path.join(REPO_ROOT, "4pca")
POOLED_OUTPUT_CSV = os.path.join(OUTPUT_DIR, "qml_dann_pca4_multiclass_pooled.csv")
CROSSHOSP_OUTPUT_CSV = os.path.join(OUTPUT_DIR, "qml_dann_pca4_multiclass_crossclass.csv")
BASELINE_POOLED_CSV = os.path.join(OUTPUT_DIR, "qml_cnn_pca4_multiclass_pooled.csv")
QSVC_MODULE_PATH = os.path.join(os.path.dirname(THIS_DIR), "qsvc.py")

os.makedirs(OUTPUT_DIR, exist_ok=True)
np.random.seed(RANDOM_SEED)
torch.manual_seed(RANDOM_SEED)


# =========================================================
# DATA LOADING 
# =========================================================
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


def sample_balanced(df, classes, n_per_class, seed):
    parts = []
    for cls in classes:
        cls_df = df[df[LABEL_COLUMN] == cls]
        n = min(len(cls_df), n_per_class)
        if n < n_per_class:
            print(f"  [warning] only {n} available for class '{cls}' -- using all of them")
        parts.append(cls_df.sample(n=n, random_state=seed))
    return pd.concat(parts).sample(frac=1, random_state=seed).reset_index(drop=True)


def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    elif torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def build_preprocess_transform():
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.Grayscale(num_output_channels=3),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def load_image_tensors(rows_df, image_base_folder, transform):
    """Preload every image as a tensor once """
    tensors, y_label, filenames, sources = [], [], [], []
    for count, (_, row) in enumerate(rows_df.iterrows()):
        img_path = resolve_image_path(row[IMAGE_COLUMN], image_base_folder)
        if not os.path.exists(img_path):
            continue
        try:
            img = Image.open(img_path).convert("L")
            tensors.append(transform(img))
        except Exception as e:
            print(f"  [skip] {img_path}: {e}")
            continue
        y_label.append(row[LABEL_COLUMN])
        filenames.append(str(row[IMAGE_COLUMN]).strip())
        sources.append(row[SOURCE_COLUMN])
        if (count + 1) % 250 == 0:
            print(f"    loaded {count + 1}/{len(rows_df)} images...")
    return (torch.stack(tensors), np.array(y_label), np.array(filenames), np.array(sources))


# =========================================================
# DANN MODEL
# =========================================================
class GradientReversal(Function):
    @staticmethod
    def forward(ctx, x, lambda_p):
        ctx.lambda_p = lambda_p
        return x.view_as(x)

    @staticmethod
    def backward(ctx, grad_output):
        return -ctx.lambda_p * grad_output, None


def grad_reverse(x, lambda_p):
    return GradientReversal.apply(x, lambda_p)


class DANN(nn.Module):
    def __init__(self, embed_dim, num_domains):
        super().__init__()
        backbone = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        self.stem = nn.Sequential(
            backbone.conv1, backbone.bn1, backbone.relu, backbone.maxpool,
            backbone.layer1, backbone.layer2,
        )
        self.layer3 = backbone.layer3
        self.layer4 = backbone.layer4
        self.avgpool = backbone.avgpool
        for p in self.stem.parameters():
            p.requires_grad = False

        self.bottleneck = nn.Linear(512, embed_dim)

        self.bottleneck_bn = nn.BatchNorm1d(embed_dim)
        self.label_head = nn.Linear(embed_dim, 3)
        self.domain_head = nn.Linear(embed_dim, num_domains)

    def embed(self, x):
        with torch.no_grad():
            h = self.stem(x)
        h = self.layer3(h)
        h = self.layer4(h)
        h = self.avgpool(h).flatten(1)
        return self.bottleneck_bn(self.bottleneck(h))

    def forward(self, x, lambda_p):
        z = self.embed(x)
        label_logits = self.label_head(z)
        domain_logits = self.domain_head(grad_reverse(z, lambda_p))
        return z, label_logits, domain_logits

    def param_groups(self, lr_backbone, lr_heads, weight_decay):
        return [
            {"params": list(self.layer3.parameters()) + list(self.layer4.parameters()),
             "lr": lr_backbone, "weight_decay": weight_decay},
            {"params": list(self.bottleneck.parameters()) + list(self.bottleneck_bn.parameters())
             + list(self.label_head.parameters()) + list(self.domain_head.parameters()),
             "lr": lr_heads, "weight_decay": weight_decay},
        ]


def lambda_schedule(epoch, total_epochs, lambda_max):
    p = epoch / max(total_epochs - 1, 1)
    return lambda_max * (2.0 / (1.0 + np.exp(-10 * p)) - 1.0)


def train_dann(X, y, domain, device, epochs, batch_size, val_fraction, seed, split_name):
    label_ids = {"normal": 0, "benign": 1, "malignant": 2}
    y_ids = np.array([label_ids[v] for v in y])
    domains_sorted = sorted(np.unique(domain).tolist())
    domain_ids_map = {d: i for i, d in enumerate(domains_sorted)}
    d_ids = np.array([domain_ids_map[v] for v in domain])
    num_domains = len(domains_sorted)

    idx_all = np.arange(len(y_ids))
    idx_fit, idx_val = train_test_split(
        idx_all, test_size=val_fraction, stratify=y_ids, random_state=seed
    )

    model = DANN(embed_dim=N_FEATURES, num_domains=num_domains).to(device)
    optimizer = torch.optim.Adam(model.param_groups(LR_BACKBONE, LR_HEADS, WEIGHT_DECAY))
    ce = nn.CrossEntropyLoss()

    y_t = torch.tensor(y_ids, dtype=torch.long)
    d_t = torch.tensor(d_ids, dtype=torch.long)

    print(f"\n[{split_name}] Training DANN: {len(idx_fit)} fit / {len(idx_val)} val, "
          f"{num_domains} domains {domains_sorted}, chance domain-acc={1/num_domains:.3f}")

    for epoch in range(epochs):
        model.train()
        lambda_p = lambda_schedule(epoch, epochs, LAMBDA_MAX)
        perm = np.random.permutation(idx_fit)
        total_label_loss = total_domain_loss = 0.0
        n_batches = 0

        for start in range(0, len(perm), batch_size):
            batch_idx = perm[start:start + batch_size]
            if len(batch_idx) < 2:
                continue 
            xb = X[batch_idx].to(device)
            yb = y_t[batch_idx].to(device)
            db = d_t[batch_idx].to(device)

            optimizer.zero_grad()
            _, label_logits, domain_logits = model(xb, lambda_p)
            label_loss = ce(label_logits, yb)
            domain_loss = ce(domain_logits, db)
            (label_loss + domain_loss).backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
            optimizer.step()

            total_label_loss += label_loss.item()
            total_domain_loss += domain_loss.item()
            n_batches += 1

        # validation monitoring
        model.eval()
        with torch.no_grad():
            xv = X[idx_val].to(device)
            val_z, val_label_logits, val_domain_logits = model(xv, lambda_p=0.0)
            val_label_acc = (val_label_logits.argmax(1).cpu().numpy() == y_ids[idx_val]).mean()
            val_domain_acc = (val_domain_logits.argmax(1).cpu().numpy() == d_ids[idx_val]).mean()
            val_embed_norm = val_z.norm(dim=1).mean().item()

        print(f"  epoch {epoch+1:2d}/{epochs}  lambda={lambda_p:.3f}  "
              f"label_loss={total_label_loss/n_batches:.3f}  domain_loss={total_domain_loss/n_batches:.3f}  "
              f"embed_norm={val_embed_norm:.2f}  "
              f"val_label_acc={val_label_acc:.3f}  val_domain_acc={val_domain_acc:.3f} "
              f"(chance={1/num_domains:.3f})")

    return model, label_ids


@torch.no_grad()
def compute_embeddings(model, X, device, batch_size=64):
    model.eval()
    out = []
    for start in range(0, len(X), batch_size):
        xb = X[start:start + batch_size].to(device)
        out.append(model.embed(xb).cpu().numpy())
    return np.concatenate(out, axis=0)


# =========================================================
# CSV WRITER
# =========================================================

def write_csv(Z_train, Z_test, y_train, y_test, f_train, f_test,
              src_train, src_test, label_ids, output_csv, split_name):
    mm_scaler = MinMaxScaler(feature_range=ANGLE_RANGE)
    Z_train_scaled = mm_scaler.fit_transform(Z_train)
    Z_test_scaled = mm_scaler.transform(Z_test)

    inverse_label_map = {v: k for k, v in label_ids.items()}
    feature_cols = [f"pc{i+1}" for i in range(Z_train.shape[1])]

    train_df = pd.DataFrame(Z_train_scaled, columns=feature_cols)
    train_df["label"] = y_train
    train_df["label_name"] = [inverse_label_map[i] for i in y_train]
    train_df["filename"] = f_train
    train_df["source_dataset"] = src_train
    train_df["split"] = "train"

    test_df = pd.DataFrame(Z_test_scaled, columns=feature_cols)
    test_df["label"] = y_test
    test_df["label_name"] = [inverse_label_map[i] for i in y_test]
    test_df["filename"] = f_test
    test_df["source_dataset"] = src_test
    test_df["split"] = "test"

    out_df = pd.concat([train_df, test_df], ignore_index=True)
    out_df.to_csv(output_csv, index=False)
    print(f"[{split_name}] Saved: {output_csv}  (train={len(train_df)}, test={len(test_df)})")


# =========================================================
# DOMAIN-LEAKAGE PROBE
# =========================================================

def domain_leakage_probe(csv_path, label_tag):
    if not os.path.exists(csv_path):
        print(f"[{label_tag}] probe skipped -- {csv_path} not found")
        return None
    df = pd.read_csv(csv_path)
    feature_cols = [c for c in df.columns if c.startswith("pc")]
    train_df = df[df["split"] == "train"]
    test_df = df[df["split"] == "test"]

    clf = LogisticRegression(max_iter=2000)
    clf.fit(train_df[feature_cols].values, train_df["source_dataset"].values)
    test_acc = clf.score(test_df[feature_cols].values, test_df["source_dataset"].values)
    n_domains = df["source_dataset"].nunique()
    print(f"[{label_tag}] source predictability from features: "
          f"{test_acc:.3f}  (chance ~= {1/n_domains:.3f} with {n_domains} domains)")
    return test_acc


# =========================================================
# MAIN
# =========================================================

def run_split(split_name, X_train, X_test, y_train, y_test, f_train, f_test,
              src_train, src_test, device, output_csv):
    model, label_ids = train_dann(
        X_train, y_train, src_train, device, EPOCHS, BATCH_SIZE, VAL_FRACTION, RANDOM_SEED, split_name
    )
    Z_train = compute_embeddings(model, X_train, device)
    Z_test = compute_embeddings(model, X_test, device)
    y_train_ids = np.array([label_ids[v] for v in y_train])
    y_test_ids = np.array([label_ids[v] for v in y_test])
    write_csv(Z_train, Z_test, y_train_ids, y_test_ids, f_train, f_test,
              src_train, src_test, label_ids, output_csv, split_name)
    del model
    return label_ids


def main():
    device = get_device()
    print(f"Using device: {device}")

    df = pd.read_csv(CSV_PATH)
    df[LABEL_COLUMN] = df[LABEL_COLUMN].apply(normalize_label)
    df = df[df[LABEL_COLUMN].isin(["normal", "benign", "malignant"])]
    df = df.dropna(subset=[IMAGE_COLUMN]).drop_duplicates(subset=[IMAGE_COLUMN])
    df = df[df[SOURCE_COLUMN].isin(ALL_SOURCES)]

    label_ids_const = {"normal": 0, "benign": 1, "malignant": 2}
    sample_df = sample_balanced(df, ["normal", "benign", "malignant"], SAMPLES_PER_CLASS, RANDOM_SEED)
    print(f"\nBalanced sample: {len(sample_df)} images")
    print(f"Source breakdown: {sample_df[SOURCE_COLUMN].value_counts().to_dict()}")

    transform = build_preprocess_transform()
    print("\nPreloading image tensors (once, reused across all training epochs)...")
    X, y_label, filenames, sources = load_image_tensors(sample_df, IMAGE_BASE_FOLDER, transform)
    print(f"Loaded {len(y_label)} images successfully.")

    # =====================================================
    # SPLIT A: POOLED
    # =====================================================
    print("\n" + "=" * 70)
    print("SPLIT A: POOLED -- training DANN encoder")
    print("=" * 70)
    idx_all = np.arange(len(y_label))
    idx_train, idx_test = train_test_split(
        idx_all, test_size=TEST_SIZE, stratify=y_label, random_state=RANDOM_SEED
    )
    label_ids = run_split(
        "POOLED", X[idx_train], X[idx_test], y_label[idx_train], y_label[idx_test],
        filenames[idx_train], filenames[idx_test], sources[idx_train], sources[idx_test],
        device, POOLED_OUTPUT_CSV
    )

    # =====================================================
    # SPLIT B: CROSS-SOURCE HOLDOUT
    # =====================================================
    print("\n" + "=" * 70)
    print(f"SPLIT B: CROSS-SOURCE HOLDOUT (test source: '{HOLDOUT_SOURCE}') -- training DANN encoder")
    print("=" * 70)
    train_mask = sources != HOLDOUT_SOURCE
    test_mask = sources == HOLDOUT_SOURCE
    if test_mask.sum() < 20:
        print(f"[STOP] Only {test_mask.sum()} holdout samples -- skipping cross-source split.")
    else:
        run_split(
            "CROSS-SOURCE", X[train_mask], X[test_mask], y_label[train_mask], y_label[test_mask],
            filenames[train_mask], filenames[test_mask], sources[train_mask], sources[test_mask],
            device, CROSSHOSP_OUTPUT_CSV
        )

    del X
    torch.mps.empty_cache() if device.type == "mps" else None

    # =====================================================
    # DOMAIN-LEAKAGE PROBE: before (frozen CNN) vs after (DANN)
    # =====================================================
    print("\n" + "=" * 70)
    print("DOMAIN-LEAKAGE PROBE (logistic regression predicting source from features)")
    print("=" * 70)
    domain_leakage_probe(BASELINE_POOLED_CSV, "BEFORE (frozen CNN + PCA, pooled)")
    domain_leakage_probe(POOLED_OUTPUT_CSV, "AFTER  (DANN, pooled)")

    # =====================================================
    # DOWNSTREAM QSVC EVALUATION + SHORTCUT CHECK
    # =====================================================
    print("\n" + "=" * 70)
    print("RUNNING qsvc.py ON THE NEW DANN EMBEDDINGS")
    print("=" * 70)
    spec = importlib.util.spec_from_file_location("qsvc_module", QSVC_MODULE_PATH)
    qsvc_module = importlib.util.module_from_spec(spec)
    sys.modules["qsvc_module"] = qsvc_module
    spec.loader.exec_module(qsvc_module)

    # qsvc.py's own OUTPUT_DIR is a relative path baked in for a different cwd --
    # repoint it at this repo's existing QSVC/qsvc_outputs so results land next
    # to the earlier baseline runs instead of creating a stray nested folder.
    qsvc_module.OUTPUT_DIR = os.path.join(THIS_DIR, "qsvc_outputs")
    qsvc_module.RESULTS_TABLE_PATH = os.path.join(qsvc_module.OUTPUT_DIR, "experiment_results.csv")
    os.makedirs(qsvc_module.OUTPUT_DIR, exist_ok=True)

    pooled_result = qsvc_module.run_qsvc_experiment(
        csv_path=POOLED_OUTPUT_CSV, tag="dann_pooled", make_plots=False
    )
    crosshosp_result = None
    if os.path.exists(CROSSHOSP_OUTPUT_CSV):
        crosshosp_result = qsvc_module.run_qsvc_experiment(
            csv_path=CROSSHOSP_OUTPUT_CSV, tag="dann_crossclass", make_plots=False
        )

    print("\n" + "=" * 70)
    print("SHORTCUT CHECK: cmmd-benign and ddsm-malignant recall (pooled DANN model)")
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
    print(f"POOLED         test accuracy: {pooled_result['test_metrics']['accuracy']:.4f}  "
          f"macro-F1: {pooled_result['test_metrics']['f1_macro']:.4f}")
    if crosshosp_result is not None:
        print(f"CROSS-HOSPITAL test accuracy: {crosshosp_result['test_metrics']['accuracy']:.4f}  "
              f"macro-F1: {crosshosp_result['test_metrics']['f1_macro']:.4f}")
    print("\nCompare against prior baselines:")
    print("  Single-hospital (ddsm only, frozen CNN):        0.528 +/- 0.011")
    print("  Multi-hospital POOLED (frozen CNN):              see qsvc_outputs/experiment_results.csv")
    print("  Multi-hospital CROSS-HOSPITAL (frozen CNN):      0.168 (Phase 7)")


if __name__ == "__main__":
    main()
