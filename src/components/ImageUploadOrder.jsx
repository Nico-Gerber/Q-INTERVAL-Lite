import React, { useCallback, useState } from 'react';
import { Box, Typography, Button, Alert, Paper } from '@mui/material';
import {
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { Reorder } from 'framer-motion';

export default function ImageUploadOrder({ file, setFiles, preview, setPreview, setActiveStep, handleAnalyse }) {
  const [status, setStatus] = useState(null);

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length) {
      const msg = rejected[0].errors[0].message === 'File is larger than 10485760 bytes'
        ? 'File is larger than 10MB'
        : rejected[0].errors[0].message;
      setStatus({ ok: false, msg });
      return;
    }
    if (file.length + accepted.length > 4) {
      setStatus({ ok: false, msg: '4 file limit reached' });
      return;
    }
    setFiles(prev => [...prev, ...accepted.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
      id: crypto.randomUUID(),
    }))]);
    setPreview(URL.createObjectURL(accepted[0]));
    setStatus(null);
  }, [file, setFiles, setPreview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] },
    maxFiles: 4,
    maxSize: 10 * 1024 * 1024,
    multiple: true,
  });

  return (
    <Box>
      {/* Fixed height wrapper — matches ImageUpload so footer never jumps */}
      <Box sx={{ minHeight: 260, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {file.length === 0 ? (
          /* ── Empty portal — identical to ImageUpload empty state ── */
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
              {isDragActive ? 'Drop images here' : 'Secure Upload Portal'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Drag & drop up to 4 mammograms, or click to browse
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
                JPEG · PNG · DICOM — Max 10 MB each · Up to 4 files
              </Typography>
            </Box>
          </Paper>
        ) : (
          /* ── Files loaded — portal strip + reorderable rows ── */
          <Paper
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: (theme) => `${theme.palette.primary.main}40`,
              borderRadius: 3,
              backgroundColor: (theme) => `${theme.palette.primary.main}08`,
              overflow: 'hidden',
            }}
          >
            {/* Compact drop strip */}
            <Box
              {...getRootProps()}
              sx={{
                p: 1.5,
                textAlign: 'center',
                cursor: 'pointer',
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.25,
                backgroundColor: isDragActive
                  ? (theme) => `${theme.palette.primary.main}0A`
                  : 'transparent',
                transition: 'background-color 0.2s ease',
                '&:hover': {
                  backgroundColor: (theme) => `${theme.palette.primary.main}06`,
                },
              }}
            >
              <input {...getInputProps()} />
              <GalleryIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                {isDragActive ? 'Drop to add' : `Add more images — ${file.length} / 4 uploaded`}
              </Typography>
            </Box>

            {/* Column headers */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr 90px 72px 90px',
              px: 2.5,
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'rgba(255,255,255,0.03)',
            }}>
              {['Order', 'Name', 'Size', 'Preview', 'Actions'].map((col) => (
                <Typography key={col} variant="caption" sx={{
                  color: 'text.disabled',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  fontSize: '0.65rem',
                }}>
                  {col}
                </Typography>
              ))}
            </Box>

            {/* Reorderable rows */}
            <Reorder.Group
              axis="y"
              values={file}
              onReorder={setFiles}
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {file.map((item, index) => (
                <Reorder.Item key={item.id} value={item} style={{ cursor: 'grab' }}>
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: '48px 1fr 90px 72px 90px',
                    px: 2.5,
                    py: 1.5,
                    alignItems: 'center',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    transition: 'background-color 0.15s ease',
                    '&:last-child': { borderBottom: 'none' },
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.025)' },
                  }}>
                    <Box sx={{
                      width: 24,
                      height: 24,
                      borderRadius: 1,
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>
                        {index + 1}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 500, pr: 1 }} noWrap>
                      {item.file.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      {item.file.size > 1024 * 1024
                        ? (item.file.size / 1000024).toFixed(2) + ' MB'
                        : (item.file.size / 1024).toFixed(1) + ' KB'}
                    </Typography>
                    <Box
                      component="img"
                      src={item.preview}
                      alt="preview"
                      sx={{
                        width: 44,
                        height: 44,
                        objectFit: 'cover',
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: (theme) => `${theme.palette.primary.main}30`,
                      }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => setFiles(prev => prev.filter(f => f.id !== item.id))}
                      sx={{ fontSize: '0.68rem', py: 0.4, px: 1, minWidth: 0 }}
                    >
                      Remove
                    </Button>
                  </Box>
                </Reorder.Item>
              ))}
            </Reorder.Group>
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
        <Button
          variant="contained"
          onClick={() => { setActiveStep(prev => prev + 1); handleAnalyse(); }}
          sx={{ px: 3, fontWeight: 700 }}
        >
          Continue →
        </Button>
      </Box>
    </Box>
  );
}