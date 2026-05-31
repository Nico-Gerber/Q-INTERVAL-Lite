import React, { useCallback, useState } from 'react';
import {
  Box, Typography, Button, Alert, Paper, Tooltip,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

// ── Animation variant (matches existing codebase) ─────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
};

// ── View configuration ─────────────────────────────────────────────────────────
const VIEW_CONFIG = [
  {
    key: 'L-CC',
    label: 'L-CC',
    fullLabel: 'Left Craniocaudal',
    description: 'Left breast — top-down view',
    formKey: 'l_cc',
  },
  {
    key: 'R-CC',
    label: 'R-CC',
    fullLabel: 'Right Craniocaudal',
    description: 'Right breast — top-down view',
    formKey: 'r_cc',
  },
  {
    key: 'L-MLO',
    label: 'L-MLO',
    fullLabel: 'Left Mediolateral Oblique',
    description: 'Left breast — angled view',
    formKey: 'l_mlo',
  },
  {
    key: 'R-MLO',
    label: 'R-MLO',
    fullLabel: 'Right Mediolateral Oblique',
    description: 'Right breast — angled view',
    formKey: 'r_mlo',
  },
];

// ── File size formatter (matches existing codebase) ───────────────────────────
const formatSize = (bytes) =>
  bytes > 1024 * 1024
    ? (bytes / 1000024).toFixed(2) + ' MB'
    : (bytes / 1024).toFixed(1) + ' KB';

