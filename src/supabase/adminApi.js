import { supabase } from './supabase';
import { apiFetch } from '../config/api';


// Calls the backend admin API with the caller's Supabase JWT. The backend re-verifies
// the token and the caller's admin status; nothing here is trusted.
async function adminFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Your session has expired. Please sign in again.');

  let res;
  try {
    res = await apiFetch(`/admin${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error('Could not reach the server. Please try again.');
  }
  if (!res.ok) {
    let detail = null;
    try { detail = (await res.json()).detail; } catch { /* non-JSON error body */ }
    throw new Error(typeof detail === 'string' ? detail : 'The request failed. Please try again.');
  }
  return res.json();
}

export const listUsers = () => adminFetch('/users');
export const approveUser = (id, role) => adminFetch(`/users/${id}/approve`, { method: 'POST', body: JSON.stringify({ role }) });
export const rejectUser = (id) => adminFetch(`/users/${id}/reject`, { method: 'POST' });
export const changeUserRole = (id, role) => adminFetch(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
export const deleteUser = (id) => adminFetch(`/users/${id}`, { method: 'DELETE' });
export const listAssignments = () => adminFetch('/assignments');
export const assignPatients = (clinicianId, patientIds) => adminFetch(`/clinicians/${clinicianId}/patients`, { method: 'POST', body: JSON.stringify({ patient_ids: patientIds }) });
export const unassignPatient = (clinicianId, patientId) => adminFetch(`/clinicians/${clinicianId}/patients/${patientId}`, { method: 'DELETE' });
