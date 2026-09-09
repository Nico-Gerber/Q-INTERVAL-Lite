import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Container, Typography, Chip, Button, CircularProgress } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Document, Page, View, Text, StyleSheet, pdf } from '@react-pdf/renderer';
import { supabase } from '../supabase/supabase';
import NeuralCanvas from '../Components/Shared/NeuralCanvas';
import ResultShell from '../Components/Shared/ResultShell';

const MC = '#FF6A4D', BC = '#E3A63C', NC = '#2FBFA8';
const getColor = (r) => (r === 'Malignant' ? MC : r === 'Benign' ? BC : NC);

// ── Patient copy PDF, built straight from this page's own (already
// simplified) data — no images, since none are retained past the session
// (see the disclaimer below). ──
const BRAND_DARK = '#0D1B2E';
const BRAND_CYAN = '#0891B2';
const BRAND_CYAN_BRIGHT = '#22D3EE';
const pdfStyles = StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 9.5, color: '#1e1e1e' },
    headerBand: { backgroundColor: BRAND_DARK, paddingTop: 26, paddingBottom: 18, paddingHorizontal: 32 },
    badge: {
        alignSelf: 'flex-start', fontSize: 7, color: '#FCA5A5', letterSpacing: 0.6,
        borderWidth: 1, borderColor: '#EF444488', borderRadius: 99,
        paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
    },
    brandRow: { flexDirection: 'row', alignItems: 'baseline' },
    brandTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#F0F9FF' },
    brandAccent: { fontSize: 20, fontFamily: 'Helvetica-BoldOblique', color: BRAND_CYAN_BRIGHT },
    meta: { fontSize: 9, color: '#8BAFC4', marginTop: 8 },
    body: { padding: 32, paddingTop: 22 },
    sectionTitle: {
        fontSize: 12.5, fontFamily: 'Helvetica-Bold', color: BRAND_DARK,
        marginBottom: 8, marginTop: 4, paddingBottom: 4,
        borderBottomWidth: 1.5, borderBottomColor: BRAND_CYAN,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    label: { color: '#707070' },
    value: { color: '#1e1e1e' },
    tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e2e2', paddingBottom: 3, marginBottom: 3 },
    tableHeaderCell: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#8a8a8a' },
    tableRow: { flexDirection: 'row', paddingVertical: 2.5 },
    tableCell: { fontSize: 9.5 },
    disclaimer: { fontSize: 8, color: '#8a8a8a', marginTop: 14, lineHeight: 1.5 },
    footer: { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between' },
    footerText: { fontSize: 7.5, color: '#999999' },
});

function PatientReportDoc({ report }) {
    return (
        <Document>
            <Page size="A4" style={pdfStyles.page}>
                <View style={pdfStyles.headerBand}>
                    <Text style={pdfStyles.badge}>RESEARCH PROTOTYPE · NOT FOR CLINICAL USE</Text>
                    <View style={pdfStyles.brandRow}>
                        <Text style={pdfStyles.brandTitle}>Mammo</Text>
                        <Text style={pdfStyles.brandAccent}>Analysis</Text>
                    </View>
                    <Text style={pdfStyles.meta}>
                        Session {report.session_code} · Patient copy · Verified {report.verified_at ? new Date(report.verified_at).toLocaleString() : '—'}
                    </Text>
                </View>

                <View style={pdfStyles.body}>
                    <Text style={pdfStyles.sectionTitle}>Your Results</Text>
                    <View style={pdfStyles.tableHeaderRow}>
                        <Text style={[pdfStyles.tableHeaderCell, { width: '30%' }]}>VIEW</Text>
                        <Text style={[pdfStyles.tableHeaderCell, { width: '70%' }]}>RESULT</Text>
                    </View>
                    {(report.views ?? []).map((v) => (
                        <View style={pdfStyles.tableRow} key={v.view}>
                            <Text style={[pdfStyles.tableCell, { width: '30%' }]}>{v.view}</Text>
                            <Text style={[pdfStyles.tableCell, { width: '70%', color: getColor(v.result) }]}>{v.result ?? '—'}</Text>
                        </View>
                    ))}

                    {report.risk && (
                        <>
                            <Text style={[pdfStyles.sectionTitle, { marginTop: 16 }]}>Risk Summary</Text>
                            <View style={pdfStyles.row}><Text style={pdfStyles.label}>Risk level</Text><Text style={pdfStyles.value}>{report.risk.risk_level ?? '—'}</Text></View>
                            <View style={pdfStyles.row}><Text style={pdfStyles.label}>Breast density</Text><Text style={pdfStyles.value}>{report.risk.highest_density ?? '—'}</Text></View>
                            <View style={pdfStyles.row}><Text style={pdfStyles.label}>BI-RADS</Text><Text style={pdfStyles.value}>{report.risk.highest_birads ?? '—'}</Text></View>
                        </>
                    )}

                    <Text style={pdfStyles.disclaimer}>
                        These results have been reviewed and confirmed by a clinician. Please discuss them with your
                        healthcare provider. Mammogram images aren't included — in this prototype's current state,
                        uploaded images aren't retained or stored after analysis, for security and privacy reasons.
                    </Text>
                </View>

                <View style={pdfStyles.footer} fixed>
                    <Text style={pdfStyles.footerText}>{report.session_code}</Text>
                    <Text style={pdfStyles.footerText}>Research prototype · Not for clinical use</Text>
                </View>
            </Page>
        </Document>
    );
}

