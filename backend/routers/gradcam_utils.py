import io
import base64
import numpy as np
from PIL import Image
import cv2
import torch
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from pytorch_grad_cam.utils.image import show_cam_on_image


def get_target_layers(model):
   
    return [model.layer4[-1]]


def generate_gradcam(model, input_tensor, original_pil_image, target_class=None):

    target_layers = get_target_layers(model)
    cam = GradCAM(model=model, target_layers=target_layers)

    targets = [ClassifierOutputTarget(target_class)] if target_class is not None else None

    grayscale_cam = cam(input_tensor=input_tensor, targets=targets)
    grayscale_cam = grayscale_cam[0, :] 


    h, w = grayscale_cam.shape
    base_image = original_pil_image.convert("RGB").resize((w, h))
    base_array = np.array(base_image).astype(np.float32) / 255.0  


    overlay = show_cam_on_image(base_array, grayscale_cam, use_rgb=True)
    overlay_pil = Image.fromarray(overlay)


    heatmap_uint8 = np.uint8(255 * grayscale_cam)
    heatmap_color = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
  
    heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)
    heatmap_pil = Image.fromarray(heatmap_color)

    return overlay_pil, heatmap_pil, base_image, grayscale_cam


def pil_to_base64(pil_image, format="PNG"):
    """Convert a PIL image to a base64 string for JSON responses."""
    buf = io.BytesIO()
    pil_image.save(buf, format=format)
    return base64.b64encode(buf.getvalue()).decode("utf-8")