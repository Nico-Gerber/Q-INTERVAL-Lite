import React, { useCallback, useState } from 'react';
import { Box, Typography, Button, Alert, Paper } from '@mui/material';
import {
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

export default function ImageUpload({ file, setFile, preview, setPreview, setActiveStep, handleAnalyse }) {
  const [status, setStatus] = useState(null);

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length) {
      const msg = rejected[0].errors[0].message === 'File is larger than 10485760 bytes'
        ? 'File is larger than 10MB'
        : rejected[0].errors[0].message;
      setStatus({ ok: false, msg });
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
      {/* Fixed height wrapper so footer stays anchored regardless of state */}
      <Box sx={{ minHeight: 260, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {!file ? (
          <Paper
            {...getRootProps()}
            elevation={0}
            sx={{
              border: '1px dashed',
              borderColor: isDragActive ? 'primary.main' : 'divider',
              borderRadius: 3,
              p: { xs: 4, md: 5 },
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              backgroundColor: isDragActive
                ? (theme) => `${theme.palette.primary.main}0A`
                : 'background.paper',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: (theme) => `${theme.palette.primary.main}08`,
              },
            }}
          >
            <input {...getInputProps()} />
            <Box sx={{
              width: 72,
              height: 72,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1,
            }}>
              <GalleryIcon sx={{ fontSize: 34, color: 'text.disabled' }} />
            </Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary' }}>
              {isDragActive ? 'Drop the image here' : 'Image Upload Portal'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Drag & drop a mammogram, 
              <br />or click to browse
            </Typography>
            <Box sx={{
              display: 'inline-flex',
              alignItems: 'center',
              mt: 0.5,
              px: 1.5,
              py: 0.4,
              borderRadius: '999px',
              border: '1px solid',
              borderColor: 'divider',
            }}>
              <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.07em', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                JPEG · PNG · DICOM — Max 10 MB
              </Typography>
            </Box>
          </Paper>
        ) : (
          <Paper
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: (theme) => `${theme.palette.primary.main}40`,
              borderRadius: 3,
              p: 2.5,
              display: 'flex',
              alignItems: 'center',
              gap: 2.5,
              backgroundColor: (theme) => `${theme.palette.primary.main}08`,
            }}
          >
            <Box
              component="img"
              src={preview}
              alt="Selected mammogram"
              sx={{
                width: 80,
                height: 80,
                objectFit: 'cover',
                borderRadius: 2,
                border: '1px solid',
                borderColor: (theme) => `${theme.palette.primary.main}40`,
                flexShrink: 0,
              }}
            />
            <Box sx={{ flex: 1, textAlign: 'left' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary', mb: 0.25 }}>
                {file.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                {file.size > 1024 * 1024
                  ? (file.size / 1000024).toFixed(2) + ' MB'
                  : (file.size / 1024).toFixed(1) + ' KB'}
                {' · '}{file.type}
              </Typography>
              <Box sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.35,
                borderRadius: '999px',
                backgroundColor: (theme) => `${theme.palette.success.main}14`,
                border: '1px solid',
                borderColor: (theme) => `${theme.palette.success.main}30`,
              }}>
                <Box sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: 'success.main' }} />
                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, fontSize: '0.7rem' }}>
                  Ready for analysis
                </Typography>
              </Box>
            </Box>
            <Button size="small" variant="outlined" color="error" onClick={handleRemove} sx={{ flexShrink: 0 }}>
              Remove
            </Button>
          </Paper>
        )}
      </Box>

      {status && (
        <Alert
          severity={status.ok ? 'success' : 'error'}
          icon={status.ok ? <CheckIcon /> : <WarnIcon />}
          sx={{ mt: 1.5 }}
        >
          {status.msg}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
        <Button
          variant="text"
          onClick={() => { setActiveStep(prev => prev - 1); setPreview(null); }}
          sx={{ letterSpacing: '0.04em', fontSize: '0.8rem' }}
        >
          ← Back to Configuration
        </Button>
        {file
          ? <Button variant="contained" onClick={() => { setActiveStep(prev => prev + 1); handleAnalyse(); }} sx={{ px: 3, fontWeight: 700 }}>Analyse →</Button>
          : <Button variant="contained" onClick={() => setStatus({ ok: false, msg: 'Upload an image to continue!' })} sx={{ px: 3, fontWeight: 700, opacity: 0.35 }}>Analyse →</Button>
        }
      </Box>
    </Box>
  );
}