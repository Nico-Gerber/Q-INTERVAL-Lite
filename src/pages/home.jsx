import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Box, Button, Chip, Container, Divider, Paper,
  Step, StepLabel, Stepper, Typography, Alert,
  ToggleButton, ToggleButtonGroup, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import {
  Memory as ClassicalIcon,
  Science as QuantumIcon,
  AutoAwesome as BothIcon,
  CloudUpload as UploadIcon,
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  ImageSearch as ImageSearchIcon,
  InfoOutlined as InfoIcon,
  CenterFocusStrong,
} from '@mui/icons-material';




const API_BASE = 'http://localhost:8000';

const MODES = {
  classical: {
    label: 'Classical CNN',
    icon: <ClassicalIcon />,
    color: '#1565C0',
    description:
      'Convolutional Neural Network trained on mammogram datasets. Fast inference with high accuracy on standard imaging.',
  },
  quantum: {
    label: 'Quantum AI',
    icon: <QuantumIcon />,
    color: '#6A0DAD',
    description:
      'Quantum-enhanced model leveraging superposition and entanglement for pattern detection beyond classical limits.',
  },
  both: {
    label: 'Classical + Quantum',
    icon: <BothIcon />,
    color: '#C2185B',
    description:
      'Run both models in parallel and compare results. Ideal for research validation and benchmarking.',
  },
};





