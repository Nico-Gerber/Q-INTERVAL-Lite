import React, { useCallback, useState } from 'react';
import { Box, Typography, Button, Alert, Paper } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

const fadeUp = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
};

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
      {/* Fixed height wrapper — both states stay within this */}
      <Box sx={{ height: 300, display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div key="empty" variants={fadeUp} initial="hidden" animate="visible" exit="exit" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Paper
                {...getRootProps()}
                elevation={0}
                sx={{
                  flex: 1,
                  border: '2px dashed',
                  borderColor: isDragActive ? 'primary.main' : 'rgba(255,255,255,0.12)',
                  borderRadius: 3,
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
                  width: 72, height: 72, borderRadius: 3,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5,
                }}>
                  <GalleryIcon sx={{ fontSize: 34, color: 'text.disabled' }} />
                </Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary' }}>
                  {isDragActive ? 'Drop the image here' : 'Image Upload Portal'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Drag & drop a mammogram, or click to browse
                </Typography>
                <Box sx={{
                  display: 'inline-flex', alignItems: 'center', mt: 0.5,
                  px: 1.5, py: 0.4, borderRadius: '999px', border: '1px solid', borderColor: 'divider',
                }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.07em', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                    JPEG · PNG · DICOM — Max 10 MB
                  </Typography>
                </Box>
              </Paper>
            </motion.div>
          ) : (
            <motion.div key="filled" variants={fadeUp} initial="hidden" animate="visible" exit="exit" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Paper
                elevation={0}
                sx={{
                  flex: 1,
                  border: '2px solid',
                  borderColor: (theme) => `${theme.palette.primary.main}40`,
                  borderRadius: 3,
                  px: 3,
                  py: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  backgroundColor: (theme) => `${theme.palette.primary.main}08`,
                }}
              >
                {/* Thumbnail — small and fixed, never grows */}
                <Box
                  component="img"
                  src={preview}
                  alt="Selected mammogram"
                  sx={{
                    width: 90,
                    height: 90,
                    objectFit: 'cover',
                    borderRadius: 2,
                    border: '2px solid',
                    borderColor: (theme) => `${theme.palette.primary.main}40`,
                    flexShrink: 0,
                  }}
                />

                {/* File info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary', mb: 0.25 }} noWrap>
                    {file.name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.25 }}>
                    {file.size > 1024 * 1024
                      ? (file.size / 1000024).toFixed(2) + ' MB'
                      : (file.size / 1024).toFixed(1) + ' KB'}
                    {' · '}{file.type}
                  </Typography>
                  <Box sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.75,
                    px: 1.25, py: 0.35, borderRadius: '999px',
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
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          >
            <Alert severity={status.ok ? 'success' : 'error'} icon={status.ok ? <CheckIcon /> : <WarnIcon />} sx={{ mt: 1.5 }}>
              {status.msg}
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.15 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          <Button variant="text" onClick={() => { setActiveStep(prev => prev - 1); setPreview(null); }} sx={{ letterSpacing: '0.04em', fontSize: '0.8rem' }}>
            ← Back to Configuration
          </Button>
          {file
            ? <Button variant="contained" onClick={() => { setActiveStep(prev => prev + 1); handleAnalyse(); }} sx={{ px: 3, fontWeight: 700 }}>Analyse →</Button>
            : <Button variant="contained" onClick={() => setStatus({ ok: false, msg: 'Upload an image to continue!' })} sx={{ px: 3, fontWeight: 700, opacity: 0.35 }}>Analyse →</Button>
          }
        </Box>
      </motion.div>
    </Box>
  );
}