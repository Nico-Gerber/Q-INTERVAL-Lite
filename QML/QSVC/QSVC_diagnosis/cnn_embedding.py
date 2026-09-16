import os
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
from torchvision import models, transforms

from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.decomposition import PCA
from sklearn.model_selection import train_test_split

# CONFIG
BASE_DIR = "/Volumes/Jack HD/Mammo_Bench_v2"
CSV_PATH = os.path.join(BASE_DIR, "mammo-bench.csv")
IMAGE_BASE_FOLDER = BASE_DIR

IMAGE_COLUMN = "preprocessed_image_path"
LABEL_COLUMN = "classification"
SOURCE_COLUMN = "source_dataset"

ALL_SOURCES = ["ddsm", "cdd-cesm", "cmmd", "kau-bcmd", "inbreast", "dmid"]
HOLDOUT_SOURCE = "kau-bcmd"   # excluded entirely from training in split B; used only as its test set
SAMPLES_PER_CLASS = 500        # pooled across ALL sources

N_COMPONENTS = 4
TEST_SIZE = 0.2
RANDOM_SEED = 42
ANGLE_RANGE = (0.0, np.pi)
BATCH_SIZE = 32

OUTPUT_DIR = "/Users/jackguo/Documents/GitHub/Q-INTERVAL-Lite/QML/4pca"
POOLED_OUTPUT_CSV = os.path.join(OUTPUT_DIR, "qml_cnn_pca4_multiclass_pooled.csv")
CROSSHOSP_OUTPUT_CSV = os.path.join(OUTPUT_DIR, "qml_cnn_pca4_multiclass_crossclass.csv")

np.random.seed(RANDOM_SEED)
torch.manual_seed(RANDOM_SEED)
os.makedirs(OUTPUT_DIR, exist_ok=True)


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
            print(f"  [warning] only {n} available for class '{cls}'")
        parts.append(cls_df.sample(n=n, random_state=seed))
    return pd.concat(parts).sample(frac=1, random_state=seed).reset_index(drop=True)


def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    elif torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def build_feature_extractor(device):
    model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
    model.fc = nn.Identity()
    model.eval()
    for param in model.parameters():
        param.requires_grad = False
    return model.to(device)


def build_preprocess_transform():
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.Grayscale(num_output_channels=3),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def extract_cnn_embeddings(rows_df, image_base_folder, model, transform, device, batch_size):
    embeddings, y_label, filenames, sources = [], [], [], []
    batch_imgs, batch_meta = [], []

    def flush_batch():
        if not batch_imgs:
            return
        batch_tensor = torch.stack(batch_imgs).to(device)
        with torch.no_grad():
            out = model(batch_tensor).cpu().numpy()
        for i, (label, fname, src) in enumerate(batch_meta):
            embeddings.append(out[i])
            y_label.append(label)
            filenames.append(fname)
            sources.append(src)
        batch_imgs.clear()
        batch_meta.clear()

    for count, (_, row) in enumerate(rows_df.iterrows()):
        img_path = resolve_image_path(row[IMAGE_COLUMN], image_base_folder)
        if not os.path.exists(img_path):
            continue
        try:
            img = Image.open(img_path).convert("L")
            tensor = transform(img)
        except Exception as e:
            print(f"  [skip] {img_path}: {e}")
            continue

        batch_imgs.append(tensor)
        batch_meta.append((row[LABEL_COLUMN], str(row[IMAGE_COLUMN]).strip(), row[SOURCE_COLUMN]))

        if len(batch_imgs) >= batch_size:
            flush_batch()
            if (count + 1) % (batch_size * 5) == 0:
                print(f"    processed {count + 1}/{len(rows_df)} images...")

    flush_batch()
    return (np.array(embeddings, dtype=np.float32), np.array(y_label),
            np.array(filenames), np.array(sources))


