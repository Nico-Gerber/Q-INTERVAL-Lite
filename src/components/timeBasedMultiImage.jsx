import React, { useCallback, useState } from 'react';
import { Box, Typography, Button, Alert, Paper, TextField } from '@mui/material';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
};

export default function MultiImageUploadDated({ file, setFiles, preview, setPreview, setActiveStep, handleAnalyse }) {
  const [status, setStatus] = useState(null);

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length) {
      const msg = rejected[0].errors[0].message === 'File is larger than 10485760 bytes'
        ? 'File is larger than 10MB'
        : rejected[0].errors[0].message;
      setStatus({ ok: false, msg });
      return;
    }
    if (file.length + accepted.length > 5) {
      setStatus({ ok: false, msg: '5 file limit reached' });
      return;
    }
    setFiles(prev => [...prev, ...accepted.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
      id: crypto.randomUUID(),
      scanDate: '',   // ← date field added
    }))]);
    setPreview(URL.createObjectURL(accepted[0]));
    setStatus(null);
  }, [file, setFiles, setPreview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] },
    maxFiles: 5,
    maxSize: 10 * 1024 * 1024,
    multiple: true,
  });

  const updateDate = (id, value) => {
    setFiles(prev => prev.map(item =>
      item.id === id ? { ...item, scanDate: value } : item
    ));
  };

  const allDated = file.length > 0 && file.every(f => f.scanDate !== '');
  const missingDates = file.length > 0 && !allDated;
  const tooFew = file.length > 0 && file.length < 2;
  const canContinue = file.length >= 2 && allDated;

  return (
    <Box>
      <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CalendarIcon sx={{ fontSize: 15, color: 'primary.main' }} />
        <Typography variant="caption" sx={{
          color: 'primary.main', fontFamily: 'monospace',
          fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          Sequential scan mode — scan dates required for temporal ordering
        </Typography>
      </Box>

      <Box sx={{ height: 340, display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence mode="wait">
          {file.length === 0 ? (
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
                  {isDragActive ? 'Drop images here' : 'Sequential Scan Upload'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Upload mammograms in chronological order — you'll assign scan dates below
                </Typography>
                <Box sx={{
                  display: 'inline-flex', alignItems: 'center', mt: 0.5,
                  px: 1.5, py: 0.4, borderRadius: '999px', border: '1px solid', borderColor: 'divider',
                }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.07em', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                    JPEG · PNG · DICOM — Max 10 MB each · Min 2 · Up to 5 scans
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
                  backgroundColor: (theme) => `${theme.palette.primary.main}08`,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* drop strip */}
                <Box
                  {...getRootProps()}
                  sx={{
                    px: 2, py: 1, cursor: 'pointer', flexShrink: 0,
                    borderBottom: '1px solid', borderColor: 'divider',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.25,
                    backgroundColor: isDragActive ? (theme) => `${theme.palette.primary.main}0A` : 'transparent',
                    transition: 'background-color 0.2s ease',
                    '&:hover': { backgroundColor: (theme) => `${theme.palette.primary.main}06` },
                  }}
                >
                  <input {...getInputProps()} />
                  <GalleryIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {isDragActive ? 'Drop to add' : `Add more scans — ${file.length} / 5 uploaded`}
                  </Typography>
                </Box>

                {/* column headers */}
                <Box sx={{
                  display: 'grid', gridTemplateColumns: '32px 1fr 120px 50px 96px 72px',
                  px: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider',
                  backgroundColor: 'rgba(255,255,255,0.03)', flexShrink: 0,
                }}>
                  {['#', 'Name', 'Scan Date', 'Preview', 'Size', 'Actions'].map((col) => (
                    <Typography key={col} variant="caption" sx={{
                      color: 'text.disabled', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.07em', fontSize: '0.62rem',
                    }}>
                      {col}
                    </Typography>
                  ))}
                </Box>

                {/* rows */}
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                  <Reorder.Group
                    axis="y" values={file} onReorder={setFiles}
                    style={{ listStyle: 'none', margin: 0, padding: 0 }}
                  >
                    <AnimatePresence>
                      {file.map((item, index) => (
                        <Reorder.Item key={item.id} value={item} style={{ cursor: 'grab' }}>
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                          >
                            <Box sx={{
                              display: 'grid', gridTemplateColumns: '32px 1fr 120px 50px 96px 72px',
                              px: 2, py: 0.75, alignItems: 'center',
                              borderBottom: '1px solid', borderColor: 'divider',
                              '&:last-child': { borderBottom: 'none' },
                              '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' },
                            }}>
                              {/* index */}
                              <Box sx={{
                                width: 20, height: 20, borderRadius: 0.75,
                                backgroundColor: item.scanDate ? (theme) => `${theme.palette.primary.main}25` : 'rgba(255,255,255,0.07)',
                                border: '1px solid',
                                borderColor: item.scanDate ? 'primary.main' : 'divider',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s',
                              }}>
                                <Typography variant="caption" sx={{
                                  color: item.scanDate ? 'primary.main' : 'text.secondary',
                                  fontWeight: 700, fontSize: '0.62rem',
                                }}>
                                  {index + 1}
                                </Typography>
                              </Box>

                              {/* filename */}
                              <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 500, pr: 1 }} noWrap>
                                {item.file.name}
                              </Typography>

                              {/* date input */}
                              <TextField
                                type="date"
                                size="small"
                                value={item.scanDate}
                                onChange={(e) => updateDate(item.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                inputProps={{ max: new Date().toISOString().split('T')[0] }}
                                sx={{
                                  '& .MuiInputBase-root': {
                                    fontSize: '0.7rem', height: 28,
                                    backgroundColor: item.scanDate ? (theme) => `${theme.palette.primary.main}10` : 'rgba(255,255,255,0.04)',
                                    borderRadius: 1,
                                  },
                                  '& .MuiOutlinedInput-notchedOutline': {
                                    borderColor: item.scanDate ? (theme) => `${theme.palette.primary.main}60` : 'rgba(255,255,255,0.15)',
                                  },
                                  '& input': { color: 'text.primary', px: 0.75, py: 0 },
                                  '& input::-webkit-calendar-picker-indicator': { filter: 'invert(0.5)', cursor: 'pointer', width: 12 },
                                }}
                              />

                              {/* thumbnail */}
                              <Box
                                component="img" src={item.preview} alt="preview"
                                sx={{
                                  width: 34, height: 34, objectFit: 'cover', borderRadius: 1,
                                  border: '1px solid',
                                  borderColor: (theme) => `${theme.palette.primary.main}30`,
                                }}
                              />

                              {/* size */}
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                                {item.file.size > 1024 * 1024
                                  ? (item.file.size / 1000024).toFixed(2) + ' MB'
                                  : (item.file.size / 1024).toFixed(1) + ' KB'}
                              </Typography>

                              {/* remove */}
                              <Button
                                size="small" variant="outlined" color="error"
                                onClick={() => setFiles(prev => prev.filter(f => f.id !== item.id))}
                                sx={{ fontSize: '0.62rem', py: 0.25, px: 0.75, minWidth: 0 }}
                              >
                                Remove
                              </Button>
                            </Box>
                          </motion.div>
                        </Reorder.Item>
                      ))}
                    </AnimatePresence>
                  </Reorder.Group>
                </Box>
              </Paper>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      <AnimatePresence>
        {tooFew && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <Alert severity="info" icon={<GalleryIcon />} sx={{ mt: 1.5 }}>
              At least 2 scans are required for sequential future risk analysis.
            </Alert>
          </motion.div>
        )}
        {missingDates && !tooFew && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <Alert severity="warning" icon={<CalendarIcon />} sx={{ mt: 1.5 }}>
              Please add a scan date for each image so the model can order them correctly.
            </Alert>
          </motion.div>
        )}
        {status && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
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
          <Button
            variant="contained"
            disabled={!canContinue}
            onClick={() => { setActiveStep(prev => prev + 1); handleAnalyse(); }}
            sx={{ px: 3, fontWeight: 700 }}
          >
            Continue →
          </Button>
        </Box>
      </motion.div>
    </Box>
  );
}