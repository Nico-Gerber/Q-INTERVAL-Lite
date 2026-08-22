import os
import numpy as np
import pandas as pd
from PIL import Image
from sklearn.decomposition import PCA
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
import joblib

# =========================================================
# CONFIG
# =========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CSV_PATH = os.path.join(BASE_DIR, "mammo-bench.csv")
IMAGE_BASE_FOLDER = BASE_DIR

OUTPUT_CSV = os.path.join(BASE_DIR, "qml_900_pca4_multiclass.csv")
PCA_SAVE_PATH = os.path.join(BASE_DIR, "pcaObj.joblib")
SCALER_SAVE_PATH = os.path.join(BASE_DIR, "scalerObj.joblib")
LABEL_MAP_SAVE_PATH = os.path.join(BASE_DIR, "labelMap.joblib")

IMAGE_COLUMN = "preprocessed_image_path"
LABEL_COLUMN = "classification"

SAMPLES_PER_CLASS = 300
RESIZE_TO = (16, 16)
N_COMPONENTS = 4
RANDOM_SEED = 42
TEST_SIZE = 0.2

np.random.seed(RANDOM_SEED)


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

    candidate = os.path.join(image_base_folder, image_ref)
    return candidate


df = pd.read_csv(CSV_PATH)

print("CSV columns:", df.columns.tolist())

if IMAGE_COLUMN not in df.columns:
    raise ValueError(f"Missing IMAGE_COLUMN '{IMAGE_COLUMN}' in CSV")

if LABEL_COLUMN not in df.columns:
    raise ValueError(f"Missing LABEL_COLUMN '{LABEL_COLUMN}' in CSV")

df = df[[IMAGE_COLUMN, LABEL_COLUMN]].copy()
df = df.dropna(subset=[IMAGE_COLUMN, LABEL_COLUMN]).copy()
df = df.drop_duplicates(subset=[IMAGE_COLUMN]).reset_index(drop=True)

df[LABEL_COLUMN] = df[LABEL_COLUMN].apply(normalize_label)

target_classes = ["normal", "benign", "malignant"]
df = df[df[LABEL_COLUMN].isin(target_classes)].copy()

print("\nClass distribution before file validation:")
print(df[LABEL_COLUMN].value_counts())


label_map = {
    "normal": 0,
    "benign": 1,
    "malignant": 2
}
inverse_label_map = {v: k for k, v in label_map.items()}


valid_rows = []
missing_files = []

for _, row in df.iterrows():
    image_ref = row[IMAGE_COLUMN]
    label_text = row[LABEL_COLUMN]

    img_path = resolve_image_path(image_ref, IMAGE_BASE_FOLDER)

    if os.path.exists(img_path):
        valid_rows.append({
            "image_ref": image_ref,
            "label_name": label_text,
            "img_path": img_path
        })
    else:
        missing_files.append(img_path)

valid_df = pd.DataFrame(valid_rows)

if valid_df.empty:
    raise ValueError("No valid image files were found. Check preprocessed_image_path values and folder structure.")

print("\nClass distribution after file validation:")
print(valid_df["label_name"].value_counts())

if missing_files:
    print(f"\nMissing files skipped: {len(missing_files)}")
    for p in missing_files[:10]:
        print("  Missing:", p)


sampled_parts = []

for cls in target_classes:
    class_df = valid_df[valid_df["label_name"] == cls].copy()

    if len(class_df) < SAMPLES_PER_CLASS:
        raise ValueError(
            f"Not enough valid image files for class '{cls}'. "
            f"Found {len(class_df)}, need {SAMPLES_PER_CLASS}."
        )

    sampled_parts.append(
        class_df.sample(n=SAMPLES_PER_CLASS, random_state=RANDOM_SEED)
    )

sampled_df = pd.concat(sampled_parts, axis=0)
sampled_df = sampled_df.sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)

print("\nBalanced sampled distribution:")
print(sampled_df["label_name"].value_counts())


X = []
y = []
used_filenames = []
failed_files = []

for _, row in sampled_df.iterrows():
    img_path = row["img_path"]
    label_text = row["label_name"]
    image_ref = row["image_ref"]

    try:
        img = Image.open(img_path).convert("L")
        img = img.resize(RESIZE_TO)
        arr = np.array(img, dtype=np.float32) / 255.0
        arr = arr.flatten()

        X.append(arr)
        y.append(label_map[label_text])
        used_filenames.append(str(image_ref).strip())

    except Exception as e:
        failed_files.append((img_path, str(e)))

X = np.array(X, dtype=np.float32)
y = np.array(y, dtype=np.int64)

print(f"\nLoaded images successfully: {len(X)}")
print("Feature shape before PCA:", X.shape)

if failed_files:
    print(f"\nFailed files skipped: {len(failed_files)}")
    for p, err in failed_files[:10]:
        print("  Failed:", p, "| Error:", err)


for class_id, class_name in inverse_label_map.items():
    count = int(np.sum(y == class_id))
    print(f"Loaded count for {class_name}: {count}")

if len(np.unique(y)) != 3:
    raise ValueError("Expected exactly 3 classes after loading images.")

for class_id in [0, 1, 2]:
    if np.sum(y == class_id) < 2:
        raise ValueError(f"Too few samples remain for class {class_id} after loading.")


X_train, X_test, y_train, y_test, f_train, f_test = train_test_split(
    X,
    y,
    used_filenames,
    test_size=TEST_SIZE,
    stratify=y,
    random_state=RANDOM_SEED
)

print("\nTrain size:", len(X_train))
print("Test size:", len(X_test))


pca = PCA(n_components=N_COMPONENTS, random_state=RANDOM_SEED)
X_train_pca = pca.fit_transform(X_train)
X_test_pca = pca.transform(X_test)


scaler = MinMaxScaler(feature_range=(0, np.pi))
X_train_qml = scaler.fit_transform(X_train_pca)
X_test_qml = scaler.transform(X_test_pca)

print("\nTrain reduced shape:", X_train_qml.shape)
print("Test reduced shape:", X_test_qml.shape)
print("Explained variance ratio sum:", pca.explained_variance_ratio_.sum())


feature_cols = [f"pc{i+1}" for i in range(N_COMPONENTS)]

train_df = pd.DataFrame(X_train_qml, columns=feature_cols)
train_df["label"] = y_train
train_df["label_name"] = [inverse_label_map[i] for i in y_train]
train_df["filename"] = f_train
train_df["split"] = "train"

test_df = pd.DataFrame(X_test_qml, columns=feature_cols)
test_df["label"] = y_test
test_df["label_name"] = [inverse_label_map[i] for i in y_test]
test_df["filename"] = f_test
test_df["split"] = "test"

out_df = pd.concat([train_df, test_df], ignore_index=True)
out_df.to_csv(OUTPUT_CSV, index=False)


joblib.dump(pca, PCA_SAVE_PATH)
joblib.dump(scaler, SCALER_SAVE_PATH)
joblib.dump(label_map, LABEL_MAP_SAVE_PATH)

print(f"\nSaved preprocessed CSV to: {OUTPUT_CSV}")
print(f"Saved PCA model to: {PCA_SAVE_PATH}")
print(f"Saved scaler to: {SCALER_SAVE_PATH}")
print(f"Saved label map to: {LABEL_MAP_SAVE_PATH}")

print("\nFinal output class distribution:")
print(out_df["label_name"].value_counts())

print("\nDone.")