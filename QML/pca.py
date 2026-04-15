import os
import numpy as np
import pandas as pd
from PIL import Image
from sklearn.decomposition import PCA
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
#global
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CSV_PATH = os.path.join(BASE_DIR, "labels", "CSAW-M_train.csv")
IMAGE_FOLDER = os.path.join(BASE_DIR, "images", "preprocessed", "train")
OUTPUT_CSV = os.path.join(BASE_DIR, "qml_500_pca4.csv")

IMAGE_COLUMN = "Filename"
LABEL_COLUMN = "If_cancer"            # 0 no cancer 1 yes caner

SAMPLES_PER_CLASS = 250         
RESIZE_TO = (16, 16)
N_COMPONENTS = 4
RANDOM_SEED = 42

df = pd.read_csv(CSV_PATH, sep=";")

print(df.columns.tolist())

# keep only binary labels 0 and 1
df = df[df[LABEL_COLUMN].isin([0, 1])].copy()

# balanced sample
healthy_df = df[df[LABEL_COLUMN] == 0]
cancer_df = df[df[LABEL_COLUMN] == 1]

if len(healthy_df) < SAMPLES_PER_CLASS or len(cancer_df) < SAMPLES_PER_CLASS:
    raise ValueError("Not enough samples in one of the classes.")

sampled_df = pd.concat([
    healthy_df.sample(n=SAMPLES_PER_CLASS, random_state=RANDOM_SEED),
    cancer_df.sample(n=SAMPLES_PER_CLASS, random_state=RANDOM_SEED)
]).sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)

# process
X = []
y = []
used_filenames = []

for _, row in sampled_df.iterrows():
    filename = str(row[IMAGE_COLUMN]).strip()
    img_path = os.path.join(IMAGE_FOLDER, filename)

    if not os.path.exists(img_path):
        print(f"Missing file: {img_path}")
        continue

    img = Image.open(img_path).convert("L")         # grayscale
    img = img.resize(RESIZE_TO)                     # 16x16
    arr = np.array(img, dtype=np.float32) / 255.0   # normalize
    arr = arr.flatten()                             # 256 features

    X.append(arr)
    y.append(int(row[LABEL_COLUMN]))
    used_filenames.append(filename)

X = np.array(X)
y = np.array(y)

print("Loaded images:", len(X))
print("Original shape:", X.shape)

#split
X_train, X_test, y_train, y_test, f_train, f_test = train_test_split(
    X, y, used_filenames,
    test_size=0.2,
    stratify=y,
    random_state=RANDOM_SEED
)

#pca train only
pca = PCA(n_components=N_COMPONENTS, random_state=RANDOM_SEED)
X_train_pca = pca.fit_transform(X_train)
X_test_pca = pca.transform(X_test)

# scale to [0, pi] for angle encoding
scaler = MinMaxScaler(feature_range=(0, np.pi))
X_train_qml = scaler.fit_transform(X_train_pca)
X_test_qml = scaler.transform(X_test_pca)

print("Train reduced shape:", X_train_qml.shape)
print("Test reduced shape:", X_test_qml.shape)
print("Explained variance:", pca.explained_variance_ratio_.sum())



train_df = pd.DataFrame(X_train_qml, columns=[f"pc{i+1}" for i in range(N_COMPONENTS)])
train_df["label"] = y_train
train_df["filename"] = f_train
train_df["split"] = "train"

test_df = pd.DataFrame(X_test_qml, columns=[f"pc{i+1}" for i in range(N_COMPONENTS)])
test_df["label"] = y_test
test_df["filename"] = f_test
test_df["split"] = "test"

out_df = pd.concat([train_df, test_df], ignore_index=True)
out_df.to_csv(OUTPUT_CSV, index=False)

print(f"Saved to {OUTPUT_CSV}")