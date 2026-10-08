"""Raw upload -> prep-v2 'baseline' prepared image at 2048x1024.

WHY THIS FILE EXISTS
--------------------
`model_input_v3.py` (the generated contract module shipped with the bundle) refuses
to resize. Its `adapt_geometry` accepts an image only if it is ALREADY
2048 x 1024, and `prepare_raw` raises NotImplementedError on purpose:

    "raw uploads are not supported by this contract. Breast cropping, windowing and
     padding have already been applied to the prepared images; repeating them here
     would be a second preprocessing pass and would not reproduce the training
     distribution. Run the prep-v1 pipeline first, then call prepare_prepared()."

The app receives raw uploads. So this module runs the FIRST pass -- the one the
Colab prepare session ran -- and hands `prepare_prepared()` a PNG that already
satisfies the contract. The contract module is never edited and never bypassed:
it still performs the geometry check and the single normalisation.

PROVENANCE
----------
Ported verbatim from `MammoBench_Preprocessing_v2_Colab.ipynb`, the notebook that
produced the prepared collection ConvNeXt V2-Huge was trained on:

    decode_raw -> crop_box/detect_breast_crop -> crop original pixels
               -> to_8bit -> resize_once -> pad_to_target -> PNG

Constants below are copied from that notebook's configuration cell. Change nothing
here without changing it there: the two must agree or the served images are drawn
from a different distribution than the training images.

UNVALIDATED PATH -- READ THIS
-----------------------------
The reported test metrics (accuracy 0.7228, macro-F1 0.7209, malignant AUC 0.8829)
were measured on prepared PNGs read straight off disk. They do NOT describe this
bridge. Sprint 4 measured a 0.0722 AUC effect from one preprocessing difference, so
this step is a first-order confounder, not a detail. Anything served through here
must be labelled as an unvalidated preprocessing path.

Depends only on numpy and OpenCV.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Tuple

import cv2
import numpy as np

__all__ = ['PREP_CONTRACT', 'PrepError', 'prepare_upload']

# --------------------------------------------------------------- prep-v2 constants
# From MammoBench_Preprocessing_v2_Colab.ipynb. Do not tune these here.
TARGET_H, TARGET_W = 2048, 1024

CROP_BG_PERCENTILE = 1.0
CROP_ABS_MARGIN = 0.02
CROP_REL_FRAC = 0.05
CROP_FAINT_FACTOR = 0.50
CROP_MIN_AREA_FRAC = 0.02
CROP_ANNOT_SAT = 0.98
CROP_ANNOT_MAX_AREA = 0.02
CROP_RIVAL_RATIO = 0.50
CROP_FAINT_TOL = 0.005
CROP_MARGIN_FRAC = 0.03
CROP_TIGHT_FRAC = 0.98
CROP_DETECT_MAX_SIDE = 1024
NATIVE_UPSCALE_LIMIT = 1.0

PREP_VERSION = 'prep-v2'
PREPARED_VARIANT = 'baseline'          # NOT the CLAHE variant; the model consumes this one

PREP_CONTRACT: Dict[str, Any] = {
    'name': 'prep-v2-upload-bridge',
    'prep_version': PREP_VERSION,
    'variant': PREPARED_VARIANT,
    'target_h': TARGET_H,
    'target_w': TARGET_W,
    'clahe': False,
    'pipeline': ['decode_unchanged', 'detect_breast_crop', 'crop_original_pixels',
                 'to_8bit', 'resize_once_proportional', 'pad_to_target_centred',
                 'png_encode'],
    'pad_value': 0,
    'validated': False,
    'validation_note': ('the published test metrics were measured on prepared PNGs read '
                        'from disk, not on images produced by this bridge'),
    'refuses': ['16-bit input (no bit-depth container policy exists for app uploads)',
                'genuinely coloured images',
                'images too small to analyse'],
}


class PrepError(ValueError):
    """The upload cannot be turned into a contract-valid prepared image."""


# --------------------------------------------------------------------- prep-v2 code
def _to_unit(a: np.ndarray) -> np.ndarray:
    """Stored values to [0,1] for detection only. Never saved."""
    full = 65535.0 if a.dtype == np.uint16 else 255.0
    return a.astype(np.float32) / full


def _decode(image_bytes: bytes) -> np.ndarray:
    """Decode at the stored depth. IMREAD_UNCHANGED keeps 16 bits if present."""
    if not image_bytes:
        raise PrepError('empty image payload')
    a = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if a is None:
        raise PrepError('could not decode the upload. PNG and JPEG only; DICOM is not '
                        'supported by this pipeline')
    if a.ndim == 2:
        return a
    planes = [a[:, :, i] for i in range(min(3, a.shape[2]))]
    if all(np.array_equal(planes[0], p) for p in planes[1:]):
        return planes[0]
    raise PrepError('genuinely coloured image refused rather than converted; a mammogram '
                    'should be grayscale')


def _detect_breast_crop(gray01: np.ndarray) -> Dict[str, Any]:
    """Conservative breast box on a [0,1] image. Exclusive upper bounds.

    Verbatim from prep-v2. When anything is uncertain the answer is the full frame and
    'review_required' -- the full frame is always a safe answer because the fit-and-pad
    step that follows never crops.
    """
    h, w = gray01.shape
    out = {'box': (0, h, 0, w), 'status': 'review_required', 'reason': '',
           'threshold': None, 'retained_frac': 1.0, 'faint_outside_frac': 0.0,
           'connected_faint_added': False, 'annotation_overlap': False,
           'n_annotation_like': 0, 'n_components': 0, 'rival_ratio': 0.0,
           'margin_applied': [0, 0], 'touches_edge': False}
    try:
        if h < 8 or w < 8:
            out['reason'] = 'image too small to analyse'
            return out
        bg = float(np.percentile(gray01, CROP_BG_PERCENTILE))
        bright = float(np.percentile(gray01, 99.0))
        thr = bg + max(CROP_ABS_MARGIN, CROP_REL_FRAC * max(bright - bg, 1e-6))
        faint_thr = bg + CROP_FAINT_FACTOR * (thr - bg)
        out['threshold'] = round(thr, 5)

        mask = (gray01 > thr).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        if mask.sum() < CROP_MIN_AREA_FRAC * h * w:
            out['reason'] = 'almost no foreground above the background level'
            return out

        n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        vmax = float(gray01.max())
        comps, annot = [], []
        for i in range(1, n):
            x, y, bw, bh, area = stats[i]
            frac = area / float(h * w)
            sel = labels == i
            near_sat = float(gray01[sel].mean()) >= CROP_ANNOT_SAT * max(vmax, 1e-6)
            if near_sat and frac < CROP_ANNOT_MAX_AREA:
                annot.append((int(y), int(y + bh), int(x), int(x + bw)))
            if area < CROP_MIN_AREA_FRAC * h * w * 0.25:
                continue
            fill = area / max(bw * bh, 1)
            if bw > 0.95 * w and bh > 0.95 * h and fill < 0.30:
                continue                      # a bright rim around the picture is a frame
            comps.append({'i': i, 'x': int(x), 'y': int(y), 'w': int(bw), 'h': int(bh),
                          'area': int(area)})
        out['n_components'], out['n_annotation_like'] = len(comps), len(annot)
        if not comps:
            out['reason'] = 'no component survived the frame-border and size filters'
            return out

        comps.sort(key=lambda c: -c['area'])
        main = comps[0]
        if len(comps) > 1:
            out['rival_ratio'] = round(comps[1]['area'] / main['area'], 3)
            if out['rival_ratio'] > CROP_RIVAL_RATIO:
                out['reason'] = (f"two components of similar size ({main['area']} vs "
                                 f"{comps[1]['area']}) - cannot tell which is the breast")
                return out
        if main['area'] < CROP_MIN_AREA_FRAC * h * w:
            out['reason'] = f"largest component is only {main['area']} pixels"
            return out

        y0, y1 = main['y'], main['y'] + main['h']
        x0, x1 = main['x'], main['x'] + main['w']

        faint = (gray01 > faint_thr).astype(np.uint8)
        faint = cv2.morphologyEx(faint, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        _, flab, fstats, _ = cv2.connectedComponentsWithStats(faint, connectivity=8)
        touching = set(np.unique(flab[labels == main['i']])) - {0}
        for lbl in touching:                  # connected faint tissue: always enclosed
            fx, fy, fw, fh, _ = fstats[lbl]
            if fy < y0 or fy + fh > y1 or fx < x0 or fx + fw > x1:
                out['connected_faint_added'] = True
            y0, y1 = min(y0, int(fy)), max(y1, int(fy + fh))
            x0, x1 = min(x0, int(fx)), max(x1, int(fx + fw))
        if out['connected_faint_added']:
            out['reason'] = 'boundary extended to enclose faint tissue joined to the breast'

        loose = faint.astype(bool).copy()     # faint signal NOT joined to the breast
        for lbl in touching:
            loose[flab == lbl] = False
        loose[y0:y1, x0:x1] = False
        frac = float(loose.sum()) / (h * w)
        out['faint_outside_frac'] = round(frac, 5)
        if frac > CROP_FAINT_TOL:
            out['reason'] = (f'{frac:.4f} of the image is faint signal detached from the '
                             'main region - it could be tissue, a marker or the other '
                             'breast, so the frame is kept')
            return out

        my = int(round(CROP_MARGIN_FRAC * (y1 - y0)))
        mx = int(round(CROP_MARGIN_FRAC * (x1 - x0)))
        y0, y1 = max(0, y0 - my), min(h, y1 + my)
        x0, x1 = max(0, x0 - mx), min(w, x1 + mx)
        out['margin_applied'] = [my, mx]
        out['touches_edge'] = bool(y0 == 0 or x0 == 0 or y1 == h or x1 == w)
        out['annotation_overlap'] = any(
            not (ay1 <= y0 or ay0 >= y1 or ax1 <= x0 or ax0 >= x1)
            for ay0, ay1, ax0, ax1 in annot)

        retained = (y1 - y0) * (x1 - x0) / float(h * w)
        out.update(box=(int(y0), int(y1), int(x0), int(x1)),
                   retained_frac=round(retained, 4))
        out['status'] = 'already_tight' if retained >= CROP_TIGHT_FRAC else 'cropped'
        out['reason'] = out['reason'] or ('the frame already contains little background'
                                          if retained >= CROP_TIGHT_FRAC
                                          else 'background margin removed')
        return out
    except Exception as exc:                  # noqa: BLE001 - mirrors prep-v2 behaviour
        out['reason'] = f'crop detection failed: {type(exc).__name__}: {exc}'
        return out


def _crop_box(raw: np.ndarray) -> Dict[str, Any]:
    """Detector on a downsampled copy when the image is large; box mapped back to the
    ORIGINAL grid and rounded OUTWARD, so the mapping can only ever keep more tissue."""
    g = _to_unit(raw)
    h, w = g.shape
    f = min(1.0, CROP_DETECT_MAX_SIDE / float(max(h, w)))
    if f >= 1.0:
        info = _detect_breast_crop(g)
        info['detect_scale'] = 1.0
        return info
    small = cv2.resize(g, (max(1, int(round(w * f))), max(1, int(round(h * f)))),
                       interpolation=cv2.INTER_AREA)
    info = _detect_breast_crop(small)
    sy, sx = h / float(small.shape[0]), w / float(small.shape[1])
    y0, y1, x0, x1 = info['box']
    info['box'] = (max(0, int(math.floor(y0 * sy))), min(h, int(math.ceil(y1 * sy))),
                   max(0, int(math.floor(x0 * sx))), min(w, int(math.ceil(x1 * sx))))
    info['detect_scale'] = round(f, 4)
    info['retained_frac'] = round((info['box'][1] - info['box'][0]) *
                                  (info['box'][3] - info['box'][2]) / float(h * w), 4)
    return info


def _to_8bit(arr: np.ndarray) -> np.ndarray:
    """prep-v2's to_8bit, restricted to the case an app upload can satisfy.

    The notebook's `to_8bit` needs a per-(source, dtype) bit-depth container policy that
    was established by measuring the TRAINING images of each source. An app upload has
    no source dataset, so no such policy exists and inventing one would be exactly the
    'converted by invention' the notebook refuses. uint8 takes the identity branch, which
    is the same code path the notebook used for every 8-bit source.
    """
    if arr.dtype == np.uint8:
        return arr
    raise PrepError(
        f'{arr.dtype} upload refused. prep-v2 converts a high-bit-depth image using a '
        'bit-depth container measured from that source\'s own training images, and no '
        'such measurement exists for an arbitrary upload. Converting by assumption would '
        'change the intensity distribution the model was trained on. Please upload an '
        '8-bit PNG or JPEG.')


def _resize_once(img8: np.ndarray) -> Tuple[np.ndarray, float, int, int, str]:
    """Proportional resize to fit inside the target. Returns the UNPADDED image."""
    h, w = img8.shape
    s = min(TARGET_H / float(h), TARGET_W / float(w))
    nh = min(TARGET_H, max(1, int(round(h * s))))
    nw = min(TARGET_W, max(1, int(round(w * s))))
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR
    return (cv2.resize(img8, (nw, nh), interpolation=interp), s, nh, nw,
            'area' if s < 1 else 'linear')


def _pad_to_target(img8: np.ndarray, nh: int, nw: int) -> Tuple[np.ndarray, Dict[str, int]]:
    """Centred constant-zero padding. Aspect ratio is preserved by construction.

    The padding is part of the model input contract, not decoration: the weights were
    trained on aspect-preserved padded images. It is never displayed -- the UI renders a
    separately built preview, so no border reaches the screen.
    """
    top = (TARGET_H - nh) // 2
    left = (TARGET_W - nw) // 2
    bottom, right = TARGET_H - nh - top, TARGET_W - nw - left
    out = cv2.copyMakeBorder(img8, top, bottom, left, right, cv2.BORDER_CONSTANT, value=0)
    if out.shape != (TARGET_H, TARGET_W):
        raise PrepError(f'padding produced {out.shape}, expected {(TARGET_H, TARGET_W)}')
    return out, {'pad_top': top, 'pad_bottom': bottom, 'pad_left': left, 'pad_right': right}


# ----------------------------------------------------------------------- entry point
def prepare_upload(image_bytes: bytes) -> Tuple[bytes, Dict[str, Any]]:
    """Raw upload bytes -> (PNG bytes at exactly 2048x1024, geometry record).

    The returned PNG is what `model_input_v3.prepare_prepared()` consumes. Re-encoding
    to PNG rather than passing an array is deliberate: the contract module then performs
    its own decode and geometry check on the real artefact, exactly as it does for a
    prepared file read off disk, so the check cannot be skipped.

    `geometry` records every transform, so a heatmap computed in model space can be
    mapped back onto the uploaded pixels.
    """
    raw = _decode(image_bytes)
    orig_h, orig_w = int(raw.shape[0]), int(raw.shape[1])

    info = _crop_box(raw)
    y0, y1, x0, x1 = info['box']
    if not (0 <= y0 < y1 <= orig_h and 0 <= x0 < x1 <= orig_w):
        raise PrepError(f'crop box {info["box"]} is outside the image {raw.shape}')
    crop = raw[y0:y1, x0:x1]                  # ORIGINAL stored values, nothing masked

    img8 = _to_8bit(crop)
    resized, scale, nh, nw, interp = _resize_once(img8)
    prepared, pads = _pad_to_target(resized, nh, nw)

    ok, buf = cv2.imencode('.png', prepared, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not ok:
        raise PrepError('PNG encode of the prepared image failed')

    geometry: Dict[str, Any] = {
        'prep_version': PREP_VERSION,
        'variant': PREPARED_VARIANT,
        'orig_h': orig_h, 'orig_w': orig_w,
        'crop_y0': y0, 'crop_y1': y1, 'crop_x0': x0, 'crop_x1': x1,
        'crop_status': info['status'], 'crop_reason': info['reason'],
        'retained_frac': info['retained_frac'],
        'detect_scale': info['detect_scale'],
        'annotation_overlap': info['annotation_overlap'],
        'touches_edge': info['touches_edge'],
        'resize_scale': round(float(scale), 6),
        'resized_h': nh, 'resized_w': nw,
        'interpolation': interp,
        'native_detail': bool(scale <= NATIVE_UPSCALE_LIMIT + 1e-9),
        'upscale_factor': round(float(max(scale, 1.0)), 4),
        'pad_frac': round(1.0 - (nh * nw) / float(TARGET_H * TARGET_W), 4),
        'target_h': TARGET_H, 'target_w': TARGET_W,
        **pads,
    }
    return buf.tobytes(), geometry


def model_to_original(y: float, x: float, geometry: Dict[str, Any]) -> Tuple[float, float]:
    """Map a point in the 2048x1024 model input back onto the uploaded image."""
    yy = (y - geometry['pad_top']) / max(geometry['resize_scale'], 1e-12)
    xx = (x - geometry['pad_left']) / max(geometry['resize_scale'], 1e-12)
    return yy + geometry['crop_y0'], xx + geometry['crop_x0']
