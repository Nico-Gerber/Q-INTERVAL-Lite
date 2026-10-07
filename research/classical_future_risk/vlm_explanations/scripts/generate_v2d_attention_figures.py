"""Create VLM-ready attention montages and longitudinal risk plots."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "explanations/vlm_inputs"
OUTPUT_DIR = ROOT / "explanations/figures"
HORIZONS = np.arange(1, 6)


def resize_attention(grid, image_size):
    attention = Image.fromarray(
        np.asarray(grid, dtype=np.float32), mode="F"
    )
    resampling = (
        Image.Resampling.BILINEAR
        if hasattr(Image, "Resampling")
        else Image.BILINEAR
    )
    return np.asarray(
        attention.resize(image_size, resample=resampling),
        dtype=np.float32,
    )


def generate_attention_montage(data):
    examinations = data["examinations"]
    rows = len(examinations)
    figure, axes = plt.subplots(
        rows,
        4,
        figsize=(12, 3.15 * rows),
        squeeze=False,
        constrained_layout=True,
    )

    available_grids = [
        np.asarray(view["spatial_attention_8x8"])
        for exam in examinations
        for view in exam["views"]
        if view["available"]
    ]
    colour_maximum = max(
        float(grid.max()) for grid in available_grids
    )

    heatmap_artist = None
    for row, exam in enumerate(examinations):
        risk_5yr = exam["risk_after_this_examination"][-1]

        for column, view in enumerate(exam["views"]):
            axis = axes[row, column]
            axis.set_xticks([])
            axis.set_yticks([])

            if not view["available"]:
                axis.set_facecolor("#eeeeee")
                axis.text(
                    0.5,
                    0.5,
                    "Missing view",
                    ha="center",
                    va="center",
                    fontsize=10,
                )
                axis.set_title(f"{view['view_slot']} | unavailable")
                continue

            with Image.open(view["image_path"]) as source:
                mammogram = np.asarray(
                    source.convert("L"), dtype=np.float32
                )

            attention = resize_attention(
                view["spatial_attention_8x8"],
                (mammogram.shape[1], mammogram.shape[0]),
            )

            axis.imshow(mammogram, cmap="gray")
            heatmap_artist = axis.imshow(
                attention,
                cmap="jet",
                alpha=0.45,
                vmin=0.0,
                vmax=colour_maximum,
            )
            axis.set_title(
                f"{view['view_slot']} | view weight "
                f"{view['view_attention_weight']:.3f}"
            )

        axes[row, 0].set_ylabel(
            f"Exam {exam['sequence_position']}\n"
            f"5-year risk {risk_5yr:.1%}\n"
            f"{exam['exam_date']}",
            fontsize=9,
        )

    figure.suptitle(
        f"Mammo-CLIP V2D attention | {data['case_id']} | "
        f"patient {data['patient_index']}",
        fontsize=14,
    )

    if heatmap_artist is not None:
        figure.colorbar(
            heatmap_artist,
            ax=axes,
            fraction=0.012,
            pad=0.01,
            label="Spatial attention weight",
        )

    output = OUTPUT_DIR / (
        f"{data['case_id']}_patient_{data['patient_index']}_attention.png"
    )
    figure.savefig(output, dpi=180, facecolor="white")
    plt.close(figure)
    return output


def generate_risk_plot(data):
    figure, axis = plt.subplots(
        figsize=(8.5, 5.2), constrained_layout=True
    )

    for exam in data["examinations"]:
        axis.plot(
            HORIZONS,
            np.asarray(exam["risk_after_this_examination"]) * 100,
            marker="o",
            linewidth=2,
            label=f"After exam {exam['sequence_position']}",
        )

    axis.set_title(
        f"Longitudinal cumulative risk | {data['case_id']} | "
        f"patient {data['patient_index']}"
    )
    axis.set_xlabel("Prediction horizon (years)")
    axis.set_ylabel("Cumulative predicted risk (%)")
    axis.set_xticks(HORIZONS)
    axis.set_ylim(bottom=0)
    axis.grid(alpha=0.25)
    axis.legend()

    output = OUTPUT_DIR / (
        f"{data['case_id']}_patient_{data['patient_index']}_risk.png"
    )
    figure.savefig(output, dpi=180, facecolor="white")
    plt.close(figure)
    return output


def main():
    inputs = sorted(INPUT_DIR.glob("*.json"))
    if len(inputs) != 5:
        raise RuntimeError(f"Expected 5 VLM inputs, found {len(inputs)}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = []

    for path in inputs:
        data = json.loads(path.read_text(encoding="utf-8"))
        outputs.append(generate_attention_montage(data))
        outputs.append(generate_risk_plot(data))

    for output in outputs:
        print("Wrote:", output)

    print("Figures:", len(outputs))
    print("MAMMOCLIP V2D ATTENTION FIGURES: PASS")


if __name__ == "__main__":
    main()
