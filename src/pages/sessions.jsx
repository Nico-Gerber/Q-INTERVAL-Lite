import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Select, MenuItem,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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

  useEffect(() => {
    if (!supabase) { setSessions([]); return; }
    supabase
      .from('sessions')
      .select('id, session_code, analysis_mode, verified, verified_at, created_at')
      .eq('analysis_mode', 'classification')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load sessions:', error); setSessions([]); return; }
        setSessions(data ?? []);
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
        <Typography variant="h3" sx={{ fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary', mb: 1, fontSize: { xs: '1.8rem', md: '2.25rem' } }}>
          My
          <Box component="span" sx={{ color: 'primary.main', fontStyle: 'italic' }}>
            Sessions
          </Box>
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3, fontSize: '0.9rem' }}>
          Every Session Analysis you've run — reviewed or not. Open one to adjust a verified result.
        </Typography>

        {sessions === null ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={20} />
            <Typography sx={{ color: 'text.secondary' }}>Loading…</Typography>
          </Box>
        ) : sessions.length === 0 ? (
          <Typography sx={{ color: 'text.secondary' }}>No sessions yet — run an analysis to see it here.</Typography>
        ) : (
          <ResultShell sx={{ p: { xs: 2, md: 2.5 }, pb: { xs: 3, md: 3.5 } }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#8fabc9', borderColor: '#17304d' }}>Session</TableCell>
                  <TableCell sx={{ color: '#8fabc9', borderColor: '#17304d' }}>Date</TableCell>
                  <TableCell sx={{ color: '#8fabc9', borderColor: '#17304d' }}>Status</TableCell>
                  <TableCell align="right" sx={{ color: '#8fabc9', borderColor: '#17304d' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#eaf4ff', borderColor: '#17304d' }}>{s.session_code}</TableCell>
                    <TableCell sx={{ fontSize: '0.85rem', color: '#c3d8ec', borderColor: '#17304d' }}>{new Date(s.created_at).toLocaleString()}</TableCell>
                    <TableCell sx={{ borderColor: '#17304d' }}>
                      <Chip
                        size="small"
                        label={s.verified ? 'Published' : 'Not published'}
                        sx={{
                          fontSize: '0.7rem', fontWeight: 700,
                          color: s.verified ? '#4fd1a1' : '#8fabc9',
                          borderColor: s.verified ? 'rgba(79,209,161,0.5)' : '#17304d',
                          background: s.verified ? 'rgba(79,209,161,0.1)' : 'transparent',
                        }}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ borderColor: '#17304d' }}>
                      <Button size="small" startIcon={<VisibilityIcon sx={{ fontSize: 15 }} />} onClick={() => openDetail(s)} sx={{ color: '#5cc8f5' }}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
              {detail?.session?.verified ? `Published ${new Date(detail.session.verified_at).toLocaleString()}` : 'Not yet published'}
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Typography sx={{ fontSize: '0.72rem', color: '#8fabc9', mt: 1.5 }}>
                  <Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: OVERRIDE_GLOW, mr: 0.75, verticalAlign: 'middle' }} />
                  Highlighted rows are where the verified result differs from the Classical AI reading.
                </Typography>
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
