import React, { useCallback, useState } from 'react';
import { Box, Typography, Button, Alert, Container } from '@mui/material';
import { CloudUpload as UploadIcon, CheckCircleOutline as CheckIcon, WarningAmber as WarnIcon } from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { motion } from "motion/react"
import { Reorder } from 'framer-motion';


export default function ImageUploadOrder({ file, setFiles, preview, setPreview, setActiveStep, activeStep, handleAnalyse }) {
  const [status, setStatus] = useState(null);

  const onDrop = useCallback((accepted, rejected) => {




    const toBigStrin = "File is larger than 10485760 bytes";

    if (rejected.length) {
      if (rejected[0].errors[0].message === toBigStrin) {
        setStatus({ ok: false, msg: 'File is larger than 10MB' });
        return;
      }
      setStatus({ ok: false, msg: rejected[0].errors[0].message });
      return;
    }
    console.log('Accepted files:', accepted);

    console.log('File:', file);

    console.log('File Length:', file.length + accepted.length)

    const f = accepted[0];
    if (file.length + accepted.length <= 4) {
      setFiles(prev => [...prev, ...accepted.map(f => ({
        file: f,
        preview: URL.createObjectURL(f),
        id: crypto.randomUUID(),
      }))]);
    } else {
      setStatus({ ok: false, msg: '4 File Limit' })
      return;
    }
    setPreview(URL.createObjectURL(f));
    setStatus(null);
  }, [file, setFiles, setPreview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] },
    maxFiles: 4,
    maxSize: 10 * 1024 * 1024,
    multiple: true
  });

  const handleRemove = () => {
    setFiles([]);
    setPreview(null);
    setStatus(null);
  };

  return (
    <Box>
      {file.length === 0 ? (
        <Box
          {...getRootProps()}
          sx={{
            border: `2px dashed ${isDragActive ? '#64B5F6' : 'rgba(255,255,255,0.3)'}`,
            borderRadius: 3,
            minHeight: 455,
            p: { xs: 4, md: 8 },
            textAlign: 'center',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDragActive ? 'rgba(100,181,246,0.08)' : 'rgba(255,255,255,0.03)',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: '#64B5F6',
              backgroundColor: 'rgba(100,181,246,0.05)',
            },
          }}
        >
          <input {...getInputProps()} />
          <UploadIcon sx={{ fontSize: 56, color: 'rgba(255,255,255,0.4)', mb: 2 }} />
          <Typography variant="subtitle1" fontWeight={600} sx={{ color: 'white', mb: 0.5 }}>
            {isDragActive ? 'Drop the image here' : 'Drag & drop a mammogram image'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
            or click to browse
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
            Accepted: JPEG, PNG, DICOM (.dcm) · Max size: 10 MB
          </Typography>
        </Box>
      ) : (
        <Box sx={{
          border: '2px solid rgba(100,181,246,0.4)',
          borderRadius: 3,
          backgroundColor: 'rgba(100,181,246,0.08)',
          overflow: 'hidden',
        }}>

          <Box sx={{
            padding: 5
          }}
            {...getRootProps()}>
            <input {...getInputProps()} />
            <UploadIcon sx={{ fontSize: 56, color: 'rgba(255,255,255,0.4)', mb: 2 }} />
            <Typography variant="subtitle1" fontWeight={600} sx={{ color: 'white', mb: 0.5 }}>
              {isDragActive ? 'Drop the image here' : 'Drag & drop a mammogram image'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
              or click to browse
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
              Accepted: JPEG, PNG, DICOM (.dcm) · Max size: 10 MB
            </Typography>
          </Box>
          {/* Column headers */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 100px 120px 80px',
            px: 3,
            py: 1.5,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}>
            {['Order', 'Name', 'Size', 'Preview', 'Actions'].map((col) => (
              <Typography key={col} variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {col}
              </Typography>
            ))}
          </Box>

          {/* File rows */}
          <Reorder.Group axis='y' values={file} onReorder={setFiles} style={{ listStyle: 'none' }}>
            {file.map((item, index) => (
              <Reorder.Item key={item.id} value={item}>
                <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: '0px 1fr 100px 120px 80px', px: 3, py: 2, alignItems: 'center', borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}>
                  <Typography sx={{ color: 'white' }}>{index + 1}</Typography>
                  <Typography variant="body2" sx={{ color: 'white' }}>{item.file.name}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {item.file.size > 1024 * 1024
                      ? (item.file.size / 1000024).toFixed(2) + ' MB'
                      : (item.file.size / 1024).toFixed(1) + ' KB'}
                  </Typography>
                  <Box component="img" src={item.preview} alt="preview" sx={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 1 }} />
                  <Button size="small" variant="outlined" color="error" onClick={() => setFiles(prev => prev.filter(f => f.id !== item.id))}>
                    Remove
                  </Button>

                </Box>
              </Reorder.Item>

            ))}
          </Reorder.Group>

        </Box>
      )
      }

      {
        status && (
          <Alert severity={status.ok ? 'success' : 'error'} icon={status.ok ? <CheckIcon /> : <WarnIcon />} sx={{ mt: 2 }}>
            {status.msg}
          </Alert>
        )
      }


      <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
        <Button variant="contained" onClick={() => { setActiveStep(prev => prev - 1); setPreview(null); }}>Back</Button>

        <Button variant="contained" onClick={() => { setActiveStep(prev => prev + 1); handleAnalyse(); }}>Next</Button>
      </Container>

    </Box >
  );
}