import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Container, Typography, Chip } from '@mui/material';
import { supabase } from '../supabase/supabase';

const MC = '#FF6A4D', BC = '#E3A63C', NC = '#2FBFA8';
const getColor = (r) => (r === 'Malignant' ? MC : r === 'Benign' ? BC : NC);

export default function Report() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | not-found | ready
  const [report, setReport] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !token) { setState('not-found'); return; }

    supabase.rpc('get_patient_report', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) { setState('not-found'); return; }
      setReport(data);
      setState('ready');
    });

    return () => { cancelled = true; };
  }, [token]);

  return (
    <Box sx={{ minHeight: '100vh', background: (theme) => theme.palette.background.default, py: 8 }}>
      <Container maxWidth="sm">
        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{
            mb: 3, bgcolor: (theme) => `${theme.palette.error.main}18`, color: 'error.main',
            letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700,
            border: '1px solid', borderColor: (theme) => `${theme.palette.error.main}35`,
          }}
        />

        <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
          Your Mammogram Results
        </Typography>

        {state === 'loading' && (
          <Typography sx={{ color: 'text.secondary' }}>Loading your results…</Typography>
        )}

        {state === 'not-found' && (
          <Typography sx={{ color: 'text.secondary' }}>
            These results aren't available yet. If your clinician has told you they're ready, double-check the
            link — otherwise, please check back later or contact your clinic.
          </Typography>
        )}

        {state === 'ready' && report && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
              Session {report.session_code} · Verified {report.verified_at ? new Date(report.verified_at).toLocaleDateString() : ''}
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              {(report.views ?? []).map((v) => (
                <Box key={v.view} sx={{
                  p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider',
                  background: 'background.paper',
                }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.08em' }}>
                    {v.view}
                  </Typography>
                  <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: getColor(v.result), mt: 0.5 }}>
                    {v.result ?? '—'}
                  </Typography>
                </Box>
              ))}
            </Box>

            {report.risk && (
              <Box sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', background: 'background.paper' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.08em', mb: 1 }}>
                  RISK SUMMARY
                </Typography>
                <Typography sx={{ fontSize: '0.95rem' }}>Risk level: {report.risk.risk_level ?? '—'}</Typography>
                <Typography sx={{ fontSize: '0.95rem' }}>Breast density: {report.risk.highest_density ?? '—'}</Typography>
                <Typography sx={{ fontSize: '0.95rem' }}>BI-RADS: {report.risk.highest_birads ?? '—'}</Typography>
              </Box>
            )}

            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
              These results have been reviewed and confirmed by a clinician. Please discuss them with your
              healthcare provider.
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  );
}