// ── ViewSlot — internal component, one per mammogram view ────────────────────
const ViewSlot = ({ viewKey, label, fullLabel, description, item, onDrop, onRemove }) => {
  const [slotError, setSlotError] = useState(null);

  const handleDrop = useCallback((accepted, rejected) => {
    setSlotError(null);
    if (rejected.length) {
      const msg = rejected[0].errors[0].message === 'File is larger than 10485760 bytes'
        ? 'File exceeds 10 MB limit'
        : rejected[0].errors[0].message;
      setSlotError(msg);
      return;
    }
    if (accepted.length) {
      onDrop(viewKey, accepted[0]);
    }
  }, [viewKey, onDrop]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  const isFilled = item !== null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>

      {/* Slot header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {/* Status dot */}
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: isFilled
            ? 'primary.main'
            : (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(8,145,178,0.25)',
          transition: 'background-color 0.3s ease',
          flexShrink: 0,
        }} />
        <Typography variant="caption" sx={{
          fontWeight: 700,
          color: isFilled ? 'primary.main' : 'text.primary',
          letterSpacing: '0.06em',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          transition: 'color 0.3s ease',
        }}>
          {label}
        </Typography>
        <Tooltip title={`${fullLabel} — ${description}`} placement="top" arrow>
          <InfoIcon sx={{ fontSize: 13, color: 'text.disabled', cursor: 'help', ml: 0.25 }} />
        </Tooltip>
      </Box>

      {/* Drop zone / preview */}
      <AnimatePresence mode="wait">
        {!isFilled ? (
          <motion.div
            key="empty"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Paper
              {...getRootProps()}
              elevation={0}
              sx={{
                height: 120,
                border: '2px dashed',
                borderColor: isDragActive
                  ? 'primary.main'
                  : slotError
                    ? 'error.main'
                    : (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(8,145,178,0.22)',
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                cursor: 'pointer',
                backgroundColor: isDragActive
                  ? (theme) => `${theme.palette.primary.main}0A`
                  : slotError
                    ? 'rgba(244,67,54,0.04)'
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
                width: 32, height: 32, borderRadius: 1.5,
                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(8,145,178,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <GalleryIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </Box>
              <Typography variant="caption" sx={{
                color: isDragActive ? 'primary.main' : 'text.secondary',
                fontWeight: 500,
                fontSize: '0.72rem',
                textAlign: 'center',
                px: 1,
              }}>
                {isDragActive ? 'Drop here' : description}
              </Typography>
              <Typography variant="caption" sx={{
                color: 'text.disabled',
                fontSize: '0.62rem',
                textAlign: 'center',
              }}>
                JPEG · PNG · DICOM
              </Typography>
            </Paper>

            {/* Per-slot error */}
            <AnimatePresence>
              {slotError && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Alert
                    severity="error"
                    icon={<WarnIcon sx={{ fontSize: 14 }} />}
                    sx={{ mt: 0.75, py: 0.25, fontSize: '0.7rem' }}
                  >
                    {slotError}
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

        ) : (
          <motion.div
            key="filled"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Paper
              elevation={0}
              sx={{
                height: 120,
                border: '2px solid',
                borderColor: (theme) => `${theme.palette.primary.main}40`,
                borderRadius: 2,
                backgroundColor: (theme) => `${theme.palette.primary.main}06`,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Image preview */}
              <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <Box
                  component="img"
                  src={item.preview}
                  alt={`${label} preview`}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                {/* Ready badge */}
                <Box sx={{
                  position: 'absolute', top: 6, left: 6,
                  px: 1, py: 0.25, borderRadius: '999px',
                  backgroundColor: (theme) => `${theme.palette.primary.main}CC`,
                  display: 'flex', alignItems: 'center', gap: 0.5,
                }}>
                  <CheckIcon sx={{ fontSize: 10, color: '#fff' }} />
                  <Typography sx={{ fontSize: '0.6rem', color: '#fff', fontWeight: 700, letterSpacing: '0.05em' }}>
                    READY
                  </Typography>
                </Box>
              </Box>

              {/* File info + remove */}
              <Box sx={{
                px: 1.25, py: 0.75, flexShrink: 0,
                borderTop: '1px solid', borderColor: 'divider',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
              }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" noWrap sx={{
                    color: 'text.primary', fontWeight: 500,
                    fontSize: '0.68rem', display: 'block',
                  }}>
                    {item.file.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem' }}>
                    {formatSize(item.file.size)}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    setSlotError(null);
                    onRemove(viewKey);
                  }}
                  sx={{ fontSize: '0.6rem', py: 0.2, px: 0.75, minWidth: 0, flexShrink: 0 }}
                >
                  Remove
                </Button>
              </Box>
            </Paper>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
};

// ── MultiViewUpload — main export ─────────────────────────────────────────────
export default function MultiViewUpload({ views, setViews, setActiveStep, handleAnalyse }) {

  const handleDrop = useCallback((viewKey, file) => {
    setViews(prev => ({
      ...prev,
      [viewKey]: {
        file,
        preview: URL.createObjectURL(file),
        id: crypto.randomUUID(),
      },
    }));
  }, [setViews]);

  const handleRemove = useCallback((viewKey) => {
    setViews(prev => ({ ...prev, [viewKey]: null }));
  }, [setViews]);

  const filledCount = Object.values(views).filter(v => v !== null).length;
  const allFilled = filledCount === 4;

  return (
    <Box>

      {/* Progress indicator */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          mb: 1.25,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{
              px: 1.25, py: 0.3, borderRadius: '999px',
              border: '1px solid', borderColor: 'divider',
              display: 'inline-flex', alignItems: 'center',
            }}>
              <Typography variant="caption" sx={{
                color: 'text.disabled', letterSpacing: '0.07em',
                fontSize: '0.65rem', textTransform: 'uppercase',
              }}>
                Sequential Scan Mode · All 4 views required
              </Typography>
            </Box>
          </Box>
          <Typography variant="caption" sx={{
            color: allFilled ? 'primary.main' : 'text.secondary',
            fontWeight: 700, fontSize: '0.72rem',
            transition: 'color 0.3s ease',
          }}>
            {filledCount} / 4 uploaded
          </Typography>
        </Box>
      </motion.div>

      {/* 2x2 grid of view slots */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1.5,
      }}>
        {VIEW_CONFIG.map(({ key, label, fullLabel, description }, i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.06, ease: 'easeOut' }}
          >
            <ViewSlot
              viewKey={key}
              label={label}
              fullLabel={fullLabel}
              description={description}
              item={views[key]}
              onDrop={handleDrop}
              onRemove={handleRemove}
            />
          </motion.div>
        ))}
      </Box>

      {/* Completion alert */}
      <AnimatePresence>
        {allFilled && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Alert
              severity="success"
              icon={<CheckIcon />}
              sx={{ mt: 2, fontSize: '0.78rem' }}
            >
              All 4 views uploaded — ready for analysis.
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation buttons — matches existing layout exactly */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Box sx={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', mt: 2,
        }}>
          <Button
            variant="text"
            onClick={() => setActiveStep(prev => prev - 1)}
            sx={{ letterSpacing: '0.04em', fontSize: '0.8rem' }}
          >
            ← Back to Configuration
          </Button>
          <Button
            variant="contained"
            disabled={!allFilled}
            onClick={() => {
              setActiveStep(prev => prev + 1);
              handleAnalyse();
            }}
            sx={{ px: 3, fontWeight: 700 }}
          >
            Analyse →
          </Button>
        </Box>
      </motion.div>
    </Box>
  );
}