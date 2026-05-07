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
      {/* minHeight matches mode card height so buttons line up with Continue */}
      <Box sx={{ minHeight: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {!file ? (
          <Paper
            {...getRootProps()}
            elevation={0}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'rgba(255,255,255,0.12)',
              borderRadius: 3,
              p: { xs: 6, md: 8 },
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              minHeight: 300,
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
              width: 80,
              height: 80,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1,
            }}>
              <GalleryIcon sx={{ fontSize: 38, color: 'text.disabled' }} />
            </Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary' }}>
              {isDragActive ? 'Drop the image here' : 'Image Upload Portal'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Drag & drop a mammogram, or click to browse
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
              border: '2px solid',
              borderColor: (theme) => `${theme.palette.primary.main}40`,
              borderRadius: 3,
              p: { xs: 4, md: 6 },
              minHeight: 300,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2.5,
              backgroundColor: (theme) => `${theme.palette.primary.main}08`,
            }}
          >
            <Box
              component="img"
              src={preview}
              alt="Selected mammogram"
              sx={{
                width: 120,
                height: 120,
                objectFit: 'cover',
                borderRadius: 2,
                border: '2px solid',
                borderColor: (theme) => `${theme.palette.primary.main}40`,
              }}
            />
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary', mb: 0.5 }}>
                {file.name}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                {file.size > 1024 * 1024
                  ? (file.size / 1000024).toFixed(2) + ' MB'
                  : (file.size / 1024).toFixed(1) + ' KB'}
                {' · '}{file.type}
              </Typography>
              <Box sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.5,
                py: 0.5,
                borderRadius: '999px',
                backgroundColor: (theme) => `${theme.palette.success.main}14`,
                border: '1px solid',
                borderColor: (theme) => `${theme.palette.success.main}30`,
                mb: 2,
              }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'success.main' }} />
                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, fontSize: '0.72rem' }}>
                  Ready for analysis
                </Typography>
              </Box>
              <br />
              <Button size="small" variant="outlined" color="error" onClick={handleRemove}>
                Remove
              </Button>
            </Box>
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