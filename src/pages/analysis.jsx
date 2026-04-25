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
import ClassificaionResults from '../components/classificationResults';

const API_BASE = 'http://localhost:8000';



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
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);   // { ok, msg }
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);   // placeholder for future AI output
  const targetRef = useRef(null);
  const targetRef1 = useRef(null);
  const [analysisMode, setAnalysisMode] = useState(null);
  const [modelMode, setModelMode] = useState('Classical');

  const [isVisible, setIsVisible] = useState(false);
  const [isVisible1, setIsVisible1] = useState(false);

  const [activeStep, setActiveStep] = useState(0);



  console.log(analysisMode)
  console.log(modelMode)

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

      const [uploadRes, qmlRes, cnnRes] = await Promise.all([

        fetch(`${API_BASE}/images/upload`, { method: 'POST', body: formData }),
        fetch(`${API_BASE}/QMLPredict`, { method: 'POST', body: formData }),
        fetch(`${API_BASE}/CNNPredict`, { method: 'POST', body: formData }),

      ]);

      const uploadData = await uploadRes.json();
      const qmlData = await qmlRes.json();
      const cnnData = await cnnRes.json();


      setResult({

        filename: uploadData.filename,
        resultFile: {
          qml: qmlData,
          cnn: cnnData,
        }
      });




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
    setActiveStep(0)
  };







  return (
    <Box sx={{ backgroundColor: 'background.default', minHeight: '100%' }}>

      {/* ── Hero ── */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(160deg, #0A0F1A 0%, #0D1F3C 60%, #0A1628 100%)',
          color: 'white',
          py: { xs: 5, md: 4 },
          minHeight: '100vh',
          px: 2,
          textAlign: 'center',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-40%', left: '50%',
            transform: 'translateX(-50%)',
            width: '600px', height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,212,160,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          },
        }}
      >

        <Box sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `linear-gradient(rgba(0,212,160,0.04) 1px, transparent 1px), 
                      linear-gradient(90deg, rgba(0,212,160,0.04) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />
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
          <ModeSelect selectedMode={analysisMode} onModeSelect={setAnalysisMode} setActiveStep={setActiveStep} />
        )}

        {activeStep === 1 && (

          analysisMode === 'classification' ? (

            < Container maxWidth="lg" sx={{ mt: 3 }}>
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

            < Container maxWidth="lg" sx={{ mt: 3 }}>
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

        {activeStep === 2 && (

          analysisMode === 'classification' ? (

            <>
              <ModelSelect selectedModel={modelMode} onModelSelect={setModelMode}></ModelSelect>

              <Container maxWidth='xl'>
                <ClassificaionResults
                  analyisedImage={preview}
                  reset={handleReset}
                  currentModel={modelMode}
                  results={result}
                ></ClassificaionResults>
              </Container>
            </>
          ) : (


            <Container></Container>

          )

        )}





      </Box>



    </Box >


  );
}
