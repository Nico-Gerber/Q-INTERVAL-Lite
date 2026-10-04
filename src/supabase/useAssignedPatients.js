import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';

// The signed-in clinician's assigned patients: [{ id, full_name }]. Access is enforced by RLS;
// this only reads what the database already allows.
export function useAssignedPatients() {
  const { user, profile } = useAuth();
  const [state, setState] = useState({ patients: [], loading: true, error: null });
  const isClinician = profile?.role === 'clinician';

  useEffect(() => {
    if (!supabase || !user || !isClinician) { setState({ patients: [], loading: false, error: null }); return; }
    let cancelled = false;
    (async () => {
      const { data: links, error: linkError } = await supabase
        .from('clinician_patients').select('patient_id').eq('clinician_id', user.id);
      if (linkError) { if (!cancelled) setState({ patients: [], loading: false, error: 'Could not load your patients.' }); return; }
      const ids = (links ?? []).map((l) => l.patient_id);
      if (!ids.length) { if (!cancelled) setState({ patients: [], loading: false, error: null }); return; }
      const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', ids).order('full_name');
      if (!cancelled) setState({ patients: data ?? [], loading: false, error: error ? 'Could not load your patients.' : null });
    })();
    return () => { cancelled = true; };
  }, [user, isClinician]);

  return state;
}
