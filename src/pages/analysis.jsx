import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Box, Button, Chip, Container, Divider, Paper,
  Step, StepLabel, Stepper, Typography, Alert,
  ToggleButton, ToggleButtonGroup, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Card,
  CardHeader,
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

import AnalysisStepper from '../components/stepper';
import ModeSelect from '../components/modeselect';
import ImageUpload from '../components/ImageUpload';
import ImageUploadOrder from '../components/ImageUploadOrder';
import ModelSelect from '../components/modelSelect';


const API_BASE = 'http://localhost:8000';

const MODES = {
  classical: {
    label: 'Classical CNN',
    icon: <ClassicalIcon />,
    postmethod: '/CNNPredict',
    color: '#1565C0',
    description:
      'Convolutional Neural Network trained on mammogram datasets. Fast inference with high accuracy on standard imaging.',
  },
  quantum: {
    label: 'Quantum AI',
    icon: <QuantumIcon />,
    postmethod: '/QMLPredict',
    color: '#6A0DAD',
    description:
      'Quantum-enhanced model leveraging superposition and entanglement for pattern detection beyond classical limits.',
  },
  both: {
    label: 'Classical + Quantum',
    icon: <BothIcon />,
    postmethod: '',
    color: '#C2185B',
    description:
      'Run both models in parallel and compare results. Ideal for research validation and benchmarking.',
  },
};

const STEP_CONTENT = [
  {
    title: 'Select Analysis Mode',
    subtitle: 'Choose the type of analysis you want to perform',
  },
  {
    title: 'Upload Mammogram Image',
    subtitle: 'Drag and drop or browse to upload your mammogram scan',
  },
  {
    title: 'View Results',
    subtitle: 'Review the AI analysis output and confidence scores',
  },
];





export default function An() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('classical');
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);   // { ok, msg }
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);   // placeholder for future AI output
  const targetRef = useRef(null);
  const targetRef1 = useRef(null);
  const [analysisMode, setAnalysisMode] = useState(null);
  const [modelMode, setModelMode] = useState(null);

  const [isVisible, setIsVisible] = useState(false);
  const [isVisible1, setIsVisible1] = useState(false);

  const [activeStep, setActiveStep] = useState(0);



  console.log(analysisMode)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {

        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    const observer1 = new IntersectionObserver(
      ([entry]) => {

        setIsVisible1(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );



    if (targetRef.current) {
      observer.observe(targetRef.current);
    }
    if (targetRef1.current) {
      observer1.observe(targetRef1.current);
    }




    return () => {
      observer.disconnect()
      observer1.disconnect()

    };
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
      if (mode === 'both') {
        const [uploadRes, qmlRes, cnnRes] = await Promise.all([

          fetch(`${API_BASE}/images/upload`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/QMLPredict`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}/CNNPredict`, { method: 'POST', body: formData }),

        ]);

        const uploadData = await uploadRes.json();
        const qmlData = await qmlRes.json();
        const cnnData = await cnnRes.json();


        setResult({
          mode,
          filename: uploadData.filename,
          resultFile: {
            qml: qmlData,
            cnn: cnnData,
          }
        });


      } else {

        const [res, AIres] = await Promise.all([

          fetch(`${API_BASE}/images/upload`, { method: 'POST', body: formData }),
          fetch(`${API_BASE}${selectedMode.postmethod}`, { method: 'POST', body: formData }),

        ]);


        const data = await res.json();


        const AIdata = await AIres.json()


        if (res.ok) {


          setStatus({
            ok: true, msg: `Image uploaded successfully (
    
               ${file.size > 1 * 1024 * 1024 ? (file.size / 1000024).toFixed(2) + ' MB ' + '· ' + file.type : (file.size / 1024).toFixed(1) + ' KB ' + '· ' + file.type})`
          });

          setResult({
            mode,
            filename: data.filename,
            resultFile: AIdata

          });
        } else {
          setStatus({ ok: false, msg: data.detail || 'Upload failed.' });
        }
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
    <Box sx={{ backgroundColor: 'background.default', minHeight: '100%' }}>

      {/* ── Hero ── */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #0D1B2A 0%, #1565C0 100%)',
          color: 'white',
          py: { xs: 5, md: 4 },
          minHeight: '100vh',
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
        <Typography variant="h3" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-0.02em' }}>
          Mammogram Analysis
        </Typography>
        <Typography
          variant="h6"
          sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400, maxWidth: 700, mx: 'auto', fontSize: 15 }}
        >
          Select an analysis mode — Classification or Future Risk Prediction — upload your mammogram image(s), and view results from your choice of Classical CNN, Quantum AI, or both.
        </Typography>




        {/* ── Stepper ── */}
        <AnalysisStepper activeStep={activeStep} />

        {/* Step Ttitle */}
        <Container maxWidth="lg" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, }}>
            {STEP_CONTENT[activeStep].title}

          </Typography>


          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400, maxWidth: 580, mx: 'auto' }}>
            {STEP_CONTENT[activeStep].subtitle}
          </Typography>



        </Container>


        {activeStep === 0 && (
          <ModeSelect selectedMode={analysisMode} onModeSelect={setAnalysisMode} />
        )}

        {activeStep === 1 && (

          analysisMode === 'classification' ? (

            < Container maxWidth="lg" sx={{ mt: 3 }}>
              <ImageUpload
                file={file}
                setFile={setFile}
                preview={preview}
                setPreview={setPreview}
              />
            </Container>


          ) : (

            < Container maxWidth="lg" sx={{ mt: 3 }}>
              <ImageUploadOrder
                file={files}
                setFiles={setFiles}
                preview={preview}
                setPreview={setPreview}
              />
            </Container>

          )
        )}

        {activeStep === 2 && (

          <ModelSelect selectedModel={modelMode} onModelSelect={setModelMode}></ModelSelect>

        )}


        {/* ── Forward and Back Buttons ── */}

        <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          {activeStep === 0 ? (<Button disabled></Button>) : (<Button variant="contained" onClick={() => { setActiveStep(prev => prev - 1); setFile(null); setPreview(null); }}>Back</Button>)}

          <Button variant="contained" onClick={() => setActiveStep(prev => prev + 1)}>Next</Button>
        </Container>

      </Box>



    </Box >


  );
}
