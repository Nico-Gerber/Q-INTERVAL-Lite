# Q-INTERVAL-Lite+ Risk Inference — Frontend Integration Guide

**For:** Q-INTERVAL-Lite+ frontend
**From:** Pasindu Pahasara
**Sprint:** 3 (Alpha release)

---

## 1. What's in the inside of this folder

Six files. 

| File | Size | Role |
|---|---|---|
| `cancer_v5_explainable.pth`     | ~170 MB | Cancer classifier (3-class Normal/Benign/Malignant) with Grad-CAM++ baked in |
| `density_v2_explainable.pth`    | ~170 MB | Density classifier (4-class A/B/C/D) with Grad-CAM++ baked in |
| `birads_v2_explainable.pth`     | ~170 MB | BIRADS classifier (5-class 1-5) with Grad-CAM++ baked in |
| `q_interval_explainable_models.py` | < 10 KB | Class definition required by `torch.load` to unpickle the bundles |
| `risk_inference_engine.py`      | < 20 KB | The pipeline wrapper — load once, call per patient |
| `README_FRONTEND_INTEGRATION.md` | this file | Usage guide |

---

## 2. Python dependencies

```bash
pip install torch torchvision opencv-python numpy pillow
```

No `pytorch-grad-cam` required — Grad-CAM++ is implemented inside the bundles.

---

## 3. The single API call

```python
from risk_inference_engine import RiskInferenceEngine



# Per patient request (any number of views from 1 to N)
result = engine.analyze_patient([
    {'image_path': '/uploads/scan_001.jpg', 'age': 55, 'view': 'CC',  'laterality': 'L', 'source': 'ddsm'},
    {'image_path': '/uploads/scan_002.jpg', 'age': 55, 'view': 'MLO', 'laterality': 'L', 'source': 'ddsm'},
    {'image_path': '/uploads/scan_003.jpg', 'age': 55, 'view': 'CC',  'laterality': 'R', 'source': 'ddsm'},
    {'image_path': '/uploads/scan_004.jpg', 'age': 55, 'view': 'MLO', 'laterality': 'R', 'source': 'ddsm'},
])
```

Return `result` as the JSON response — the frontend renders it.

---

## 4. Output schema (matches Sprint 2 contract)

The Sprint 2 frontend schema is preserved exactly — all the field names the
frontend already uses are unchanged. The only difference is that the values
are now driven by the Sprint 3 calibrated models. Sprint 3 also adds a few
**new fields** the frontend can adopt when ready (calibrated probability vectors,
Grad-CAM++ heatmap overlays, and a per-patient confidence number).

```python
{
    # --- Sprint 2 fields (unchanged names — drop-in replacement) ---
    'number_of_images'          : 4,
    'image_level_results'       : [
        {
            'image_path'            : '/uploads/scan_001.jpg',
            'predicted_cancer_class': 'Benign',
            'predicted_density'     : 'B',
            'predicted_birads'      : 4,
            'cnn_risk_score'        : 31.6,
            'density_risk_score'    : 50,
            'birads_risk_score'     : 75,
            'future_risk_score'     : 56.2,
            'risk_level'            : 'Medium Risk',
            'feedback'              : 'Some areas may need further review...',

            # --- Sprint 3 ADDITIVE fields (frontend can ignore until ready) ---
            'cancer_probabilities'  : {'Normal': 0.18, 'Benign': 0.72, 'Malignant': 0.10},
            'density_probabilities' : {'A': 0.05, 'B': 0.81, 'C': 0.12, 'D': 0.02},
            'birads_probabilities'  : {'1': 0.02, '2': 0.05, '3': 0.18, '4': 0.69, '5': 0.06},
            'heatmap_overlays'      : {
                'cancer_Normal'     : 'data:image/png;base64,...',
                'cancer_Benign'     : 'data:image/png;base64,...',
                'cancer_Malignant'  : 'data:image/png;base64,...',
                'density'           : 'data:image/png;base64,...',
                'birads'            : 'data:image/png;base64,...',
                'original'          : 'data:image/png;base64,...',
            },
        },
        # ... one entry per view ...
    ],
    'highest_density_risk_score': 100,
    'highest_birads_risk_score' : 75,
    'future_risk_score'         : 56.2,        # patient-level (max across views)
    'risk_level'                : 'Medium Risk',
    'feedback'                  : 'Some areas may need further review...',

    # --- Sprint 3 ADDITIVE fields at patient level ---
    'confidence'                : 87.2,         # 0-100; lower = views disagree more
    'pred_class'                : 'Benign',     # patient-level class
    'most_suspicious_index'     : 1,            # index into image_level_results
    'most_suspicious_view'      : '/uploads/scan_002.jpg',
}
```

