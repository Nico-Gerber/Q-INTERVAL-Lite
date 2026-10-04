import { supabase } from './supabase';

const BUCKET = 'session-images';
const VIEW_KEYS = ['L-CC', 'L-MLO', 'R-CC', 'R-MLO'];

// ── base64 <-> Blob ──────────────────────────────────────────────────────
const b64ToBlob = (b64, type = 'image/png') => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
};

const blobToB64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const isBase64Field = (key, value) => key.endsWith('_base64') && typeof value === 'string' && value.length > 100;

// Walks the model output; returns a copy with every large `*_base64` image replaced by null,
// plus the extracted images keyed by their dot-path (e.g. cnn.views.L-CC.explainability.heatmap_base64).
function stripImages(node, path = [], images = []) {
  if (Array.isArray(node)) {
    return { value: node.map((item, i) => stripImages(item, [...path, String(i)], images).value), images };
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (isBase64Field(key, value)) {
        images.push({ jsonPath: [...path, key].join('.'), b64: value });
        out[key] = null;
      } else {
        out[key] = stripImages(value, [...path, key], images).value;
      }
    }
    return { value: out, images };
  }
  return { value: node, images };
}

function setAtPath(root, dotPath, value) {
  const keys = dotPath.split('.');
  let node = root;
  for (let i = 0; i < keys.length - 1; i++) node = node?.[keys[i]];
  if (node) node[keys[keys.length - 1]] = value;
}

const extOf = (file) => {
  const fromName = file.name?.split('.').pop()?.toLowerCase();
  return fromName && fromName.length <= 5 ? fromName : 'png';
};

// Model outputs with base64 images removed — safe to store in sessions.result_snapshot.
// `meta` carries non-model inputs needed to rebuild the screen (e.g. future-risk exam dates, patient age).
export function buildSnapshot(cnnData, qmlData, meta) {
  return stripImages({ cnn: cnnData ?? null, qml: qmlData ?? null, ...(meta ? { meta } : {}) }).value;
}

// Uploads the original mammograms and the model's derived images (base/heatmap/overlay) to private
// storage and records them in session_images. The text outputs are already in sessions.result_snapshot.
//   views: classification uploads { 'L-CC': { file }, ... }
//   exams: future-risk uploads [{ examId, views: { 'L-CC': { file } | File, ... } }]
export async function saveSessionImages({ sessionId, views, exams, cnnData, qmlData }) {
  const { images: derived } = stripImages({ cnn: cnnData ?? null, qml: qmlData ?? null });
  const storage = supabase.storage.from(BUCKET);

  const fileOf = (v) => v?.file ?? (v instanceof File ? v : null);
  const originals = [
    ...VIEW_KEYS.filter((v) => fileOf(views?.[v])).map((view) => ({ view, examId: null, file: fileOf(views[view]) })),
    ...(exams ?? []).flatMap((exam) => VIEW_KEYS
      .filter((v) => fileOf(exam.views?.[v]))
      .map((view) => ({ view, examId: exam.examId, file: fileOf(exam.views[view]) }))),
  ];

  const uploads = [
    ...originals.map(({ view, examId, file }) => ({
      view, examId, kind: 'original', jsonPath: null, blob: file,
      contentType: file.type || 'application/octet-stream',
      path: `${sessionId}/original/${examId ? `${examId}_` : ''}${view}.${extOf(file)}`,
    })),
    ...derived.map(({ jsonPath, b64 }, i) => ({
      view: VIEW_KEYS.find((v) => jsonPath.includes(`.${v}.`)) ?? null,
      examId: null,
      kind: 'derived', jsonPath, blob: b64ToBlob(b64), contentType: 'image/png',
      path: `${sessionId}/derived/${i}.png`,
    })),
  ];

  const results = await Promise.all(uploads.map(async (u) => {
    const { error } = await storage.upload(u.path, u.blob, { contentType: u.contentType, upsert: false });
    if (error) { console.error('Image upload failed:', u.path, error); return null; }
    return {
      session_id: sessionId, view: u.view, exam_id: u.examId, kind: u.kind, json_path: u.jsonPath,
      storage_path: u.path, content_type: u.contentType, size_bytes: u.blob.size,
    };
  }));

  const rows = results.filter(Boolean);
  if (rows.length) {
    const { error } = await supabase.from('session_images').insert(rows);
    if (error) throw error;
  }
}

// Rebuilds { cnn, qml } (including base64 images) for a stored session without calling the models.
export async function loadSessionResult(sessionId) {
  const [{ data: session, error: sErr }, { data: images, error: iErr }, { data: aiRows, error: aErr }] = await Promise.all([
    supabase.from('sessions')
      .select('id, session_code, analysis_mode, verified, access_token, result_snapshot, explanations')
      .eq('id', sessionId).maybeSingle(),
    supabase.from('session_images').select('json_path, storage_path, kind').eq('session_id', sessionId),
    supabase.from('ai_results')
      .select('view, verification_status, verified_result').eq('session_id', sessionId),
  ]);
  if (sErr || iErr || aErr) throw sErr || iErr || aErr;
  if (!session) throw new Error('Session not found.');
  if (!session.result_snapshot) throw new Error('This session was saved before full results were stored, so it cannot be restored.');

  const snapshot = structuredClone(session.result_snapshot);
  await Promise.all((images ?? []).filter((i) => i.kind === 'derived' && i.json_path).map(async (img) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(img.storage_path);
    if (error) { console.error('Image download failed:', img.storage_path, error); return; }
    setAtPath(snapshot, img.json_path, await blobToB64(data));
  }));

  // One verification state per view (Classical and Quantum rows share it).
  const verifications = {};
  for (const view of VIEW_KEYS) {
    const row = (aiRows ?? []).find((r) => r.view === view);
    verifications[view] = {
      status: row?.verification_status === 'approved' ? 'confirmed'
        : row?.verification_status === 'overridden' ? 'edited' : 'pending',
      clinicianResult: row?.verified_result ?? null,
      note: '',
    };
  }

  return { session, result: { resultFile: { cnn: snapshot.cnn, qml: snapshot.qml } }, meta: snapshot.meta ?? null, verifications };
}

export const saveExplanations = (sessionId, explanations) =>
  supabase.rpc('save_session_explanations', { p_session_id: sessionId, p_explanations: explanations });

// Removes a session's stored image files (call BEFORE deleting the session row, while access still resolves).
export async function deleteSessionImages(sessionId) {
  const { data, error } = await supabase.from('session_images').select('storage_path').eq('session_id', sessionId);
  if (error) throw error;
  const paths = (data ?? []).map((r) => r.storage_path);
  if (!paths.length) return;
  const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
  if (removeError) throw removeError;
}
