import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Chip, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Select, MenuItem, TextField, InputAdornment, Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import IosShareIcon from '@mui/icons-material/IosShare';
import { supabase } from '../supabase/supabase';
import { useAuth } from '../supabase/AuthContext';
import NeuralCanvas from '../Components/Shared/NeuralCanvas';
import ResultShell from '../Components/Shared/ResultShell';

const VIEWS = ['L-CC', 'L-MLO', 'R-CC', 'R-MLO'];
const RESULTS = ['Malignant', 'Benign', 'Normal'];
const MC = '#FF6A4D', BC = '#E3A63C', NC = '#2FBFA8';
const getColor = (r) => (r === 'Malignant' ? MC : r === 'Benign' ? BC : NC);
const OVERRIDE_GLOW = '#FFB020';

// Dark dialog surface — matches the "Verify Result" dialog in
// ClassificationResults.jsx rather than the app's default (lighter) Paper.
const DIALOG_SX = {
  background: (theme) => theme.palette.mode === 'dark' ? '#0a1728' : '#0D1B2E',
  border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? '#17304d' : 'rgba(34,211,238,0.18)'}`,
  color: '#F0F9FF',
};

export default function Sessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState(null); // null = loading
  const [detail, setDetail] = useState(null); // { session, rows, risk } | null
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingChange, setPendingChange] = useState(null); // { view, from, to } | null
  const [pendingDelete, setPendingDelete] = useState(null); // session | null
  const [deleting, setDeleting] = useState(false);
  const [shareSession, setShareSession] = useState(null); // session | null
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | published | in-progress | not-reviewed
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

  const statusOf = (s) => (s.verified ? 'published' : s.reviewedCount === 0 ? 'not-reviewed' : 'in-progress');

  const visibleSessions = useMemo(() => {
    const list = (sessions ?? []).filter((s) => {
      if (statusFilter !== 'all' && statusOf(s) !== statusFilter) return false;
      if (search && !s.session_code.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
    list.sort((a, b) => sortNewestFirst
      ? new Date(b.created_at) - new Date(a.created_at)
      : new Date(a.created_at) - new Date(b.created_at));
    return list;
  }, [sessions, search, statusFilter, sortNewestFirst]);

  useEffect(() => {
    if (!supabase) { setSessions([]); return; }
    supabase
      .from('sessions')
      .select('id, session_code, analysis_mode, verified, verified_at, created_at, access_token')
      .eq('analysis_mode', 'classification')
      .order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (error) { console.error('Failed to load sessions:', error); setSessions([]); return; }
        const list = data ?? [];
        if (!list.length) { setSessions([]); return; }

        // One batched query for review progress across every listed session,
        // rather than N+1 — Classical model only, since both models share
        // the same verification_status per view.
        const { data: progressRows, error: progressError } = await supabase
          .from('ai_results')
          .select('session_id, verification_status')
          .eq('model', 'Classical')
          .in('session_id', list.map((s) => s.id));
        if (progressError) console.error('Failed to load review progress:', progressError);

        const reviewedCounts = {};
        (progressRows ?? []).forEach((r) => {
          if (r.verification_status !== 'pending') {
            reviewedCounts[r.session_id] = (reviewedCounts[r.session_id] ?? 0) + 1;
          }
        });

        setSessions(list.map((s) => ({ ...s, reviewedCount: reviewedCounts[s.id] ?? 0 })));
      });
  }, []);

  const openDetail = async (session) => {
    if (!supabase) return;
    setDetailLoading(true);
    setDetail((prev) => ({ session, rows: prev?.rows ?? [], risk: prev?.risk ?? [] }));
    const [{ data: aiRows }, { data: riskRows }] = await Promise.all([
      supabase.from('ai_results').select('view, model, ai_result, ai_confidence, verified_result, verification_status').eq('session_id', session.id),
      supabase.from('risk_assessments').select('model, risk_level, highest_density, highest_birads').eq('session_id', session.id),
    ]);
    const rows = VIEWS.map((v) => {
      const classical = (aiRows ?? []).find((r) => r.view === v && r.model === 'Classical');
      const quantum = (aiRows ?? []).find((r) => r.view === v && r.model === 'Quantum');
      return {
        view: v, classical, quantum,
        verified: classical?.verified_result ?? quantum?.verified_result ?? null,
        overridden: classical?.verification_status === 'overridden' || quantum?.verification_status === 'overridden',
        // Never reviewed with the image visible — editing this blind isn't a
        // correction, it'd be fabricating a review. Locked in the UI below.
        reviewed: classical?.verification_status !== 'pending',
      };
    });
    setDetail({ session, rows, risk: riskRows ?? [] });
    setDetailLoading(false);
  };

  const requestChange = (view, newResult) => {
    const row = detail.rows.find((r) => r.view === view);
    if (newResult === row?.verified) return;
    setPendingChange({ view, from: row?.verified ?? 'Not reviewed', to: newResult });
  };

  const confirmChange = async () => {
    if (!supabase || !detail?.session || !pendingChange) return;
    const { view, to } = pendingChange;
    const row = detail.rows.find((r) => r.view === view);
    const status = to === row?.classical?.ai_result ? 'approved' : 'overridden';
    const { error } = await supabase
      .from('ai_results')
      .update({
        verification_status: status,
        verified_result: to,
        verified_at: new Date().toISOString(),
        verified_by: user?.email ?? null,
      })
      .eq('session_id', detail.session.id)
      .eq('view', view);
    setPendingChange(null);
    if (error) { console.error('Failed to update verified result:', error); return; }
    openDetail(detail.session);
  };

  // Only ever offered for sessions that were never published — get_patient_report
  // refuses to return anything for an unpublished session regardless of who
  // holds the access_token, so deleting one destroys nothing a patient could
  // ever have seen. A published session's link may already be in a patient's
  // hands; pulling that data out from under them isn't something a button in
  // this list should be able to do — that stays a deliberate DB-console action.
  const handleDeleteSession = async () => {
    if (!supabase || !pendingDelete || pendingDelete.verified) return;
    setDeleting(true);
    const { error } = await supabase.from('sessions').delete().eq('id', pendingDelete.id);
    setDeleting(false);
    if (error) { console.error('Failed to delete session:', error); return; }
    setSessions((prev) => (prev ?? []).filter((s) => s.id !== pendingDelete.id));
    if (detail?.session?.id === pendingDelete.id) setDetail(null);
    setPendingDelete(null);
  };

  return (
    <Box sx={{
      minHeight: '100vh', position: 'relative', overflow: 'clip',
      background: (theme) => theme.palette.background.hero,
    }}>
      <NeuralCanvas />
      <Box sx={{
        position: 'absolute', top: '-40%', left: '50%',
        transform: 'translateX(-50%)', width: '500px', height: '500px',
        borderRadius: '50%',
        background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: (theme) =>
          `linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px),
           linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />

      <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1, py: 8 }}>
        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{
            mb: 2.5, bgcolor: (theme) => `${theme.palette.error.main}18`, color: 'error.main',
            letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700,
            border: '1px solid', borderColor: (theme) => `${theme.palette.error.main}35`,
            borderRadius: '999px',
          }}
        />
        <Typography variant="h3" sx={{ fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary', mb: 1.5, fontSize: { xs: '1.8rem', md: '2.25rem' } }}>
          My
          <Box component="span" sx={{ color: 'primary.main', fontStyle: 'italic' }}>
            Sessions
          </Box>
          {user?.email && (
            <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'normal', fontWeight: 500, fontSize: '0.55em', ml: 1.5 }}>
              — {user.email.split('@')[0]}
            </Box>
          )}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 4, fontSize: '0.95rem', lineHeight: 1.75, maxWidth: 640 }}>
          Every Session Analysis you've run — reviewed or not. Open one to correct an already-reviewed result;
          views you never reviewed with the image visible stay locked.
        </Typography>

        {sessions === null ? (
          <Box sx={{ minHeight: '30vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.75 }}>
            <CircularProgress size={30} sx={{ color: 'primary.main' }} />
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>Loading your sessions…</Typography>
          </Box>
        ) : sessions.length === 0 ? (
          <Typography sx={{ color: 'text.secondary' }}>No sessions yet — run an analysis to see it here.</Typography>
        ) : (
          <ResultShell sx={{ p: { xs: 2, md: 2.5 }, pb: { xs: 3, md: 3.5 } }}>
            <Box sx={{
              display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center',
              pb: 2, mb: 2, borderBottom: '1px solid #17304d',
            }}>
              <TextField
                size="small"
                placeholder="Search by session code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{
                  flex: 1, minWidth: 220,
                  '& .MuiOutlinedInput-root': { color: '#eaf4ff', background: 'rgba(255,255,255,0.04)', fontSize: '0.82rem' },
                  '& fieldset': { borderColor: '#1f3a5c' },
                  '&:hover fieldset': { borderColor: '#2d4a6b !important' },
                }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: '#5f7fa6' }} /></InputAdornment> }}
              />
              <Select
                size="small"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{ minWidth: 150, fontSize: '0.82rem', color: '#eaf4ff', background: 'rgba(255,255,255,0.04)', '.MuiOutlinedInput-notchedOutline': { borderColor: '#1f3a5c' } }}
                MenuProps={{ PaperProps: { sx: { fontSize: '0.82rem' } } }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.82rem' }}>All statuses</MenuItem>
                <MenuItem value="published" sx={{ fontSize: '0.82rem' }}>Published</MenuItem>
                <MenuItem value="in-progress" sx={{ fontSize: '0.82rem' }}>In progress</MenuItem>
                <MenuItem value="not-reviewed" sx={{ fontSize: '0.82rem' }}>Not reviewed</MenuItem>
              </Select>
              <Button
                size="small"
                startIcon={sortNewestFirst ? <ArrowDownwardIcon sx={{ fontSize: 14 }} /> : <ArrowUpwardIcon sx={{ fontSize: 14 }} />}
                onClick={() => setSortNewestFirst((v) => !v)}
                sx={{ color: '#8fabc9', border: '1px solid #1f3a5c', px: 1.5, fontSize: '0.8rem', background: 'rgba(255,255,255,0.04)' }}
              >
                {sortNewestFirst ? 'Newest first' : 'Oldest first'}
              </Button>
            </Box>

            {visibleSessions.length === 0 ? (
              <Typography sx={{ color: '#8fabc9', fontSize: '0.9rem', p: 2 }}>
                No sessions match your search or filter.
              </Typography>
            ) : (
            <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ py: 1.5, color: '#8fabc9', borderBottom: '2px solid #1f3a5c', whiteSpace: 'nowrap' }}>Session</TableCell>
                  <TableCell sx={{ py: 1.5, color: '#8fabc9', borderBottom: '2px solid #1f3a5c', whiteSpace: 'nowrap' }}>Date</TableCell>
                  <TableCell sx={{ py: 1.5, color: '#8fabc9', borderBottom: '2px solid #1f3a5c', whiteSpace: 'nowrap' }}>Status</TableCell>
                  <TableCell sx={{ py: 1.5, color: '#8fabc9', borderBottom: '2px solid #1f3a5c', whiteSpace: 'nowrap' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleSessions.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell sx={{ py: 2, fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: '#eaf4ff', borderColor: '#1f3a5c', whiteSpace: 'nowrap' }}>{s.session_code}</TableCell>
                    <TableCell sx={{ py: 2, fontSize: '0.85rem', color: '#c3d8ec', borderColor: '#1f3a5c', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleString()}</TableCell>
                    <TableCell sx={{ py: 2, borderColor: '#1f3a5c' }}>
                      {s.verified ? (
                        <Chip
                          size="small" label="Published" variant="outlined"
                          sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#4fd1a1', borderColor: 'rgba(79,209,161,0.5)', background: 'rgba(79,209,161,0.1)' }}
                        />
                      ) : s.reviewedCount === 0 ? (
                        <Chip
                          size="small" label="Not reviewed" variant="outlined"
                          sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#5f7fa6', borderColor: '#17304d', background: 'transparent' }}
                        />
                      ) : (
                        <Chip
                          size="small" label={`${s.reviewedCount}/4 reviewed`} variant="outlined"
                          sx={{ fontSize: '0.7rem', fontWeight: 700, color: OVERRIDE_GLOW, borderColor: `${OVERRIDE_GLOW}80`, background: `${OVERRIDE_GLOW}14` }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ py: 2, borderColor: '#1f3a5c', whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Button
                          size="small" startIcon={<VisibilityIcon sx={{ fontSize: 15 }} />} onClick={() => openDetail(s)}
                          sx={{ color: '#5cc8f5', minWidth: 84, justifyContent: 'flex-start' }}
                        >
                          View
                        </Button>
                        <Divider orientation="vertical" flexItem sx={{ borderColor: '#1f3a5c', mx: 0.5, my: 0.5 }} />
                        {s.verified ? (
                          <Button
                            size="small" startIcon={<IosShareIcon sx={{ fontSize: 14 }} />} onClick={() => { setShareSession(s); setCopied(false); }}
                            sx={{ color: '#4fd1a1', minWidth: 84, justifyContent: 'flex-start' }}
                          >
                            Share
                          </Button>
                        ) : (
                          <Button
                            size="small" startIcon={<DeleteOutlineIcon sx={{ fontSize: 15 }} />} onClick={() => setPendingDelete(s)}
                            sx={{ color: '#8fabc9', minWidth: 84, justifyContent: 'flex-start' }}
                          >
                            Delete
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableContainer>
            )}
          </ResultShell>
        )}
      </Container>

      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="sm" fullWidth PaperProps={{ sx: DIALOG_SX }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem' }}>
              {detail?.session?.session_code}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: '#8fabc9' }}>
              {detail?.session?.verified
                ? `Published ${new Date(detail.session.verified_at).toLocaleString()}`
                : `Not published · ${(detail?.rows ?? []).filter((r) => r.reviewed).length}/4 reviewed`}
            </Typography>
          </Box>
          <IconButton onClick={() => setDetail(null)} size="small" sx={{ color: '#8fabc9' }}><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: '#17304d' }}>
          {detailLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
              <CircularProgress size={18} />
              <Typography sx={{ color: '#8fabc9', fontSize: '0.85rem' }}>Loading…</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{
                display: 'flex', gap: 1.25, alignItems: 'flex-start',
                p: 1.5, borderRadius: 1.5, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.08)',
              }}>
                <InfoOutlinedIcon sx={{ fontSize: 18, color: '#FBBF24', flexShrink: 0, mt: 0.15 }} />
                <Typography sx={{ fontSize: '0.76rem', color: '#FDE68A', lineHeight: 1.5 }}>
                  Mammogram images aren't retained after analysis, so they're not shown here either — review is
                  based on the recorded AI output and confidence only.
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#8fabc9', letterSpacing: '0.08em', mb: 1.5 }}>
                  PER-VIEW RESULTS
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ py: 1.5, color: '#8fabc9', borderColor: '#17304d' }}>View</TableCell>
                      <TableCell sx={{ py: 1.5, color: '#8fabc9', borderColor: '#17304d' }}>Classical AI</TableCell>
                      <TableCell sx={{ py: 1.5, color: '#8fabc9', borderColor: '#17304d' }}>Quantum AI</TableCell>
                      <TableCell sx={{ py: 1.5, color: '#8fabc9', borderColor: '#17304d' }}>Verified</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(detail?.rows ?? []).map((r) => (
                      <TableRow
                        key={r.view}
                        sx={r.overridden ? {
                          background: `${OVERRIDE_GLOW}14`,
                          boxShadow: `inset 3px 0 0 0 ${OVERRIDE_GLOW}`,
                        } : undefined}
                      >
                        <TableCell sx={{ py: 2, fontWeight: 600, color: '#eaf4ff', borderColor: '#17304d' }}>{r.view}</TableCell>
                        <TableCell sx={{ py: 2, color: getColor(r.classical?.ai_result), borderColor: '#17304d' }}>{r.classical?.ai_result ?? '—'}</TableCell>
                        <TableCell sx={{ py: 2, color: getColor(r.quantum?.ai_result), borderColor: '#17304d' }}>{r.quantum?.ai_result ?? '—'}</TableCell>
                        <TableCell sx={{ py: 1, borderColor: '#17304d' }}>
                          {r.reviewed ? (
                            <Select
                              size="small"
                              value={r.verified ?? ''}
                              displayEmpty
                              onChange={(e) => requestChange(r.view, e.target.value)}
                              sx={{
                                minWidth: 130, fontSize: '0.85rem', color: getColor(r.verified),
                                '.MuiOutlinedInput-notchedOutline': { borderColor: '#17304d' },
                              }}
                            >
                              <MenuItem value="" disabled>Not reviewed</MenuItem>
                              {RESULTS.map((res) => (
                                <MenuItem key={res} value={res} sx={{ color: getColor(res) }}>{res}</MenuItem>
                              ))}
                            </Select>
                          ) : (
                            <Box title="Never reviewed with the mammogram image visible — can't be edited here." sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: '#5f7fa6', cursor: 'help' }}>
                              <LockOutlinedIcon sx={{ fontSize: 15 }} />
                              <Typography sx={{ fontSize: '0.8rem' }}>Never reviewed</Typography>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Box sx={{
                  display: 'flex', gap: 1.25, alignItems: 'flex-start', mt: 2,
                  p: 1.5, borderRadius: 1.5, border: `1px solid ${OVERRIDE_GLOW}66`, background: `${OVERRIDE_GLOW}14`,
                }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: OVERRIDE_GLOW, flexShrink: 0, mt: 0.35 }} />
                  <Typography sx={{ fontSize: '0.85rem', color: '#FFD98A', lineHeight: 1.6 }}>
                    Highlighted rows are where the verified result differs from the Classical AI reading.
                  </Typography>
                </Box>
                {(detail?.rows ?? []).some((r) => !r.reviewed) && (
                  <Box sx={{
                    display: 'flex', gap: 1.25, alignItems: 'flex-start', mt: 1.25,
                    p: 1.5, borderRadius: 1.5, border: '1px solid #2d4a6b', background: 'rgba(95,127,166,0.12)',
                  }}>
                    <LockOutlinedIcon sx={{ fontSize: 18, color: '#8fabc9', flexShrink: 0, mt: 0.15 }} />
                    <Typography sx={{ fontSize: '0.85rem', color: '#c3d8ec', lineHeight: 1.6 }}>
                      Locked views were never reviewed while the mammogram image was on screen — open a new
                      session to review them properly rather than setting a result blind.
                    </Typography>
                  </Box>
                )}
              </Box>

              <Box>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#8fabc9', letterSpacing: '0.08em', mb: 1 }}>
                  RISK ASSESSMENT
                </Typography>
                {(detail?.risk ?? []).map((r, i) => (
                  <Typography key={i} sx={{ fontSize: '0.85rem', color: '#c3d8ec' }}>
                    {r.model}: {r.risk_level ?? '—'} · Density {r.highest_density ?? '—'} · BI-RADS {r.highest_birads ?? '—'}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        {detail?.session && !detail.session.verified && (
          <DialogActions sx={{ px: 3, py: 1.5 }}>
            <Button
              size="small" startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
              onClick={() => setPendingDelete(detail.session)}
              sx={{ color: '#F87171', mr: 'auto' }}
            >
              Delete Session
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* Delete is only ever offered for unpublished sessions (see handleDeleteSession) —
          still confirm, since it's a permanent, irreversible action either way. */}
      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth PaperProps={{ sx: DIALOG_SX }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Delete this session?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#c3d8ec', lineHeight: 1.6 }}>
            <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{pendingDelete?.session_code}</Box>
            {' '}and all of its AI results and risk assessments will be permanently deleted. This can't be undone.
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: '#8fabc9', mt: 1.5 }}>
            This session was never published, so no patient could ever have seen it.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPendingDelete(null)} sx={{ color: '#8fabc9' }}>Cancel</Button>
          <Button onClick={handleDeleteSession} variant="contained" disabled={deleting} color="error" sx={{ fontWeight: 700 }}>
            {deleting ? 'Deleting…' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!shareSession} onClose={() => setShareSession(null)} maxWidth="xs" fullWidth PaperProps={{ sx: DIALOG_SX }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Patient link</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.85rem', color: '#8fabc9', mb: 1.5 }}>
            This link has been live since <Box component="span" sx={{ fontFamily: 'monospace' }}>{shareSession?.session_code}</Box> was published — it never expires.
          </Typography>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
            px: 2, py: 1.25, borderRadius: 1, border: '1px solid rgba(79,209,161,0.35)', background: 'rgba(79,209,161,0.08)',
          }}>
            <Typography sx={{
              fontFamily: 'monospace', fontSize: '0.78rem', color: '#c3d8ec',
              wordBreak: 'break-all', flex: 1, minWidth: 0,
            }}>
              {shareSession ? `${window.location.origin}/report/${shareSession.access_token}` : ''}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setShareSession(null)} sx={{ color: '#8fabc9' }}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/report/${shareSession.access_token}`);
              setCopied(true);
            }}
            sx={{ fontWeight: 700 }}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm-before-save — a verified result feeds a live patient link, so an
          accidental dropdown click shouldn't be able to change it unconfirmed. */}
      <Dialog open={!!pendingChange} onClose={() => setPendingChange(null)} maxWidth="xs" fullWidth PaperProps={{ sx: DIALOG_SX }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Change verified result?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#c3d8ec', lineHeight: 1.6 }}>
            {pendingChange?.view}: <Box component="span" sx={{ color: getColor(pendingChange?.from), fontWeight: 700 }}>{pendingChange?.from}</Box>
            {' → '}
            <Box component="span" sx={{ color: getColor(pendingChange?.to), fontWeight: 700 }}>{pendingChange?.to}</Box>
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: '#8fabc9', mt: 1.5 }}>
            {detail?.session?.verified
              ? 'This session is already published — the patient-facing link updates immediately.'
              : 'This session has not been published yet.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPendingChange(null)} sx={{ color: '#8fabc9' }}>Cancel</Button>
          <Button onClick={confirmChange} variant="contained" sx={{ fontWeight: 700 }}>Confirm Change</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