export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('classical');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);   // { ok, msg }
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);   // placeholder for future AI output
  const targetRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  // Derived active step
  const activeStep = file ? (result ? 2 : 1) : 0;

  const onDrop = useCallback((accepted, rejected) => {

    const toBigStrin = "File is larger than 10485760 bytes"


    if (rejected.length) {
      if (rejected[0].errors[0].message === toBigStrin) {

        setStatus({ ok: false, msg: 'File is larger than 10MB' });


        return;

      }


      setStatus({ ok: false, msg: rejected[0].errors[0].message });

      return;

    }




    const f = accepted[0];
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus(null);
    setResult(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,

  });



  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {

        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    if (targetRef.current) {
      observer.observe(targetRef.current);
    }

    return () => observer.disconnect();
  }, [result]);





  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleOpenDetails = () => setDetailsOpen(true);
  const handleCloseDetails = () => setDetailsOpen(false);

  const handleAnalyse = async () => {
    if (!file) return;
    setLoading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/images/upload`, { method: 'POST', body: formData });
      const data = await res.json();

      if (res.ok) {


        setStatus({
          ok: true, msg: `Image uploaded successfully (
    
               ${file.size > 1 * 1024 * 1024 ? (file.size / 1000024).toFixed(2) + ' MB ' + '· ' + file.type : (file.size / 1024).toFixed(1) + ' KB ' + '· ' + file.type})`
        });
        // Placeholder – real inference will populate this once AI models are integrated
        setResult({
          mode,
          filename: data.filename,

        });
      } else {
        setStatus({ ok: false, msg: data.detail || 'Upload failed.' });
      }
    } catch {
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
  };

  const selectedMode = MODES[mode];

  return (
    <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 8 }}>

      {/* ── Hero ── */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #0D1B2A 0%, #1565C0 100%)',
          color: 'white',
          py: { xs: 5, md: 8 },
          px: 2,
          textAlign: 'center',
        }}
      >
        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{
            mb: 2,
            backgroundColor: 'rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.08em',
            fontSize: '0.65rem',
            fontWeight: 700,
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        />
        <Typography variant="h3" sx={{ fontWeight: 800, mb: 1.5, letterSpacing: '-0.02em' }}>
          Mammogram Analysis
        </Typography>
        <Typography
          variant="h6"
          sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400, maxWidth: 580, mx: 'auto' }}
        >
          Upload a mammogram image and select an AI analysis method — Classical CNN, Quantum AI, or both.
        </Typography>
      </Box>

      <Container maxWidth="md" sx={{ mt: { xs: -3, md: -4 } }}>

        {/* ── Progress stepper ── */}
        <Paper elevation={2} sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 2 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {['Select Mode', 'Upload Image', 'View Results'].map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Paper>

        {/* ── Step 1: Mode selector ── */}
        <Paper elevation={2} sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1 }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
              1 · Select Analysis Mode
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={handleOpenDetails}
              startIcon={<InfoIcon fontSize="small" />}
              sx={{
                color: 'primary.main',
                textDecoration: 'underline',
                fontWeight: 700,
                minWidth: 0,
                p: 0,
              }}
            >
              How do these models differ?
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />

          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => { if (v) setMode(v); }}
            fullWidth
            sx={{ mb: 2, gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}
          >
            {Object.entries(MODES).map(([key, m]) => (
              <ToggleButton
                key={key}
                value={key}
                sx={{
                  flex: 1,
                  py: 1.5,
                  border: '2px solid !important',
                  borderColor: `${mode === key ? m.color : 'rgba(0,0,0,0.12)'} !important`,
                  borderRadius: '8px !important',
                  color: mode === key ? m.color : 'text.secondary',
                  backgroundColor: mode === key ? `${m.color}12` : 'transparent',
                  fontWeight: 600,
                  gap: 1,
                  '&:hover': { backgroundColor: `${m.color}18` },
                  '&.Mui-selected': {
                    color: m.color,
                    backgroundColor: `${m.color}12`,
                    '&:hover': { backgroundColor: `${m.color}20` },
                  },
                }}
              >
                {m.icon}
                <span style={{ fontSize: '0.85rem' }}>{m.label}</span>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {/* Mode description card */}
          <Box
            sx={{
              backgroundColor: `${selectedMode.color}0D`,
              border: `1px solid ${selectedMode.color}30`,
              borderLeft: `4px solid ${selectedMode.color}`,
              borderRadius: 2,
              px: 2,
              py: 1.5,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
            }}
          >
            <Box sx={{ color: selectedMode.color, mt: '2px' }}>{selectedMode.icon}</Box>
            <Box>
              <Typography variant="subtitle2" sx={{ color: selectedMode.color, fontWeight: 700 }}>
                {selectedMode.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedMode.description}
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* ── Step 2: Upload ── */}
        <Paper elevation={2} sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom>
            2 · Upload Mammogram Image
          </Typography>
          <Divider sx={{ mb: 2 }} />

          {!file ? (
            <Box
              {...getRootProps()}
              sx={{
                border: `2px dashed ${isDragActive ? '#1565C0' : 'rgba(0,0,0,0.2)'}`,
                borderRadius: 2,
                p: { xs: 4, md: 6 },
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: isDragActive ? 'rgba(21,101,192,0.04)' : 'rgba(0,0,0,0.01)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: '#1565C0',
                  backgroundColor: 'rgba(21,101,192,0.04)',
                },
              }}
            >
              <input {...getInputProps()} />
              <UploadIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                {isDragActive ? 'Drop the image here' : 'Drag & drop a mammogram image'}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                or click to browse
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Accepted: JPEG, PNG, DICOM (.dcm) · Max size: 10 MB
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Thumbnail */}
              <Box
                component="img"
                src={preview}
                alt="Selected mammogram"
                sx={{
                  width: 140,
                  height: 140,
                  objectFit: 'cover',
                  borderRadius: 2,
                  border: '1px solid rgba(0,0,0,0.1)',
                  flexShrink: 0,
                }}
              />
              <Box sx={{ flex: 1, minWidth: 180 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                  {file.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {file.size > 1 * 1024 * 1024 ? (file.size / 1000024).toFixed(2) + ' MB ' + '· ' + file.type : (file.size / 1024).toFixed(1) + ' KB ' + '· ' + file.type}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={handleReset}
                >
                  Remove
                </Button>
              </Box>
            </Box>
          )}

          {/* Status message */}
          {status && (
            <Alert
              severity={status.ok ? 'success' : 'error'}
              icon={status.ok ? <CheckIcon /> : <WarnIcon />}
              sx={{ mt: 2 }}
            >
              {status.msg}
            </Alert>
          )}
        </Paper>

        {/* ── Step 3: Analyse button ── */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <Button
            variant="contained"
            size="large"
            disabled={!file || loading}
            onClick={handleAnalyse}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ImageSearchIcon />}
            sx={{
              px: 5,
              py: 1.5,
              fontSize: '1rem',
              backgroundColor: selectedMode.color,
              '&:hover': { backgroundColor: selectedMode.color, filter: 'brightness(0.9)' },
              '&:disabled': { backgroundColor: 'rgba(0,0,0,0.1)' },
            }}
          >
            {loading ? 'Uploading…' : `Analyse with ${selectedMode.label}`}
          </Button>
        </Box>

        {/* ── Results */}
        {result && (
          <>
            <Paper
              elevation={2}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 2,
                borderTop: `4px solid ${selectedMode.color}`,
              }}
            >
              <Typography variant="h6" gutterBottom>
                3 · Analysis Results
              </Typography>
              <Divider sx={{ mb: 2 }} />


              <Box sx={{
                alignItems: 'center',
                justifyContent: 'center',
                display: 'flex',
                paddingBottom: '1rem',
              }}>

                <Box
                  component="img"
                  src={preview}
                  alt="Selected mammogram"
                  sx={{
                    width: 500,
                    height: 500,
                    objectFit: 'cover',


                    flexShrink: 0,
                  }}
                />




              </Box>

              <Box sx={{ mb: 2 }}>
                {/* Result Label */}
                <Typography fontWeight={500} variant='h3' gutterBottom>Malignant</Typography>
                {/* Percentage */}

                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography fontWeight={500} variant='subtitle2' fontSize={25} color='grey' gutterBottom>Confidence</Typography>
                  <Typography fontWeight={500} variant='subtitle2' fontSize={25} color='grey' gutterBottom>87%</Typography>
                </Box>
                <div ref={targetRef} >
                  <div style={{ background: '#eee', borderRadius: 4, height: 8 }}>
                    <div style={{

                      width: isVisible ? '87%' : '0%',
                      background: '#3440e8ff',
                      height: '100%',
                      borderRadius: 4,
                      transition: 'width 1s ease'
                    }} />
                  </div>
                </div>
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ flex: 1, background: '...', borderRadius: 2, p: 2 }}>
                  <Typography variant="caption">Model used</Typography>
                  <Typography variant="subtitle1" fontWeight={500}>{MODES[mode].label}</Typography>
                </Box>
                <Box sx={{ flex: 1, background: '...', borderRadius: 2, p: 2 }}>
                  <Typography variant="caption">Image</Typography>
                  <Typography variant="subtitle1" fontWeight={500}>{file.name}</Typography>
                </Box>
              </Box>



            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 7, padding: '1rem', }}>
              <Button
                variant="contained"
                size="large"
                disabled={!file || loading}
                onClick={handleReset}

                sx={{
                  px: 5,
                  py: 1.5,

                  fontSize: '1rem',
                  backgroundColor: selectedMode.color,
                  '&:hover': { backgroundColor: selectedMode.color, filter: 'brightness(0.9)' },
                  '&:disabled': { backgroundColor: 'rgba(0,0,0,0.1)' },
                }}
              >
                {'Reset'}
              </Button>
            </Box>


          </>
        )}



        <Dialog
          open={detailsOpen}
          onClose={handleCloseDetails}
          aria-labelledby="analysis-details-dialog-title"
          aria-describedby="analysis-details-dialog-description"
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle id="analysis-details-dialog-title">
            How do these models differ? 
          </DialogTitle>
          <DialogContent>
            <Box component="ul" sx={{ pl: 2, mb: 2 }}>
              <Typography component="li" variant="body2" sx={{ mb: 2 }}>
                <strong>Classical CNN</strong>:
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 2 }}>
                <strong>Quantum AI</strong>: 
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 2 }}>
                <strong>Classical + Quantum</strong>:
              </Typography>
            </Box>
            <Box sx={{ mt: 3, p: 2, backgroundColor: 'rgba(21, 101, 192, 0.08)', borderRadius: 1, borderLeft: `4px solid #1565C0` }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Want to learn more?</strong> Visit the Models page for an in-depth explanation of how each model works, training data, accuracy metrics, and more.
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDetails}>
              Close
            </Button>
            <Button 
              onClick={() => {
                handleCloseDetails();
                navigate('/models');
              }}
              variant="contained"
              color="primary"
            >
              View Models
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
