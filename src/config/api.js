// Single place that knows where the backend lives and which endpoints exist.
// Docs: docs/DEPLOYMENT.md ("Endpoint registry"). Add new endpoints here, never as inline URLs.
import { supabase } from '../supabase/supabase';

// Local dev uses the local backend; the deployed frontend sets REACT_APP_API_BASE to the Railway URL.
export const API_BASE = (process.env.REACT_APP_API_BASE || 'http://localhost:8000').replace(/\/+$/, '');

export const ENDPOINTS = {
  // Model inference (approved users) — multipart/form-data
  sessionAnalysisClassical: '/session-analysis/predict-four-views',
  sessionAnalysisQuantum: '/quantum-session-analysis/predict-four-views',
  futureRiskClassical: '/future-risk',
  futureRiskQuantum: '/qml-future-risk-view-aware/',

  // LLM explanations (approved users) — JSON
  explain: '/explain/',
  explainFutureRisk: '/explain-future-risk/',
  explainView: '/explain/explain_view',

  // Admin only — see src/supabase/adminApi.js for the callers
  adminUsers: '/admin/users',
  adminAssignments: '/admin/assignments',
};

// Authorization header carrying the signed-in user's Supabase JWT. The backend re-verifies it on every call.
export async function authHeaders() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// fetch() against the backend with auth attached. `path` is an ENDPOINTS value (or an /admin/... path).
export async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(await authHeaders()), ...options.headers },
  });
}
