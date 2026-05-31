import React, { useCallback, useState } from 'react';
import {
  Box, Typography, Button, Alert, Paper, Tooltip, TextField,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
  InfoOutlined as InfoIcon,
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_SESSIONS = 5;
const MIN_SESSIONS = 2;

// ── Animation variant (matches existing codebase) ─────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
};

// ── View configuration ─────────────────────────────────────────────────────────
const VIEW_CONFIG = [
  { key: 'L-CC', label: 'L-CC', fullLabel: 'Left Craniocaudal', description: 'Left breast — top-down view' },
  { key: 'R-CC', label: 'R-CC', fullLabel: 'Right Craniocaudal', description: 'Right breast — top-down view' },
  { key: 'L-MLO', label: 'L-MLO', fullLabel: 'Left Mediolateral Oblique', description: 'Left breast — angled view' },
  { key: 'R-MLO', label: 'R-MLO', fullLabel: 'Right Mediolateral Oblique', description: 'Right breast — angled view' },
];

// Factory for a fresh, empty session
const emptySession = () => ({
  id: crypto.randomUUID(),
  scanDate: '',
  views: { 'L-CC': null, 'R-CC': null, 'L-MLO': null, 'R-MLO': null },
});

// ── File size formatter (matches existing codebase) ───────────────────────────
const formatSize = (bytes) =>
  bytes > 1024 * 1024
    ? (bytes / 1000024).toFixed(2) + ' MB'
    : (bytes / 1024).toFixed(1) + ' KB';

