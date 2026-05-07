# Improved ResNet-50 — Sprint 2 Mammogram Classifier

This branch contains the Sprint 2 final classification model for the Q-INTERVAL-Lite+ project. The model is a fine-tuned ResNet-50 with a regularised classifier head, trained with progressive unfreezing and discriminative learning rates on the Mammo-Bench dataset.

## What's in this branch

| File | Description |
|---|---|
| `Memmo_Final_v2.ipynb` | Full training and inference notebook (22 sections, all steps documented) |
| `final_model_bundle.pth` | Recommended file for inference. Bundle containing model weights, calibration temperature, normalization stats, input size, and class names |
| `best_restnet50_5_mammobench.pth` | Raw model state dict only (alternative — use the bundle above instead) |

## Final test metrics

| Metric | Value |
|---|---|
| Accuracy | 0.70 |
| Macro F1 | 0.70 |
| Malignant recall (sensitivity) | 0.74 |
| Malignant specificity | 0.78 |
| Macro ROC-AUC | 0.86 |
| ECE (calibrated) | 0.029 |

## Key changes from Sprint 1

- **Input size**: 384 × 384 (was 224 × 224)
- **Normalization**: Mammo-Bench-specific mean/std, stored in the bundle (was ImageNet defaults)
- **Classifier head**: `Dropout → Linear(2048, 256) → ReLU → Dropout → Linear(256, 3)` (was a single linear layer)
- **Image read**: BGR → RGB conversion required (use OpenCV or convert from PIL)
- **Calibrated probabilities**: divide logits by the stored `temperature` before softmax for properly calibrated outputs

## Loading the model

```python
import torch
import torch.nn as nn
from torchvision import models

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load the bundle
bundle = torch.load("final_model_bundle.pth", map_location=device)

# Rebuild the model architecture (must match what was saved)
model = models.resnet50()
model.fc = nn.Sequential(
    nn.Dropout(0.3),
    nn.Linear(2048, 256),
    nn.ReLU(inplace=True),
    nn.Dropout(0.3),
    nn.Linear(256, 3),
)
model.load_state_dict(bundle['model_state_dict'])
model.to(device)
model.eval()

# Configuration values from the bundle
MEAN        = bundle['mean']           # list of 3 floats, replaces ImageNet mean
STD         = bundle['std']            # list of 3 floats, replaces ImageNet std
INPUT_SIZE  = bundle['input_size']     # 384
TEMPERATURE = bundle['temperature']    # used for calibration before softmax
CLASS_NAMES = bundle['class_names']    # ['Normal', 'Benign', 'Malignant']
```

## Preprocessing for a single image

```python
import cv2
import numpy as np
import torch

def preprocess(image_path):
    image = cv2.imread(image_path)                       # BGR
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)       # RGB
    image = cv2.resize(image, (INPUT_SIZE, INPUT_SIZE))
    image = image.astype(np.float32) / 255.0
    image = (image - np.array(MEAN)) / np.array(STD)
    image = np.transpose(image, (2, 0, 1))               # HWC → CHW
    image = torch.tensor(image, dtype=torch.float32).unsqueeze(0).to(device)
    return image
```

## Inference (single image)

```python
def predict(image_path):
    image = preprocess(image_path)
    with torch.no_grad():
        logits = model(image)
        # Apply calibration: divide logits by temperature before softmax
        probs = torch.softmax(logits / TEMPERATURE, dim=1).cpu().numpy()[0]

    pred_idx = int(np.argmax(probs))
    return {
        'predicted_class': CLASS_NAMES[pred_idx],
        'probabilities': {
            'Normal':    float(probs[0]),
            'Benign':    float(probs[1]),
            'Malignant': float(probs[2]),
        },
    }
```

Example output:

```json
{
  "predicted_class": "Malignant",
  "probabilities": {
    "Normal":    0.12,
    "Benign":    0.21,
    "Malignant": 0.67
  }
}
```

## Grad-CAM++ heatmap (optional)

The notebook includes a `make_gradcam_overlay` function for generating visual heatmap overlays. The library `grad-cam` is required:

```bash
pip install grad-cam
```

Usage pattern:

```python
from pytorch_grad_cam import GradCAMPlusPlus
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget

cam = GradCAMPlusPlus(model=model, target_layers=[model.layer4[-1]])

def make_overlay(image_rgb_resized, target_class, alpha=0.5):
    """image_rgb_resized: HxWx3 uint8 numpy array, already resized to 384x384"""
    image_norm = image_rgb_resized.astype(np.float32) / 255.0
    image_tensor = preprocess_for_cam(image_rgb_resized)   # same as preprocess but no batch dim handling
    targets = [ClassifierOutputTarget(target_class)]
    grayscale_cam = cam(input_tensor=image_tensor, targets=targets)[0]
    overlay = show_cam_on_image(image_norm, grayscale_cam, use_rgb=True, image_weight=1 - alpha)
    return overlay
```

The overlay is a HxWx3 RGB numpy array suitable for displaying or returning from a FastAPI endpoint.

## Dependencies

```
torch
torchvision
opencv-python
numpy
grad-cam       # only if heatmap output is required
```

## Notes

- The `final_model_bundle.pth` file is approximately 94 MB. Make sure Git LFS is enabled on the repository, otherwise it will bloat the git history.
- The model was trained on ImageNet-pretrained ResNet-50 with progressive unfreezing of the head, then layer4, then layer3. Layers 1, 2, and the conv stem remain frozen.
- The temperature value is fitted on the validation set using L-BFGS to minimise NLL, following Guo et al. (ICML 2017).
- The model expects 3-channel RGB input even though mammograms are grayscale; OpenCV read + RGB conversion replicates the grayscale value across all 3 channels automatically.

