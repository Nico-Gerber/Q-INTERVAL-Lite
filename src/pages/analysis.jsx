import React, { useState, useRef, useEffect } from 'react';
import { Box, Chip, Container, Typography, Alert } from '@mui/material';

import AnalysisStepper from '../components/stepper';
import ModeSelect from '../components/modeselect';
import ImageUpload from '../components/ImageUpload';
import ImageUploadOrder from '../components/ImageUploadOrder';
import ModelSelect from '../components/modelSelect';
import ClassificationResults from '../components/classificationResults';
import FutureRiskResults from '../components/futureRiskResults';
import MammoRiskResults from '../components/mammoRiskResults';
import NeuralCanvas from '../components/neuralCanvas';

import { Atom } from 'react-loading-indicators';

const API_BASE = 'http://localhost:8000';

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
          fetch(`${API_BASE}/QMLPredictV2/`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/S2CNNPredict/predict`, { method: 'POST', body: formData }),

        ]);
        const [uploadData, qmlData, cnnData] = await Promise.all([
          uploadRes.json(), qmlRes.json(), cnnRes.json(),
        ]);

        console.log("result:", result);
        console.log("cnn:", result?.resultFile?.cnn);

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
    setFiles([]);
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

      {/* Radial glow */}
      <Box sx={{
        position: 'absolute',
        top: '-40%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: (theme) =>
          `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`,
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Grid overlay */}
      <Box sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundImage: (theme) =>
          `linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px),
           linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />

      <NeuralCanvas />

      {/* ── Hero ── */}
      <Box sx={{
        position: 'relative',
        zIndex: 1,
        pt: { xs: 5, md: 8 },
        pb: 0,
        px: 2,
        textAlign: 'center',
      }}>
        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{
            mb: 2.5,
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
        <Typography variant="h3" sx={{
          fontWeight: 700,
          mb: 1.5,
          letterSpacing: '-0.01em',
          color: 'text.primary',
        }}>
          Mammogram Analysis
        </Typography>
        <Typography variant="h6" sx={{
          color: 'text.secondary',
          fontWeight: 400,
          maxWidth: 520,
          mx: 'auto',
          lineHeight: 1.6,
        }}>
          Upload a mammogram and let our AI models detect, classify, and predict risk.
        </Typography>

        {status && !status.ok && (
          <Container maxWidth="sm" sx={{ mt: 2 }}>
            <Alert severity="error">{status.msg}</Alert>
          </Container>
        )}
      </Box>

      {/* ── Stepper ── */}
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <AnalysisStepper activeStep={activeStep} />
      </Box>

      {/* ── Step content ── */}
      <Box sx={{ position: 'relative', zIndex: 1, pb: { xs: 4, md: 5 }, px: 2 }}>

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
              <ImageUpload
                file={file} setFile={setFile}
                preview={preview} setPreview={setPreview}
                setActiveStep={setActiveStep}
                handleAnalyse={handleAnalyse}
              />
            </Container>
          ) : (
            <Container maxWidth="md" sx={{ mt: 1 }}>
              <ImageUploadOrder
                file={files} setFiles={setFiles}
                preview={preview} setPreview={setPreview}
                setActiveStep={setActiveStep}
                handleAnalyse={handleAnalyse}
              />
            </Container>
          )
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
                  <MammoRiskResults results={result} reset={handleReset} />
                </Container>
              )}
              {analysisMode === 'future-risk' && (
                <>
                  <ModelSelect selectedModel={modelMode} onModelSelect={setModelMode} />
                  <Container maxWidth="xl">
                    <FutureRiskResults
                      analyisedImage={preview} reset={handleReset}
                      currentModel={modelMode} results={result}
                    />
                  </Container>
                </>
              )}
            </>
          )
        )}

      </Box>
    </Box>
  );
}