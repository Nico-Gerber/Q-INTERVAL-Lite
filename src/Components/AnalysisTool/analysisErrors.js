// Normalises failures from the analysis endpoints so the UI can tell input problems
// (4xx / unreadable image) apart from service problems (network / 5xx) without
// showing raw backend exception text.
import { UNREADABLE_IMAGE_MSG } from '../ImageUpload/uploadChecks';

export class AnalysisRequestError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : `Analysis request failed (${status || 'no response'})`);
    this.status = status; // 0 = no response (server down, CORS, offline)
    this.detail = detail;
  }
}

export async function postAnalysis(url, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', body });
  } catch {
    throw new AnalysisRequestError(0, null);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new AnalysisRequestError(res.status, data?.detail);
  return data;
}

const UNREADABLE_RE = /could not (?:decode|read)|cannot identify image|unreadable|corrupt|truncated/i;
const NOT_IMAGE_RE = /must be an image file/i;
const VIEW_RE = /\b([LR])-(CC|MLO)\b/;
const EXAM_RE = /\b(?:exam_|session\s+)(\d+)\b/i;

// Only pass a backend detail through when it reads like a sentence meant for users.
const isSafeDetail = (d) =>
  typeof d === 'string' && d.trim().length > 0 && d.length <= 160 && !/[<>{}[\]\\/_]|Traceback|Exception|Error:/.test(d);

/**
 * @returns {{ kind: 'input'|'service', message: string, slotMessage?: string,
 *             viewKey?: string|null, examNumber?: number|null }}
 * `slotMessage` is set when the failure is about one image; callers that can
 * locate that slot show it there instead of the general `message`.
 */
export function describeAnalysisFailure(err, { subject, kept }) {
  const status = err instanceof AnalysisRequestError ? err.status : 0;
  const detail = typeof err?.detail === 'string' ? err.detail : '';
  const viewMatch = detail.match(VIEW_RE);
  const examMatch = detail.match(EXAM_RE);
  const viewKey = viewMatch ? `${viewMatch[1]}-${viewMatch[2]}` : null;
  const examNumber = examMatch ? Number(examMatch[1]) : null;
  const where = `${viewKey ? `The ${viewKey} image` : 'One of the uploaded images'}${examNumber ? ` in Session ${examNumber}` : ''}`;

  if (NOT_IMAGE_RE.test(detail)) {
    const slotMessage = 'The analysis service could not accept this file. Please upload a JPEG or PNG image.';
    return { kind: 'input', slotMessage, viewKey, examNumber, message: `${where} could not be accepted by the analysis service. Please upload a JPEG or PNG image.` };
  }
  if (UNREADABLE_RE.test(detail)) {
    return { kind: 'input', slotMessage: UNREADABLE_IMAGE_MSG, viewKey, examNumber, message: `${where} could not be read. Please upload a valid mammogram image.` };
  }
  if (status >= 400 && status < 500) {
    const message = isSafeDetail(detail)
      ? `${detail.replace(/\.?$/, '.')} Please check your inputs and try again.`
      : 'Some of the inputs could not be processed. Please check your images and details, then try again.';
    return { kind: 'input', message, viewKey, examNumber };
  }

  const reason = status === 0 || status >= 502 ? 'the model service is unavailable' : 'the model service ran into a problem';
  return { kind: 'service', message: `${subject} could not be completed because ${reason}. Your ${kept} have been kept. Please try again.` };
}
