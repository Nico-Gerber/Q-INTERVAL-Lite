import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Chip, Container, Typography, Alert,
} from '@mui/material';

import AnalysisStepper from '../components/stepper';
import ModeSelect from '../components/modeselect';
import ImageUpload from '../components/ImageUpload';
import ImageUploadOrder from '../components/ImageUploadOrder';
import ModelSelect from '../components/modelSelect';
import ClassificationResults from '../components/classificationResults';
import FutureRiskResults from '../components/futureRiskResults';

import NeuralCanvas from '../components/neuralCanvas';

import { Atom } from "react-loading-indicators";
import { m } from 'framer-motion';

const API_BASE = 'http://localhost:8000';

const STEP_CONTENT = [
  { title: 'Select Analysis Mode', subtitle: 'Choose the type of analysis you want to perform' },
  { title: 'Upload Mammogram Image', subtitle: 'Drag and drop or browse to upload your mammogram scan' },
  { title: 'View Results', subtitle: 'Review the AI analysis output and confidence scores' },
];

export default function Analysis() {
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const targetRef = useRef(null);
  const targetRef1 = useRef(null);
  const [analysisMode, setAnalysisMode] = useState(null);
  const [modelMode, setModelMode] = useState('Classical');
  const [isVisible, setIsVisible] = useState(false);
  const [isVisible1, setIsVisible1] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setIsVisible(e.isIntersecting), { threshold: 0.1 });
    const observer1 = new IntersectionObserver(([e]) => setIsVisible1(e.isIntersecting), { threshold: 0.1 });
    if (targetRef.current) observer.observe(targetRef.current);
    if (targetRef1.current) observer1.observe(targetRef1.current);
    return () => { observer.disconnect(); observer1.disconnect(); };
  }, [result]);

  const handleAnalyse = async () => {
    if (analysisMode === 'mammo-risk' && files.length === 0) return;
    if (analysisMode !== 'mammo-risk' && !file) return;

    setLoading(true);
    setStatus(null);

    if (analysisMode === 'mammo-risk') {
      const isMulti = files.length > 1;
      const multiFormData = new FormData();
      if (isMulti) {
        files.forEach(f => multiFormData.append('files', f.file));
      } else {
        multiFormData.append('file', files[0].file);
      }

      try {
        const res = await fetch(
          `${API_BASE}/mammo-risk/predict/${isMulti ? 'multi' : 'single'}`,
          { method: 'POST', body: multiFormData }
        );
        const mammoData = await res.json();
        setResult({ resultFile: mammoData });
      } catch {
        setStatus({ ok: false, msg: 'Cannot reach the server. Make sure the backend is running.' });
      } finally {
        setLoading(false);
      }

    } else {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const [uploadRes, qmlRes, cnnRes] = await Promise.all([
          fetch(`${API_BASE}/images/upload`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/QMLPredict`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/CNNPredict/?include_gradcam=true`, { method: 'POST', body: formData }),
        ]);
        const uploadData = await uploadRes.json();
        const qmlData = await qmlRes.json();
        const cnnData = await cnnRes.json();
        setResult({ filename: uploadData.filename, resultFile: { qml: qmlData, cnn: cnnData } });
      } catch {
        setStatus({ ok: false, msg: 'Cannot reach the server. Make sure the backend is running.' });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setStatus(null);
    setResult(null);
    setActiveStep(0);
  };

  return (
    <Box sx={{
      backgroundColor: 'background.default',
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden',
      background: (theme) => theme.palette.background.hero,
    }}>

      <Box sx={{
        position: 'absolute',
        top: '-20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '700px',
        height: '700px',
        borderRadius: '50%',
        background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}12 0%, transparent 65%)`,
        //                                                                 
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <Box sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundImage: (theme) => `linear-gradient(${theme.palette.primary.main}06 1px, transparent 1px), linear-gradient(90deg, ${theme.palette.primary.main}06 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />


      <NeuralCanvas />

      <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', pt: { xs: 6, md: 8 }, pb: { xs: 8, md: 12 }, px: 2 }}>

        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{ mb: 2, bgcolor: (theme) => `${theme.palette.error.main}18`, color: 'error.main', letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700, border: '1px solid', borderColor: (theme) => `${theme.palette.error.main}35`, borderRadius: '999px' }}
        />

        <Typography variant="h3" sx={{ fontWeight: 700, mb: 1, letterSpacing: '-0.01em', color: 'text.primary' }}>
          Mammogram Analysis
        </Typography>
        <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 700, mx: 'auto', fontSize: 15 }}>
          Select an analysis mode — Classification or Future Risk Prediction — upload your mammogram image(s),
          and view results from your choice of Classical CNN, Quantum AI, or both.
        </Typography>

        {status && !status.ok && (
          <Container maxWidth="sm" sx={{ mt: 2 }}>
            <Alert severity="error">{status.msg}</Alert>
          </Container>
        )}

        <AnalysisStepper activeStep={activeStep} />

        <Container maxWidth="lg" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
            {STEP_CONTENT[activeStep].title}
          </Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 580, mx: 'auto' }}>
            {STEP_CONTENT[activeStep].subtitle}
          </Typography>
        </Container>

        {activeStep === 0 && (
          <ModeSelect selectedMode={analysisMode} onModeSelect={setAnalysisMode} setActiveStep={setActiveStep} />
        )}

        {activeStep === 1 && (
          analysisMode === 'classification' ? (
            <Container maxWidth="lg" sx={{ mt: 3 }}>
              <ImageUpload file={file} setFile={setFile} preview={preview} setPreview={setPreview} setActiveStep={setActiveStep} handleAnalyse={handleAnalyse} />
            </Container>
          ) : (
            <Container maxWidth="lg" sx={{ mt: 3 }}>
              <ImageUploadOrder file={files} setFiles={setFiles} preview={preview} setPreview={setPreview} setActiveStep={setActiveStep} handleAnalyse={handleAnalyse} />
            </Container>
          )
        )}

        {activeStep === 2 && (
          <>
            {loading ? (
              <Box sx={{ mt: 15 }}>
                <Atom color='#2dd4bf' />
              </Box>
            ) : (
              <>
                <ModelSelect selectedModel={modelMode} onModelSelect={setModelMode} />
                <Container maxWidth="xl">
                  {analysisMode === 'classification' && (
                    <ClassificationResults analyisedImage={preview} reset={handleReset} currentModel={modelMode} results={result} />
                  )}
                  {analysisMode === 'mammo-risk' && (
                    <Box></Box>
                  )}
                  {analysisMode === 'future-risk' && (
                    <FutureRiskResults analyisedImage={preview} reset={handleReset} currentModel={modelMode} results={result} />
                  )}
                </Container>
              </>
            )}
          </>
        )}

      </Box>
    </Box>
  );
}