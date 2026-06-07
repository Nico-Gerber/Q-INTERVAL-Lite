import React, { useState, useRef, useEffect, } from 'react';
import { Box, Chip, Container, Typography, Alert, Button, Drawer, TextField } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, Menu, MenuItem, SubMenu } from 'react-pro-sidebar';


import AnalysisStepper from '../Components/AnalysisTool/AnalysisStepper';
import ModeSelect from '../Components/AnalysisTool/AnalysisModeSelect';


import ModelSelect from '../Components/Results/ModelResultSelect';
import ClassificationResults from '../Components/Results/ClassificationResults';
import FutureRiskResults from '../Components/Results/FutureRiskResults';
import MammoRiskResults from '../Components/Results/MammoRiskResults';
import NeuralCanvas from '../Components/Results/NeuralCanvas';
import MultiImageUploadDated from '../Components/ImageUpload/FutureRiskUpload';
import MultiViewUpload from '../Components/ImageUpload/SessionAnalysisUpload';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import AssistantIcon from '@mui/icons-material/Assistant';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Atom, ThreeDot } from 'react-loading-indicators';

const API_BASE = 'http://localhost:8000';

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


  const [summary, setSummary] = useState(null);


  const [collapsed, setCollapsed] = useState(true);


  const [audience, setAudience] = useState("clinician")

  const [patientAge, setPatientAge] = useState('');



  const [analysisMode, setAnalysisMode] = useState(null);
  const [modelMode, setModelMode] = useState('Classical');
  const [activeStep, setActiveStep] = useState(0);


  const targetRef = useRef(null);
  const targetRef1 = useRef(null);


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

    const advance = (index) => {
      if (index >= LOADING_MESSAGES.length) return;
      setLoadingText(LOADING_MESSAGES[index].text);
      setMsgIndex(index);
      setTimeout(() => advance(index + 1), LOADING_MESSAGES[index].duration);
    };

    advance(0);
  }, [loading]);




  const handleAnalyse = async () => {


    // UNCOMMENT WHEN END POINTS COME if (analysisMode === 'future-risk' && files.length === 0) return;
    if (analysisMode === 'classification' && Object.values(views).some(v => v === null)) return;

    setLoading(true);
    setStatus(null);
    /*
    if (analysisMode === 'future-risk') {
      const isMulti = files.length > 1;
      const endpoint = isMulti ? 'multi' : 'single';

      const qmlFormData = new FormData();
      // const cnnFormData = new FormData(); // TODO: wire up CNN future risk endpoint when ready

      if (isMulti) {
        files.forEach(f => qmlFormData.append('files', f.file));
      } else {
        qmlFormData.append('file', files[0].file);
      }

      try {
        const [qmlRes] = await Promise.all([
          fetch(`${API_BASE}/qml-future-risk/predict/${endpoint}`, { method: 'POST', body: qmlFormData }),
          // fetch(`${API_BASE}/cnn-future-risk/predict/${endpoint}`, { method: 'POST', body: cnnFormData }), // TODO: CNN future risk
        ]);
        const [qmlData] = await Promise.all([
          qmlRes.json(),
          // cnnRes.json(), // TODO: CNN future risk
        ]);
        setResult({ resultFile: { qml: qmlData, cnn: null } });
      } catch {
        setStatus({ ok: false, msg: 'Cannot reach the server. Make sure the backend is running.' });
      } finally {
        setLoading(false);
      }
        */
    const datedSessions = sessions.filter(s => s.scanDate);


    if (analysisMode === 'future-risk') {
      // TEMP mock until AI team's endpoint is ready
      const mockYearly = {
        "1_year": 2.1, "2_year": 3.4, "3_year": 5.0,
        "4_year": 6.8, "5_year": 9.2,
      };

      const qmlData = {
        patient_summary: {
          final_patient_yearly_future_risk: mockYearly,
          final_patient_5_year_risk_score: 9.2,
        },
        image_level_results: datedSessions.map((s, i) => ({
          filename: `exam_${i + 1}`,
          image_contribution_percent: [58, 26, 16][i] ?? 10,
        })),
      };

      const cnnData = {
        patient_summary: {
          final_patient_yearly_future_risk: {
            "1_year": 1.8, "2_year": 3.0, "3_year": 4.4,
            "4_year": 5.9, "5_year": 7.6,
          },
          final_patient_5_year_risk_score: 7.6,
        },
        image_level_results: datedSessions.map((s, i) => ({
          filename: `exam_${i + 1}`,
          image_contribution_percent: [55, 30, 15][i] ?? 10,
        })),
      };

      setResult({ resultFile: { qml: qmlData, cnn: cnnData } });
      setLoading(false);
      return;
    } else {
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
        const [qmlRes, cnnRes, CRqmlRes, CRcnnRes] = await Promise.all([
          //  fetch(`${API_BASE}/images/upload`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/QMLPredictV2/predict-four-views-QML`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/S2CNNPredict/predict-four-views`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/qml-mammo-risk/predict/multi`, { method: 'POST', body: compositeRiskData }),
          fetch(`${API_BASE}/mammo-risk/predict/multi`, { method: 'POST', body: compositeRiskData }),

        ]);
        const [qmlData, cnnData, CRqmlData, CRcnnData] = await Promise.all([
          qmlRes.json(), cnnRes.json(), CRqmlRes.json(), CRcnnRes.json()
        ]);
        setResult({ resultFile: { qml: qmlData, cnn: cnnData, CRqml: CRqmlData, CRcnn: CRcnnData } });
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



        {/* ── Hero — fades in on mount ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          <Box sx={{ pt: { xs: 5, md: 8 }, pb: 0, px: 2, textAlign: 'center' }}>
            <Chip
              label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
              size="small"
              sx={{
                mb: 2.5,
                bgcolor: (theme) => `${theme.palette.error.main}18`,
                color: 'error.main',
                letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700,
                border: '1px solid',
                borderColor: (theme) => `${theme.palette.error.main}35`,
                borderRadius: '999px',
              }}
            />
            <Typography variant="h3" sx={{ fontWeight: 700, mb: 1.5, letterSpacing: '-0.01em', color: 'text.primary' }}>
              Mammogram Analysis
            </Typography>
            <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 520, mx: 'auto', lineHeight: 1.6 }}>
              Upload a mammogram and let our AI models detect, classify, and predict risk.
            </Typography>
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
                <ModeSelect
                  selectedMode={analysisMode}
                  onModeSelect={setAnalysisMode}
                  setActiveStep={setActiveStep}
                />
              )}

              {activeStep === 1 && (
                analysisMode === 'classification' ? (
                  <Container maxWidth="md" sx={{ mt: 1 }}>
                    <MultiViewUpload
                      views={views} setViews={setViews}
                      setActiveStep={setActiveStep}
                      handleAnalyse={handleAnalyse}
                    />

                  </Container>

                ) : analysisMode === 'future-risk' ? (
                  <Container maxWidth="md" sx={{ mt: 1 }}>



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
                loading ? (
                  <Box sx={{
                    mt: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2
                  }}>
                    <Atom color='#22D3EE' />
                    <Typography sx={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      color: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(8,145,178,0.7)',
                      textTransform: 'uppercase',
                    }}>
                      {loadingText}
                    </Typography>
                  </Box>
                ) : (
                  <>
                    {analysisMode === 'classification' && (
                      <>
                        <ModelSelect selectedModel={modelMode} onModelSelect={setModelMode} />
                        <Container maxWidth="xl">
                          <ClassificationResults
                            analyisedImage={preview} reset={handleReset}
                            currentModel={modelMode} results={result}
                          />
                          <MammoRiskResults results={result}
                            reset={handleReset} currentModel={modelMode} />




                        </Container>
                      </>
                    )}



                    {analysisMode === 'future-risk' && (
                      <>
                        <ModelSelect selectedModel={modelMode} onModelSelect={setModelMode} />
                        <Container maxWidth="xl">
                          <FutureRiskResults
                            analyisedImage={preview} reset={handleReset}
                            currentModel={modelMode} results={result}
                            uploadedFiles={examFiles}
                          />
                        </Container>
                      </>
                    )}
                  </>
                )
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
                </Box>
              )}
            </Box>
          </>
        )}
    </Box>
  );
}