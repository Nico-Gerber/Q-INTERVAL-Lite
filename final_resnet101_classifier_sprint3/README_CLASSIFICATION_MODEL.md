# Q-INTERVAL-Lite+ Cancer Classification Model — Integration Guide

**For:** Anyone needing the cancer classifier alone (without the full risk-inference pipeline)
**From:** Pasindu Pahasara
**Sprint:** 3 (Alpha release)
**Model:** v5 — ResNet-101 + clinical metadata embeddings + Grad-CAM++ (baked in)

---

## 1. What's in this package

Three files. Drop them into your project folder:

| File | Size | Role |
|---|---|---|
| `cancer_v5_explainable.pth`        | ~165 MB | The cancer classifier — model weights + Grad-CAM++ method baked in as one object |
| `q_interval_explainable_models.py` | < 10 KB | Class definition required by `torch.load` to unpickle the bundle |
| `README_CLASSIFICATION_MODEL.md`   | this file | Usage guide |

---

## 2. What the model does

A 3-class breast cancer classifier trained on the Mammo-Bench benchmark:

- **Input:** a mammogram image (PNG / JPG) + minimal metadata (age, view, laterality, source dataset)
- **Output:** calibrated probabilities for **Normal / Benign / Malignant**, plus a Grad-CAM++ heatmap for *each* of the three classes (so you can see *why* the model is leaning toward each diagnosis)

**Test metrics on a patient-level Mammo-Bench split (2,821 images, 879 patients):**

| Metric | Value |
|---|---|
| Accuracy | 0.7185 |
| Macro F1 | 0.7216 |
| Malignant recall | 0.7134 |
| Macro ROC-AUC | **0.8791** (best single model in Sprint 3) |
| Expected Calibration Error (ECE) | **0.024** (excellent — probabilities are trustworthy) |

The calibration is the standout — when the model says "0.85 probability Malignant," that means roughly 85% of those predictions really are malignant on held-out data.

---

## 3. Python dependencies

```bash
pip install torch torchvision opencv-python numpy pillow
```

No `pytorch-grad-cam` required — Grad-CAM++ is implemented inside the bundle.

---

## 4. Usage — one call returns everything

```python
import torch
import cv2
from q_interval_explainable_models import QIntervalExplainable

# Load once at startup
model = torch.load('cancer_v5_explainable.pth', weights_only=False).eval()
model = model.cuda()   # or .cpu() if no GPU

# Per image
img = cv2.imread('mammogram.jpg')
result = model.explain(
    img,
    age=55,
    view='CC',          # 'CC' or 'MLO'
    laterality='L',     # 'L' or 'R'
    source='ddsm',      # 'ddsm', 'cmmd', 'inbreast', 'kau-bcmd', 'dmid'
)

print(result['pred_class'])      # e.g. 'Malignant'
print(result['pred_conf'])       # e.g. 0.82 (calibrated)
print(result['probabilities'])   # {'Normal': 0.07, 'Benign': 0.11, 'Malignant': 0.82}
print(result['overlays'].keys()) # dict with 3 base64 PNGs: 'Normal', 'Benign', 'Malignant'
```

---

## 5. Output schema

```python
{
    'task'           : 'cancer',
    'pred_class'     : 'Malignant',           # 'Normal' | 'Benign' | 'Malignant'
    'pred_conf'      : 0.82,                  # calibrated probability of the predicted class
    'probabilities'  : {                      # full calibrated probability vector
        'Normal'   : 0.07,
        'Benign'   : 0.11,
        'Malignant': 0.82,
    },
    'overlays'       : {                      # base64 PNG data URLs - one per class
        'Normal'   : 'data:image/png;base64,...',
        'Benign'   : 'data:image/png;base64,...',
        'Malignant': 'data:image/png;base64,...',
    },
    'original_base64': 'data:image/png;base64,...',   # the resized input image for side-by-side display
    'input_size'     : 512,
}
```

The three `overlays` are class-targeted Grad-CAM++ heatmaps. Showing all three side-by-side answers *"where is the evidence for each diagnosis?"* — far more informative than a single heatmap on the predicted class.

---

## 6. Metadata fallback values

If the source image doesn't have metadata, use these defaults — the model still produces sensible predictions, just with slightly less precision:

| Field | Default | Acceptable values |
|---|---|---|
| `age` | `None` (treated as "missing") | float, years |
| `view` | `'CC'` | `'CC'`, `'MLO'`, anything else → "missing" |
| `laterality` | `'L'` | `'L'`, `'R'` |
| `source` | `'ddsm'` | `'ddsm'`, `'cmmd'`, `'inbreast'`, `'kau-bcmd'`, `'dmid'` |

---

## 7. Hardware

- GPU inference (T4 / V100 / A100): ~1.5 s per image (forward + 3 Grad-CAM++ passes)
- CPU inference: ~6–10 s per image

A GPU is recommended for any interactive demo.

---

## 8. Quick test

```python
import torch, cv2
from q_interval_explainable_models import QIntervalExplainable

model = torch.load('cancer_v5_explainable.pth', weights_only=False).eval().cuda()
img = cv2.imread('your_test_image.jpg')
r = model.explain(img, age=55, view='CC', laterality='L', source='ddsm')

print(f"Predicted: {r['pred_class']} ({100*r['pred_conf']:.1f}%)")
print(f"Probabilities: {r['probabilities']}")
print(f"Overlays available for: {list(r['overlays'].keys())}")
```

If this runs without errors and prints sensible probabilities, the model is working.

---

## 9. Architecture details (for documentation)

- **Backbone:** ResNet-101, ImageNet pretrained, fine-tuned on Mammo-Bench
- **Metadata embeddings:** age (bucketed into 8 categories), view (CC/MLO), laterality (L/R), source dataset (5 sources)
- **Input size:** 512×512
- **Normalisation:** ImageNet (mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225])
- **Calibration:** Temperature scaling (T ≈ 1.55) fitted on validation set via L-BFGS
- **Grad-CAM++:** implemented natively (no external pytorch-grad-cam dependency); target layer = `backbone.layer4[-1]`; magma colormap, 35% alpha, top-10% threshold

---

## 10. Limitations

- **Patient-level evaluation only.** Published Mammo-Bench numbers (78.8%) are from an image-level split; under stricter patient-level evaluation our 0.7185 is competitive with the literature ceiling for this task framing.
- **CDD-CESM filtered out.** Model is trained for standard digital and digitised-film mammography only; not for contrast-enhanced spectral mammography.
- **Research prototype.** Not clinically validated. Not for diagnostic use.
