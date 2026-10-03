// Browser-side DICOM → PNG conversion. The models only read JPEG/PNG and browsers
// cannot display DICOM, so a .dcm is rendered to a greyscale PNG File at upload time
// and that File is used for both the preview and the analysis request.
import dicomParser from 'dicom-parser';

// Implicit / Explicit VR Little Endian. Compressed transfer syntaxes (JPEG, JPEG 2000,
// RLE) need codecs this app does not ship.
const UNCOMPRESSED_SYNTAXES = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1']);

class DicomError extends Error {
  constructor(unsupported) {
    super(unsupported ? 'Unsupported DICOM encoding' : 'Unreadable DICOM');
    this.unsupported = unsupported;
  }
}

const readDataset = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let ds;
  try { ds = dicomParser.parseDicom(bytes); } catch { throw new DicomError(false); }
  return { ds, bytes };
};

// Greyscale pixel values after rescale slope/intercept.
const readPixels = ({ ds, bytes }) => {
  const syntax = ds.string('x00020010') || '1.2.840.10008.1.2';
  const photometric = ds.string('x00280004');
  const rows = ds.uint16('x00280010');
  const cols = ds.uint16('x00280011');
  const bits = ds.uint16('x00280100');
  const signed = ds.uint16('x00280103') === 1;
  const samples = ds.uint16('x00280002') ?? 1;
  const frames = parseInt(ds.string('x00280008') ?? '1', 10) || 1;
  const el = ds.elements.x7fe00010;

  if (!rows || !cols || !el) throw new DicomError(false);
  if (!UNCOMPRESSED_SYNTAXES.has(syntax) || samples !== 1 || frames !== 1
    || (photometric !== 'MONOCHROME1' && photometric !== 'MONOCHROME2') || (bits !== 8 && bits !== 16)) {
    throw new DicomError(true);
  }

  const count = rows * cols;
  const size = count * (bits / 8);
  if (el.length < size) throw new DicomError(false);
  // slice() copies, which also guarantees the 2-byte alignment Uint16Array needs.
  const raw = bytes.slice(el.dataOffset, el.dataOffset + size).buffer;
  const px = bits === 8 ? new Uint8Array(raw) : signed ? new Int16Array(raw) : new Uint16Array(raw);

  const slope = ds.floatString('x00281053') ?? 1;
  const intercept = ds.floatString('x00281052') ?? 0;
  return { px, count, rows, cols, slope, intercept, invert: photometric === 'MONOCHROME1', ds };
};

const grayscaleBlob = ({ px, count, rows, cols, slope, intercept, invert, ds }) => {
  let lo; let hi;
  const center = ds.floatString('x00281050');
  const width = ds.floatString('x00281051');
  if (Number.isFinite(center) && Number.isFinite(width) && width > 0) {
    lo = center - width / 2; hi = center + width / 2;
  } else {
    let min = Infinity; let max = -Infinity;
    for (let i = 0; i < count; i++) { const v = px[i]; if (v < min) min = v; if (v > max) max = v; }
    lo = min * slope + intercept; hi = max * slope + intercept;
    if (lo > hi) [lo, hi] = [hi, lo];
  }
  const span = hi - lo || 1;

  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  const out = img.data;
  for (let i = 0; i < count; i++) {
    let g = ((px[i] * slope + intercept - lo) / span) * 255;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    if (invert) g = 255 - g;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = g;
    out[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new DicomError(false))), 'image/png'));
};

/** Resolves to a PNG File named after the original; rejects with a DicomError carrying `.unsupported`. */
export async function dicomToImageFile(file) {
  const blob = await grayscaleBlob(readPixels(await readDataset(file)));
  return new File([blob], `${file.name.replace(/\.(dcm|dicom)$/i, '')}.png`, { type: 'image/png' });
}
