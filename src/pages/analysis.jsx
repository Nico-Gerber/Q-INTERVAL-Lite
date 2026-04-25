import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Chip, Container, Typography, Alert,
} from '@mui/material';

import AnalysisStepper from '../components/stepper';
import ModeSelect from '../components/modeselect';
import ImageUpload from '../components/ImageUpload';
import ImageUploadOrder from '../components/ImageUploadOrder';
import ModelSelect from '../components/modelSelect';
import ClassificaionResults from '../components/classificationResults';

const API_BASE = 'http://localhost:8000';

const STEP_CONTENT = [
  { title: 'Select Analysis Mode',   subtitle: 'Choose the type of analysis you want to perform' },
  { title: 'Upload Mammogram Image', subtitle: 'Drag and drop or browse to upload your mammogram scan' },
  { title: 'View Results',           subtitle: 'Review the AI analysis output and confidence scores' },
];

export default function Analysis() {
  const navigate = useNavigate();
  const [file, setFile]           = useState(null);
  const [files, setFiles]         = useState([]);
  const [preview, setPreview]     = useState(null);
  const [status, setStatus]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const targetRef                 = useRef(null);
  const targetRef1                = useRef(null);
  const [analysisMode, setAnalysisMode] = useState(null);
  const [modelMode, setModelMode]       = useState('Classical');
  const [isVisible,  setIsVisible]      = useState(false);
  const [isVisible1, setIsVisible1]     = useState(false);
  const [activeStep, setActiveStep]     = useState(0);

  console.log(analysisMode);
  console.log(modelMode);

  useEffect(() => {
    const observer  = new IntersectionObserver(([e]) => setIsVisible(e.isIntersecting),  { threshold: 0.1 });
    const observer1 = new IntersectionObserver(([e]) => setIsVisible1(e.isIntersecting), { threshold: 0.1 });
    if (targetRef.current)  observer.observe(targetRef.current);
    if (targetRef1.current) observer1.observe(targetRef1.current);
    return () => { observer.disconnect(); observer1.disconnect(); };
  }, [result]);

  const handleAnalyse = async () => {
    if (!file) return;
    setLoading(true);
    setStatus(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const [uploadRes, qmlRes, cnnRes] = await Promise.all([
        fetch(`${API_BASE}/images/upload`, { method: 'POST', body: formData }),
        fetch(`${API_BASE}/QMLPredict`,    { method: 'POST', body: formData }),
        fetch(`${API_BASE}/CNNPredict`,    { method: 'POST', body: formData }),
      ]);
      const uploadData = await uploadRes.json();
      const qmlData    = await qmlRes.json();
      const cnnData    = await cnnRes.json();
      setResult({ filename: uploadData.filename, resultFile: { qml: qmlData, cnn: cnnData } });
    } catch {
      // error.main from theme is used here — not hardcoded
      setStatus({ ok: false, msg: 'Cannot reach the server. Make sure the backend is running.' });
    } finally {
      setLoading(false);
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
    <Box sx={{ backgroundColor: 'background.default', minHeight: '100%' }}>

      {/* ── Page shell ── */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          // Theme-driven gradient — adapts automatically when theme changes
          background: (theme) =>
            `linear-gradient(160deg, ${theme.palette.background.default} 0%, ${theme.palette.background.paper} 50%, ${theme.palette.background.default} 100%)`,
          color: 'text.primary',
          py: { xs: 5, md: 4 },
          minHeight: '100vh',
          px: 2,
          textAlign: 'center',
          // Soft radial glow using theme primary
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-20%', left: '50%',
            transform: 'translateX(-50%)',
            width: '700px', height: '700px',
            borderRadius: '50%',
            background: (theme) =>
              `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 65%)`,
            pointerEvents: 'none',
          },
        }}
      >
        {/* Grid overlay — theme primary at very low opacity */}
        <Box
          sx={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: (theme) => `
              linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px),
              linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Research disclaimer — uses theme error colour, intentional */}
        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{
            mb: 2,
            bgcolor: (theme) => `${theme.palette.error.main}18`,
            color: 'error.main',
            letterSpacing: '0.08em',
            fontSize: '0.65rem',
            fontWeight: 700,
            border: '1px solid',
            borderColor: (theme) => `${theme.palette.error.main}35`,
            borderRadius: '999px',
          }}
        />

        <Typography variant="h3" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-0.02em', color: 'text.primary' }}>
          Mammogram Analysis
        </Typography>
        <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 700, mx: 'auto', fontSize: 15 }}>
          Select an analysis mode — Classification or Future Risk Prediction — upload your mammogram image(s),
          and view results from your choice of Classical CNN, Quantum AI, or both.
        </Typography>

        {/* Server error alert — uses theme error, not hardcoded */}
        {status && !status.ok && (
          <Container maxWidth="sm" sx={{ mt: 2 }}>
            <Alert severity="error">{status.msg}</Alert>
          </Container>
        )}

        {/* ── Stepper ── */}
        <AnalysisStepper activeStep={activeStep} />

        {/* Step title block — consistent spacing with other pages */}
        <Container maxWidth="lg" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: 'text.primary' }}>
            {STEP_CONTENT[activeStep].title}
          </Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 580, mx: 'auto' }}>
            {STEP_CONTENT[activeStep].subtitle}
          </Typography>
        </Container>

        {/* ── Step 0: Mode select ── */}
        {activeStep === 0 && (
          <ModeSelect
            selectedMode={analysisMode}
            onModeSelect={setAnalysisMode}
            setActiveStep={setActiveStep}
          />
        )}

        {/* ── Step 1: Upload ── */}
        {activeStep === 1 && (
          analysisMode === 'classification' ? (
            <Container maxWidth="lg" sx={{ mt: 3 }}>
              <ImageUpload
                file={file}
                setFile={setFile}
                preview={preview}
                setPreview={setPreview}
                setActiveStep={setActiveStep}
                handleAnalyse={handleAnalyse}
              />
            </Container>
          ) : (
            <Container maxWidth="lg" sx={{ mt: 3 }}>
              <ImageUploadOrder
                file={files}
                setFiles={setFiles}
                preview={preview}
                setPreview={setPreview}
                setActiveStep={setActiveStep}
              />
            </Container>
          )
        )}

        {/* ── Step 2: Results ── */}
        {activeStep === 2 && (
          analysisMode === 'classification' ? (
            <>
              <ModelSelect
                selectedModel={modelMode}
                onModelSelect={setModelMode}
              />
              <Container maxWidth="xl">
                {/* ClassificaionResults manages its own functional colours
                    (positive/negative/confidence bars) — those stay in that component */}
                <ClassificaionResults
                  analyisedImage={preview}
                  reset={handleReset}
                  currentModel={modelMode}
                  results={result}
                />
              </Container>
            </>
          ) : (
            <Container />
          )
        )}

      </Box>
    </Box>
  );
}
