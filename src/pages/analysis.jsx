import React, { useState, useEffect, useRef } from 'react';
import { Box, Chip, Container, Typography, Alert, Button, Drawer, TextField } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, Menu, MenuItem, SubMenu } from 'react-pro-sidebar';
import exportSessionPDF from '../Components/Results/Shared/ExportSession.js';
import DownloadIcon from '@mui/icons-material/Download';


import AnalysisStepper from '../Components/AnalysisTool/AnalysisStepper';
import ModeSelect from '../Components/AnalysisTool/AnalysisModeSelect';


import ClassificationResults from '../Components/Results/SessionAnalysis/ClassificationResults';
import FutureRiskResults from '../Components/Results/SequentialFtrRisk/FutureRiskResults';
import MammoRiskResults from '../Components/Results/SessionAnalysis/RiskAssessment';
import ScanningLoader from '../Components/Results/Shared/LoadingAnimation';
import MultiImageUploadDated from '../Components/ImageUpload/FutureRiskUpload';
import MultiViewUpload from '../Components/ImageUpload/SessionAnalysisUpload';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import AssistantIcon from '@mui/icons-material/Assistant';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { ThreeDot } from 'react-loading-indicators';

const API_BASE = 'http://localhost:8000';

function NeuralCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    const NODE_COUNT = 48;
    const CONNECT_DIST = 160;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.2 + 0.6,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.12;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(45,212,191,${alpha})`; ctx.lineWidth = 0.8; ctx.stroke();
          }
        }
      }
      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0) n.x = canvas.width; if (n.x > canvas.width) n.x = 0;
        if (n.y < 0) n.y = canvas.height; if (n.y > canvas.height) n.y = 0;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(45,212,191,0.28)'; ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} />;
}

// Shared fade+slide up variant for step transitions
const stepVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: 'easeIn' } },
};

const LOADING_MESSAGES = [
  { text: "Preprocessing mammogram views...", duration: 1200 },
  { text: "Running CNN classification — L-CC...", duration: 1000 },
  { text: "Running CNN classification — L-MLO...", duration: 1000 },
  { text: "Running CNN classification — R-CC...", duration: 1000 },
  { text: "Running CNN classification — R-MLO...", duration: 1000 },
  { text: "Generating Grad-CAM heatmaps...", duration: 1500 },
  { text: "Applying temperature calibration...", duration: 800 },
  { text: "Running quantum classification...", duration: 1200 },
  { text: "Encoding PCA features into qubits...", duration: 1000 },
  { text: "Measuring quantum circuit outputs...", duration: 1000 },
  { text: "Running composite risk pipeline...", duration: 1200 },
  { text: "Scoring breast density classification...", duration: 800 },
  { text: "Calculating BI-RADS risk score...", duration: 800 },
  { text: "Computing weighted risk index...", duration: 800 },
  { text: "Aggregating patient-level scores...", duration: 800 },
  { text: "Comparing classical vs quantum results...", duration: 1000 },
  { text: "Finalising analysis results...", duration: 800 },
  { text: "Almost there...", duration: 3000 },
];

// Short, readable per-session identifier — used in the results header, the
// PDF filename, and the PDF's own footer/title so a downloaded report can
// always be traced back to the session it came from.
// Format: QIL-MA-YYYYMMDD-HHMM-XXXX
//   QIL-MA   — Q-Interval-Lite+ MammoAnalysis
//   YYYYMMDD-HHMM — date and 24h time down to the minute
//   XXXX     — 4-char random alphanumeric tiebreaker for same-minute sessions
const genSessionId = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = '';
  for (let i = 0; i < 4; i++) hash += chars[Math.floor(Math.random() * chars.length)];
  return `QIL-MA-${date}-${time}-${hash}`;
};


export default function Analysis() {

  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const [LLMloading, setLLMLoading] = useState(false);

  const emptySession = () => ({
    id: crypto.randomUUID(),
    scanDate: '',
    views: { 'L-CC': null, 'R-CC': null, 'L-MLO': null, 'R-MLO': null },
  });


  const [sessions, setSessions] = useState([emptySession(), emptySession()]);


  const [loadingText, setLoadingText] = useState(LOADING_MESSAGES[0].text);
  const [msgIndex, setMsgIndex] = useState(0);

  const [result, setResult] = useState(null);
  const [sessionId, setSessionId] = useState(null);


  const [summary, setSummary] = useState(null);


  const [collapsed, setCollapsed] = useState(true);


  const [audience, setAudience] = useState("clinician")

  const [patientAge, setPatientAge] = useState('');



  const [analysisMode, setAnalysisMode] = useState(null);
  const [modelMode, setModelMode] = useState('Classical');
  const [activeStep, setActiveStep] = useState(0);



  const [views, setViews] = useState({
    "L-CC": null, "L-MLO": null,
    "R-CC": null, "R-MLO": null,
  })




  useEffect(() => {
    if (!loading) {
      setMsgIndex(0);
      setLoadingText(LOADING_MESSAGES[0].text);
      return;
    }

    let cancelled = false;
    let timeoutId;

    const advance = (index) => {
      if (cancelled || index >= LOADING_MESSAGES.length) return;
      setLoadingText(LOADING_MESSAGES[index].text);
      setMsgIndex(index);
      timeoutId = setTimeout(() => advance(index + 1), LOADING_MESSAGES[index].duration);
    };

    advance(0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [loading]);

  // Once past step 0 the hero/stepper are compact, so a plain scroll-to-top
  // is enough to bring each new step into view — no centering math needed.
  useEffect(() => {
    if (activeStep === 0) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeStep]);




  const handleAnalyse = async () => {


    // UNCOMMENT WHEN END POINTS COME if (analysisMode === 'future-risk' && files.length === 0) return;
    if (analysisMode === 'classification' && Object.values(views).some(v => v === null)) return;

    setLoading(true);
    setStatus(null);

    if (analysisMode === 'future-risk') {
      // sessions that have a date AND at least one uploaded image
      const datedSessions = sessions.filter(
        s => s.scanDate && Object.values(s.views).some(v => (v?.file ?? v) instanceof File)
      );

      if (datedSessions.length === 0) {
        setStatus({ ok: false, msg: 'Add at least one session with a date and one mammogram image.' });
        setLoading(false);
        return;
      }

      if (!patientAge) {
        setStatus({ ok: false, msg: 'Enter patient age before running future-risk analysis.' });
        setLoading(false);
        return;
      }

      setActiveStep(2);
      setSessionId(genSessionId());

      // UI slot names use hyphens; the endpoint expects underscores
      const slotMap = { 'L-CC': 'L_CC', 'R-CC': 'R_CC', 'L-MLO': 'L_MLO', 'R-MLO': 'R_MLO' };
      const viewKeys = ['L-CC', 'R-CC', 'L-MLO', 'R-MLO'];

      const fd = new FormData();
      if (patientAge) fd.append('age', String(patientAge));
      datedSessions.forEach((s, i) => {
        fd.append(`s${i}_date`, s.scanDate);
        Object.entries(slotMap).forEach(([uiKey, apiKey]) => {
          const v = s.views?.[uiKey];
          const file = v?.file ?? (v instanceof File ? v : null);
          if (file) fd.append(`s${i}_${apiKey}`, file);
        });
      });

      const qmlFd = new FormData();
      const qmlMetadata = {
        patient_age: Number(patientAge),
        exams: datedSessions.map((s, i) => ({
          exam_id: `exam_${i + 1}`,
          exam_date: s.scanDate,
          views: Object.fromEntries(
            viewKeys.map((viewKey) => {
              const file = s.views?.[viewKey]?.file ?? s.views?.[viewKey];
              const safeOriginalName = file?.name?.replace(/[^A-Za-z0-9._-]/g, '_') ?? `${viewKey}.png`;
              return [viewKey, `exam_${i + 1}_${viewKey}_${safeOriginalName}`];
            })
          ),
        })),
      };

      qmlFd.append('metadata_json', JSON.stringify(qmlMetadata));
      datedSessions.forEach((s, i) => {
        viewKeys.forEach((viewKey) => {
          const file = s.views?.[viewKey]?.file ?? s.views?.[viewKey];
          const filename = qmlMetadata.exams[i].views[viewKey];
          qmlFd.append('files', file, filename);
        });
      });

      // reshape /future-risk response into the { patient_summary, image_level_results }
      // contract FutureRiskResults reads
      const adaptFutureRisk = (api) => {
        if (!api?.risk_predictions) return null;
        const num = (x) => parseFloat(String(x).replace('%', '')) || 0;

        const yearly = Object.fromEntries(
          Object.entries(api.risk_predictions).map(([k, val]) => [k, num(val)])
        );

        // one contribution % per exam, matched by date (5-year relative contribution)
        const byDate = Object.fromEntries(
          (api.session_contributions ?? []).map(r =>
            [String(r.exam_date), r.risk_5yr_relative_contribution_percent ?? 0])
        );

        return {
          patient_summary: {
            final_patient_yearly_future_risk: yearly,
            final_patient_5_year_risk_score: yearly['5_year'] ?? 0,
          },
          // emit a row per session; null contribution lets the component fall back
          // to an even 1/n weight for single-view sessions (skipped in ablation)
          image_level_results: datedSessions.map((s, i) => ({
            filename: `exam_${i + 1}`,
            image_contribution_percent: byDate[String(s.scanDate)] ?? null,
          })),
        };
      };

      const adaptQmlFutureRisk = (api) => {
        const yearly = api?.future_risk?.age_adjusted_risk;
        if (!yearly) return null;

        const byExamId = Object.fromEntries(
          (api.exam_contributions ?? []).map(row => [
            String(row.exam_id),
            row.contribution_percent,
          ])
        );

        return {
          patient_summary: {
            final_patient_yearly_future_risk: yearly,
            final_patient_5_year_risk_score: yearly['5_year'] ?? 0,
            future_risk_score: yearly['5_year'] ?? 0,
            risk_level: api.future_risk?.risk_level,
          },
          image_level_results: datedSessions.map((s, i) => ({
            filename: `exam_${i + 1}`,
            image_contribution_percent: byExamId[`exam_${i + 1}`] ?? null,
          })),
          model_info: api.model,
        };
      };

      try {
        const [cnnRes, qmlRes] = await Promise.all([
          fetch(`${API_BASE}/future-risk`, { method: 'POST', body: fd }),
          fetch(`${API_BASE}/qml-future-risk-view-aware/`, { method: 'POST', body: qmlFd }),
        ]);

        const [cnnApi, qmlApi] = await Promise.all([cnnRes.json(), qmlRes.json()]);

        if (!cnnRes.ok) throw new Error(cnnApi?.detail ?? 'Classical future-risk request failed.');
        if (!qmlRes.ok) throw new Error(qmlApi?.detail ?? 'Quantum future-risk request failed.');

        const cnnData = adaptFutureRisk(cnnApi);
        const qmlData = adaptQmlFutureRisk(qmlApi);

        setResult({ resultFile: { qml: qmlData, cnn: cnnData } });
      } catch (err) {
        setStatus({ ok: false, msg: err?.message || 'Cannot reach the server. Make sure the backend is running.' });
      } finally {
        setLoading(false);
      }
      return;
    } else {
      setActiveStep(2);
      setSessionId(genSessionId());

      const formData = new FormData();
      formData.append('l_cc', views['L-CC'].file);
      formData.append('l_mlo', views['L-MLO'].file);
      formData.append('r_cc', views['R-CC'].file);
      formData.append('r_mlo', views['R-MLO'].file);

      const compositeRiskData = new FormData();
      compositeRiskData.append('files', views['L-CC'].file);
      compositeRiskData.append('files', views['L-MLO'].file);
      compositeRiskData.append('files', views['R-CC'].file);
      compositeRiskData.append('files', views['R-MLO'].file);



      try {
        const [qmlRes, sessionRes, CRqmlRes] = await Promise.all([
          fetch(`${API_BASE}/QMLPredictV2/predict-four-views-QML`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/session-analysis/predict-four-views`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/qml-mammo-risk/predict/multi`, { method: 'POST', body: compositeRiskData }),
        ]);
        const [qmlData, sessionData, CRqmlData] = await Promise.all([
          qmlRes.json(), sessionRes.json(), CRqmlRes.json(),
        ]);
        setResult({
          resultFile: {
            qml: qmlData,
            cnn: sessionData.classification,
            CRcnn: sessionData.composite_risk,
            CRqml: CRqmlData,
          }
        });
      } catch {
        setStatus({ ok: false, msg: 'Cannot reach the server. Make sure the backend is running.' });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleReset = () => {

    setFiles([]);
    setPreview(null);
    setStatus(null);
    setResult(null);
    setSessionId(null);
    setActiveStep(0);
    setViews({ "L-CC": null, "L-MLO": null, "R-CC": null, "R-MLO": null });
    setSummary("")
    setCollapsed(true)
    setSessions([emptySession(), emptySession()]);

  };


  const handleExplain = async () => {

    setLLMLoading(true);
    setSummary("")

    try {
      const llmRes = await fetch(`${API_BASE}/explain/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },  // ← must set this manually
        body: JSON.stringify({
          // CNN primary
          audience: audience,
          overall_classification: result.resultFile.cnn.aggregated.overall_classification,
          patient_malignant_score: result.resultFile.cnn.aggregated.patient_malignant_score,
          malignant_detected: result.resultFile.cnn.aggregated.malignant_detected,
          views: result.resultFile.cnn.views,
          composite_risk_score: result.resultFile.CRcnn?.future_risk_score ?? null,
          composite_risk_level: result.resultFile.CRcnn?.risk_level ?? null,
          highest_density: result.resultFile.CRcnn?.highest_density_risk_score ?? null,
          highest_birads: result.resultFile.CRcnn?.highest_birads_risk_score ?? null,
          // QML secondary
          qml_overall_classification: result.resultFile.qml?.aggregated?.overall_classification ?? null,
          qml_patient_malignant_score: result.resultFile.qml?.aggregated?.patient_malignant_score ?? null,
          qml_views: result.resultFile.qml?.views ?? null,
          qml_composite_risk_score: result.resultFile.CRqml?.future_risk_score ?? null,
          qml_composite_risk_level: result.resultFile.CRqml?.risk_level ?? null,
          qml_highest_density: result.resultFile.CRqml?.highest_density_risk_score ?? null,
          qml_highest_birads: result.resultFile.CRqml?.highest_birads_risk_score ?? null,
        })
      })

      const data = await llmRes.json()
      setSummary(data)


    } catch {

    } finally {
      setLLMLoading(false);
    }

  }

  const handleExplainFutureRisk = async () => {
    setLLMLoading(true);
    setSummary("");
    try {
      const cnnRaw = result.resultFile.cnn;
      const qmlRaw = result.resultFile.qml;
      const cnn = cnnRaw?.patient_summary ?? cnnRaw;
      const qml = qmlRaw?.patient_summary ?? qmlRaw;

      const datedSessions = sessions
        .filter(s => s.scanDate)
        .sort((a, b) => new Date(a.scanDate) - new Date(b.scanDate));

      const contribsOf = (raw) =>
        (raw?.image_level_results ?? []).map((r, i) => ({
          label: datedSessions[i]
            ? new Date(datedSessions[i].scanDate).getFullYear().toString()
            : r.filename,
          percent: r.image_contribution_percent,
        }));
      const llmRes = await fetch(`${API_BASE}/explain-future-risk/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: audience,
          patient_age: patientAge ? Number(patientAge) : null,
          num_exams: sessions.filter(s => s.scanDate).length,
          // Classical — primary
          cnn_yearly_risk: cnn?.final_patient_yearly_future_risk ?? null,
          cnn_five_year_risk: cnn?.final_patient_5_year_risk_score ?? null,
          cnn_exam_contributions: contribsOf(cnnRaw),
          // Quantum — secondary
          qml_yearly_risk: qml?.final_patient_yearly_future_risk ?? null,
          qml_five_year_risk: qml?.final_patient_5_year_risk_score ?? null,
          qml_exam_contributions: contribsOf(qmlRaw),
        }),
      });
      const data = await llmRes.json();
      setSummary(data);
    } catch (err) {
      console.error("Future-risk explain failed:", err);
      setStatus({ ok: false, msg: 'Explanation failed. Is Ollama running?' });
    } finally {
      setLLMLoading(false);
    }
  };





  const stepPb = {
    0: { xs: 4, md: 5 },
    1: { xs: 4, md: 5 },
    2: { xs: 4, md: 5 },
  };


  //mock data

  const dated = sessions.filter(s => s.scanDate);
  const examFiles = (dated.length ? dated : [
    { scanDate: '2024-01-01' },
    { scanDate: '2025-01-01' },
    { scanDate: '2026-01-01' },
  ]).map((s, i) => ({ scanDate: s.scanDate, file: { name: `exam_${i + 1}` } }));

  return (

    <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'flex-start' }}>

      <Box sx={{
        backgroundColor: 'background.default',
        minHeight: '100vh',
        flex: 1,
        position: 'relative',
        overflow: 'clip',
        background: (theme) => theme.palette.background.hero,
      }}>
        <NeuralCanvas />




        {/* Radial glow */}
        <Box sx={{
          position: 'absolute', top: '-40%', left: '50%',
          transform: 'translateX(-50%)', width: '500px', height: '500px',
          borderRadius: '50%',
          background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`,
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Grid overlay */}
        <Box sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: (theme) =>
            `linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px),
           linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />



        {/* ── Hero — one persistent element that smoothly shrinks past step 0, ──
             instead of swapping between two separate trees (which read as a
             jump-cut rather than an actual shrink). Chip + title stay put;
             only the descriptive subtitle collapses away. */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          <Box sx={{
            pt: activeStep === 0 ? { xs: 5, md: 8 } : { xs: 3.5, md: 4.5 },
            pb: 0, px: 2, textAlign: 'center',
            transition: 'padding-top 0.45s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <Chip
              label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
              size="small"
              sx={{
                mb: activeStep === 0 ? 2.5 : 1.5,
                bgcolor: (theme) => `${theme.palette.error.main}18`,
                color: 'error.main',
                letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700,
                border: '1px solid',
                borderColor: (theme) => `${theme.palette.error.main}35`,
                borderRadius: '999px',
                transition: 'margin-bottom 0.45s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
            <Typography variant="h3" sx={{
              fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary',
              mb: activeStep === 0 ? 1.5 : 0.5,
              fontSize: activeStep === 0 ? { xs: '2rem', md: '2.75rem' } : { xs: '1.6rem', md: '2.1rem' },
              transition: 'font-size 0.45s cubic-bezier(0.4,0,0.2,1), margin-bottom 0.45s cubic-bezier(0.4,0,0.2,1)',
            }}>
              Mammo
              <Box component="span" sx={{
                color: 'primary.main',
                fontStyle: 'italic',
              }}>
                Analysis
              </Box>
            </Typography>

            <AnimatePresence initial={false}>
              {activeStep === 0 && (
                <motion.div
                  key="hero-subtitle"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <Typography variant="body1" sx={{
                    color: 'text.secondary', fontWeight: 400,
                    maxWidth: 680, mx: 'auto', lineHeight: 1.7,
                    fontSize: '0.95rem', pb: 0.5,
                  }}>
                    Upload mammogram imaging for automated classification, composite risk scoring, and side-by-side classical vs quantum model comparison.
                  </Typography>
                </motion.div>
              )}
            </AnimatePresence>

            {status && !status.ok && (
              <Container maxWidth="sm" sx={{ mt: 2 }}>
                <Alert severity="error">{status.msg}</Alert>
              </Container>
            )}
          </Box>
        </motion.div>




        {/* ── Stepper — fades in slightly after hero ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15, ease: 'easeOut' }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          <AnalysisStepper activeStep={activeStep} />
        </motion.div>

        {/* ── Step content — AnimatePresence swaps between steps ── */}
        <Box sx={{ position: 'relative', zIndex: 1, pb: stepPb[activeStep], px: 2 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              variants={stepVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {activeStep === 0 && (
                <Container maxWidth="md" sx={{ mt: { xs: 3, md: 4.5 } }}>
                  <ModeSelect
                    selectedMode={analysisMode}
                    onModeSelect={setAnalysisMode}
                    setActiveStep={setActiveStep}
                  />
                </Container>
              )}

              {activeStep === 1 && (
                analysisMode === 'classification' ? (
                  <Container maxWidth="md" sx={{ mt: { xs: 3, md: 4.5 } }}>
                    <MultiViewUpload
                      views={views} setViews={setViews}
                      setActiveStep={setActiveStep}
                      handleAnalyse={handleAnalyse}
                    />

                  </Container>

                ) : analysisMode === 'future-risk' ? (
                  <Container maxWidth="md" sx={{ mt: { xs: 3, md: 4.5 } }}>



                    <MultiImageUploadDated
                      sessions={sessions}
                      setSessions={setSessions}
                      setActiveStep={setActiveStep}
                      handleAnalyse={handleAnalyse}
                      patientAge={patientAge}
                      setPatientAge={setPatientAge}
                    />
                  </Container>
                ) : null
              )}

              {activeStep === 2 && (
                <Box sx={{ minHeight: loading ? '55vh' : 'auto' }}>
                  {loading ? (
                    <Box sx={{
                      minHeight: '55vh', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <ScanningLoader message={loadingText} />
                    </Box>
                  ) : (
                    <>
                      {analysisMode === 'classification' && (
                        <>

                          <Container maxWidth="xl">
                            <Box sx={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5,
                              mb: 1.5, px: 2, py: 1.25, borderRadius: 1,
                              background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(8,145,178,0.05)',
                            }}>
                              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', color: '#FFFFFF' }}>
                                SESSION ID: {sessionId}
                              </Typography>
                              <Button
                                size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                                onClick={() => exportSessionPDF({ sessionId, analysisMode, currentModel: modelMode, result, summary, patientAge, sessions })}
                                sx={{ fontSize: '0.75rem', fontWeight: 700, borderRadius: 1.5 }}
                              >
                                Download PDF
                              </Button>
                            </Box>
                            <ClassificationResults
                              analyisedImage={preview} reset={handleReset} sessionId={sessionId}
                              currentModel={modelMode} results={result} onModelSelect={setModelMode}
                            />
                            <MammoRiskResults results={result} sessionId={sessionId}
                              reset={handleReset} currentModel={modelMode} />




                          </Container>
                        </>
                      )}



                      {analysisMode === 'future-risk' && (
                        <>

                          <Container maxWidth="xl">
                            <Box sx={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5,
                              mb: 1.5, px: 2, py: 1.25, borderRadius: 1,
                              background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(8,145,178,0.05)',
                            }}>
                              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', color: '#FFFFFF' }}>
                                SESSION ID: {sessionId}
                              </Typography>
                              <Button
                                size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                                onClick={() => exportSessionPDF({ sessionId, analysisMode, currentModel: modelMode, result, summary, patientAge, sessions })}
                                sx={{ fontSize: '0.75rem', fontWeight: 700, borderRadius: 1.5 }}
                              >
                                Download PDF
                              </Button>
                            </Box>
                            <FutureRiskResults
                              analyisedImage={preview} reset={handleReset}
                              currentModel={modelMode} results={result}
                              uploadedFiles={examFiles}
                              onModelSelect={setModelMode}
                            />
                          </Container>
                        </>
                      )}
                    </>
                  )}
                </Box>
              )}

            </motion.div>
          </AnimatePresence>
        </Box>
      </Box>
      {activeStep === 2 && !loading && result &&
        (analysisMode === 'classification' || analysisMode === 'future-risk') && (
          <>
            {/* Floating Toggle */}
            <Box
              sx={{
                position: 'fixed',
                right: collapsed ? 12 : 348,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 30,
                transition: 'right 0.25s ease',
              }}
            >
              <Button
                onClick={() => setCollapsed(!collapsed)}
                sx={{
                  minWidth: 0,
                  width: 52,
                  height: 52,
                  borderRadius: '18px',
                  backdropFilter: 'blur(14px)',
                  background: (theme) => theme.palette.mode === 'dark' ? 'rgba(15,23,42,0.85)' : 'rgba(8,145,178,0.90)',
                  border: (theme) => theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(8,145,178,0.3)',
                  color: '#FFFFFF',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                  '&:hover': {
                    background: (theme) => theme.palette.mode === 'dark' ? 'rgba(25,35,55,0.95)' : 'rgba(14,116,144,0.95)',
                    transform: 'scale(1.05)',
                  },
                }}
              >
                {collapsed ? <AssistantIcon /> : <ChevronRightIcon />}
              </Button>
            </Box>

            {/* Sidebar */}
            <Box
              sx={{
                width: 360,

                position: 'fixed',
                right: 0,
                top: 0,
                height: '100vh',

                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',

                backdropFilter: 'blur(18px)',
                background: (theme) => theme.palette.mode === 'dark' ? 'rgba(10,15,25,0.72)' : 'rgba(232,246,250,0.92)',
                borderLeft: (theme) => theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(8,145,178,0.18)',

                transform: collapsed ? 'translateX(100%)' : 'translateX(0)',
                transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',

                overflow: 'hidden',
                zIndex: 20,
                px: 2,
              }}
            >
              {!collapsed && (
                <Box
                  sx={{
                    p: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >

                  <Box>
                    <Typography sx={{
                      fontSize: '0.72rem',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(8,145,178,0.7)',
                      fontWeight: 700,
                    }}>
                      AI Explanation
                    </Typography>

                    <Typography sx={{
                      color: (theme) => theme.palette.mode === 'dark' ? '#FFFFFF' : theme.palette.text.primary,
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      mt: 0.5,
                    }}>
                      Clinical Summary
                    </Typography>
                  </Box>


                  <Box
                    sx={{
                      p: 2.2,
                      borderRadius: '22px',
                      background: (theme) => theme.palette.mode === 'dark'
                        ? 'linear-gradient(180deg, rgba(34,211,238,0.08), rgba(34,211,238,0.03))'
                        : 'linear-gradient(180deg, rgba(8,145,178,0.06), rgba(8,145,178,0.02))',
                      border: (theme) => theme.palette.mode === 'dark'
                        ? '1px solid rgba(34,211,238,0.12)'
                        : '1px solid rgba(8,145,178,0.20)',
                    }}
                  >

                    {summary ? (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 1.5,
                        }}
                      >
                        <AutoAwesomeIcon sx={{ color: 'primary.main', fontSize: 18 }} />
                        <Typography sx={{
                          color: 'primary.main',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}>
                          Generated Interpretation
                        </Typography>


                      </Box>

                    ) : (<Container></Container>)



                    }

                    {LLMloading ? (

                      <Container sx={{ display: 'flex', justifyContent: 'center' }}>

                        <ThreeDot color='#22D3EE' size="small" text="" textColor="" />

                      </Container>) : (


                      <Box
                        sx={{
                          maxHeight: 500,
                          overflowY: 'auto',
                          pr: 1,

                          '&::-webkit-scrollbar': {
                            width: '6px',
                          },
                          '&::-webkit-scrollbar-track': {
                            background: 'transparent',
                          },
                          '&::-webkit-scrollbar-thumb': {
                            background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(8,145,178,0.25)',
                            borderRadius: '999px',
                          },
                          '&::-webkit-scrollbar-thumb:hover': {
                            background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(8,145,178,0.45)',
                          },
                        }}
                      >
                        <Typography sx={{
                          color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.78)' : theme.palette.text.secondary,
                          fontSize: '0.92rem',
                          lineHeight: 1.85,
                        }}>
                          {summary ? summary.explanation : 'Generate a structured explanation of the mammogram analysis results using AI analysis.'}
                        </Typography>
                      </Box>)}
                  </Box>


                  <Button
                    variant="contained"
                    fullWidth
                    onClick={analysisMode === 'future-risk' ? handleExplainFutureRisk : handleExplain}
                    sx={{
                      height: 50,
                      borderRadius: '16px',
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      background: (theme) => theme.palette.mode === 'dark'
                        ? 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)'
                        : 'linear-gradient(135deg, #0E7490 0%, #0891B2 100%)',
                      color: '#FFFFFF',
                      boxShadow: '0 10px 30px rgba(8,145,178,0.30)',
                    }}
                  >
                    Generate Explanation
                  </Button>
                  {/* Audience toggle */}
                  <Box>
                    <Typography sx={{
                      fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                      fontWeight: 700, mb: 0.75,
                      color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(8,145,178,0.7)',
                    }}>
                      Audience
                    </Typography>

                    <Box sx={{
                      display: 'flex', gap: 0.5, p: 0.5, borderRadius: '14px',
                      background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(8,145,178,0.06)',
                      border: (theme) => theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(8,145,178,0.15)',
                    }}>
                      {[
                        { value: 'clinician', label: 'Clinician' },
                        { value: 'patient', label: 'Patient' },
                      ].map(({ value, label }) => {
                        const active = audience === value;
                        return (
                          <Box
                            key={value}
                            onClick={() => { setAudience(value); }}
                            sx={{
                              flex: 1, textAlign: 'center', cursor: 'pointer',
                              py: 0.9, borderRadius: '11px',
                              fontSize: '0.8rem', fontWeight: 700,
                              transition: 'all 0.18s',
                              color: active
                                ? '#FFFFFF'
                                : (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(8,145,178,0.7)',
                              background: active
                                ? (theme) => theme.palette.mode === 'dark'
                                  ? 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)'
                                  : 'linear-gradient(135deg, #0E7490 0%, #0891B2 100%)'
                                : 'transparent',
                              boxShadow: active ? '0 4px 14px rgba(8,145,178,0.30)' : 'none',
                              '&:hover': active ? {} : {
                                background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(8,145,178,0.05)',
                              },
                            }}
                          >
                            {label}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          </>
        )}
    </Box>
  );
}