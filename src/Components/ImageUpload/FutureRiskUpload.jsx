import React, { useCallback, useRef, useState } from 'react';
import {
  Box, Typography, Button, Alert, Tooltip, TextField,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleOutline as CheckIcon,
  WarningAmber as WarnIcon,
  Collections as GalleryIcon,
  InfoOutlined as InfoIcon,
  AutoAwesome as AutoAwesomeIcon,
  GridView as GridViewIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

const MAX_SESSIONS = 5;
const MIN_SESSIONS = 2;
const SLOT_H = 88;
const TODAY = new Date().toISOString().split('T')[0];

const VIEW_CONFIG = [
  { key: 'L-CC', label: 'L-CC', fullLabel: 'Left Craniocaudal', description: 'Left breast — top-down view' },
  { key: 'R-CC', label: 'R-CC', fullLabel: 'Right Craniocaudal', description: 'Right breast — top-down view' },
  { key: 'L-MLO', label: 'L-MLO', fullLabel: 'Left Mediolateral Oblique', description: 'Left breast — angled view' },
  { key: 'R-MLO', label: 'R-MLO', fullLabel: 'Right Mediolateral Oblique', description: 'Right breast — angled view' },
];

// ── Filename detectors ────────────────────────────────────────────────────────
const SIDE_MAP = { L: 'L', LEFT: 'L', R: 'R', RIGHT: 'R' };
const VIEW_SET = ['CC', 'MLO'];

const detectView = (filename) => {
  const base = filename.replace(/\.[^.]+$/, '');
  const tokens = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const upper = tokens.map(t => t.toUpperCase());
  for (let i = 0; i < upper.length; i++) {
    const m = upper[i].match(/^(LEFT|RIGHT|L|R)(CC|MLO)$/);
    if (m) return { ok: true, side: SIDE_MAP[m[1]], view: m[2], key: `${SIDE_MAP[m[1]]}-${m[2]}`, sideIdx: i, viewIdx: i, sideProof: tokens[i], viewProof: tokens[i], adjacent: true };
  }
  const sc = upper.map((t, i) => ({ i, side: SIDE_MAP[t] })).filter(x => x.side);
  const vc = upper.map((t, i) => ({ i, view: t })).filter(x => VIEW_SET.includes(x.view));
  if (!sc.length || !vc.length) return { ok: false, missing: [!sc.length && 'laterality', !vc.length && 'view (CC/MLO)'].filter(Boolean) };
  let best = null;
  for (const s of sc) for (const v of vc) { const d = Math.abs(s.i - v.i); if (!best || d < best.dist) best = { s, v, dist: d }; }
  const { s, v } = best;
  return { ok: true, side: s.side, view: v.view, key: `${s.side}-${v.view}`, sideIdx: s.i, viewIdx: v.i, sideProof: tokens[s.i], viewProof: tokens[v.i], adjacent: Math.abs(s.i - v.i) === 1 };
};

const detectDate = (filename) => {
  const base = filename.replace(/\.[^.]+$/, '');
  let m = base.match(/(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (!m) m = base.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (!m) return { ok: false };
  const [proof, y, mo, d] = m;
  const Y = +y, MO = +mo, D = +d;
  if (Y < 1970 || Y > 2100 || MO < 1 || MO > 12 || D < 1 || D > 31) return { ok: false };
  const iso = `${y}-${String(MO).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
  if (iso > TODAY) return { ok: false };
  return { ok: true, iso, proof };
};

const sideName = (s) => (s === 'L' ? 'Left' : 'Right');

// ── Mode toggle tabs ──────────────────────────────────────────────────────────
const TABS = [
  { val: 'manual', Icon: GridViewIcon, label: 'Manual', blurb: 'Drop each view into its slot.' },
  { val: 'smart', Icon: AutoAwesomeIcon, label: 'Smart', blurb: 'Auto-detect view + date from filename.' },
];

const ModeToggle = ({ mode, setMode }) => (
  <>
    {TABS.map(({ val, Icon, label, blurb }) => {
      const active = mode === val;
      return (
        <Box key={val} onClick={() => setMode(val)} sx={{
          position: 'relative', cursor: 'pointer', flex: 1,
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.1,
          backgroundColor: active ? (t) => t.palette.mode === 'dark' ? 'rgba(34,211,238,0.10)' : 'rgba(8,145,178,0.13)' : 'transparent',
          transition: 'background-color 0.18s',
          '&:hover': !active ? { backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(8,145,178,0.05)' } : {},
          '&::after': active ? { content: '""', position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, background: (t) => t.palette.mode === 'dark' ? 'linear-gradient(90deg,#22D3EE,#0891B2)' : 'linear-gradient(90deg,#0891B2,#0E7490)' } : {},
        }}>
          <Box sx={{ width: 32, height: 32, borderRadius: 1.5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', background: active ? (t) => t.palette.mode === 'dark' ? 'linear-gradient(135deg,#22D3EE,#0891B2)' : 'linear-gradient(135deg,#0891B2,#0E7490)' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(8,145,178,0.09)', boxShadow: active ? '0 3px 10px rgba(34,211,238,0.32)' : 'none' }}>
            <Icon sx={{ fontSize: 16, color: active ? '#fff' : 'text.disabled', transition: 'color 0.2s' }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.84rem', lineHeight: 1.15, color: active ? 'text.primary' : 'text.secondary', transition: 'color 0.2s' }}>{label}</Typography>
            <Typography sx={{ fontSize: '0.63rem', lineHeight: 1.25, mt: 0.1, color: active ? 'text.secondary' : 'text.disabled', transition: 'color 0.2s' }}>{blurb}</Typography>
          </Box>
        </Box>
      );
    })}
  </>
);

// ── ViewSlot ──────────────────────────────────────────────────────────────────
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
      <Box sx={{ height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.7 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, transition: 'background-color 0.3s', backgroundColor: item ? 'primary.main' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(8,145,178,0.24)' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: item ? 'primary.main' : 'text.primary', letterSpacing: '0.06em', fontSize: '0.7rem', textTransform: 'uppercase', transition: 'color 0.3s' }}>{label}</Typography>
        <Tooltip title={`${fullLabel} — ${description}`} placement="top" arrow>
          <InfoIcon sx={{ fontSize: 12, color: 'text.disabled', cursor: 'help', ml: 0.2 }} />
        </Tooltip>
      </Box>
      <Box sx={{ height: SLOT_H, flexShrink: 0, position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {!item ? (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} style={{ position: 'absolute', inset: 0 }}>
              <Box {...getRootProps()} sx={{ position: 'absolute', inset: 0, border: '2px dashed', borderRadius: 2, cursor: 'pointer', borderColor: isDragActive ? 'primary.main' : err ? 'error.main' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.11)' : 'rgba(8,145,178,0.22)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5, backgroundColor: isDragActive ? (t) => `${t.palette.primary.main}0E` : err ? 'rgba(239,68,68,0.04)' : 'background.default', transition: 'all 0.18s', '&:hover': { borderColor: 'primary.main', backgroundColor: (t) => `${t.palette.primary.main}09` } }}>
                <input {...getInputProps()} />
                <GalleryIcon sx={{ fontSize: 18, color: isDragActive ? 'primary.main' : 'text.disabled' }} />
                <Typography variant="caption" sx={{ color: isDragActive ? 'primary.main' : 'text.secondary', fontWeight: 500, fontSize: '0.65rem', textAlign: 'center', px: 0.75 }}>{isDragActive ? 'Drop here' : description}</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.57rem' }}>JPEG · PNG · DICOM</Typography>
              </Box>
            </motion.div>
          ) : (
            <motion.div key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} style={{ position: 'absolute', inset: 0 }}>
              <Box sx={{ position: 'absolute', inset: 0, border: '2px solid', borderColor: (t) => `${t.palette.primary.main}45`, borderRadius: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: (t) => `${t.palette.primary.main}08` }}>
                <Box component="img" src={item.preview} alt={label} sx={{ flex: 1, width: '100%', objectFit: 'cover', display: 'block', minHeight: 0 }} />
                <Box sx={{ px: 1, py: 0.4, flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, backgroundColor: 'background.paper' }}>
                  <Box sx={{ position: 'absolute', top: 5, left: 5, px: 0.8, py: 0.2, borderRadius: '999px', backgroundColor: (t) => `${t.palette.primary.main}CC`, display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    <CheckIcon sx={{ fontSize: 9, color: '#fff' }} /><Typography sx={{ fontSize: '0.55rem', color: '#fff', fontWeight: 700, letterSpacing: '0.05em' }}>READY</Typography>
                  </Box>
                  <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0, color: 'text.primary', fontWeight: 500, fontSize: '0.62rem' }}>{item.file.name}</Typography>
                  <Button size="small" variant="outlined" color="error" onClick={() => { setErr(null); onRemove(viewKey); }} sx={{ fontSize: '0.56rem', py: 0.1, px: 0.55, minWidth: 0, flexShrink: 0 }}>Remove</Button>
                </Box>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>
      <AnimatePresence>
        {err && <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Alert severity="error" icon={<WarnIcon sx={{ fontSize: 13 }} />} sx={{ py: 0.2, fontSize: '0.65rem' }}>{err}</Alert></motion.div>}
      </AnimatePresence>
    </Box>
  );
};

// ── RoutedRow ─────────────────────────────────────────────────────────────────
const RoutedRow = ({ cfg, item, proof, onRemove }) => {
  const sp = proof && !proof.manual;
  const tip = sp ? `Matched "${proof.sideProof}" → ${sideName(proof.side)}, "${proof.viewProof}" → ${proof.view}${!proof.adjacent ? ' (not adjacent — verify)' : ''}` : proof?.manual ? 'Placed manually' : cfg.label;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.9, borderRadius: 1.5, backgroundColor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
      <Box component="img" src={item.preview} alt={cfg.label} sx={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 1, flexShrink: 0, border: '1px solid', borderColor: (t) => `${t.palette.primary.main}40` }} />
      <Tooltip arrow placement="top" title={tip}>
        <Box sx={{ flexShrink: 0, px: 0.85, py: 0.25, borderRadius: '999px', cursor: 'help', backgroundColor: (t) => `${t.palette.primary.main}18`, border: '1px solid', borderColor: (t) => `${t.palette.primary.main}50`, display: 'flex', alignItems: 'center', gap: 0.4 }}>
          {sp && <AutoAwesomeIcon sx={{ fontSize: 9, color: 'primary.main' }} />}
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: 'primary.main', letterSpacing: '0.04em' }}>{cfg.label}</Typography>
        </Box>
      </Tooltip>
      <Typography variant="caption" noWrap sx={{ color: 'text.primary', fontWeight: 500, fontSize: '0.66rem', flex: 1, minWidth: 0 }}>{item.file.name}</Typography>
      <Button size="small" variant="outlined" color="error" onClick={() => onRemove(cfg.key)} sx={{ fontSize: '0.56rem', py: 0.1, px: 0.55, minWidth: 0, flexShrink: 0 }}>Remove</Button>
    </Box>
  );
};

// ── Slide animation ───────────────────────────────────────────────────────────
const slideVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 22 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: (dir) => ({ opacity: 0, x: dir * -22, transition: { duration: 0.16 } }),
};

// ── Arrow button ──────────────────────────────────────────────────────────────
const ArrowBtn = ({ dir, onClick, disabled }) => (
  <Box onClick={disabled ? undefined : onClick} sx={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? 'transparent' : 'primary.main', border: '1px solid', borderColor: disabled ? 'transparent' : 'primary.main', color: disabled ? 'transparent' : 'primary.contrastText', opacity: disabled ? 0.1 : 1, transition: 'all 0.15s', boxShadow: disabled ? 'none' : (t) => `0 2px 8px ${t.palette.primary.main}55`, '&:hover': disabled ? {} : { filter: 'brightness(1.15)' } }}>
    {dir === 'left' ? <ChevronLeftIcon sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />}
  </Box>
);

// ── Main export ───────────────────────────────────────────────────────────────
export default function FutureRiskUpload({ sessions, setSessions, setActiveStep, handleAnalyse, patientAge, setPatientAge }) {
  const [uploadMode, setUploadMode] = useState('manual');
  const [activeIdx, setActiveIdx] = useState(0);
  const [proofMaps, setProofMaps] = useState({});
  const [pendings, setPendings] = useState({});
  const [dateProofs, setDateProofs] = useState({});
  const [smartErrs, setSmartErrs] = useState({});
  const slideDir = useRef(1);

  const goTo = (i) => {
    const clamped = Math.max(0, Math.min(sessions.length - 1, i));
    slideDir.current = clamped > activeIdx ? 1 : -1;
    setActiveIdx(clamped);
  };

  const currentSession = sessions[activeIdx] ?? sessions[0];
  const sid = currentSession?.id;
  const currentProof = proofMaps[sid] ?? {};
  const currentPending = pendings[sid] ?? [];
  const currentDateProof = dateProofs[sid] ?? null;
  const currentSmartErr = smartErrs[sid] ?? null;
  const filledCount = currentSession ? Object.values(currentSession.views).filter(Boolean).length : 0;
  const hasSmartContent = filledCount > 0 || currentPending.length > 0;

  const sessionComplete = (s) => s.scanDate !== '' && Object.values(s.views).every(v => v !== null);
  const completedCount = sessions.filter(sessionComplete).length;
  const canContinue = sessions.length >= MIN_SESSIONS && sessions.every(sessionComplete);
  const isSmrt = uploadMode === 'smart';
  const freeSlots = VIEW_CONFIG.filter(c => !currentSession?.views[c.key]);

  // ── Session management ─────────────────────────────────────────────────────
  const addSession = () => {
    if (sessions.length >= MAX_SESSIONS) return;
    const s = { id: crypto.randomUUID(), scanDate: '', views: { 'L-CC': null, 'R-CC': null, 'L-MLO': null, 'R-MLO': null } };
    setSessions([...sessions, s]);
    slideDir.current = 1;
    setActiveIdx(sessions.length);
  };

  const removeSession = (id) => {
    if (sessions.length <= MIN_SESSIONS) return;
    const idx = sessions.findIndex(s => s.id === id);
    setSessions(sessions.filter(s => s.id !== id));
    if (idx <= activeIdx) setActiveIdx(Math.max(0, activeIdx - 1));
    [setProofMaps, setPendings, setDateProofs, setSmartErrs].forEach(fn => fn(p => { const n = { ...p }; delete n[id]; return n; }));
  };

  const updateDate = useCallback((val) => {
    setSessions(prev => prev.map((s, i) => i === activeIdx ? { ...s, scanDate: val } : s));
    // clear auto-proof if user manually typed
    setDateProofs(p => ({ ...p, [sid]: null }));
  }, [activeIdx, sid, setSessions]);

  // ── Manual handlers ────────────────────────────────────────────────────────
  const handleManualDrop = useCallback((viewKey, file) => {
    setSessions(prev => prev.map((s, i) => i === activeIdx ? { ...s, views: { ...s.views, [viewKey]: { file, preview: URL.createObjectURL(file), id: crypto.randomUUID() } } } : s));
  }, [activeIdx, setSessions]);

  const handleRemoveView = useCallback((viewKey) => {
    setSessions(prev => prev.map((s, i) => i === activeIdx ? { ...s, views: { ...s.views, [viewKey]: null } } : s));
    setProofMaps(p => { const n = { ...p }; if (n[sid]) { const m = { ...n[sid] }; delete m[viewKey]; n[sid] = m; } return n; });
  }, [activeIdx, sid, setSessions]);

  // ── Smart handlers ─────────────────────────────────────────────────────────
  const handleSmartDrop = useCallback((accepted, rejected) => {
    const sess = sessions[activeIdx];
    if (!sess) return;
    const id_ = sess.id;

    if (rejected.length) setSmartErrs(p => ({ ...p, [id_]: rejected[0].errors[0].message === 'File is larger than 10485760 bytes' ? 'One or more files exceed 10 MB.' : 'Some files were rejected.' }));
    else setSmartErrs(p => ({ ...p, [id_]: null }));

    const nv = { ...sess.views };
    const np = { ...(proofMaps[id_] ?? {}) };
    const npe = [...(pendings[id_] ?? [])];
    let nd = sess.scanDate;
    let ndp = dateProofs[id_] ?? null;

    accepted.forEach(f => {
      const vd = detectView(f.name);
      const dd = detectDate(f.name);
      const preview = URL.createObjectURL(f);
      const fid = crypto.randomUUID();
      if (!nd && dd.ok) { nd = dd.iso; ndp = dd.proof; }
      if (vd.ok && nv[vd.key] == null) { nv[vd.key] = { file: f, preview, id: fid }; np[vd.key] = { ...vd, fileName: f.name }; }
      else npe.push({ id: fid, file: f, preview, reason: vd.ok ? 'duplicate' : 'unrecognized', detection: vd });
    });

    setSessions(prev => prev.map((s, i) => i === activeIdx ? { ...s, views: nv, scanDate: nd } : s));
    setProofMaps(p => ({ ...p, [id_]: np }));
    setPendings(p => ({ ...p, [id_]: npe }));
    setDateProofs(p => ({ ...p, [id_]: ndp }));
  }, [sessions, activeIdx, proofMaps, pendings, dateProofs, setSessions]);

  const assignPending = (pid, viewKey) => {
    const it = currentPending.find(p => p.id === pid); if (!it) return;
    setSessions(prev => prev.map((s, i) => i === activeIdx ? { ...s, views: { ...s.views, [viewKey]: { file: it.file, preview: it.preview, id: it.id } } } : s));
    setProofMaps(p => ({ ...p, [sid]: { ...(p[sid] ?? {}), [viewKey]: { fileName: it.file.name, manual: true } } }));
    setPendings(p => ({ ...p, [sid]: (p[sid] ?? []).filter(x => x.id !== pid) }));
  };
  const discardPending = (pid) => setPendings(p => ({ ...p, [sid]: (p[sid] ?? []).filter(x => x.id !== pid) }));

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: handleSmartDrop, accept: { 'image/jpeg': [], 'image/png': [], 'application/dicom': ['.dcm'] }, maxSize: 10485760, multiple: true });

  return (
    <Box>
      {/* ── Panel ── */}
      <Box sx={{ borderRadius: '6px 6px 16px 16px', border: '1px solid', borderColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.11)' : 'rgba(8,145,178,0.2)', backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.025)' : 'rgba(8,145,178,0.04)', boxShadow: (t) => t.palette.mode === 'dark' ? '0 10px 36px rgba(0,0,0,0.32)' : '0 6px 24px rgba(8,145,178,0.1)', overflow: 'hidden' }}>

        {/* Tab bar */}
        <Box sx={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid', borderColor: 'divider', backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(0,0,0,0.22)' : 'rgba(8,145,178,0.07)' }}>
          <ModeToggle mode={uploadMode} setMode={setUploadMode} />

          {/* Sessions-complete counter */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 1.75, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', gap: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.2 }}>
              <Typography sx={{ fontWeight: 900, fontSize: '1rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums', transition: 'color 0.3s', color: completedCount > 0 ? 'primary.main' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(8,145,178,0.6)' }}>{completedCount}</Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1, color: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(8,145,178,0.3)' }}>/</Typography>
              <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1, color: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(8,145,178,0.4)' }}>{sessions.length}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.56rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.disabled', lineHeight: 1, mt: 0.3 }}>sessions</Typography>
          </Box>
        </Box>

        {/* Info / status bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, px: 1.75, minHeight: 38, borderBottom: '1px solid', borderColor: 'divider', backgroundColor: canContinue ? (t) => t.palette.mode === 'dark' ? 'rgba(34,211,238,0.10)' : 'rgba(8,145,178,0.12)' : (t) => t.palette.mode === 'dark' ? 'rgba(34,211,238,0.06)' : 'rgba(8,145,178,0.07)', transition: 'background-color 0.25s' }}>
          {canContinue ? <CheckIcon sx={{ fontSize: 14, flexShrink: 0, color: 'primary.main' }} /> : <InfoIcon sx={{ fontSize: 14, flexShrink: 0, color: 'primary.main' }} />}
          <Typography variant="caption" sx={{ fontSize: '0.69rem', lineHeight: 1.5, minWidth: 0, fontWeight: canContinue ? 600 : 400, color: canContinue ? 'primary.main' : 'text.secondary' }}>
            {canContinue ? `All ${sessions.length} sessions complete — ready for temporal analysis.`
              : isSmrt
                ? <>Filename needs <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>laterality</Box> (L/R), <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>view</Box> (CC/MLO) and <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>date</Box> (YYYY-MM-DD) — e.g.{'\u00A0'}<Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.67rem', color: 'primary.main', backgroundColor: (t) => `${t.palette.primary.main}18`, px: 0.45, borderRadius: 0.5 }}>…_2014-03-01_…_R_CC</Box></>
                : `Future Risk · Fill all 4 views + scan date for each session. At least ${MIN_SESSIONS} sessions required.`}
          </Typography>
        </Box>

        {/* Body */}
        <Box sx={{ p: 1.5 }}>
          {/* Session date row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'text.primary', whiteSpace: 'nowrap' }}>
              Session {activeIdx + 1} date
            </Typography>
            <TextField type="date" size="small" value={currentSession?.scanDate ?? ''} onChange={e => updateDate(e.target.value)} inputProps={{ max: TODAY }}
              sx={{ '& .MuiInputBase-root': { fontSize: '0.7rem', height: 28, backgroundColor: currentSession?.scanDate ? (t) => `${t.palette.primary.main}10` : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(8,145,178,0.04)', borderRadius: 1 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: currentSession?.scanDate ? (t) => `${t.palette.primary.main}60` : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(8,145,178,0.25)' }, '& input': { color: 'text.primary', px: 0.75, py: 0 }, '& input::-webkit-calendar-picker-indicator': { filter: (t) => t.palette.mode === 'dark' ? 'invert(0.5)' : 'none', cursor: 'pointer', width: 13 } }}
            />
            {isSmrt && currentDateProof && (
              <Tooltip arrow title={`Date "${currentDateProof}" detected from filename`}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, px: 0.65, py: 0.2, borderRadius: '999px', backgroundColor: (t) => `${t.palette.primary.main}14`, border: '1px solid', borderColor: (t) => `${t.palette.primary.main}40`, cursor: 'help', flexShrink: 0 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 10, color: 'primary.main' }} />
                  <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, color: 'primary.main' }}>AUTO</Typography>
                </Box>
              </Tooltip>
            )}
            {sessions.length > MIN_SESSIONS && (
              <Tooltip title="Remove this session" arrow>
                <Box onClick={() => removeSession(sid)} sx={{ ml: 'auto', display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'error.main', opacity: 0.55, flexShrink: 0, '&:hover': { opacity: 1 }, transition: 'opacity 0.15s' }}>
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </Box>
              </Tooltip>
            )}
          </Box>

          {/* Carousel: ← content → */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <ArrowBtn dir="left" onClick={() => goTo(activeIdx - 1)} disabled={activeIdx === 0} />

            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', minHeight: 240, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <AnimatePresence mode="wait" custom={slideDir.current}>
                <motion.div key={`${sid}-${isSmrt ? 's' : 'm'}`} custom={slideDir.current} variants={slideVariants} initial="enter" animate="center" exit="exit">
                  {!isSmrt ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                      {VIEW_CONFIG.map(cfg => (
                        <ViewSlot key={cfg.key} viewKey={cfg.key} label={cfg.label} fullLabel={cfg.fullLabel} description={cfg.description}
                          item={currentSession?.views[cfg.key] ?? null} onDrop={handleManualDrop} onRemove={handleRemoveView}
                        />
                      ))}
                    </Box>
                  ) : (
                    <Box>
                      {filledCount < 4 && (
                        <Box {...getRootProps()} sx={{ border: '2px dashed', borderRadius: 2.5, cursor: 'pointer', borderColor: isDragActive ? 'primary.main' : (t) => `${t.palette.primary.main}50`, height: hasSmartContent ? 'auto' : 230, py: hasSmartContent ? 1 : 0, px: 2, display: 'flex', flexDirection: hasSmartContent ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: hasSmartContent ? 1 : 1.1, backgroundColor: isDragActive ? (t) => `${t.palette.primary.main}12` : (t) => `${t.palette.primary.main}07`, transition: 'all 0.2s', '&:hover': { borderColor: 'primary.main', backgroundColor: (t) => `${t.palette.primary.main}0E` } }}>
                          <input {...getInputProps()} />
                          <Box sx={{ width: hasSmartContent ? 26 : 44, height: hasSmartContent ? 26 : 44, borderRadius: hasSmartContent ? 1.25 : 2.25, flexShrink: 0, backgroundColor: (t) => `${t.palette.primary.main}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                            <AutoAwesomeIcon sx={{ fontSize: hasSmartContent ? 14 : 22, color: 'primary.main', transition: 'font-size 0.2s' }} />
                          </Box>
                          {hasSmartContent
                            ? <Typography variant="caption" sx={{ color: isDragActive ? 'primary.main' : 'text.secondary', fontWeight: 600, fontSize: '0.71rem' }}>{isDragActive ? 'Drop to add more' : `Add more — ${filledCount}/4 routed for Session ${activeIdx + 1}`}</Typography>
                            : (<>
                              <Typography variant="subtitle1" fontWeight={700} sx={{ color: isDragActive ? 'primary.main' : 'text.primary' }}>{isDragActive ? 'Drop files here' : `Drop files for Session ${activeIdx + 1}`}</Typography>
                              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 300 }}>View, laterality and date are read from filenames automatically.</Typography>
                            </>)}
                        </Box>
                      )}
                      {filledCount === 4 && <input {...getInputProps()} style={{ display: 'none' }} />}

                      <AnimatePresence>
                        {currentSmartErr && <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Alert severity="warning" icon={<WarnIcon />} sx={{ mt: 1, py: 0.2, fontSize: '0.7rem' }}>{currentSmartErr}</Alert></motion.div>}
                      </AnimatePresence>

                      {filledCount > 0 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: hasSmartContent && filledCount < 4 ? 1.25 : 0 }}>
                          <AnimatePresence>
                            {VIEW_CONFIG.filter(c => currentSession?.views[c.key]).map(cfg => (
                              <motion.div key={cfg.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.16 }}>
                                <RoutedRow cfg={cfg} item={currentSession.views[cfg.key]} proof={currentProof[cfg.key]} onRemove={handleRemoveView} />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </Box>
                      )}

                      <AnimatePresence>
                        {currentPending.length > 0 && (
                          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                            <Box sx={{ mt: 1, p: 1, borderRadius: 2, border: '1px solid', borderColor: (t) => `${t.palette.warning.main}40`, backgroundColor: (t) => `${t.palette.warning.main}09` }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, mb: 0.75 }}>
                                <WarnIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem' }}>Needs attention · {currentPending.length}</Typography>
                              </Box>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                                {currentPending.map(p => (
                                  <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.85, px: 0.85, py: 0.6, borderRadius: 1.5, backgroundColor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                                    <Box component="img" src={p.preview} alt="preview" sx={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 0.75, flexShrink: 0 }} />
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                      <Typography variant="caption" noWrap sx={{ color: 'text.primary', fontWeight: 600, fontSize: '0.64rem', display: 'block' }}>{p.file.name}</Typography>
                                      <Typography variant="caption" sx={{ color: 'warning.main', fontSize: '0.59rem' }}>{p.reason === 'duplicate' ? `${p.detection.key} already filled` : `Missing ${p.detection.missing?.join(' & ') ?? 'view'} in filename`}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                      {freeSlots.map(c => <Button key={c.key} size="small" variant="outlined" onClick={() => assignPending(p.id, c.key)} sx={{ fontSize: '0.56rem', py: 0.1, px: 0.5, minWidth: 0 }}>{c.label}</Button>)}
                                      {!freeSlots.length && <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.58rem' }}>All slots full</Typography>}
                                      <Button size="small" variant="text" color="error" onClick={() => discardPending(p.id)} sx={{ fontSize: '0.58rem', py: 0.1, px: 0.5, minWidth: 0 }}>✕</Button>
                                    </Box>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Box>
                  )}
                </motion.div>
              </AnimatePresence>
            </Box>

            <ArrowBtn dir="right" onClick={() => goTo(activeIdx + 1)} disabled={activeIdx === sessions.length - 1} />
          </Box>

          {/* Pagination dots + add — below the carousel */}
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.8, mt: 0.75 }}>
            {sessions.map((s, i) => (
              <Tooltip key={s.id} title={`Session ${i + 1}${sessionComplete(s) ? ' — complete' : ''}`} arrow>
                <Box onClick={() => goTo(i)} sx={{ width: 9, height: 9, borderRadius: '50%', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0, backgroundColor: sessionComplete(s) ? 'primary.main' : i === activeIdx ? 'primary.main' : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(8,145,178,0.3)', transform: i === activeIdx ? 'scale(1.3)' : 'scale(1)', opacity: i === activeIdx ? 1 : sessionComplete(s) ? 0.85 : 0.4, boxShadow: i === activeIdx ? (t) => `0 0 6px ${t.palette.primary.main}BB` : 'none' }} />
              </Tooltip>
            ))}
            {sessions.length < MAX_SESSIONS && (
              <Tooltip title={`Add session (${sessions.length}/${MAX_SESSIONS})`} arrow>
                <Box onClick={addSession} sx={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', border: '1.5px solid', borderColor: (t) => `${t.palette.primary.main}60`, backgroundColor: (t) => `${t.palette.primary.main}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'primary.main', '&:hover': { backgroundColor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' }, transition: 'all 0.18s' }}>
                  <AddIcon sx={{ fontSize: 15 }} />
                </Box>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Box>

      {/* Navigation + Patient Age */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.12 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.75 }}>
          <Button variant="text" onClick={() => setActiveStep(p => p - 1)} sx={{ letterSpacing: '0.04em', fontSize: '0.8rem' }}>← Back to Configuration</Button>

          {/* Patient Age — centred between the nav buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', whiteSpace: 'nowrap' }}>Patient Age</Typography>
            <TextField type="number" size="small" value={patientAge} onChange={e => setPatientAge(e.target.value)} inputProps={{ min: 18, max: 100 }}
              sx={{ width: 90, '& .MuiInputBase-root': { fontSize: '0.78rem', height: 30, backgroundColor: patientAge ? (t) => `${t.palette.primary.main}10` : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(8,145,178,0.04)', borderRadius: 1 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: patientAge ? (t) => `${t.palette.primary.main}60` : (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(8,145,178,0.25)' }, '& input': { color: 'text.primary', px: 1, py: 0 } }}
            />
          </Box>

          <Button variant="contained" disabled={!canContinue} onClick={() => { setActiveStep(p => p + 1); handleAnalyse(); }} sx={{ px: 3, fontWeight: 700 }}>Analyse →</Button>
        </Box>
      </motion.div>
    </Box>
  );
}