"""Audit deterministic breast masking before masked feature extraction."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from PIL import Image
from scipy import ndimage


WORKSPACE = Path(__file__).resolve().parents[3]
SOURCE_ROOT = WORKSPACE / "experiments/v2c_mammoclip_b5"
OUTPUT_ROOT = WORKSPACE / "experiments/v2d_mammoclip_b5_masked"
INPUT_DIR = SOURCE_ROOT / "explanations/vlm_inputs"
AUDIT_DIR = OUTPUT_ROOT / "audit"
PREVIEW_DIR = AUDIT_DIR / "previews"


def create_breast_mask(image):
    image = np.asarray(image, dtype=np.float32)
    background = float(np.percentile(image, 50))
    tissue_level = float(np.percentile(image, 95))

    threshold = max(
        1.0,
        background
        + 0.10 * (tissue_level - background),
    )
    foreground = image > threshold

    labels, component_count = ndimage.label(
        foreground,
        structure=np.ones((3, 3), dtype=np.uint8),
    )
    component_sizes = np.bincount(labels.ravel())
    if len(component_sizes) <= 1:
        raise RuntimeError("No foreground component was found")

    component_sizes[0] = 0
    breast_label = int(component_sizes.argmax())
    mask = labels == breast_label
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_closing(mask, iterations=2)
    mask = ndimage.binary_dilation(mask, iterations=4)

    return mask.astype(bool), threshold, component_count


def load_records():
    records = []
    for json_path in sorted(INPUT_DIR.glob("*.json")):
        data = json.loads(json_path.read_text(encoding="utf-8"))
        for exam in data["examinations"]:
            for view in exam["views"]:
                if view["available"]:
                    records.append({
                        "case_id": data["case_id"],
                        "patient_index": data["patient_index"],
                        "sequence_position": exam["sequence_position"],
                        "view_slot": view["view_slot"],
                        "view_attention_weight": view[
                            "view_attention_weight"
                        ],
                        "image_path": view["image_path"],
                    })
    return pd.DataFrame(records)


def audit_images(records):
    results = []
    for row in records.itertuples(index=False):
        with Image.open(row.image_path) as source:
            image = np.asarray(source.convert("L"), dtype=np.uint8)

        mask, threshold, component_count = create_breast_mask(image)
        area_fraction = float(mask.mean())
        cleaned = np.where(mask, image, 0).astype(np.uint8)
        removed_nonzero = int(
            np.count_nonzero(image) - np.count_nonzero(cleaned)
        )

        if not 0.03 <= area_fraction <= 0.95:
            raise RuntimeError(
                f"Implausible mask area {area_fraction:.4f}: "
                f"{row.image_path}"
            )

        results.append({
            **row._asdict(),
            "threshold": threshold,
            "connected_components": component_count,
            "breast_mask_area_fraction": area_fraction,
            "removed_nonzero_pixels": removed_nonzero,
        })

    return pd.DataFrame(results)


def create_previews(records):
    for case_id, case_records in records.groupby("case_id", sort=True):
        chosen = (
            case_records.sort_values(
                ["sequence_position", "view_attention_weight"],
                ascending=[True, False],
            )
            .groupby("sequence_position", as_index=False)
            .head(1)
            .sort_values("sequence_position")
        )

        rows = len(chosen)
        figure, axes = plt.subplots(
            rows,
            3,
            figsize=(9, 3.1 * rows),
            squeeze=False,
            constrained_layout=True,
        )

        for plot_row, record in enumerate(
            chosen.itertuples(index=False)
        ):
            with Image.open(record.image_path) as source:
                image = np.asarray(source.convert("L"), dtype=np.uint8)

            mask, _, _ = create_breast_mask(image)
            cleaned = np.where(mask, image, 0)

            axes[plot_row, 0].imshow(image, cmap="gray")
            axes[plot_row, 0].set_title(
                f"Original | exam {record.sequence_position} | "
                f"{record.view_slot}"
            )
            axes[plot_row, 1].imshow(image, cmap="gray")
            axes[plot_row, 1].imshow(
                mask, cmap="Reds", alpha=0.30, vmin=0, vmax=1
            )
            axes[plot_row, 1].set_title("Detected breast mask")
            axes[plot_row, 2].imshow(cleaned, cmap="gray")
            axes[plot_row, 2].set_title("Cleaned image")

            for axis in axes[plot_row]:
                axis.set_xticks([])
                axis.set_yticks([])

        figure.suptitle(f"Breast-mask audit | {case_id}", fontsize=14)
        output = PREVIEW_DIR / f"{case_id}_mask_audit.png"
        figure.savefig(output, dpi=160, facecolor="white")
        plt.close(figure)
        print("Wrote:", output)


def main():
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    records = load_records()
    if records.empty:
        raise RuntimeError("No explanation images were found")

    audit = audit_images(records)
    audit_path = AUDIT_DIR / "selected_case_mask_audit.csv"
    audit.to_csv(audit_path, index=False)
    create_previews(records)

    print("Images audited:", len(audit))
    print(
        "Mask area range:",
        round(float(audit["breast_mask_area_fraction"].min()), 4),
        "to",
        round(float(audit["breast_mask_area_fraction"].max()), 4),
    )
    print("Wrote:", audit_path)
    print("SELECTED-CASE BREAST MASK AUDIT: PASS")


if __name__ == "__main__":
    main()
