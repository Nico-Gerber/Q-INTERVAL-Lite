# Q-Interval-Lite+ V2C frontend bundle

This directory contains the drop-in `run.py` adapter for the shared future-risk
router. Add these two trained artifacts under `models/` before integration:

```text
models/v2c_model.pt
models/resnet50-11ad3fa6.pth
```

The adapter exposes only:

- `initialise()`
- `health()`
- `run_inference(model_input)`

It accepts two to five dated examinations with `L-CC`, `R-CC`, `L-MLO`, and
`R-MLO` image bytes. It returns the exact shared contract containing monotonic
one-to-five-year cumulative risks in percentage points, a provisional research
risk level, and examination contribution percentages.

The provisional five-year risk bands are:

- low: below 5%
- moderate: 5% to below 20%
- high: 20% or above

Examination contributions use leave-one-image-out ablation. Absolute changes
across all five horizons are aggregated within each examination and normalised
to 100%. They describe model sensitivity, not clinical causation.

The model is an experimental research system and is not for clinical use.
