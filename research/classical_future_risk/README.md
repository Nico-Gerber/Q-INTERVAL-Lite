# Classical Longitudinal Future-Risk Research

This directory preserves the development history and reproducibility evidence
for the Q-Interval-Lite+ classical longitudinal breast-cancer future-risk
model.

The research predicts cumulative breast-cancer risk across one-to-five-year
horizons from up to five chronological mammography examinations.

## Final research model

The validation-selected final model is:

- image encoder: Mammo-CLIP EfficientNet-B5;
- model: V2D spatial multiview longitudinal hazard LSTM;
- selected seed: 2026;
- supported examinations: two to five;
- supported views: L-CC, R-CC, L-MLO, and R-MLO;
- output: five discrete yearly hazards and monotonic cumulative risks.

The selected checkpoint was frozen using validation data before one-time
evaluation on the untouched test split.

## Final repaired cohort

- processed mammograms: 19,054;
- examinations: 4,942;
- patients: 2,230;
- five-year cancer events: 153;
- training patients: 1,566;
- validation patients: 334;
- test patients: 330.

## Final untouched test results

- unweighted masked NLL: 0.040948;
- mean AUROC: 0.868413;
- mean AUPRC: 0.642404;
- mean Brier score: 0.026016;
- cumulative-risk monotonicity violations: 0.

## Research progression

| Directory | Purpose |
|---|---|
| `baseline/` | Original ResNet50 longitudinal LSTM pipeline and audits |
| `hazard_models/` | Discrete hazard targets, temporal features, and V2A/V2B/V2C variants |
| `repaired_cohort/` | Image-derived cohort rebuild after metadata restoration |
| `spatial_v2d/` | ResNet50 spatial-attention V2D architecture experiments |
| `mammoclip_v2d/` | Mammo-CLIP global V2C and spatial V2D experiments |
| `image_cleaning_ablations/` | Breast masking and acquisition-label cleaning experiments |
| `final_evaluation/` | Frozen one-time untouched test evaluation |
| `vlm_explanations/` | Guarded and human-reviewed VLM explanation workflow |

## Data and artifact policy

This Git archive contains source code, job definitions, configurations,
aggregate reports, and integrity records.

It intentionally excludes:

- mammograms and other clinical images;
- patient-level metadata and predictions;
- feature and sequence arrays;
- spatial feature tensors;
- model checkpoints and pretrained weights;
- generated VLM case inputs and outputs;
- virtual environments;
- credentials and environment files.

Large model artifacts remain in controlled project storage and require a
separate deployment-artifact strategy.

## Deployment separation

The research archive is not imported directly by the application backend.
Deployable future-risk inference belongs under:

```text
backend/routers/future_risk_classical/