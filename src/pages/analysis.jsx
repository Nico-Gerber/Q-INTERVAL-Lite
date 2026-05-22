import React, { useState, useRef, useEffect } from 'react';
import { Box, Chip, Container, Typography, Alert, Button, Drawer } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, Menu, MenuItem, SubMenu } from 'react-pro-sidebar';


import AnalysisStepper from '../components/stepper';
import ModeSelect from '../components/AnalysisModeSelect';


import ModelSelect from '../components/ModelResultSelect';
import ClassificationResults from '../components/classificationResults';
import FutureRiskResults from '../components/futureRiskResults';
import MammoRiskResults from '../components/mammoRiskResults';
import NeuralCanvas from '../components/neuralCanvas';
import MultiImageUploadDated from '../components/timeBasedMultiImage';
import MultiViewUpload from '../components/MultiImageUpload';

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



  const [loadingText, setLoadingText] = useState(LOADING_MESSAGES[0].text);
  const [msgIndex, setMsgIndex] = useState(0);

  const [result, setResult] = useState(null);


  const [summary, setSummary] = useState(null);


  const [collapsed, setCollapsed] = useState(true);


  const [audience, setAudience] = useState("clinician")



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


    if (analysisMode === 'future-risk' && files.length === 0) return;
    if (analysisMode === 'classification' && Object.values(views).some(v => v === null)) return;

    setLoading(true);
    setStatus(null);

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


  const stepPb = {
    0: { xs: 4, md: 5 },
    1: { xs: 10, md: 14 },
    2: { xs: 4, md: 5 },
  };

  return (

    <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'flex-start' }}>

      <Box sx={{
        backgroundColor: 'background.default',
        minHeight: '100vh',
        flex: 1,
        position: 'relative',
        overflow: 'clip',   // ← 'clip' allows sticky children unlike 'hidden'
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
                      file={files} setFiles={setFiles}
                      preview={preview} setPreview={setPreview}
                      setActiveStep={setActiveStep}
                      handleAnalyse={handleAnalyse}
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
                    <Atom color='#2DD4BF' />
                    <Typography sx={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      color: 'rgba(255,255,255,0.45)',
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
                            uploadedFiles={files}
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
      {activeStep === 2 && !loading && analysisMode === 'classification' && result && (
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
                background: 'rgba(15,23,42,0.85)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#2DD4BF',
                boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
                '&:hover': {
                  background: 'rgba(25,35,55,0.95)',
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
              background: 'rgba(10,15,25,0.72)',
              borderLeft: '1px solid rgba(255,255,255,0.06)',

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
                  <Typography
                    sx={{
                      fontSize: '0.72rem',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.45)',
                      fontWeight: 700,
                    }}
                  >
                    AI Explanation
                  </Typography>

                  <Typography
                    sx={{
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      mt: 0.5,
                    }}
                  >
                    Clinical Summary
                  </Typography>
                </Box>


                <Box
                  sx={{
                    p: 2.2,
                    borderRadius: '22px',
                    background:
                      'linear-gradient(180deg, rgba(45,212,191,0.08), rgba(45,212,191,0.03))',
                    border: '1px solid rgba(45,212,191,0.12)',
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
                      <AutoAwesomeIcon sx={{ color: '#2DD4BF', fontSize: 18 }} />

                      <Typography
                        sx={{
                          color: '#2DD4BF',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Generated Interpretation
                      </Typography>
                    </Box>

                  ) : (<Container></Container>)



                  }

                  {LLMloading ? (

                    <Container sx={{ display: 'flex', justifyContent: 'center' }}>

                      <ThreeDot color='#2DD4BF' size="small" text="" textColor="" />

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
                          background: 'rgba(255,255,255,0.14)',
                          borderRadius: '999px',
                        },
                        '&::-webkit-scrollbar-thumb:hover': {
                          background: 'rgba(255,255,255,0.28)',
                        },
                      }}
                    >
                      <Typography
                        sx={{
                          color: 'rgba(255,255,255,0.78)',
                          fontSize: '0.92rem',
                          lineHeight: 1.85,
                        }}
                      >
                        {summary ? summary.explanation : 'Generate a structured explanation of the mammogram analysis results using AI analysis.'}
                      </Typography>
                    </Box>)}
                </Box>


                <Button
                  variant="contained"
                  fullWidth
                  onClick={handleExplain}
                  sx={{
                    height: 50,
                    borderRadius: '16px',
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    background:
                      'linear-gradient(135deg, #14B8A6 0%, #0EA5E9 100%)',
                    boxShadow: '0 10px 30px rgba(20,184,166,0.25)',
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