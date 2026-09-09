"""Baseline preprocessing for the Mammo-FM classical three-class engine.

SINGLE SOURCE OF TRUTH. The training notebook writes this exact file, records its
SHA-256 in the model bundle, and the backend verifies that hash at load time. If the
two ever diverge, loading fails loudly instead of serving predictions produced by a
different pipeline from the one the model was trained on.

Two entry points, deliberately separate so preprocessing cannot be applied twice:

    prepare_raw(image_bytes)        an ordinary uploaded mammogram: crop, resize, pad
    prepare_baseline(image_bytes)   an already-exported prep-v1 baseline PNG: decode only

Both return (tensor_input, geometry). `tensor_input` is float32 (3, H, W), normalised
once. `geometry` records every transform so an attribution map can be mapped back onto
the original pixels.

Depends only on numpy and OpenCV. No torch, no Colab.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np

__all__ = ['CONTRACT', 'CLASS_NAMES', 'prepare_raw', 'prepare_baseline',
           'decode_bytes', 'detect_breast_crop', 'fit_and_pad', 'normalise',
           'map_to_original', 'PreprocessingError']

CLASS_NAMES = ('Normal', 'Benign', 'Malignant')

# Everything the model input depends on. Copied into the bundle and compared at load.
CONTRACT: Dict[str, Any] = {
    'name': 'mammofm-classical-baseline',
    'prep_version': 'prep-v1',
    # Native image sizes in Mammo-Bench are median 359x207. 1520x912 upsampled 4.2x,
    # which costs ~4x the compute and adds interpolation rather than detail. 760x456 is
    # still ~2x the native median. Change these two numbers and EVERYTHING follows: the
    # training notebook reads the target from here, and the bundle records this file's
    # hash, so the backend cannot silently disagree with the model.
    'target_h': 760,
    'target_w': 456,
    'channels': 3,                     # grayscale replicated, not a colour image
    'norm_mean': [0.485, 0.456, 0.406],
    'norm_std': [0.229, 0.224, 0.225],
    'pad_value': 0,
    'interpolation': 'INTER_AREA when shrinking, INTER_LINEAR when enlarging',
    'crop': {
        'algo': 'conservative-v1',
        'bg_percentile': 1.0, 'abs_margin': 0.02, 'rel_frac': 0.05,
        'margin_frac': 0.03, 'min_area_frac': 0.02, 'rival_ratio': 0.50,
        'faint_factor': 0.50, 'faint_tol': 0.005, 'tight_frac': 0.98,
        'detect_max_side': 1024,
    },
    'clahe': False,                    # the baseline variant carries no CLAHE
    'orientation': 'stored orientation retained; no flips are applied',
    'supported_input_formats': ['PNG', 'JPEG'],
    'unsupported': ['DICOM'],          # no DICOM decoder is implemented or tested here
}

_C = CONTRACT['crop']


class PreprocessingError(ValueError):
    """An input cannot be decoded or does not match the contract.

    ValueError on purpose: router_factory turns ValueError into HTTP 400 with the
    message passed through to the caller, which is right for a bad upload. Anything
    that is not the caller's fault stays a RuntimeError and becomes a 500.
    """


# ---------------------------------------------------------------- decoding ---
def decode_bytes(data: bytes) -> np.ndarray:
    """Decode PNG/JPEG bytes to a single-channel array at its stored bit depth.

    IMREAD_UNCHANGED, so a 16-bit PNG keeps 16 bits. An RGB frame whose channels are
    identical is reduced to one channel; a genuinely coloured image is refused rather
    than silently converted, because that is a sign the wrong file was uploaded.
    """
    if not data:
        raise PreprocessingError('empty image payload')
    buf = np.frombuffer(data, dtype=np.uint8)
    a = cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)
    if a is None:
        raise PreprocessingError(
            'could not decode the image. Supported: %s. DICOM is NOT supported by this '
            'engine - no DICOM decoder is implemented or tested here.'
            % ', '.join(CONTRACT['supported_input_formats']))
    if a.ndim == 3:
        planes = [a[:, :, i] for i in range(min(3, a.shape[2]))]
        if all(np.array_equal(planes[0], p) for p in planes[1:]):
            return planes[0]
        raise PreprocessingError('genuinely coloured image - refused rather than '
                                 'converted, because a mammogram should be grayscale')
    return a


def to_unit(a: np.ndarray) -> np.ndarray:
    """Stored values to [0,1], for crop detection only. Never saved."""
    full = 65535.0 if a.dtype == np.uint16 else 255.0
    return a.astype(np.float32) / full


def to_8bit(a: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
    """8-bit values are preserved. 16-bit is mapped from the smallest container the
    data actually fits, never assuming the full 0-65535 range is used."""
    if a.dtype == np.uint8:
        return a, {'kind': 'identity', 'container': 255, 'scale': 1.0}
    vmax = int(a.max())
    container = next((c for c in (255, 1023, 4095, 16383, 65535) if vmax <= c), 65535)
    scale = 255.0 / container
    return (np.clip(a.astype(np.float32) * scale, 0, 255).round().astype(np.uint8),
            {'kind': 'linear_container', 'container': container, 'scale': scale})


# ------------------------------------------------------------------- crop ---
def detect_breast_crop(gray01: np.ndarray) -> Dict[str, Any]:
    """Conservative breast box on a [0,1] image, exclusive upper bounds.

    Identical in behaviour to the detector used to build the prep-v1 baseline images.
    Faint tissue joined to the main region is always enclosed whatever its size; faint
    signal detached from it is judged by area and, when there is too much, the original
    frame is kept and the status is 'review_required'. Anything uncertain returns the
    full frame rather than a silent crop.
    """
    h, w = gray01.shape
    out = {'box': (0, h, 0, w), 'status': 'review_required', 'reason': '',
           'retained_frac': 1.0, 'connected_faint_added': False, 'margin_applied': [0, 0]}
    try:
        if h < 8 or w < 8:
            out['reason'] = 'image too small to analyse'
            return out
        bg = float(np.percentile(gray01, _C['bg_percentile']))
        bright = float(np.percentile(gray01, 99.0))
        thr = bg + max(_C['abs_margin'], _C['rel_frac'] * max(bright - bg, 1e-6))
        faint_thr = bg + _C['faint_factor'] * (thr - bg)

        mask = (gray01 > thr).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        if mask.sum() < _C['min_area_frac'] * h * w:
            out['reason'] = 'almost no foreground above the background level'
            return out

        n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        comps = []
        for i in range(1, n):
            x, y, bw, bh, area = stats[i]
            if area < _C['min_area_frac'] * h * w * 0.25:
                continue
            if bw > 0.95 * w and bh > 0.95 * h and area / max(bw * bh, 1) < 0.30:
                continue                       # a bright rim around the whole picture
            comps.append({'i': i, 'x': int(x), 'y': int(y), 'w': int(bw), 'h': int(bh),
                          'area': int(area)})
        if not comps:
            out['reason'] = 'no component survived the frame-border and size filters'
            return out
        comps.sort(key=lambda c: -c['area'])
        main = comps[0]
        if len(comps) > 1 and comps[1]['area'] / main['area'] > _C['rival_ratio']:
            out['reason'] = 'two components of similar size - cannot tell which is breast'
            return out
        if main['area'] < _C['min_area_frac'] * h * w:
            out['reason'] = 'largest component is too small'
            return out

        y0, y1 = main['y'], main['y'] + main['h']
        x0, x1 = main['x'], main['x'] + main['w']

        faint = (gray01 > faint_thr).astype(np.uint8)
        faint = cv2.morphologyEx(faint, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        _, flab, fstats, _ = cv2.connectedComponentsWithStats(faint, connectivity=8)
        touching = set(np.unique(flab[labels == main['i']])) - {0}
        for lbl in touching:                   # connected faint tissue is always kept
            fx, fy, fw, fh, _a = fstats[lbl]
            if fy < y0 or fy + fh > y1 or fx < x0 or fx + fw > x1:
                out['connected_faint_added'] = True
            y0, y1 = min(y0, int(fy)), max(y1, int(fy + fh))
            x0, x1 = min(x0, int(fx)), max(x1, int(fx + fw))

        loose = faint.astype(bool).copy()
        for lbl in touching:
            loose[flab == lbl] = False
        loose[y0:y1, x0:x1] = False
        if float(loose.sum()) / (h * w) > _C['faint_tol']:
            out['reason'] = 'faint signal detached from the main region - frame kept'
            return out

        my = int(round(_C['margin_frac'] * (y1 - y0)))    # margin AFTER the boundary
        mx = int(round(_C['margin_frac'] * (x1 - x0)))
        y0, y1 = max(0, y0 - my), min(h, y1 + my)
        x0, x1 = max(0, x0 - mx), min(w, x1 + mx)

        retained = (y1 - y0) * (x1 - x0) / float(h * w)
        out.update(box=(int(y0), int(y1), int(x0), int(x1)),
                   retained_frac=round(retained, 4), margin_applied=[my, mx],
                   status='already_tight' if retained >= _C['tight_frac'] else 'cropped',
                   reason='background margin removed')
        return out
    except Exception as exc:                   # never lose an image to a crop failure
        out['reason'] = f'crop detection failed: {type(exc).__name__}: {exc}'
        return out


def crop_box(raw: np.ndarray) -> Dict[str, Any]:
    """Detect on a downsample when the image is large, then map the box back to the
    original grid, rounding outward so the mapping can only ever keep more tissue."""
    g = to_unit(raw)
    h, w = g.shape
    f = min(1.0, _C['detect_max_side'] / float(max(h, w)))
    if f >= 1.0:
        info = detect_breast_crop(g)
        info['detect_scale'] = 1.0
        return info
    small = cv2.resize(g, (max(1, int(round(w * f))), max(1, int(round(h * f)))),
                       interpolation=cv2.INTER_AREA)
    info = detect_breast_crop(small)
    sy, sx = h / float(small.shape[0]), w / float(small.shape[1])
    y0, y1, x0, x1 = info['box']
    info['box'] = (max(0, int(np.floor(y0 * sy))), min(h, int(np.ceil(y1 * sy))),
                   max(0, int(np.floor(x0 * sx))), min(w, int(np.ceil(x1 * sx))))
    info['detect_scale'] = round(f, 4)
    return info


# ------------------------------------------------------- resize and pad ---
def fit_and_pad(img8: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
    """One proportional resize into the target, then centred black padding."""
    H, W = CONTRACT['target_h'], CONTRACT['target_w']
    h, w = img8.shape
    s = min(H / float(h), W / float(w))
    nh = min(H, max(1, int(round(h * s))))
    nw = min(W, max(1, int(round(w * s))))
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR
    small = cv2.resize(img8, (nw, nh), interpolation=interp)
    top, left = (H - nh) // 2, (W - nw) // 2
    out = cv2.copyMakeBorder(small, top, H - nh - top, left, W - nw - left,
                             cv2.BORDER_CONSTANT, value=CONTRACT['pad_value'])
    if out.shape != (H, W):
        raise PreprocessingError(f'padded to {out.shape}, expected {(H, W)}')
    return out, {'scale': float(s), 'resized_h': nh, 'resized_w': nw,
                 'pad_top': top, 'pad_bottom': H - nh - top,
                 'pad_left': left, 'pad_right': W - nw - left,
                 'interpolation': 'area' if s < 1 else 'linear'}


def normalise(img8: np.ndarray) -> np.ndarray:
    """Grayscale uint8 -> float32 (3, H, W), replicated and normalised ONCE."""
    x = img8.astype(np.float32) / 255.0
    x = np.repeat(x[None, :, :], CONTRACT['channels'], axis=0)
    mean = np.asarray(CONTRACT['norm_mean'], np.float32)[:, None, None]
    std = np.asarray(CONTRACT['norm_std'], np.float32)[:, None, None]
    return (x - mean) / std


# --------------------------------------------------------- entry points ---
def prepare_raw(data: bytes) -> Tuple[np.ndarray, Dict[str, Any]]:
    """An ordinary uploaded mammogram. Crop, resize, pad, normalise - once."""
    raw = decode_bytes(data)
    info = crop_box(raw)
    y0, y1, x0, x1 = info['box']
    crop = raw[y0:y1, x0:x1]
    img8, conv = to_8bit(crop)
    padded, geom = fit_and_pad(img8)
    geom.update(entry='raw', orig_h=int(raw.shape[0]), orig_w=int(raw.shape[1]),
                crop_y0=y0, crop_y1=y1, crop_x0=x0, crop_x1=x1,
                crop_h=int(crop.shape[0]), crop_w=int(crop.shape[1]),
                crop_status=info['status'], crop_reason=info['reason'],
                to8=conv, padded_8bit=padded)
    return normalise(padded), geom


def prepare_baseline(data: bytes) -> Tuple[np.ndarray, Dict[str, Any]]:
    """An already-exported prep-v1 baseline image. Decode and normalise only.

    Cropping, resizing and padding have already been applied to these files. Doing any
    of it again would be a second pass over an image that is already at the target.
    """
    raw = decode_bytes(data)
    H, W = CONTRACT['target_h'], CONTRACT['target_w']
    if raw.shape != (H, W):
        raise PreprocessingError(
            f'baseline entry point expects an image already at {H}x{W}, got '
            f'{raw.shape}. Use prepare_raw() for an unprocessed mammogram.')
    if raw.dtype != np.uint8:
        raise PreprocessingError(f'baseline images are 8-bit; got {raw.dtype}')
    geom = {'entry': 'baseline', 'orig_h': H, 'orig_w': W, 'scale': 1.0,
            'resized_h': H, 'resized_w': W, 'pad_top': 0, 'pad_bottom': 0,
            'pad_left': 0, 'pad_right': 0, 'crop_y0': 0, 'crop_y1': H,
            'crop_x0': 0, 'crop_x1': W, 'crop_h': H, 'crop_w': W,
            'interpolation': 'none', 'padded_8bit': raw}
    return normalise(raw), geom


def map_to_original(heat: np.ndarray, geom: Dict[str, Any]) -> np.ndarray:
    """Take a (target_h, target_w) attribution map back to the ORIGINAL image.

    Reverses padding, then the resize, then places the result at the recorded crop
    coordinates on a full-size canvas. A cropped heatmap is never pasted straight onto
    a differently shaped original.
    """
    H, W = CONTRACT['target_h'], CONTRACT['target_w']
    if heat.shape != (H, W):
        raise PreprocessingError(f'attribution map is {heat.shape}, expected {(H, W)}')
    t, l = int(geom['pad_top']), int(geom['pad_left'])
    nh, nw = int(geom['resized_h']), int(geom['resized_w'])
    inner = heat[t:t + nh, l:l + nw]                       # undo the padding
    ch, cw = int(geom['crop_h']), int(geom['crop_w'])
    inner = cv2.resize(inner, (cw, ch), interpolation=cv2.INTER_LINEAR)   # undo resize
    canvas = np.zeros((int(geom['orig_h']), int(geom['orig_w'])), dtype=heat.dtype)
    canvas[int(geom['crop_y0']):int(geom['crop_y1']),
           int(geom['crop_x0']):int(geom['crop_x1'])] = inner              # crop origin
    return canvas
