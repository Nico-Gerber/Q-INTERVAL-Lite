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
import NeuralCanvas from '../Components/Shared/NeuralCanvas';
import ResultShell from '../Components/Shared/ResultShell';
import { supabase } from '../supabase/supabase';
import { useAssignedPatients } from '../supabase/useAssignedPatients';
import { useAuth } from '../supabase/AuthContext';
import { GreetingBlock, PrototypeNotice } from '../Components/Shared/DashboardHeader';

const fmt = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const initialsOf = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export default function Patients() {
  const theme = useTheme();
  const t = theme.palette.results;
  const { reportStatus } = theme.palette;
  const navigate = useNavigate();
  const { user, profile } = useAuth();
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
  const totalAwaiting = patients.reduce((n, p) => n + awaiting(p.id), 0);
  const displayName = profile?.full_name || user?.email?.split('@')[0] || '';

  return (
    <Box sx={{ minHeight: '100vh', position: 'relative', overflow: 'clip', background: (th) => th.palette.background.hero }}>
      <NeuralCanvas />
      <Box sx={{
        position: 'absolute', top: '-40%', left: '50%',
        transform: 'translateX(-50%)', width: '500px', height: '500px',
        borderRadius: '50%',
        background: (th) => `radial-gradient(circle, ${th.palette.primary.main}0F 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: (th) =>
          `linear-gradient(${th.palette.primary.main}${th.palette.mode === 'dark' ? '07' : '14'} 1px, transparent 1px),
           linear-gradient(90deg, ${th.palette.primary.main}${th.palette.mode === 'dark' ? '07' : '14'} 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />

      <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1, py: 8 }}>
        <PrototypeNotice />
        <Typography variant="h3" sx={{ fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary', mb: 1.5, fontSize: { xs: '1.8rem', md: '2.25rem' } }}>
          My
          <Box component="span" sx={{ color: 'primary.main', fontStyle: 'italic' }}>
            Patients
          </Box>
        </Typography>
        <GreetingBlock
          name={displayName}
          stats={!loading && !sessionsLoading && patients.length > 0 ? [
            { value: patients.length, label: patients.length === 1 ? 'Assigned patient' : 'Assigned patients' },
            { value: totalAwaiting, label: 'Awaiting review', warn: true },
          ] : []}
          note={!loading && !sessionsLoading && patients.length > 0
            ? 'Patients with sessions waiting are listed first.'
            : 'Patients assigned to you and their stored analysis sessions.'}
        />

        {loading || sessionsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : error || sessionsError ? (
          <Alert severity="error">{error || sessionsError}</Alert>
        ) : !patients.length ? (
          <Alert severity="info">No patients are assigned to you yet. An administrator can assign patients from User Management.</Alert>
        ) : (
          <ResultShell sx={{ p: { xs: 2, md: 2.5 } }}>
          {ordered.map((p) => {
            const list = sessionsByPatient[p.id] ?? [];
            const pending = awaiting(p.id);
            return (
              <Accordion
                key={p.id}
                disableGutters
                elevation={0}
                sx={{
                  mb: 1.5, backgroundImage: 'none', backgroundColor: t.inputBg, border: `1px solid ${t.lineStrong}`, borderRadius: 2,
                  '&::before': { display: 'none' }, '&:last-of-type': { mb: 0 },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, width: '100%', pr: 1 }}>
                    <Box
                      aria-hidden="true"
                      sx={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.85rem', fontWeight: 800, color: 'primary.main', border: '1.5px solid', borderColor: 'primary.main',
                      }}
                    >
                      {initialsOf(p.full_name)}
                    </Box>
                    <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: { xs: '1.05rem', md: '1.2rem' }, color: t.text, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                      {p.full_name || 'Unnamed patient'}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {pending > 0 && <Chip size="small" label={`${pending} awaiting review`} sx={{ bgcolor: `${reportStatus.pending}22`, color: reportStatus.pending, fontWeight: 700 }} />}
                      <Chip size="small" variant="outlined" label={`${list.length} session${list.length === 1 ? '' : 's'}`} />
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {list.length ? (
                    <TableContainer sx={{ overflowX: 'auto' }}>
                      <Table size="small" sx={{ '& .MuiTableCell-root': { px: 1.5 } }}>
                        <TableHead>
                          <TableRow>
                            {['Session', 'Date', 'Status', ''].map((h) => (
                              <TableCell key={h || 'actions'} sx={{ py: 1.5, fontWeight: 700, color: t.label, borderBottom: `2px solid ${t.lineStrong}`, whiteSpace: 'nowrap' }}>{h}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {list.map((s) => {
                            const st = statusOf(s);
                            return (
                              <TableRow key={s.id} hover>
                                <TableCell sx={{ py: 2, fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: t.text, borderColor: t.lineStrong, whiteSpace: 'nowrap' }}>{s.session_code}</TableCell>
                                <TableCell sx={{ py: 2, fontSize: '0.85rem', color: t.body, whiteSpace: 'nowrap', borderColor: t.lineStrong }}>{fmt(s.created_at)}</TableCell>
                                <TableCell sx={{ py: 2, borderColor: t.lineStrong }}>
                                  <Chip size="small" label={st.label} sx={{ bgcolor: `${st.color}22`, color: st.color, fontWeight: 700 }} />
                                </TableCell>
                                <TableCell align="right" sx={{ py: 2, borderColor: t.lineStrong, whiteSpace: 'nowrap' }}>
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
          })}
          </ResultShell>
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
