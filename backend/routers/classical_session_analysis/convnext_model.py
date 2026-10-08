"""ConvNeXt V2 three-class classifier: architecture and bundle loader.

The architecture is copied from `ConvNeXtV2H_Full_Training_Colab.ipynb` cell 22. Its
docstring there explains the one subtlety worth repeating: `head_from_map` reuses
timm's own `forward_head`, which applies the PRETRAINED head LayerNorm after pooling.
Skipping that normalisation would be a different architecture from the one the weights
were trained for, and the state dict would load without complaint.

ConvNeXt V2 normalises with LayerNorm and GRN. Neither keeps running statistics, so
there is no BatchNorm to hold in eval mode -- `.eval()` here only disables drop-path,
which is already inert at inference.
"""

from __future__ import annotations

import importlib.util
import logging
import os
from typing import Any, Dict, Tuple

import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

EXPECTED_FORMAT = 'convnextv2h-classical-bundle/1'
EXPECTED_CLASSES = ['Normal', 'Benign', 'Malignant']   # the index IS the label


class BundleError(RuntimeError):
    """The bundle, the contract module, or the pair of them is not servable."""


class ConvNeXt3C(nn.Module):
    """ConvNeXt V2 encoder -> pooled+normed feature -> 3-class linear head."""

    def __init__(self, encoder: nn.Module, feat_dim: int, head_dropout: float = 0.0):
        super().__init__()
        self.backbone = encoder
        self.head_dropout = float(head_dropout)
        self.dropout = (nn.Dropout(self.head_dropout)
                        if self.head_dropout > 0 else nn.Identity())
        self.head = nn.Linear(feat_dim, 3)

    def feature_map(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone.forward_features(x)

    def head_from_map(self, feat: torch.Tensor) -> torch.Tensor:
        return self.head(self.dropout(self.backbone.forward_head(feat)))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head_from_map(self.feature_map(x))


def load_contract_module(path: str):
    """Import the generated `model_input_v3.py` by file path.

    Imported by path rather than by module name on purpose: hardcoding a name risks
    silently importing a stale module from an earlier contract version, and every check
    below would then pass against the wrong file. The notebook's export cell guards the
    same way.
    """
    if not os.path.isfile(path):
        raise BundleError(
            f'contract module not found at {path}. Copy `model_input_v3.py` from the '
            'training run\'s export/ directory next to the bundle. It is generated code '
            'whose SHA-256 is recorded in the bundle; do not retype or edit it.')
    spec = importlib.util.spec_from_file_location('convnext_model_input', path)
    if spec is None or spec.loader is None:
        raise BundleError(f'could not load the contract module at {path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_bundle(bundle_path: str, contract_path: str,
                device: str = 'cpu') -> Tuple[ConvNeXt3C, Any, Dict[str, Any]]:
    """Build the model, load the trained weights, and verify bundle/module agreement.

    Returns (model in eval mode with grad disabled, contract module, bundle metadata
    without the state dict).
    """
    import timm                                        # imported late: heavy

    if not os.path.isfile(bundle_path):
        raise BundleError(f'bundle not found at {bundle_path}')

    contract = load_contract_module(contract_path)
    bundle = torch.load(bundle_path, map_location='cpu', weights_only=False)

    # --- the module's own verifier: format, model-input hash, provenance ------------
    # It raises ContractError if the bundle was trained under a different input
    # geometry than this module implements. Serving one through the other would change
    # the input silently, which is the whole reason the hash is recorded.
    contract.verify_bundle(bundle)

    if bundle.get('format') != EXPECTED_FORMAT:
        raise BundleError(f'bundle format {bundle.get("format")!r} != {EXPECTED_FORMAT!r}')
    if list(bundle.get('class_names', [])) != EXPECTED_CLASSES:
        raise BundleError(f'bundle class order {bundle.get("class_names")} != '
                          f'{EXPECTED_CLASSES}. A different order would mislabel every '
                          'prediction.')
    if list(contract.CLASS_NAMES) != EXPECTED_CLASSES:
        raise BundleError(f'contract module class order {list(contract.CLASS_NAMES)} != '
                          f'{EXPECTED_CLASSES}')

    arch = bundle['architecture']
    encoder_arch = str(arch['encoder'])
    feat_dim = int(arch['feat_dim'])
    drop_path = float(arch.get('drop_path_rate', 0.0))
    head_dropout = float(bundle['training']['spec'].get('head_dropout', 0.0))

    # pretrained=False: the trained state dict is loaded below, so downloading ImageNet
    # weights here would be a pointless multi-GB fetch on every cold start. drop_path is
    # passed anyway so the built module matches the training build exactly; stochastic
    # depth is inert in eval mode.
    encoder = timm.create_model(encoder_arch, pretrained=False, num_classes=0,
                                global_pool='avg', drop_path_rate=drop_path)
    model = ConvNeXt3C(encoder, feat_dim, head_dropout=head_dropout)

    # strict=True raises on any mismatch. The returned lists are checked as well, so a
    # future relaxation to strict=False cannot pass silently.
    incompatible = model.load_state_dict(bundle['state_dict'], strict=True)
    if incompatible.missing_keys or incompatible.unexpected_keys:
        raise BundleError(f'state dict mismatch: missing={incompatible.missing_keys} '
                          f'unexpected={incompatible.unexpected_keys}')

    n_params = int(sum(p.numel() for p in model.parameters()))
    logger.info('ConvNeXt: %s, %d parameters, feat_dim %d, input %dx%d',
                encoder_arch, n_params, feat_dim, contract.MODEL_H, contract.MODEL_W)

    model.eval()
    for p in model.parameters():
        p.requires_grad_(False)
    if hasattr(model.backbone, 'set_grad_checkpointing'):
        model.backbone.set_grad_checkpointing(False)   # inference: nothing to recompute
    model.to(device)

    temperature = float(bundle['temperature'])
    if not (temperature > 0):
        raise BundleError(f'bundle temperature {temperature} is not positive')

    meta = {
        'format': bundle['format'],
        'encoder': encoder_arch,
        'feat_dim': feat_dim,
        'parameters': n_params,
        'model_h': int(contract.MODEL_H),
        'model_w': int(contract.MODEL_W),
        'class_names': list(bundle['class_names']),
        'temperature': temperature,
        'calibrated': bool(bundle.get('calibrated', False)),
        'model_input_hash': bundle['model_input']['hash'],
        'inference_module_sha256': bundle['inference_module']['sha256'],
        'trial_id': bundle['training']['trial_id'],
        'selected_epoch': bundle['training']['selected_epoch'],
        'stop_reasons': bundle['training']['stop_reasons'],
        'intended_use': bundle['intended_use'],
    }
    del bundle
    return model, contract, meta


@torch.inference_mode()
def classify(model: ConvNeXt3C, contract, prepared_png: bytes,
             temperature: float, device: str = 'cpu') -> Dict[str, Any]:
    """One prepared PNG -> calibrated three-class probabilities.

    `prepare_prepared` performs the geometry check and the single normalisation. It is
    the only supported entry point of the contract module; `prepare_raw` raises by
    design, which is why prep_v2_bridge produces a contract-sized PNG first.

    Temperature comes from the bundle and is never refitted here.
    """
    x = contract.prepare_prepared(prepared_png)           # (3, H, W) float32, normalised
    tensor = torch.from_numpy(np.ascontiguousarray(x)).unsqueeze(0).to(device)

    logits = model(tensor).float().cpu().numpy()[0]
    del tensor

    raw = contract.calibrated_probabilities(logits, 1.0)
    cal = contract.calibrated_probabilities(logits, temperature)
    names = list(contract.CLASS_NAMES)

    if not np.isfinite(cal).all():
        raise BundleError('non-finite probabilities from the model')

    return {
        'logits': [float(v) for v in logits],
        'probabilities': {n: float(cal[i]) for i, n in enumerate(names)},
        'probabilities_uncalibrated': {n: float(raw[i]) for i, n in enumerate(names)},
        'predicted_class': names[int(np.argmax(cal))],
        'temperature': float(temperature),
    }
