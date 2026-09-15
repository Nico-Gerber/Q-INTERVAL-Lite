"""
Follow-up check motivated by the dim_pca_sweep.py results:
    Is source_dataset confounded with classification label?
    If e.g. malignant cases disproportionately come from one source
    dataset, a classifier could pick up scanner/preprocessing
    signatures that correlate with label by coincidence, rather than
    true pathology signal.
"""

import os
import pandas as pd

# CONFIG
BASE_DIR = "/Volumes/Jack HD/Mammo_Bench_v2"
CSV_PATH = os.path.join(BASE_DIR, "mammo-bench.csv")

LABEL_COLUMN = "classification"
SOURCE_COLUMN = "source_dataset"


def normalize_label(label_value: str) -> str:
    value = str(label_value).strip().lower()
    if value in {"normal", "no finding", "negative"}:
        return "normal"
    elif value in {"benign", "benign lesion"}:
        return "benign"
    elif value in {"malignant", "cancer", "malignant lesion"}:
        return "malignant"
    return value


# CHECK: source_dataset vs. label confound
def check_source_confound(df):
    print("\n" + "=" * 60)
    print("CHECK: source_dataset vs. classification confound")
    print("=" * 60)

    df_norm = df.copy()
    df_norm[LABEL_COLUMN] = df_norm[LABEL_COLUMN].apply(normalize_label)
    df_norm = df_norm[df_norm[LABEL_COLUMN].isin(["normal", "benign", "malignant"])]

    crosstab = pd.crosstab(df_norm[SOURCE_COLUMN], df_norm[LABEL_COLUMN])
    crosstab_pct = pd.crosstab(df_norm[SOURCE_COLUMN], df_norm[LABEL_COLUMN], normalize="index") * 100

    print("\nRaw counts (source_dataset x classification):")
    print(crosstab)
    print("\nRow-normalized percentages (what % of each source's images are each class):")
    print(crosstab_pct.round(1))


def main():
    df = pd.read_csv(CSV_PATH)
    check_source_confound(df)


if __name__ == "__main__":
    main()