// File checks shared by the manual and smart upload paths of both analysis modes.
import { dicomToImageFile } from './dicomToImage';

export const ACCEPTED_FILE_TYPES = { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const UNSUPPORTED_TYPE_MSG = 'Unsupported file type. Please upload a JPEG, PNG, or DICOM (.dcm) image.';
export const TOO_LARGE_MSG = 'This file is larger than 10 MB. Please upload a smaller image.';
export const UNREADABLE_IMAGE_MSG = 'This image could not be read. Please upload a valid mammogram image.';
export const DICOM_UNSUPPORTED_MSG = 'This DICOM uses a compressed or multi-frame encoding that cannot be read in the browser. Please export it as an uncompressed DICOM, PNG, or JPEG.';

const hasCode = (rejection, code) => rejection.errors.some((e) => e.code === code);

// react-dropzone FileRejection → user-facing text (never the raw MIME list).
export const rejectionMessage = (rejection) => {
  if (hasCode(rejection, 'file-invalid-type')) return UNSUPPORTED_TYPE_MSG;
  if (hasCode(rejection, 'file-too-large')) return TOO_LARGE_MSG;
  if (hasCode(rejection, 'too-many-files')) return 'Please upload one image per view.';
  return 'This file could not be uploaded. Please try a different image.';
};

const isDicom = (file) => file.type === 'application/dicom' || /\.dcm$/i.test(file.name);

const decodesAsImage = (file) => {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).then((bitmap) => { bitmap.close?.(); return true; }, () => false);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(true); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
};

// Resolves to { file } with the file to use from here on, or { error, unsupported? }.
// JPEG/PNG must actually decode before they are accepted into a slot. DICOM is
// converted to a PNG (browsers cannot display it, the models cannot read it), so
// everything downstream only ever sees an ordinary image.
export const prepareImage = async (file) => {
  if (!file?.size) return { error: UNREADABLE_IMAGE_MSG };
  if (isDicom(file)) {
    try {
      return { file: await dicomToImageFile(file) };
    } catch (e) {
      return e?.unsupported ? { error: DICOM_UNSUPPORTED_MSG, unsupported: true } : { error: UNREADABLE_IMAGE_MSG };
    }
  }
  return (await decodesAsImage(file)) ? { file } : { error: UNREADABLE_IMAGE_MSG };
};

// A session holds 4 views, so a smart drop may only add as many files as there is
// room for — routed views and files still waiting in "Needs attention" both count.
export const MAX_VIEWS = 4;
export const smartDropCapacity = (filledCount, pendingCount) => Math.max(0, MAX_VIEWS - filledCount - pendingCount);

// One summary line for a multi-file (smart) drop.
export const batchProblemMessage = (rejections, unreadableFiles, overflowFiles = [], unsupportedDicomFiles = []) => {
  const names = (files) => files.map((f) => f.name).join(', ');
  const invalidType = rejections.filter((r) => hasCode(r, 'file-invalid-type')).map((r) => r.file);
  const tooLarge = rejections.filter((r) => !hasCode(r, 'file-invalid-type') && hasCode(r, 'file-too-large')).map((r) => r.file);
  const parts = [];
  if (invalidType.length) parts.push(`Unsupported file type (${names(invalidType)}). Please upload JPEG, PNG, or DICOM (.dcm) images.`);
  if (tooLarge.length) parts.push(`Larger than 10 MB (${names(tooLarge)}).`);
  if (unreadableFiles.length) parts.push(`Could not be read (${names(unreadableFiles)}). Please upload valid mammogram images.`);
  if (unsupportedDicomFiles.length) parts.push(`Compressed or multi-frame DICOM cannot be read (${names(unsupportedDicomFiles)}). Please export as uncompressed DICOM, PNG, or JPEG.`);
  if (overflowFiles.length) {
    const n = overflowFiles.length;
    parts.push(`Only ${MAX_VIEWS} images can be added — ${n} extra ${n === 1 ? 'file was' : 'files were'} not added (${names(overflowFiles)}).`);
  }
  return parts.length ? parts.join(' ') : null;
};
