import React, { useCallback, useState } from 'react';
import { Box, Typography, Button, Alert, Tooltip } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
  InfoOutlined as InfoIcon,
  AutoAwesome as AutoAwesomeIcon,
  GridView as GridViewIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.16, ease: 'easeIn'  } },
};

const VIEW_CONFIG = [
  { key: 'L-CC',  label: 'L-CC',  fullLabel: 'Left Craniocaudal',          description: 'Left breast — top-down view'  },
  { key: 'R-CC',  label: 'R-CC',  fullLabel: 'Right Craniocaudal',         description: 'Right breast — top-down view' },
  { key: 'L-MLO', label: 'L-MLO', fullLabel: 'Left Mediolateral Oblique',  description: 'Left breast — angled view'    },
  { key: 'R-MLO', label: 'R-MLO', fullLabel: 'Right Mediolateral Oblique', description: 'Right breast — angled view'   },
];

const formatSize = (b) => b > 1048576 ? (b / 1000024).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB';

// ── View detector ─────────────────────────────────────────────────────────────
const SIDE_MAP = { L: 'L', LEFT: 'L', R: 'R', RIGHT: 'R' };
const VIEW_SET = ['CC', 'MLO'];

const detectView = (filename) => {
  const base   = filename.replace(/\.[^.]+$/, '');
  const tokens = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const upper  = tokens.map((t) => t.toUpperCase());

  for (let i = 0; i < upper.length; i++) {
    const m = upper[i].match(/^(LEFT|RIGHT|L|R)(CC|MLO)$/);
    if (m) return { ok: true, side: SIDE_MAP[m[1]], view: m[2], key: `${SIDE_MAP[m[1]]}-${m[2]}`, sideIdx: i, viewIdx: i, sideProof: tokens[i], viewProof: tokens[i], adjacent: true };
  }
  const sc = upper.map((t, i) => ({ i, side: SIDE_MAP[t] })).filter((x) => x.side);
  const vc = upper.map((t, i) => ({ i, view: t  })).filter((x) => VIEW_SET.includes(x.view));
  if (!sc.length || !vc.length) return { ok: false, missing: [!sc.length && 'laterality (L / R)', !vc.length && 'view (CC / MLO)'].filter(Boolean) };

  let best = null;
  for (const s of sc) for (const v of vc) { const d = Math.abs(s.i - v.i); if (!best || d < best.dist) best = { s, v, dist: d }; }
  const { s, v, dist } = best;
  return { ok: true, side: s.side, view: v.view, key: `${s.side}-${v.view}`, sideIdx: s.i, viewIdx: v.i, sideProof: tokens[s.i], viewProof: tokens[v.i], adjacent: dist === 1 };
};

const sideName = (s) => (s === 'L' ? 'Left' : 'Right');

// ── Proof tooltip content ─────────────────────────────────────────────────────
const ProofName = ({ name, sideIdx, viewIdx }) => {
  const ext  = (name.match(/\.[^.]+$/) || [''])[0];
  const base = ext ? name.slice(0, name.length - ext.length) : name;
  const segs = base.split(/([^A-Za-z0-9]+)/);
  let tok = -1;
  return (
    <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', wordBreak: 'break-all', lineHeight: 1.6 }}>
      {segs.map((seg, i) => {
        if (i % 2 === 0) {
          if (!seg) return null;
          tok += 1;
          return (tok === sideIdx || tok === viewIdx)
            ? <Box key={i} component="span" sx={{ color: '#22D3EE', fontWeight: 800, backgroundColor: 'rgba(34,211,238,0.18)', borderRadius: '4px', px: '3px', mx: '1px' }}>{seg}</Box>
            : <span key={i}>{seg}</span>;
        }
        return <span key={i}>{seg}</span>;
      })}
      {ext && <span>{ext}</span>}
    </Box>
  );
};

// ── ViewSlot — manual ─────────────────────────────────────────────────────────
const SLOT_H = 108;

