import React, { useCallback, useState } from 'react';
import { Box, Typography, Button, Alert, Container } from '@mui/material';
import { CloudUpload as UploadIcon, CheckCircleOutline as CheckIcon, WarningAmber as WarnIcon } from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

export default function ImageUpload({ file, setFile, preview, setPreview, setActiveStep }) {
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

    const f = accepted[0];
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus(null);
  }, [setFile, setPreview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleRemove = () => {
    setFile(null);
    setPreview(null);
    setStatus(null);
  };

  return (
    <Box>
      {!file ? (
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
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          p: 4,
          border: '2px solid rgba(100,181,246,0.4)',
          borderRadius: 3,
          backgroundColor: 'rgba(100,181,246,0.08)',
        }}>

          {/* Image preview */}
          <Box
            component="img"
            src={preview}
            alt="Selected mammogram"
            sx={{
              width: 220,
              height: 220,
              objectFit: 'cover',
              borderRadius: 3,
              border: '2px solid rgba(100,181,246,0.4)',
            }}
          />

          {/* File info */}
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'white', mb: 0.5 }}>
              {file.name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 2 }}>
              {file.size > 1 * 1024 * 1024
                ? (file.size / 1000024).toFixed(2) + ' MB'
                : (file.size / 1024).toFixed(1) + ' KB'}
              {' · '}
              {file.type}
            </Typography>

            {/* Ready indicator */}
            <Box sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 0.5,
              borderRadius: 10,
              backgroundColor: 'rgba(100,200,100,0.15)',
              border: '1px solid rgba(100,200,100,0.3)',
              mb: 2,
            }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#66BB6A' }} />
              <Typography variant="caption" sx={{ color: '#66BB6A', fontWeight: 600 }}>
                Ready for analysis
              </Typography>
            </Box>

            <br />
            <Button size="small" variant="outlined" color="error" onClick={handleRemove}>
              Remove
            </Button>
          </Box>

        </Box>
      )}

      {status && (
        <Alert
          severity={status.ok ? 'success' : 'error'}
          icon={status.ok ? <CheckIcon /> : <WarnIcon />}
          sx={{ mt: 2 }}
        >
          {status.msg}
        </Alert>
      )}


      <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
        <Button variant="contained" onClick={() => { setActiveStep(prev => prev - 1); setPreview(null); }}>Back</Button>

        <Button variant="contained" onClick={() => setActiveStep(prev => prev + 1)}>Next</Button>
      </Container>

    </Box>
  );
}