// ── ViewSlot — one mammogram view within a session (compact variant) ──────────
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
    if (accepted.length) onDrop(viewKey, accepted[0]);
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>

      {/* Slot header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{
          width: 7, height: 7, borderRadius: '50%',
          backgroundColor: isFilled
            ? 'primary.main'
            : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(8,145,178,0.25)',
          transition: 'background-color 0.3s ease', flexShrink: 0,
        }} />
        <Typography variant="caption" sx={{
          fontWeight: 700,
          color: isFilled ? 'primary.main' : 'text.primary',
          letterSpacing: '0.06em', fontSize: '0.66rem', textTransform: 'uppercase',
          transition: 'color 0.3s ease',
        }}>
          {label}
        </Typography>
        <Tooltip title={`${fullLabel} — ${description}`} placement="top" arrow>
          <InfoIcon sx={{ fontSize: 12, color: 'text.disabled', cursor: 'help', ml: 0.25 }} />
        </Tooltip>
      </Box>

      {/* Drop zone / preview */}
      <AnimatePresence mode="wait">
        {!isFilled ? (
          <motion.div key="empty" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
            <Paper
              {...getRootProps()}
              elevation={0}
              sx={{
                height: 92, border: '2px dashed',
                borderColor: isDragActive ? 'primary.main'
                  : slotError ? 'error.main'
                    : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(8,145,178,0.22)',
                borderRadius: 2, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 0.25, cursor: 'pointer',
                backgroundColor: isDragActive ? (t) => `${t.palette.primary.main}0A`
                  : slotError ? 'rgba(244,67,54,0.04)' : 'background.paper',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: (t) => `${t.palette.primary.main}08`,
                },
              }}
            >
              <input {...getInputProps()} />
              <GalleryIcon sx={{ fontSize: 18, color: isDragActive ? 'primary.main' : 'text.disabled' }} />
              <Typography variant="caption" sx={{
                color: isDragActive ? 'primary.main' : 'text.secondary',
                fontWeight: 500, fontSize: '0.64rem', textAlign: 'center', px: 0.5,
              }}>
                {isDragActive ? 'Drop here' : 'JPEG · PNG · DICOM'}
              </Typography>
            </Paper>

            <AnimatePresence>
              {slotError && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                  <Alert severity="error" icon={<WarnIcon sx={{ fontSize: 13 }} />} sx={{ mt: 0.5, py: 0.1, fontSize: '0.65rem' }}>
                    {slotError}
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="filled" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
            <Paper
              elevation={0}
              sx={{
                height: 92, border: '2px solid',
                borderColor: (t) => `${t.palette.primary.main}40`,
                borderRadius: 2, backgroundColor: (t) => `${t.palette.primary.main}06`,
                overflow: 'hidden', position: 'relative',
              }}
            >
              <Box component="img" src={item.preview} alt={`${label} preview`}
                sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

              {/* Ready badge */}
              <Box sx={{
                position: 'absolute', top: 5, left: 5, px: 0.75, py: 0.15, borderRadius: '999px',
                backgroundColor: (t) => `${t.palette.primary.main}CC`,
                display: 'flex', alignItems: 'center', gap: 0.4,
              }}>
                <CheckIcon sx={{ fontSize: 9, color: '#fff' }} />
                <Typography sx={{ fontSize: '0.55rem', color: '#fff', fontWeight: 700, letterSpacing: '0.05em' }}>
                  READY
                </Typography>
              </Box>

              {/* Remove */}
              <Button
                size="small" variant="contained" color="error"
                onClick={() => { setSlotError(null); onRemove(viewKey); }}
                sx={{
                  position: 'absolute', bottom: 5, right: 5,
                  fontSize: '0.55rem', py: 0.1, px: 0.6, minWidth: 0, lineHeight: 1.4,
                }}
              >
                Remove
              </Button>
            </Paper>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
};

// ── SessionCard — a date + 4 required views ──────────────────────────────────
const SessionCard = ({ session, index, total, onDropView, onRemoveView, onUpdateDate, onRemoveSession }) => {
  const filledCount = Object.values(session.views).filter(v => v !== null).length;
  const allViews = filledCount === 4;
  const hasDate = session.scanDate !== '';
  const complete = allViews && hasDate;

  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: complete ? (t) => `${t.palette.primary.main}55` : 'divider',
        borderRadius: 3, p: 1.75,
        backgroundColor: complete
          ? (t) => `${t.palette.primary.main}05`
          : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.015)' : 'rgba(8,145,178,0.015)',
        transition: 'border-color 0.3s ease, background-color 0.3s ease',
      }}
    >
      {/* Session header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width: 24, height: 24, borderRadius: 1,
            backgroundColor: complete ? (t) => `${t.palette.primary.main}25` : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(8,145,178,0.08)',
            border: '1px solid', borderColor: complete ? 'primary.main' : 'divider',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s ease', flexShrink: 0,
          }}>
            <Typography variant="caption" sx={{ color: complete ? 'primary.main' : 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>
              {index + 1}
            </Typography>
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
            Session {index + 1}
          </Typography>
          <Typography variant="caption" sx={{
            color: allViews ? 'primary.main' : 'text.secondary',
            fontWeight: 600, fontSize: '0.68rem', transition: 'color 0.3s ease',
          }}>
            {filledCount}/4 views
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Date picker */}
          <TextField
            type="date" size="small" value={session.scanDate}
            onChange={(e) => onUpdateDate(session.id, e.target.value)}
            inputProps={{ max: new Date().toISOString().split('T')[0] }}
            sx={{
              '& .MuiInputBase-root': {
                fontSize: '0.72rem', height: 30,
                backgroundColor: hasDate
                  ? (t) => `${t.palette.primary.main}10`
                  : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(8,145,178,0.04)',
                borderRadius: 1,
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: hasDate
                  ? (t) => `${t.palette.primary.main}60`
                  : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(8,145,178,0.25)',
              },
              '& input': { color: 'text.primary', px: 1, py: 0 },
              '& input::-webkit-calendar-picker-indicator': {
                filter: (t) => t.palette.mode === 'dark' ? 'invert(0.5)' : 'none',
                cursor: 'pointer', width: 13,
              },
            }}
          />
          {/* Remove session — only when above the minimum */}
          {total > MIN_SESSIONS && (
            <Tooltip title="Remove session" placement="top" arrow>
              <Button
                size="small" variant="outlined" color="error"
                onClick={() => onRemoveSession(session.id)}
                sx={{ minWidth: 0, px: 0.75, py: 0.25 }}
              >
                <DeleteIcon sx={{ fontSize: 16 }} />
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Missing-date hint */}
      {allViews && !hasDate && (
        <Box sx={{ display: 'flex', gap: 0.75, px: 1, py: 0.6, mb: 1.25, borderRadius: 1.5, backgroundColor: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <WarnIcon sx={{ fontSize: 13, color: 'warning.main', mt: 0.1, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'warning.main', fontSize: '0.68rem' }}>
            Add a scan date so the model can order this session in the timeline.
          </Typography>
        </Box>
      )}

      {/* 2x2 grid of view slots */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
        {VIEW_CONFIG.map(({ key, label, fullLabel, description }) => (
          <ViewSlot
            key={key}
            viewKey={key}
            label={label}
            fullLabel={fullLabel}
            description={description}
            item={session.views[key]}
            onDrop={(vk, file) => onDropView(session.id, vk, file)}
            onRemove={(vk) => onRemoveView(session.id, vk)}
          />
        ))}
      </Box>
    </Paper>
  );
};

// ── FutureRiskUpload — main export ────────────────────────────────────────────
export default function FutureRiskUpload({ sessions, setSessions, setActiveStep, handleAnalyse }) {
  // Ensure we always start with the minimum number of sessions
  const list = (sessions && sessions.length >= MIN_SESSIONS)
    ? sessions
    : [emptySession(), emptySession()];

  const addSession = () => {
    if (list.length >= MAX_SESSIONS) return;
    setSessions([...list, emptySession()]);
  };

  const removeSession = (id) => {
    if (list.length <= MIN_SESSIONS) return;
    setSessions(list.filter(s => s.id !== id));
  };

  const updateDate = (id, value) =>
    setSessions(list.map(s => s.id === id ? { ...s, scanDate: value } : s));

  const dropView = (sessionId, viewKey, file) =>
    setSessions(list.map(s => s.id === sessionId
      ? { ...s, views: { ...s.views, [viewKey]: { file, preview: URL.createObjectURL(file), id: crypto.randomUUID() } } }
      : s));

  const removeView = (sessionId, viewKey) =>
    setSessions(list.map(s => s.id === sessionId
      ? { ...s, views: { ...s.views, [viewKey]: null } }
      : s));

  // ── Validation ──────────────────────────────────────────────────────────────
  const sessionComplete = (s) =>
    s.scanDate !== '' && Object.values(s.views).every(v => v !== null);

  const completeCount = list.filter(sessionComplete).length;
  const allComplete = list.every(sessionComplete);
  const canContinue = list.length >= MIN_SESSIONS && allComplete;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{
          px: 1.25, py: 0.3, borderRadius: '999px',
          border: '1px solid', borderColor: 'divider', display: 'inline-flex', alignItems: 'center',
        }}>
          <Typography variant="caption" sx={{
            color: 'text.disabled', letterSpacing: '0.07em', fontSize: '0.65rem', textTransform: 'uppercase',
          }}>
            Future Risk Mode · All 4 views per session · {MIN_SESSIONS}–{MAX_SESSIONS} sessions
          </Typography>
        </Box>
        <Typography variant="caption" sx={{
          color: allComplete ? 'primary.main' : 'text.secondary',
          fontWeight: 700, fontSize: '0.72rem', transition: 'color 0.3s ease',
        }}>
          {completeCount} / {list.length} sessions complete
        </Typography>
      </Box>

      {/* Sessions */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <AnimatePresence>
          {list.map((session, index) => (
            <motion.div
              key={session.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <SessionCard
                session={session}
                index={index}
                total={list.length}
                onDropView={dropView}
                onRemoveView={removeView}
                onUpdateDate={updateDate}
                onRemoveSession={removeSession}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </Box>

      {/* Add session */}
      {list.length < MAX_SESSIONS && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={addSession}
          sx={{
            borderStyle: 'dashed', borderWidth: 2, py: 1, fontWeight: 600,
            letterSpacing: '0.03em', fontSize: '0.78rem',
            '&:hover': { borderStyle: 'dashed', borderWidth: 2 },
          }}
        >
          Add Session ({list.length}/{MAX_SESSIONS})
        </Button>
      )}

      {/* Completion alert */}
      <AnimatePresence>
        {canContinue && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <Alert severity="success" icon={<CheckIcon />} sx={{ fontSize: '0.78rem' }}>
              {list.length} sessions ready — all views and dates captured for temporal analysis.
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Button
          variant="text"
          onClick={() => setActiveStep(prev => prev - 1)}
          sx={{ letterSpacing: '0.04em', fontSize: '0.8rem' }}
        >
          ← Back to Configuration
        </Button>
        <Button
          variant="contained"
          disabled={!canContinue}
          onClick={() => { setActiveStep(prev => prev + 1); handleAnalyse(); }}
          sx={{ px: 3, fontWeight: 700, color: '#FFFFFF' }}
        >
          Analyse →
        </Button>
      </Box>
    </Box>
  );
}