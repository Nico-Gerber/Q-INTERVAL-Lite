"""Compare V2C raw-image inference with its saved validation prediction."""

import json
from pathlib import Path

import numpy as np
import pandas as pd


input_data = json.loads(
    Path("reports/v2c_frontend_smoke_input.json").read_text()
)
output_data = json.loads(
    Path("reports/v2c_frontend_smoke_output_16340713.json").read_text()
)

image_paths = {
    path
    for session in input_data["sessions"]
    for path in session["images"].values()
    if path
}

image_metadata = pd.read_csv("features/resnet50_feature_metadata.csv")
matched = image_metadata.loc[image_metadata["image_path"].isin(image_paths)]

patient_ids = matched["empi_anon"].unique()
splits = matched["split"].unique()

assert len(patient_ids) == 1
assert splits.tolist() == ["validation"]

patient_id = patient_ids[0]

sequence_metadata = pd.read_csv("features/patient_sequence_metadata.csv")
patient_row = sequence_metadata.loc[
    sequence_metadata["empi_anon"].astype(str) == str(patient_id)
]

assert len(patient_row) == 1
patient_index = int(patient_row.iloc[0]["patient_index"])

predictions = pd.read_csv(
    "outputs/predictions/v2c_none_seed42_job16340024_validation.csv"
)
prediction_row = predictions.loc[predictions["patient_index"] == patient_index]

assert len(prediction_row) == 1
prediction_row = prediction_row.iloc[0]

expected = np.asarray(
    [
        prediction_row[f"predicted_risk_{year}yr"] * 100
        for year in range(1, 6)
    ]
)
actual = np.asarray(
    [output_data["yearly_risk"][f"{year}_year"] for year in range(1, 6)]
)

difference = np.abs(expected - actual)

print("Patient index:", patient_index)
print("Saved validation risks:", expected.tolist())
print("Frontend risks:", actual.tolist())
print("Absolute differences:", difference.tolist())
print("Maximum difference:", float(difference.max()))

assert difference.max() < 0.01
print("TRAINING-INFERENCE PARITY: PASS")