const ViewSlot = ({ viewKey, label, fullLabel, description, item, onDrop, onRemove }) => {
  const [err, setErr] = useState(null);
  const handleDrop = useCallback((acc, rej) => {
    setErr(null);
    if (rej.length) { setErr(rej[0].errors[0].message === 'File is larger than 10485760 bytes' ? 'File exceeds 10 MB' : rej[0].errors[0].message); return; }
    if (acc.length) onDrop(viewKey, acc[0]);
  }, [viewKey, onDrop]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: handleDrop, accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] }, maxFiles: 1, maxSize: 10485760, multiple: false });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, minWidth: 0 }}>
      {/* Label row */}
      <Box sx={{ height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.7 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, transition: 'background-color 0.3s', backgroundColor: item ? 'primary.main' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(8,145,178,0.24)' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: item ? 'primary.main' : 'text.primary', letterSpacing: '0.06em', fontSize: '0.7rem', textTransform: 'uppercase', transition: 'color 0.3s' }}>{label}</Typography>
        <Tooltip title={`${fullLabel} — ${description}`} placement="top" arrow>
          <InfoIcon sx={{ fontSize: 12, color: 'text.disabled', cursor: 'help', ml: 0.2 }} />
        </Tooltip>
      </Box>

      {/* Slot frame — position:relative + explicit height is the ONLY thing sizing this */}
      <Box sx={{ height: SLOT_H, flexShrink: 0, position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {!item ? (
            <motion.div key="e"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              style={{ position: 'absolute', inset: 0 }}>
              <Box {...getRootProps()} sx={{
                position: 'absolute', inset: 0,
                border: '2px dashed', borderRadius: 2, cursor: 'pointer',
                borderColor: isDragActive ? 'primary.main' : err ? 'error.main' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.11)' : 'rgba(8,145,178,0.22)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                backgroundColor: isDragActive ? (t) => `${t.palette.primary.main}0E` : err ? 'rgba(239,68,68,0.04)' : 'background.default',
                transition: 'all 0.18s',
                '&:hover': { borderColor: 'primary.main', backgroundColor: (t) => `${t.palette.primary.main}09` },
              }}>
                <input {...getInputProps()} />
                <GalleryIcon sx={{ fontSize: 20, color: isDragActive ? 'primary.main' : 'text.disabled' }} />
                <Typography variant="caption" sx={{ color: isDragActive ? 'primary.main' : 'text.secondary', fontWeight: 500, fontSize: '0.68rem', textAlign: 'center', px: 0.75 }}>{isDragActive ? 'Drop here' : description}</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.58rem' }}>JPEG · PNG · DICOM</Typography>
              </Box>
            </motion.div>
          ) : (
            <motion.div key="f"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              style={{ position: 'absolute', inset: 0 }}>
              <Box sx={{
                position: 'absolute', inset: 0,
                border: '2px solid', borderColor: (t) => `${t.palette.primary.main}45`, borderRadius: 2,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                backgroundColor: (t) => `${t.palette.primary.main}08`,
              }}>
                {/* Image fills everything except the footer strip */}
                <Box component="img" src={item.preview} alt={label} sx={{ flex: 1, width: '100%', objectFit: 'cover', display: 'block', minHeight: 0 }} />
                {/* Footer strip — constrained to full cell width */}
                <Box sx={{
                  px: 1, py: 0.5, flexShrink: 0, borderTop: '1px solid', borderColor: 'divider',
                  display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0,
                  backgroundColor: 'background.paper',
                }}>
                  <Box sx={{ position: 'absolute', top: 5, left: 5, px: 0.8, py: 0.2, borderRadius: '999px', backgroundColor: (t) => `${t.palette.primary.main}CC`, display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    <CheckIcon sx={{ fontSize: 9, color: '#fff' }} />
                    <Typography sx={{ fontSize: '0.55rem', color: '#fff', fontWeight: 700, letterSpacing: '0.05em' }}>READY</Typography>
                  </Box>
                  <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0, color: 'text.primary', fontWeight: 500, fontSize: '0.63rem' }}>{item.file.name}</Typography>
                  <Button size="small" variant="outlined" color="error" onClick={() => { setErr(null); onRemove(viewKey); }} sx={{ fontSize: '0.57rem', py: 0.15, px: 0.6, minWidth: 0, flexShrink: 0 }}>Remove</Button>
                </Box>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      {/* Error alert — outside locked frame so it can grow freely */}
      <AnimatePresence>
        {err && <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Alert severity="error" icon={<WarnIcon sx={{ fontSize: 13 }} />} sx={{ py: 0.2, fontSize: '0.66rem' }}>{err}</Alert></motion.div>}
      </AnimatePresence>
    </Box>
  );
};

// ── Routed result row — compact, proof shown on pill tooltip ─────────────────
const RoutedRow = ({ cfg, item, proof, onRemove }) => {
  const sp = proof && !proof.manual;
  const tipText = sp
    ? `Matched "${proof.sideProof}" → ${proof.side === 'L' ? 'Left' : 'Right'}, "${proof.viewProof}" → ${proof.view}${!proof.adjacent ? ' (tokens not adjacent — double-check)' : ''}`
    : proof?.manual ? 'Placed manually' : cfg.label;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.9, px: 1, py: 0.6, borderRadius: 1.5, backgroundColor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
      <Box component="img" src={item.preview} alt={cfg.label} sx={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 1, flexShrink: 0, border: '1px solid', borderColor: (t) => `${t.palette.primary.main}40` }} />
      <Tooltip arrow placement="top" title={tipText}>
        <Box sx={{ flexShrink: 0, px: 0.85, py: 0.3, borderRadius: '999px', cursor: 'help', backgroundColor: (t) => `${t.palette.primary.main}18`, border: '1px solid', borderColor: (t) => `${t.palette.primary.main}50`, display: 'flex', alignItems: 'center', gap: 0.4 }}>
          {sp && <AutoAwesomeIcon sx={{ fontSize: 9, color: 'primary.main' }} />}
          <Typography sx={{ fontSize: '0.63rem', fontWeight: 800, color: 'primary.main', letterSpacing: '0.04em' }}>{cfg.label}</Typography>
        </Box>
      </Tooltip>
      <Typography variant="caption" noWrap sx={{ color: 'text.primary', fontWeight: 500, fontSize: '0.67rem', flex: 1, minWidth: 0 }}>{item.file.name}</Typography>
      <Button size="small" variant="outlined" color="error" onClick={() => onRemove(cfg.key)} sx={{ fontSize: '0.57rem', py: 0.15, px: 0.6, minWidth: 0, flexShrink: 0 }}>Remove</Button>
    </Box>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
const TABS = [
  { val: 'manual', Icon: GridViewIcon,    label: 'Manual', blurb: 'Drop each mammogram into its own slot.' },
  { val: 'smart',  Icon: AutoAwesomeIcon, label: 'Smart',  blurb: 'Drop all four at once — sorted by filename.' },
];

export default function MultiViewUpload({ views, setViews, setActiveStep, handleAnalyse }) {
  const [uploadMode, setUploadMode] = useState('manual');
  const [proofMap, setProofMap]     = useState({});
  const [pending, setPending]       = useState([]);
  const [smartError, setSmartError] = useState(null);

  const handleRemoveView = useCallback((key) => {
    setViews((p) => ({ ...p, [key]: null }));
    setProofMap((p) => { const n = { ...p }; delete n[key]; return n; });
  }, [setViews]);

  const handleManualDrop = useCallback((key, file) => {
    setViews((p) => ({ ...p, [key]: { file, preview: URL.createObjectURL(file), id: crypto.randomUUID() } }));
  }, [setViews]);

  const handleSmartDrop = useCallback((acc, rej) => {
    setSmartError(null);
    if (rej.length) setSmartError(rej[0].errors[0].message === 'File is larger than 10485760 bytes' ? 'One or more files exceed 10 MB and were skipped.' : 'Some files were rejected (unsupported type).');
    const nv = { ...views }, np = { ...proofMap }, npe = [...pending];
    acc.forEach((f) => {
      const det = detectView(f.name), preview = URL.createObjectURL(f), id = crypto.randomUUID();
      if (det.ok && nv[det.key] == null) { nv[det.key] = { file: f, preview, id }; np[det.key] = { ...det, fileName: f.name }; }
      else npe.push({ id, file: f, preview, reason: det.ok ? 'duplicate' : 'unrecognized', detection: det });
    });
    setViews(nv); setProofMap(np); setPending(npe);
  }, [views, proofMap, pending, setViews]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: handleSmartDrop, accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] }, maxSize: 10485760, multiple: true });

  const assignPending = (pid, key) => {
    const it = pending.find((p) => p.id === pid); if (!it) return;
    setViews((p) => ({ ...p, [key]: { file: it.file, preview: it.preview, id: it.id } }));
    setProofMap((p) => ({ ...p, [key]: { fileName: it.file.name, manual: true } }));
    setPending((p) => p.filter((x) => x.id !== pid));
  };
  const discardPending = (id) => setPending((p) => p.filter((x) => x.id !== id));

  const filledCount     = Object.values(views).filter(Boolean).length;
  const allFilled       = filledCount === 4;
  const freeSlots       = VIEW_CONFIG.filter((c) => !views[c.key]);
  const hasSmartContent = filledCount > 0 || pending.length > 0;
  const isSmrt          = uploadMode === 'smart';

  return (
    <Box>
      {/* ── Main panel — square top corners, rounded bottom ── */}
      <Box sx={{
        borderRadius: '6px 6px 16px 16px',       // slight top curve, rounded bottom
        border: '1px solid',
        borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.11)' : 'rgba(8,145,178,0.2)',
        backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.025)' : 'rgba(8,145,178,0.04)',
        boxShadow: (t) => t.palette.mode === 'dark' ? '0 10px 36px rgba(0,0,0,0.32)' : '0 6px 24px rgba(8,145,178,0.1)',
        overflow: 'hidden',
      }}>

        {/* ── Tab bar ── */}
        <Box sx={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid', borderColor: 'divider', backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(0,0,0,0.22)' : 'rgba(8,145,178,0.07)' }}>
          {TABS.map(({ val, Icon, label, blurb }) => {
            const active = uploadMode === val;
            return (
              <Box key={val} onClick={() => setUploadMode(val)} sx={{
                position: 'relative', cursor: 'pointer', flex: 1,
                display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1.1,
                // Active tab: noticeably stronger background tint
                backgroundColor: active
                  ? (t) => t.palette.mode === 'dark' ? 'rgba(34,211,238,0.10)' : 'rgba(8,145,178,0.13)'
                  : 'transparent',
                transition: 'background-color 0.18s',
                '&:hover': !active ? { backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(8,145,178,0.05)' } : {},
                // Active indicator — bold 3 px bottom border
                '&::after': active ? {
                  content: '""', position: 'absolute', bottom: -1, left: 0, right: 0, height: 3,
                  background: (t) => t.palette.mode === 'dark' ? 'linear-gradient(90deg,#22D3EE,#0891B2)' : 'linear-gradient(90deg,#0891B2,#0E7490)',
                } : {},
              }}>
                {/* Icon badge */}
                <Box sx={{
                  width: 32, height: 32, borderRadius: 1.5, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active
                    ? (t) => t.palette.mode === 'dark' ? 'linear-gradient(135deg,#22D3EE,#0891B2)' : 'linear-gradient(135deg,#0891B2,#0E7490)'
                    : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(8,145,178,0.09)',
                  boxShadow: active ? '0 3px 10px rgba(34,211,238,0.32)' : 'none',
                  transition: 'all 0.2s',
                }}>
                  <Icon sx={{ fontSize: 16, color: active ? '#fff' : 'text.disabled', transition: 'color 0.2s' }} />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.84rem', lineHeight: 1.15, color: active ? 'text.primary' : 'text.secondary', transition: 'color 0.2s' }}>{label}</Typography>
                  <Typography sx={{ fontSize: '0.63rem', lineHeight: 1.25, mt: 0.1, color: active ? 'text.secondary' : 'text.disabled', transition: 'color 0.2s' }}>{blurb}</Typography>
                </Box>
              </Box>
            );
          })}

          {/* Counter — bright & bold, right-docked */}
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1.75, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', gap: 0.25 }}>
            <Typography sx={{ fontWeight: 900, fontSize: '1rem', lineHeight: 1, color: allFilled ? 'primary.main' : filledCount > 0 ? 'primary.main' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(8,145,178,0.6)', transition: 'color 0.3s', fontVariantNumeric: 'tabular-nums' }}>
              {filledCount}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1, color: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(8,145,178,0.3)' }}>/</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1, color: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(8,145,178,0.4)' }}>4</Typography>
          </Box>
        </Box>

        {/* ── Info / status bar — same fixed height in every state ── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.85,
          px: 1.75, minHeight: 38,
          borderBottom: '1px solid', borderColor: 'divider',
          backgroundColor: allFilled
            ? (t) => t.palette.mode === 'dark' ? 'rgba(34,211,238,0.10)' : 'rgba(8,145,178,0.12)'
            : (t) => t.palette.mode === 'dark' ? 'rgba(34,211,238,0.06)' : 'rgba(8,145,178,0.07)',
          transition: 'background-color 0.25s',
        }}>
          {allFilled
            ? <CheckIcon sx={{ fontSize: 14, flexShrink: 0, color: 'primary.main' }} />
            : <InfoIcon  sx={{ fontSize: 14, flexShrink: 0, color: 'primary.main' }} />}
          <Typography variant="caption" sx={{ fontSize: '0.69rem', lineHeight: 1.5, minWidth: 0, fontWeight: allFilled ? 600 : 400, color: allFilled ? 'primary.main' : 'text.secondary' }}>
            {allFilled ? 'All 4 views uploaded — ready for analysis.' : isSmrt ? (
              <>
                {'Needs '}
                <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>laterality</Box>
                {' (L/R or Left/Right) and '}
                <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>view</Box>
                {' (CC/MLO) in filename\u00A0— e.g.\u00A0'}
                <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.67rem', color: 'primary.main', backgroundColor: (t) => `${t.palette.primary.main}18`, px: 0.45, borderRadius: 0.5 }}>…_L_CC</Box>
                {'. Unmatched files listed below.'}
              </>
            ) : (
              'Session Scan · All 4 views required. Drop each mammogram into its matching slot below.'
            )}
          </Typography>
        </Box>

        {/* ── Panel body ── */}
        <Box sx={{ p: 1.5 }}>
          <AnimatePresence mode="wait">

            {/* ─── MANUAL: 2×2 grid ─── */}
            {!isSmrt ? (
              <motion.div key="manual" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                  {VIEW_CONFIG.map((cfg, i) => (
                    <motion.div key={cfg.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, delay: i * 0.05 }}>
                      <ViewSlot viewKey={cfg.key} label={cfg.label} fullLabel={cfg.fullLabel} description={cfg.description}
                        item={views[cfg.key]} onDrop={handleManualDrop} onRemove={handleRemoveView} />
                    </motion.div>
                  ))}
                </Box>
              </motion.div>
            ) : (
              /* ─── SMART: one dropzone ─── */
              <motion.div key="smart" variants={fadeUp} initial="hidden" animate="visible" exit="exit">

                {/* Add-more strip — hidden once all 4 slots are filled */}
                {filledCount < 4 && (
                  <Box {...getRootProps()} sx={{
                    border: '2px dashed', borderRadius: 2.5, cursor: 'pointer',
                    borderColor: isDragActive ? 'primary.main' : (t) => `${t.palette.primary.main}50`,
                    height: hasSmartContent ? 'auto' : 260, py: hasSmartContent ? 1 : 0, px: 2,
                    display: 'flex', flexDirection: hasSmartContent ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: hasSmartContent ? 1 : 1.1,
                    backgroundColor: isDragActive ? (t) => `${t.palette.primary.main}12` : (t) => `${t.palette.primary.main}07`,
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: 'primary.main', backgroundColor: (t) => `${t.palette.primary.main}0E` },
                  }}>
                    <input {...getInputProps()} />
                    <Box sx={{ width: hasSmartContent ? 26 : 48, height: hasSmartContent ? 26 : 48, borderRadius: hasSmartContent ? 1.25 : 2.25, flexShrink: 0, backgroundColor: (t) => `${t.palette.primary.main}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                      <AutoAwesomeIcon sx={{ fontSize: hasSmartContent ? 14 : 24, color: 'primary.main', transition: 'font-size 0.2s' }} />
                    </Box>
                    {hasSmartContent ? (
                      <Typography variant="caption" sx={{ color: isDragActive ? 'primary.main' : 'text.secondary', fontWeight: 600, fontSize: '0.71rem' }}>
                        {isDragActive ? 'Drop to add more' : `Add more — ${filledCount} / 4 routed`}
                      </Typography>
                    ) : (
                      <>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ color: isDragActive ? 'primary.main' : 'text.primary' }}>
                          {isDragActive ? 'Drop files here' : 'Drop or browse named mammograms'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 300 }}>
                          Select up to 4 files — sorted into view slots automatically.
                        </Typography>
                      </>
                    )}
                  </Box>
                )}

                {/* Hidden input when strip is hidden (all 4 filled) */}
                {filledCount === 4 && <input {...getInputProps()} style={{ display: 'none' }} />}

                <AnimatePresence>
                  {smartError && <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Alert severity="warning" icon={<WarnIcon />} sx={{ mt: 1, py: 0.2, fontSize: '0.7rem' }}>{smartError}</Alert></motion.div>}
                </AnimatePresence>

                {/* Routed rows — compact, proof on pill hover */}
                {filledCount > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: hasSmartContent && filledCount < 4 ? 1 : 0 }}>
                    <AnimatePresence>
                      {VIEW_CONFIG.filter((c) => views[c.key]).map((cfg) => (
                        <motion.div key={cfg.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.16 }}>
                          <RoutedRow cfg={cfg} item={views[cfg.key]} proof={proofMap[cfg.key]} onRemove={handleRemoveView} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </Box>
                )}

               
                <AnimatePresence>
                  {pending.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <Box sx={{ mt: 1.1, p: 1, borderRadius: 2, border: '1px solid', borderColor: (t) => `${t.palette.warning.main}40`, backgroundColor: (t) => `${t.palette.warning.main}09` }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, mb: 0.75 }}>
                          <WarnIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem' }}>Needs attention · {pending.length}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.65 }}>
                          {pending.map((p) => (
                            <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.85, px: 0.85, py: 0.65, borderRadius: 1.5, backgroundColor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                              <Box component="img" src={p.preview} alt="preview" sx={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 0.75, flexShrink: 0 }} />
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography variant="caption" noWrap sx={{ color: 'text.primary', fontWeight: 600, fontSize: '0.64rem', display: 'block' }}>{p.file.name}</Typography>
                                <Typography variant="caption" sx={{ color: 'warning.main', fontSize: '0.59rem' }}>
                                  {p.reason === 'duplicate' ? `${p.detection.key} already filled — pick another slot` : `Couldn't read ${p.detection.missing ? p.detection.missing.join(' & ') : 'view'} from the name`}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {freeSlots.map((c) => <Button key={c.key} size="small" variant="outlined" onClick={() => assignPending(p.id, c.key)} sx={{ fontSize: '0.57rem', py: 0.1, px: 0.55, minWidth: 0 }}>{c.label}</Button>)}
                                {!freeSlots.length && <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.59rem' }}>All slots full</Typography>}
                                <Button size="small" variant="text" color="error" onClick={() => discardPending(p.id)} sx={{ fontSize: '0.59rem', py: 0.1, px: 0.55, minWidth: 0 }}>✕</Button>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

        </Box>
      </Box>

      {/* ── Navigation ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.12 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.75 }}>
          <Button variant="text" onClick={() => setActiveStep((p) => p - 1)} sx={{ letterSpacing: '0.04em', fontSize: '0.8rem' }}>← Back to Configuration</Button>
          <Button variant="contained" disabled={!allFilled} onClick={() => { setActiveStep((p) => p + 1); handleAnalyse(); }} sx={{ px: 3, fontWeight: 700 }}>Analyse →</Button>
        </Box>
      </motion.div>
    </Box>
  );
}