### What the frontend can do with the new Sprint 3 fields

| New field | Suggested frontend use |
|---|---|
| `heatmap_overlays.cancer_Malignant` | Show as a heatmap overlay on the most-suspicious view — *"this region is what's driving the cancer call"* |
| `heatmap_overlays.cancer_Normal` / `cancer_Benign` | Comparison heatmaps — *"and these regions look more Normal / Benign"* |
| `heatmap_overlays.density` and `.birads` | Per-task explainability for the BIRADS and Density scores |
| `confidence` | Show a "confidence: 87%" indicator next to the risk score |
| `most_suspicious_view` | Highlight which view to show first when displaying the patient |
| `cancer_probabilities` | Render the full probability distribution rather than just the predicted class |

All Sprint 2 fields keep working exactly as before — the frontend doesn't have
to touch them if no one has bandwidth.

---

## 5. Metadata requirements

Every image needs metadata. If the frontend doesn't have a value, use these defaults:

| Field | Default | Acceptable values |
|---|---|---|
| `age` | `None` (becomes "missing" bucket) | float, years |
| `view` | `'CC'` | `'CC'`, `'MLO'`, anything else → "missing" |
| `laterality` | `'L'` | `'L'`, `'R'` |
| `source` | `'ddsm'` | `'ddsm'`, `'cmmd'`, `'inbreast'`, `'kau-bcmd'`, `'dmid'` |

For an uploaded mammogram with no metadata, sensible defaults are
`age=None, view='CC', laterality='L', source='ddsm'`. The models still
produce sensible predictions — calibrated probabilities don't break on
missing metadata, they just lose a bit of accuracy.

---

## 6. Risk formula reference

```
CNN risk      = P(Malignant) * 100 + P(Benign) * 30        [calibrated ensemble probs]
Density risk  = {A:25, B:50, C:75, D:100}[argmax]          [calibrated density v2 probs]
BIRADS risk   = {1:0, 2:25, 3:50, 4:75, 5:100}[argmax]     [calibrated BIRADS v2 probs]
Image risk    = 0.60 * CNN + 0.25 * BIRADS + 0.15 * Density   (clipped to [0, 100])

Patient risk  = max(image risks across views)              [clinical max-severity]
Confidence    = 100 - 2 * std(image risks across views)    (clipped to [0, 100])
Pred class    = max-severity over views using calibrated cancer probabilities

Risk level (same thresholds as Sprint 2):
   >= 67   -> High Risk
   >= 34   -> Medium Risk
    < 34   -> Low Risk
```

---

## 7.  example for the backend integration test

```python
from risk_inference_engine import RiskInferenceEngine

engine = RiskInferenceEngine.load_from_folder('backend/models/')

# Single test image (one-view patient)
result = engine.analyze_patient([{
    'image_path': 'tests/sample_mammogram.jpg',
    'age': 55,
    'view': 'CC',
    'laterality': 'L',
    'source': 'ddsm',
}])

print(f"Patient risk : {result['future_risk_score']:.1f}")
print(f"Risk level   : {result['risk_level']}")
print(f"Confidence   : {result['confidence']:.1f}")
print(f"Predicted    : {result['pred_class']}")
print(f"Feedback     : {result['feedback']}")
print(f"# views      : {result['number_of_images']}")
print(f"Per-image    : {[r['risk_level'] for r in result['image_level_results']]}")
```

If this prints without errors, the backend integration is working.

