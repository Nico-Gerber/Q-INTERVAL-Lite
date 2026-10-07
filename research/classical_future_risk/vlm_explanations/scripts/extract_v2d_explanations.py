"""Extract grounded Mammo-CLIP V2D explanations for selected validation cases."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from v2d_mammoclip_components import (
    V2DSpatialDataset,
    V2DSpatialMultiviewHazardLSTM,
)


ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "checkpoints/final_selected_v2d_mammoclip_b5.pt"
SELECTION_FILE = ROOT / "explanations/selected_validation_cases.csv"
OUTPUT_DIR = ROOT / "explanations/vlm_inputs"
VIEW_SLOTS = ["L_CC", "R_CC", "L_MLO", "R_MLO"]


def tensor_list(tensor):
    return tensor.detach().cpu().float().tolist()


def prefix_risk_trajectory(model, inputs, temporal, length):
    trajectory = []
    previous = None

    for exam_count in range(1, length + 1):
        prefix_inputs = inputs.clone()
        prefix_temporal = temporal.clone()
        prefix_inputs[:, exam_count:] = 0
        prefix_temporal[:, exam_count:] = 0

        prefix_mask = torch.zeros(
            (1, 5), dtype=torch.float32
        )
        prefix_mask[:, :exam_count] = 1

        prediction = model.predict_risk(
            prefix_inputs,
            prefix_temporal,
            prefix_mask,
        )["cumulative_risk"][0]

        risk = tensor_list(prediction)
        change = None
        if previous is not None:
            change = [
                current - prior
                for current, prior in zip(risk, previous)
            ]

        trajectory.append({
            "examinations_included": exam_count,
            "cumulative_risk": risk,
            "change_from_previous_examination": change,
        })
        previous = risk

    return trajectory


def main():
    selection = pd.read_csv(SELECTION_FILE)
    patients = pd.read_csv(
        ROOT / "data/derived/hazard_target_metadata.csv"
    ).set_index("patient_index")
    exams = pd.read_csv(
        ROOT / "features/exam_feature_metadata.csv"
    )
    spatial = pd.read_csv(
        ROOT
        / "spatial_features/mammoclip_b5_spatial_metadata.csv"
    ).set_index("feature_index")

    dataset = V2DSpatialDataset(ROOT, ROOT, "validation")
    positions = {
        int(patient_index): position
        for position, patient_index in enumerate(
            dataset.patient_indices
        )
    }

    checkpoint = torch.load(CHECKPOINT, map_location="cpu")
    model = V2DSpatialMultiviewHazardLSTM()
    model.load_state_dict(
        checkpoint["model_state_dict"], strict=True
    )
    model.eval()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    written = []

    with torch.inference_mode():
        for selected in selection.itertuples(index=False):
            patient_index = int(selected.patient_index)
            sample = dataset[positions[patient_index]]
            inputs = sample["sequence_features"].unsqueeze(0)
            temporal = sample["temporal_features"].unsqueeze(0)
            sequence_mask = sample["sequence_mask"].unsqueeze(0)
            length = int(sequence_mask.sum().item())

            _, attention = model.encode_examinations(
                inputs, temporal, sequence_mask
            )
            prediction = model.predict_risk(
                inputs, temporal, sequence_mask
            )
            trajectory = prefix_risk_trajectory(
                model, inputs, temporal, length
            )

            patient = patients.loc[patient_index]
            patient_exams = exams[
                exams["empi_anon"] == patient["empi_anon"]
            ].sort_values("sequence_position")
            spatial_indices = np.asarray(
                dataset.spatial_indices[patient_index]
            )

            exam_records = []
            for exam_offset in range(length):
                exam = patient_exams.iloc[exam_offset]
                view_records = []

                for view_offset, view_slot in enumerate(VIEW_SLOTS):
                    feature_index = int(
                        spatial_indices[exam_offset, view_offset]
                    )
                    available = feature_index >= 0
                    view_record = {
                        "view_slot": view_slot,
                        "available": available,
                        "view_attention_weight": float(
                            attention["view"][
                                0, exam_offset, view_offset
                            ]
                        ),
                    }

                    if available:
                        grid = attention["spatial"][
                            0, exam_offset, view_offset
                        ].detach().cpu().float().numpy()
                        top_cell = np.unravel_index(
                            int(np.argmax(grid)), grid.shape
                        )
                        image = spatial.loc[feature_index]
                        view_record.update({
                            "feature_index": feature_index,
                            "image_path": str(image["image_path"]),
                            "spatial_attention_8x8": grid.tolist(),
                            "strongest_attention_cell": {
                                "row": int(top_cell[0]),
                                "column": int(top_cell[1]),
                                "weight": float(grid[top_cell]),
                            },
                        })

                    view_records.append(view_record)

                exam_records.append({
                    "sequence_position": exam_offset + 1,
                    "exam_date": str(exam["exam_date"]),
                    "is_anchor": bool(exam["is_anchor"]),
                    "recency_weight": float(temporal[0, exam_offset, 0]),
                    "years_since_previous_examination": float(
                        temporal[0, exam_offset, 1]
                    ),
                    "years_before_anchor": float(
                        temporal[0, exam_offset, 2]
                    ),
                    "risk_after_this_examination": trajectory[
                        exam_offset
                    ]["cumulative_risk"],
                    "risk_change_from_previous_examination": trajectory[
                        exam_offset
                    ]["change_from_previous_examination"],
                    "views": view_records,
                })

            record = {
                "schema_version": "1.0",
                "purpose": "research_explanation_not_diagnosis",
                "case_id": str(selected.selection_category),
                "patient_index": patient_index,
                "model": "Mammo-CLIP B5 V2D seed 2026",
                "sequence_length": length,
                "risk_horizons_years": [1, 2, 3, 4, 5],
                "predicted_hazards": tensor_list(
                    prediction["hazards"][0]
                ),
                "predicted_cumulative_risk": tensor_list(
                    prediction["cumulative_risk"][0]
                ),
                "examinations": exam_records,
                "interpretation_notes": [
                    "Attention weights describe model focus and are not causal evidence.",
                    "Risk changes are prefix-based prediction differences.",
                    "Ground-truth outcomes are intentionally excluded from VLM input.",
                ],
            }

            output = OUTPUT_DIR / (
                f"{selected.selection_category}_patient_{patient_index}.json"
            )
            output.write_text(
                json.dumps(record, indent=2) + "\n",
                encoding="utf-8",
            )
            written.append(output)
            print("Wrote:", output)

    if len(written) != len(selection):
        raise RuntimeError("Not every selected case was written")

    print("Cases:", len(written))
    print("MAMMOCLIP V2D EXPLANATION EXTRACTION: PASS")


if __name__ == "__main__":
    main()
