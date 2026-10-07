# Classical Longitudinal Future-Risk Baseline

This directory preserves the reproducible research pipeline used to construct
and evaluate the original classical longitudinal breast-cancer future-risk
baseline.

## Pipeline

The archived workflow covers:

1. corrected-label and screening-eligibility audits;
2. duplicate-view and follow-up censoring audits;
3. corrected examination manifest construction;
4. patient-level train, validation, and test splitting;
5. frozen ResNet50 image-feature extraction;
6. five-examination longitudinal sequence construction;
7. LSTM baseline training;
8. validation and test evaluation; and
9. frontend inference smoke testing.

## Directory layout

- `scripts/`: Python pipeline, training, evaluation, and audit programs.
- `slurm/`: OzSTAR batch-job definitions.
- `configs/`: feature-extraction and sequence-layout records.
- `reports/`: aggregate audit, training, and evaluation evidence.

## Excluded artifacts

Model checkpoints, image-feature arrays, patient-level inputs, mammograms,
virtual environments, and private data are intentionally excluded from Git.
The scripts retain the original OzSTAR paths as provenance and will require
path configuration before being run in another environment.

This research archive is separate from the deployable implementation under
`backend/routers/future_risk_classical/`.