def fit_and_write_csv(X_train, X_test, y_train, y_test, f_train, f_test,
                       src_train, src_test, label_ids, output_csv, split_name):
    scaler = StandardScaler()
    X_train_std = scaler.fit_transform(X_train)
    X_test_std = scaler.transform(X_test)

    n_comp = min(N_COMPONENTS, X_train_std.shape[0] - 1, X_train_std.shape[1])
    pca = PCA(n_components=n_comp, random_state=RANDOM_SEED)
    X_train_pca = pca.fit_transform(X_train_std)
    X_test_pca = pca.transform(X_test_std)
    print(f"\n[{split_name}] PCA: k={n_comp}, cumulative explained variance="
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

    print(f"[{split_name}] Saved: {output_csv}")
    print(f"[{split_name}] Train size: {len(train_df)}   Test size: {len(test_df)}")
    print(f"[{split_name}] Train source distribution: {pd.Series(src_train).value_counts().to_dict()}")
    print(f"[{split_name}] Test source distribution:  {pd.Series(src_test).value_counts().to_dict()}")
    return n_comp


def main():
    device = get_device()
    print(f"Using device: {device}")

    df = pd.read_csv(CSV_PATH)
    df[LABEL_COLUMN] = df[LABEL_COLUMN].apply(normalize_label)
    df = df[df[LABEL_COLUMN].isin(["normal", "benign", "malignant"])]
    df = df.dropna(subset=[IMAGE_COLUMN]).drop_duplicates(subset=[IMAGE_COLUMN])
    df = df[df[SOURCE_COLUMN].isin(ALL_SOURCES)]

    print(f"\nClass distribution pooled across all sources:")
    print(df[LABEL_COLUMN].value_counts())
    print(f"\nSource distribution:")
    print(df[SOURCE_COLUMN].value_counts())

    label_ids = {"normal": 0, "benign": 1, "malignant": 2}
    sample_df = sample_balanced(df, ["normal", "benign", "malignant"], SAMPLES_PER_CLASS, RANDOM_SEED)
    print(f"\nBalanced sample: {len(sample_df)} images")
    print(f"Source breakdown of sample: {sample_df[SOURCE_COLUMN].value_counts().to_dict()}")

    print("\nLoading pretrained ResNet18 (downloads weights on first run)...")
    model = build_feature_extractor(device)
    transform = build_preprocess_transform()

    print(f"\nExtracting CNN embeddings from {len(sample_df)} images "
          f"(extracted ONCE, reused for both splits below)...")
    X, y_label, filenames, sources = extract_cnn_embeddings(
        sample_df, IMAGE_BASE_FOLDER, model, transform, device, BATCH_SIZE
    )
    y = np.array([label_ids[l] for l in y_label])
    print(f"\nLoaded {len(y)} images successfully. CNN embedding dim: {X.shape[1]}")

    # =====================================================
    # SPLIT A: POOLED -- naive random stratified split, all sources mixed
    # =====================================================
    print("\n" + "=" * 70)
    print("SPLIT A: POOLED (random split, all sources mixed together)")
    print("=" * 70)

    (Xa_train, Xa_test, ya_train, ya_test,
     fa_train, fa_test, srca_train, srca_test) = train_test_split(
        X, y, filenames, sources, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_SEED
    )
    fit_and_write_csv(Xa_train, Xa_test, ya_train, ya_test, fa_train, fa_test,
                       srca_train, srca_test, label_ids, POOLED_OUTPUT_CSV, "POOLED")

    # =====================================================
    # SPLIT B: CROSS-SOURCE HOLDOUT -- train on some, test on unseen source
    # =====================================================
    print("\n" + "=" * 70)
    print(f"SPLIT B: CROSS-SOURCE HOLDOUT (test source: '{HOLDOUT_SOURCE}')")
    print("=" * 70)

    train_mask = sources != HOLDOUT_SOURCE
    test_mask = sources == HOLDOUT_SOURCE

    if test_mask.sum() < 20:
        print(f"\n[STOP] Only {test_mask.sum()} samples available for holdout source "
              f"'{HOLDOUT_SOURCE}' in this sample -- too few for a meaningful test.")
        print("Increase SAMPLES_PER_CLASS or pick a different HOLDOUT_SOURCE and rerun.")
    else:
        Xb_train, Xb_test = X[train_mask], X[test_mask]
        yb_train, yb_test = y[train_mask], y[test_mask]
        fb_train, fb_test = filenames[train_mask], filenames[test_mask]
        srcb_train, srcb_test = sources[train_mask], sources[test_mask]

        fit_and_write_csv(Xb_train, Xb_test, yb_train, yb_test, fb_train, fb_test,
                           srcb_train, srcb_test, label_ids, CROSSHOSP_OUTPUT_CSV, "CROSS-SOURCE")


if __name__ == "__main__":
    main()