async function downloadPatientPdf(report) {
    const blob = await pdf(<PatientReportDoc report={report} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MammoAnalysis-${report.session_code}-patient.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

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

      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1, py: 8 }}>
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

        <Typography variant="h3" sx={{
          fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary',
          mb: 3, fontSize: { xs: '2rem', md: '2.5rem' },
        }}>
          Mammo
          <Box component="span" sx={{ color: 'primary.main', fontStyle: 'italic' }}>
            Analysis
          </Box>
        </Typography>

        {state === 'loading' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={20} />
            <Typography sx={{ color: 'text.secondary' }}>Loading your results…</Typography>
          </Box>
        )}

        {state === 'not-found' && (
          <Typography sx={{ color: 'text.secondary' }}>
            These results aren't available yet. If your clinician has told you they're ready, double-check the
            link — otherwise, please check back later or contact your clinic.
          </Typography>
        )}

        {state === 'ready' && report && (
          <ResultShell>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5,
                px: 2, py: 1.25, borderRadius: 1.5, background: 'rgba(255,255,255,0.04)',
              }}>
                <Box>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.04em', color: '#eaf4ff' }}>
                    SESSION {report.session_code}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: '#8fabc9', mt: 0.25 }}>
                    Verified {report.verified_at ? new Date(report.verified_at).toLocaleDateString() : '—'}
                  </Typography>
                </Box>
                <Button
                  size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                  onClick={() => downloadPatientPdf(report)}
                  sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#eaf4ff', borderColor: 'rgba(240,249,255,0.3)' }}
                >
                  Download PDF
                </Button>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {(report.views ?? []).map((v) => (
                  <Box key={v.view} sx={{
                    p: 2, borderRadius: 2, border: '1px solid #17304d', background: 'rgba(255,255,255,0.04)',
                  }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#8fabc9', letterSpacing: '0.08em' }}>
                      {v.view}
                    </Typography>
                    <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: getColor(v.result), mt: 0.5 }}>
                      {v.result ?? '—'}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={{
                display: 'flex', gap: 1.25, alignItems: 'flex-start',
                p: 2, borderRadius: 2, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.1)',
              }}>
                <InfoOutlinedIcon sx={{ fontSize: 20, color: '#FBBF24', flexShrink: 0, mt: 0.2 }} />
                <Typography sx={{ fontSize: '0.8rem', color: '#FDE68A', lineHeight: 1.6, fontWeight: 500 }}>
                  Mammogram images aren't shown here — in this prototype's current state, uploaded images aren't
                  retained or stored after analysis, for security and privacy reasons.
                </Typography>
              </Box>

              {report.risk && (
                <Box sx={{ p: 2, borderRadius: 2, border: '1px solid #17304d', background: 'rgba(255,255,255,0.04)' }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#8fabc9', letterSpacing: '0.08em', mb: 1 }}>
                    RISK SUMMARY
                  </Typography>
                  <Typography sx={{ fontSize: '0.95rem', color: '#c3d8ec' }}>Risk level: {report.risk.risk_level ?? '—'}</Typography>
                  <Typography sx={{ fontSize: '0.95rem', color: '#c3d8ec' }}>Breast density: {report.risk.highest_density ?? '—'}</Typography>
                  <Typography sx={{ fontSize: '0.95rem', color: '#c3d8ec' }}>BI-RADS: {report.risk.highest_birads ?? '—'}</Typography>
                </Box>
              )}

              <Typography sx={{ fontSize: '0.8rem', color: '#8fabc9' }}>
                These results have been reviewed and confirmed by a clinician. Please discuss them with your
                healthcare provider.
              </Typography>
            </Box>
          </ResultShell>
        )}
      </Container>
    </Box>
  );
}
