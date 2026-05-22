import React, { useState, useRef, useEffect } from 'react';
import { Box, Chip, Container, Typography, Alert } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';

import AnalysisStepper from '../components/stepper';
import ModeSelect from '../components/AnalysisModeSelect';
import ImageUpload from '../components/SingleImageUpload';

import ModelSelect from '../components/ModelResultSelect';
import ClassificationResults from '../components/classificationResults';
import FutureRiskResults from '../components/futureRiskResults';
import MammoRiskResults from '../components/mammoRiskResults';
import NeuralCanvas from '../components/neuralCanvas';
import MultiImageUploadDated from '../components/timeBasedMultiImage';
import MultiViewUpload from '../components/MultiImageUpload';

import { Atom } from 'react-loading-indicators';

const API_BASE = 'http://localhost:8000';

// Shared fade+slide up variant for step transitions
const stepVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: 'easeIn' } },
};

export default function Analysis() {
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);



  const [result, setResult] = useState(null);



  const [analysisMode, setAnalysisMode] = useState(null);
  const [modelMode, setModelMode] = useState('Classical');
  const [activeStep, setActiveStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isVisible1, setIsVisible1] = useState(false);

  const targetRef = useRef(null);
  const targetRef1 = useRef(null);


  const [views, setViews] = useState({
    "L-CC": null, "L-MLO": null,
    "R-CC": null, "R-MLO": null,
  })



  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setIsVisible(e.isIntersecting), { threshold: 0.1 });
    const observer1 = new IntersectionObserver(([e]) => setIsVisible1(e.isIntersecting), { threshold: 0.1 });
    if (targetRef.current) observer.observe(targetRef.current);
    if (targetRef1.current) observer1.observe(targetRef1.current);
    return () => { observer.disconnect(); observer1.disconnect(); };
  }, [result]);

  const handleAnalyse = async () => {
    if (analysisMode === 'mammo-risk' && files.length === 0) return;

    if (analysisMode === 'future-risk' && files.length === 0) return;
    if (analysisMode === 'classification' && Object.values(views).some(v => v === null)) return;

    setLoading(true);
    setStatus(null);

    if (analysisMode === 'mammo-risk') {
      const isMulti = files.length > 1;
      const endpoint = isMulti ? 'multi' : 'single';

      const cnnFormData = new FormData();
      const qmlFormData = new FormData();

      if (isMulti) {
        files.forEach(f => {
          cnnFormData.append('files', f.file);
          qmlFormData.append('files', f.file);
        });
      } else {
        cnnFormData.append('file', files[0].file);
        qmlFormData.append('file', files[0].file);
      }

      try {
        const [cnnRes, qmlRes] = await Promise.all([
          fetch(`${API_BASE}/mammo-risk/predict/${endpoint}`, { method: 'POST', body: cnnFormData }),
          fetch(`${API_BASE}/qml-mammo-risk/predict/${endpoint}`, { method: 'POST', body: qmlFormData }),
        ]);
        const [cnnData, qmlData] = await Promise.all([
          cnnRes.json(),
          qmlRes.json(),
        ]);
        setResult({ resultFile: { cnn: cnnData, qml: qmlData } });
      } catch {
        setStatus({ ok: false, msg: 'Cannot reach the server. Make sure the backend is running.' });
      } finally {
        setLoading(false);
      }

    } else if (analysisMode === 'future-risk') {
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

      try {
        const [qmlRes, cnnRes] = await Promise.all([
          //  fetch(`${API_BASE}/images/upload`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/QMLPredictV2/predict-four-views-QML`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/S2CNNPredict/predict-four-views`, { method: 'POST', body: formData }),
        ]);
        const [qmlData, cnnData] = await Promise.all([
          qmlRes.json(), cnnRes.json()
        ]);
        setResult({ resultFile: { qml: qmlData, cnn: cnnData } });
      } catch {
        setStatus({ ok: false, msg: 'Cannot reach the server. Make sure the backend is running.' });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleReset = () => {
    setFile(null);
    setFiles([]);
    setPreview(null);
    setStatus(null);
    setResult(null);
    setActiveStep(0);
    setViews({ "L-CC": null, "L-MLO": null, "R-CC": null, "R-MLO": null });

  };

  const stepPb = {
    0: { xs: 4, md: 5 },
    1: { xs: 10, md: 14 },
    2: { xs: 4, md: 5 },
  };

  return (
    <Box sx={{
      backgroundColor: 'background.default',
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden',
      background: (theme) => theme.palette.background.hero,
    }}>

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

      <NeuralCanvas />

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
              ) : analysisMode === 'mammo-risk' ? (
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
                <Box sx={{ mt: 8, display: 'flex', justifyContent: 'center' }}>
                  <Atom color='#2DD4BF' />
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
                      </Container>
                    </>
                  )}
                  {analysisMode === 'mammo-risk' && (
                    <Container maxWidth="xl">
                      <ModelSelect selectedModel={modelMode} onModelSelect={setModelMode} />
                      <MammoRiskResults results={result} reset={handleReset} currentModel={modelMode} />
                    </Container>
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
  );
}