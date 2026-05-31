import React, { useCallback } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

const formatSize = (b) =>
  b > 1024 * 1024 ? (b / 1000024).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB';

// ── File table ────────────────────────────────────────────────────────────────
const FileTable = ({ file, setFiles, getRootProps, getInputProps, isDragActive, updateDate, removeFile }) => (
  <Box sx={{
    border: '2px solid', borderColor: (t) => `${t.palette.primary.main}40`,
    borderRadius: 3, overflow: 'hidden',
    backgroundColor: (t) => `${t.palette.primary.main}08`,
    display: 'flex', flexDirection: 'column', height: 300,
  }}>
    {/* Add more strip */}
    <Box {...getRootProps()} sx={{
      px: 2, py: 0.75, cursor: 'pointer', flexShrink: 0,
      borderBottom: '1px solid', borderColor: 'divider',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
      backgroundColor: isDragActive ? (t) => `${t.palette.primary.main}0A` : 'transparent',
      transition: 'background-color 0.18s',
      '&:hover': { backgroundColor: (t) => `${t.palette.primary.main}06` },
    }}>
      <input {...getInputProps()} />
      <GalleryIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.7rem' }}>
        {isDragActive ? 'Drop to add' : `Add more — ${file.length} / 5 uploaded`}
      </Typography>
    </Box>

    {/* Column headers */}
    <Box sx={{
      display: 'grid', gridTemplateColumns: '28px 1fr 120px 44px 90px 68px',
      px: 2, py: 0.6, borderBottom: '1px solid', borderColor: 'divider',
      backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(8,145,178,0.04)',
      flexShrink: 0,
    }}>
      {['#', 'Name', 'Scan Date', 'Preview', 'Size', 'Actions'].map((col) => (
        <Typography key={col} variant="caption" sx={{
          color: 'text.disabled', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', fontSize: '0.6rem',
        }}>
          {col}
        </Typography>
      ))}
    </Box>

    {/* Rows */}
    <Box sx={{ flex: 1, overflowY: 'auto' }}>
      <Reorder.Group axis="y" values={file} onReorder={setFiles}
        style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <AnimatePresence>
          {file.map((item, index) => (
            <Reorder.Item key={item.id} value={item} style={{ cursor: 'grab' }}>
              <motion.div
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}
              >
                <Box sx={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 120px 44px 90px 68px',
                  px: 2, py: 0.75, alignItems: 'center',
                  borderBottom: '1px solid', borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                  '&:hover': { backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(8,145,178,0.03)' },
                }}>
                  <Box sx={{
                    width: 20, height: 20, borderRadius: 0.75,
                    backgroundColor: item.scanDate ? (t) => `${t.palette.primary.main}25` : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(8,145,178,0.08)',
                    border: '1px solid', borderColor: item.scanDate ? 'primary.main' : 'divider',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                  }}>
                    <Typography variant="caption" sx={{ color: item.scanDate ? 'primary.main' : 'text.secondary', fontWeight: 700, fontSize: '0.6rem' }}>
                      {index + 1}
                    </Typography>
                  </Box>

                  <Box sx={{ minWidth: 0, pr: 1 }}>
                    <Typography variant="caption" noWrap sx={{ color: 'text.primary', fontWeight: 500, display: 'block' }}>
                      {item.file.name}
                    </Typography>
                  </Box>

                  <TextField
                    type="date" size="small" value={item.scanDate}
                    onChange={(e) => updateDate(item.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    inputProps={{ max: new Date().toISOString().split('T')[0] }}
                    sx={{
                      '& .MuiInputBase-root': {
                        fontSize: '0.7rem', height: 28,
                        backgroundColor: item.scanDate
                          ? (t) => `${t.palette.primary.main}10`
                          : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(8,145,178,0.04)',
                        borderRadius: 1,
                      },
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: item.scanDate
                          ? (t) => `${t.palette.primary.main}60`
                          : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(8,145,178,0.25)',
                      },
                      '& input': { color: 'text.primary', px: 0.75, py: 0 },
                      '& input::-webkit-calendar-picker-indicator': {
                        filter: (t) => t.palette.mode === 'dark' ? 'invert(0.5)' : 'none',
                        cursor: 'pointer', width: 12,
                      },
                    }}
                  />

                  <Box component="img" src={item.preview} alt="preview" sx={{
                    width: 34, height: 34, objectFit: 'cover', borderRadius: 1,
                    border: '1px solid', borderColor: (t) => `${t.palette.primary.main}30`,
                  }} />

                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                    {formatSize(item.file.size)}
                  </Typography>

                  <Button size="small" variant="outlined" color="error"
                    onClick={() => removeFile(item.id)}
                    sx={{ fontSize: '0.62rem', py: 0.25, px: 0.75, minWidth: 0 }}>
                    Remove
                  </Button>
                </Box>
              </motion.div>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
    </Box>
  </Box>
);

// ── Main export ───────────────────────────────────────────────────────────────
export default function MultiImageUploadDated({ file: fileProp, setFiles, preview, setPreview, setActiveStep, handleAnalyse }) {
  const file = fileProp ?? [];

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length || file.length + accepted.length > 5) return;
    setFiles(prev => [
      ...prev,
      ...accepted.map(f => ({ file: f, preview: URL.createObjectURL(f), id: crypto.randomUUID(), scanDate: '' })),
    ]);
    setPreview(URL.createObjectURL(accepted[0]));
  }, [file, setFiles, setPreview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] },
    maxFiles: 5, maxSize: 10 * 1024 * 1024, multiple: true,
  });

  const updateDate = (id, v) => setFiles(prev => prev.map(x => x.id === id ? { ...x, scanDate: v } : x));
  const removeFile = (id) => setFiles(prev => prev.filter(x => x.id !== id));

  const allDated    = file.length > 0 && file.every(f => f.scanDate !== '');
  const missingDates = file.length > 0 && !allDated;
  const tooFew      = file.length > 0 && file.length < 2;
  const canContinue = file.length >= 2 && allDated;
  const datedCount  = file.filter(f => f.scanDate).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <CalendarIcon sx={{ fontSize: 14, color: 'primary.main' }} />
          <Typography sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em' }}>
            Sequential Future Risk · Scan dates required
          </Typography>
        </Box>
        {file.length > 0 && (
          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', transition: 'color 0.25s', color: allDated ? 'primary.main' : 'text.secondary' }}>
            {file.length} scan{file.length !== 1 ? 's' : ''} · {datedCount}/{file.length} dated
          </Typography>
        )}
      </Box>

      {/* Upload area — fills naturally, buttons follow below like session analysis */}
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence mode="wait">
          {file.length === 0 ? (
            <motion.div key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Box {...getRootProps()} sx={{
                height: 300, border: '2px dashed',
                borderColor: isDragActive ? 'primary.main' : 'divider',
                borderRadius: 3, cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 1.25,
                backgroundColor: isDragActive
                  ? (t) => `${t.palette.primary.main}07`
                  : 'background.paper',
                transition: 'all 0.18s',
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: (t) => `${t.palette.primary.main}05`,
                },
              }}>
                <input {...getInputProps()} />
                <Box sx={{
                  width: 60, height: 60, borderRadius: 3,
                  backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(8,145,178,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <GalleryIcon sx={{ fontSize: 28, color: isDragActive ? 'primary.main' : 'text.disabled' }} />
                </Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: isDragActive ? 'primary.main' : 'text.primary' }}>
                  {isDragActive ? 'Drop images here' : 'Sequential Scan Upload'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 300 }}>
                  Upload 2–5 scans, then enter a date for each
                </Typography>
                <Box sx={{ px: 1.5, py: 0.4, borderRadius: '999px', border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.07em', fontSize: '0.64rem', textTransform: 'uppercase' }}>
                    JPEG · PNG · DICOM — Max 10 MB · Min 2 · Up to 5
                  </Typography>
                </Box>
              </Box>
            </motion.div>
          ) : (
            <motion.div key="table"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <FileTable
                file={file} setFiles={setFiles}
                getRootProps={getRootProps} getInputProps={getInputProps} isDragActive={isDragActive}
                updateDate={updateDate} removeFile={removeFile}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      {/* Status alerts */}
      <AnimatePresence>
        {tooFew && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Box sx={{ display: 'flex', gap: 0.75, px: 1.25, py: 0.75, borderRadius: 1.5, backgroundColor: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', flexShrink: 0 }}>
              <GalleryIcon sx={{ fontSize: 14, color: 'info.main', mt: 0.1, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: 'info.main', fontSize: '0.72rem' }}>
                At least 2 scans required for sequential analysis.
              </Typography>
            </Box>
          </motion.div>
        )}
        {missingDates && !tooFew && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Box sx={{ display: 'flex', gap: 0.75, px: 1.25, py: 0.75, borderRadius: 1.5, backgroundColor: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', flexShrink: 0 }}>
              <WarnIcon sx={{ fontSize: 14, color: 'warning.main', mt: 0.1, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: 'warning.main', fontSize: '0.72rem' }}>
                Add a scan date for each image so the model can order them correctly.
              </Typography>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Button variant="text" onClick={() => { setActiveStep(prev => prev - 1); setPreview(null); }}
          sx={{ letterSpacing: '0.04em', fontSize: '0.8rem' }}>
          ← Back to Configuration
        </Button>
        <Button variant="contained" disabled={!canContinue}
          onClick={() => { setActiveStep(prev => prev + 1); handleAnalyse(); }}
          sx={{ px: 3, fontWeight: 700, color: '#FFFFFF' }}>
          Continue →
        </Button>
      </Box>
    </Box>
  );
}