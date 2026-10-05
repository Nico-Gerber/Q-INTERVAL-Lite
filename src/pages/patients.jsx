import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Accordion, AccordionSummary, AccordionDetails, Chip, Button,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { deleteSessionImages } from '../supabase/sessionArtifacts';
import { supabase } from '../supabase/supabase';
import { useAssignedPatients } from '../supabase/useAssignedPatients';

const fmt = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Patients() {
  const theme = useTheme();
  const t = theme.palette.results;
  const { reportStatus } = theme.palette;
  const navigate = useNavigate();
  const { patients, loading, error } = useAssignedPatients();
  const [sessionsByPatient, setSessionsByPatient] = useState({});
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!patients.length) { setSessionsLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: sessions, error: sErr } = await supabase
        .from('sessions')
        .select('id, session_code, patient_id, analysis_mode, verified, created_at')
        .in('patient_id', patients.map((p) => p.id))
        .order('created_at', { ascending: false });
      if (sErr) { if (!cancelled) { setSessionsError('Could not load sessions.'); setSessionsLoading(false); } return; }

      // Reviewed views per session (Classical rows only — Classical and Quantum share one verification).
      const reviewed = {};
      if (sessions?.length) {
        const { data: rows } = await supabase
          .from('ai_results').select('session_id, verification_status')
          .eq('model', 'Classical').in('session_id', sessions.map((s) => s.id));
        (rows ?? []).forEach((r) => { if (r.verification_status !== 'pending') reviewed[r.session_id] = (reviewed[r.session_id] ?? 0) + 1; });
      }

      const grouped = {};
      (sessions ?? []).forEach((s) => {
        (grouped[s.patient_id] ??= []).push({ ...s, reviewedCount: reviewed[s.id] ?? 0 });
      });
      if (!cancelled) { setSessionsByPatient(grouped); setSessionsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [patients, loading]);

  const isFuture = (s) => s.analysis_mode === 'future-risk';
  // Published sessions can't be deleted here (their patient link may already be in use).
  const confirmDelete = async () => {
    const s = pendingDelete;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSessionImages(s.id);            // remove stored images first
      const { error: delError } = await supabase.from('sessions').delete().eq('id', s.id);
      if (delError) throw delError;
      setSessionsByPatient((prev) => ({ ...prev, [s.patient_id]: (prev[s.patient_id] ?? []).filter((x) => x.id !== s.id) }));
      setPendingDelete(null);
    } catch (err) {
      console.error('Failed to delete session:', err);
      setDeleteError('Could not delete this session. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const statusOf = (s) => (isFuture(s)
    ? { label: 'Future risk', color: reportStatus.partial }
    : s.verified
    ? { label: 'Published', color: reportStatus.verified }
    : s.reviewedCount === 0
      ? { label: 'Not reviewed', color: reportStatus.pending }
      : { label: `${s.reviewedCount}/4 reviewed`, color: reportStatus.partial });

  const awaiting = (id) => (sessionsByPatient[id] ?? []).filter((s) => !isFuture(s) && !s.verified).length;
  // Patients with sessions to review come first.
  const ordered = [...patients].sort((a, b) => awaiting(b.id) - awaiting(a.id));

  return (
    <Box sx={{ minHeight: '100vh', position: 'relative', overflow: 'clip', background: (th) => th.palette.background.hero }}>
      <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1, py: 8 }}>
        <Typography variant="h4" sx={{ mb: 0.5 }}>My Patients</Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Patients assigned to you and their stored analysis sessions.
        </Typography>

        {loading || sessionsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : error || sessionsError ? (
          <Alert severity="error">{error || sessionsError}</Alert>
        ) : !patients.length ? (
          <Alert severity="info">No patients are assigned to you yet. An administrator can assign patients from User Management.</Alert>
        ) : (
          ordered.map((p) => {
            const list = sessionsByPatient[p.id] ?? [];
            const pending = awaiting(p.id);
            return (
              <Accordion key={p.id} disableGutters sx={{ mb: 1.5 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', width: '100%' }}>
                    <Typography sx={{ fontWeight: 700 }}>{p.full_name || 'Unnamed patient'}</Typography>
                    <Chip size="small" variant="outlined" label={`${list.length} session${list.length === 1 ? '' : 's'}`} />
                    {pending > 0 && <Chip size="small" label={`${pending} awaiting review`} sx={{ bgcolor: `${reportStatus.pending}22`, color: reportStatus.pending, fontWeight: 700 }} />}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {list.length ? (
                    <TableContainer sx={{ overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            {['Session', 'Date', 'Status', ''].map((h) => (
                              <TableCell key={h} sx={{ fontWeight: 700, color: t.label, borderColor: t.line }}>{h}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {list.map((s) => {
                            const st = statusOf(s);
                            return (
                              <TableRow key={s.id} hover>
                                <TableCell sx={{ fontFamily: 'monospace', borderColor: t.line }}>{s.session_code}</TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap', borderColor: t.line }}>{fmt(s.created_at)}</TableCell>
                                <TableCell sx={{ borderColor: t.line }}>
                                  <Chip size="small" label={st.label} sx={{ bgcolor: `${st.color}22`, color: st.color, fontWeight: 700 }} />
                                </TableCell>
                                <TableCell align="right" sx={{ borderColor: t.line }}>
                                  <Button size="small" startIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />} onClick={() => navigate(`/Analysis?session=${s.id}`)}>
                                    Open
                                  </Button>
                                  {!s.verified && (
                                    <Button size="small" color="error" startIcon={<DeleteOutlineIcon sx={{ fontSize: 15 }} />} onClick={() => { setDeleteError(null); setPendingDelete(s); }}>
                                      Delete
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography color="text.secondary">No sessions yet.</Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </Container>

      <Dialog open={!!pendingDelete} onClose={() => !deleting && setPendingDelete(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete session?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently deletes session {pendingDelete?.session_code}, including its stored images and results,
            and removes it from any model-improvement data. This cannot be undone.
          </DialogContentText>
          {deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
