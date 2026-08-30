import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Box, Typography, TextField, Dialog, DialogTitle, DialogContent, DialogActions, useTheme } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

const MONO = { fontFamily: 'monospace' };
const VIEWS = ['L-CC', 'L-MLO', 'R-CC', 'R-MLO'];
const MODELS = [
    { id: 'Classical', label: 'Classical AI' },
    { id: 'Quantum', label: 'Quantum AI' },
    { id: 'Both', label: 'Comparison' },
];

// Classification triad avoids a straight red/green pair (a common colorblind
// confusion axis); every value still ships with its text label alongside the color.
const MC = '#FF6A4D', BC = '#E3A63C', NC = '#2FBFA8';
const CNN_C = '#5cc8f5', QML_C = '#c07ae0';

// Review status uses its own palette, separate from classification colors,
// so "pending/confirmed/edited" never reads as a classification result.
const STATUS_PENDING = '#FFB020', STATUS_DONE = '#33C9FF';

const pct = (v) => ((v ?? 0) * 100);
const getColor = (r) => (r === 'Malignant' ? MC : r === 'Benign' ? BC : NC);

function Bar({ value, color, track, delay = 0, height = 4 }) {
    const [w, setW] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setW(value), 100 + delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return (
        <Box sx={{ flex: 1, height, borderRadius: 99, backgroundColor: track, overflow: 'hidden' }}>
            <Box sx={{
                width: `${w}%`, height: '100%', borderRadius: 99, backgroundColor: color,
                transition: 'width 1.1s cubic-bezier(0.16,1,0.3,1)',
            }} />
        </Box>
    );
}

function Label({ children, sx }) {
    return (
        <Typography sx={{
            ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            lineHeight: 1.2, ...sx,
        }}>
            {children}
        </Typography>
    );
}


export default function ClassificationResults({
    analyisedImage,
    currentModel,
    onModelSelect,
    results,
    sessionId,
    summary,
    LLMloading,
    audience,
    setAudience,
    onGenerateExplanation,
    onOpenFullExplanation,
    verifications,
    onVerifyView,
    height = 820,
}) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [mounted, setMounted] = useState(false);
    const [opacity, setOpacity] = useState(45);
    const [currentView, setCurrentView] = useState('L-CC');
    const [zoomModel, setZoomModel] = useState(null); // model name while the zoom popup is open, else null
    const [zoomScale, setZoomScale] = useState(1);
    const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 });
    const zoomStageRef = useRef(null);
    const ZOOM_MIN = 1, ZOOM_MAX = 4, ZOOM_STEP = 0.4;
    const clampZoom = (v) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +v.toFixed(2)));

    // Reset zoom/pan whenever the popup opens or the view changes.
    useEffect(() => {
        setZoomScale(1);
        setZoomPan({ x: 0, y: 0 });
    }, [zoomModel, currentView]);

    // Native listener with { passive: false } — React's onWheel is passive by
    // default, which silently no-ops preventDefault() and lets the dialog
    // scroll instead of zooming.
    useEffect(() => {
        const el = zoomStageRef.current;
        if (!el || !zoomModel) return;
        const onWheel = (e) => {
            e.preventDefault();
            setZoomScale((s) => clampZoom(s - e.deltaY * 0.0025));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [zoomModel]);

    const handleZoomMouseDown = (e) => {
        if (zoomScale <= 1) return;
        panRef.current = { startX: e.clientX, startY: e.clientY, originX: zoomPan.x, originY: zoomPan.y };
        setIsPanning(true);
    };
    const handleZoomMouseMove = (e) => {
        if (!isPanning) return;
        setZoomPan({
            x: panRef.current.originX + (e.clientX - panRef.current.startX),
            y: panRef.current.originY + (e.clientY - panRef.current.startY),
        });
    };
    const stopZoomPan = () => setIsPanning(false);

    // Editing state is local to whichever view is open.
    const [editingView, setEditingView] = useState(false);
    const [draftResult, setDraftResult] = useState(null);
    const [draftNote, setDraftNote] = useState('');
    useEffect(() => {
        setEditingView(false);
        setDraftResult(null);
        setDraftNote('');
    }, [currentView]);

    const cnn = results?.resultFile?.cnn;
    const qml = results?.resultFile?.qml;
    const isBoth = currentModel === 'Both';
    const activeResult = currentModel === 'Quantum' ? qml : cnn;
    const activeView = activeResult?.views?.[currentView];

    /* ── tokens ── */
    const t = isDark ? {
        shell: '#0a1728', panel: '#08131f', card: '#0c1c2e', line: '#17304d',
        selLine: '#2f7fb8', selBg: '#0f2740', text: '#eaf4ff', body: '#c3d8ec',
        muted: '#5f7fa6', dim: '#8fabc9', track: '#132840', footer: '#3f5d7d',
    } : {
        shell: '#0D1B2E', panel: '#112038', card: '#162840',
        line: 'rgba(34,211,238,0.18)',
        selLine: '#2f7fb8', selBg: 'rgba(34,211,238,0.12)',
        text: '#F0F9FF', body: '#CBD8E8',
        muted: '#6B90AC', dim: '#8BAFC4',
        track: 'rgba(255,255,255,0.08)', footer: '#4A6A80',
    };

    useEffect(() => {
        setMounted(false);
        if (!activeResult) return;
        const id = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(id);
    }, [activeResult]);

    const perView = useMemo(() => VIEWS.map((v) => {
        const c = cnn?.views?.[v];
        const q = qml?.views?.[v];
        const shown = currentModel === 'Quantum' ? q : c;
        return {
            id: v,
            result: shown?.result,
            score: pct(shown?.score),
            cnnResult: c?.result,
            qmlResult: q?.result,
            agree: !!c?.result && c?.result === q?.result,
            base: c?.gradcam?.base_image_base64 ?? q?.gradcam?.base_image_base64,
        };
    }), [cnn, qml, currentModel]);

    if (!activeResult || !activeView) return null;

    const resultColor = getColor(activeView.result);
    const cnnView = cnn?.views?.[currentView];
    const qmlView = qml?.views?.[currentView];
    const agree = cnnView?.result === qmlView?.result;
    const verdictColor = agree ? NC : MC;
    const verdictText = agree ? 'Agree' : 'Disagree';

    const baseSrc = (v) => {
        const b64 = cnn?.views?.[v]?.gradcam?.base_image_base64 ?? qml?.views?.[v]?.gradcam?.base_image_base64;
        return b64 ? `data:image/png;base64,${b64}` : analyisedImage;
    };
    const heatSrc = (model, v) => {
        const b64 = (model === 'Quantum' ? qml : cnn)?.views?.[v]?.gradcam?.heatmap_base64;
        return b64 ? `data:image/png;base64,${b64}` : null;
    };

    const classes = ['Malignant', 'Benign', 'Normal'].map((label) => ({
        label,
        color: label === 'Malignant' ? MC : label === 'Benign' ? BC : NC,
        single: pct(activeView?.class_probabilities?.[label]),
        cnn: pct(cnnView?.class_probabilities?.[label]),
        qml: pct(qmlView?.class_probabilities?.[label]),
    }));

    /* ── image pane ── */
    const ImagePane = ({ model, title, titleColor, borderColor, resultLine }) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
            {title && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Label sx={{ color: titleColor, letterSpacing: '0.12em', fontSize: 11 }}>{title}</Label>
                    <Typography sx={{ ...MONO, fontSize: 11, color: resultLine?.color, whiteSpace: 'nowrap' }}>
                        {resultLine?.text}
                    </Typography>
                </Box>
            )}
            <Box sx={{
                flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
                borderRadius: 2.5, background: '#000',
                border: `1px solid ${borderColor ?? t.line}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Box sx={{ position: 'relative', objectFit: 'contain' }}>

                    <Box component="img" src={baseSrc(currentView)} alt={`${currentView} mammogram`}
                        sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
                    {heatSrc(model, currentView) && (
                        <Box component="img" src={heatSrc(model, currentView)} alt="" aria-hidden
                            sx={{
                                position: 'absolute', inset: 0, width: '100%', height: '100%',
                                objectFit: 'contain', pointerEvents: 'none',
                                mixBlendMode: 'multiply', opacity: opacity / 100,
                                transition: 'opacity 0.2s ease',
                            }} />
                    )}
                </Box>
                {!title && (
                    <Box sx={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 1 }}>
                        {[currentView, `OCCL ${opacity}%`].map((txt, i) => (
                            <Typography key={txt} sx={{
                                ...MONO, fontSize: 11, whiteSpace: 'nowrap',
                                color: `rgba(255,255,255,${i ? 0.65 : 0.88})`,
                                background: 'rgba(0,0,0,0.55)', px: 1, py: 0.5, borderRadius: 1,
                            }}>{txt}</Typography>
                        ))}
                    </Box>
                )}
                <Box
                    onClick={() => setZoomModel(model)}
                    title="Zoom in"
                    sx={{
                        position: 'absolute', top: 12, right: 12,
                        width: 30, height: 30, borderRadius: 1.5, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)',
                        transition: 'all 0.15s ease',
                        '&:hover': { background: 'rgba(0,0,0,0.75)', borderColor: 'rgba(255,255,255,0.35)' },
                    }}
                >
                    <OpenInFullIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }} />
                </Box>
            </Box>
        </Box>
    );

    return (
        <Box sx={{
            width: '100%', mx: 'auto', my: 2,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(12px)',
            transition: 'opacity 0.45s ease, transform 0.45s ease',
        }}>
            <Box sx={{
                height, maxHeight: '86vh', display: 'flex', flexDirection: 'column',
                borderRadius: 1.5, overflow: 'hidden',
                background: t.shell, border: `1px solid ${t.line}`,
            }}>
                {/* ── top bar ── */}
                <Box sx={{
                    flex: 'none', minHeight: 58, pl: 3.5, pr: 2.5, py: 1.5,
                    display: 'flex', alignItems: 'baseline', gap: 2.75, flexWrap: 'wrap',
                    background: t.panel, borderBottom: `1px solid ${t.line}`,
                }}>
                    <Typography sx={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: t.text, whiteSpace: 'nowrap' }}>
                        Mammo
                        <Box component="span" sx={{ color: theme.palette.primary.main, fontStyle: 'italic' }}>
                            Analysis
                        </Box>
                    </Typography>

                    <Box sx={{ width: '1px', alignSelf: 'stretch', background: t.line, flexShrink: 0 }} />

                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: t.text, whiteSpace: 'nowrap' }}>
                        Classification Results
                    </Typography>

                    {sessionId && (
                        <Label sx={{ ml: 'auto', color: t.dim, whiteSpace: 'nowrap' }}>
                            ID: {sessionId}
                        </Label>
                    )}

                    {onModelSelect && (
                        <Box sx={{
                            alignSelf: 'center', flexShrink: 0, display: 'flex', gap: 0.4, p: 0.4,
                            background: t.card, border: `1px solid ${t.line}`, borderRadius: 2.25,
                        }}>
                            {MODELS.map(({ id, label }) => {
                                const sel = currentModel === id;
                                return (
                                    <Box key={id} onClick={() => onModelSelect(id)} sx={{
                                        px: 1.9, py: 0.9, borderRadius: 1.5, cursor: 'pointer',
                                        background: sel ? t.selBg : 'transparent',
                                        transition: 'background 0.15s ease',
                                        '&:hover': { background: sel ? t.selBg : 'rgba(92,200,245,0.08)' },
                                    }}>
                                        <Typography sx={{
                                            fontSize: 13, lineHeight: 1, whiteSpace: 'nowrap',
                                            fontWeight: sel ? 600 : 400,
                                            color: sel ? t.text : t.dim,
                                        }}>{label}</Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}

                </Box>

                {/* ── body ── */}
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>


                    <Box sx={{
                        width: 148, flex: 'none', position: 'relative',
                        px: 2, pt: 3.5, pb: 2.5, borderRight: `1px solid ${t.line}`,
                        display: 'flex', flexDirection: 'column', gap: 1,
                    }}>
                        <Label sx={{ color: t.muted, position: 'absolute', top: 12, left: 16 }}>
                            Views
                        </Label>
                        {perView.map((v) => {
                            const sel = currentView === v.id;
                            const vStatus = verifications?.[v.id]?.status ?? 'pending';
                            const dotColor = vStatus === 'pending' ? STATUS_PENDING : STATUS_DONE;
                            return (
                                <Box key={v.id} onClick={() => setCurrentView(v.id)}
                                    sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.6, cursor: 'pointer' }}>
                                    <Box sx={{
                                        flex: 1, minHeight: 0, position: 'relative',
                                        borderRadius: 1, overflow: 'hidden', background: '#000',
                                        border: `1.5px solid ${sel ? '#3f8fc4' : t.line}`,
                                        boxShadow: sel ? '0 0 0 3px rgba(92,200,245,0.18)' : 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.15s ease',
                                        '&:hover': { borderColor: '#3f8fc4' },
                                    }}>
                                        <Box component="img" src={baseSrc(v.id)} alt={v.id}
                                            sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                        {onVerifyView && (
                                            <Box title={vStatus === 'confirmed' ? 'Confirmed' : vStatus === 'edited' ? 'Edited by clinician' : 'Awaiting review'} sx={{
                                                position: 'absolute', top: 5, right: 5, width: 10, height: 10, borderRadius: '50%',
                                                background: dotColor, border: '1.5px solid rgba(0,0,0,0.75)',
                                                boxShadow: `0 0 6px 1px ${dotColor}99`,
                                            }} />
                                        )}
                                    </Box>
                                    <Typography sx={{
                                        ...MONO, fontSize: 13, fontWeight: 700, textAlign: 'center',
                                        color: sel ? CNN_C : t.dim,
                                    }}>
                                        {v.id}
                                    </Typography>
                                </Box>
                            );
                        })}

                    </Box>

                    {/* reader */}
                    <Box sx={{ flex: 1, minWidth: 0, p: 3.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {isBoth ? (
                            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', gap: 1.75, px: 2 }}>
                                <ImagePane
                                    model="Classical" title="Classical · Occlusion"
                                    titleColor={CNN_C} borderColor="#24506f"
                                    resultLine={{
                                        text: `${cnnView?.result ?? '—'} ${pct(cnnView?.score).toFixed(2)}%`,
                                        color: getColor(cnnView?.result),
                                    }}
                                />
                                <Box sx={{
                                    flex: 'none', width: 0,
                                    borderLeft: `1px dashed ${t.line}`,
                                }} />
                                <ImagePane
                                    model="Quantum" title="Quantum · Occlusion"
                                    titleColor={QML_C} borderColor="#4a3060"
                                    resultLine={{
                                        text: `${qmlView?.result ?? '—'} ${pct(qmlView?.score).toFixed(2)}%`,
                                        color: getColor(qmlView?.result),
                                    }}
                                />
                            </Box>
                        ) : (

                            <ImagePane model={currentModel} />
                        )}

                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                            {onVerifyView && (() => {
                                const verification = verifications?.[currentView] ?? { status: 'pending', clinicianResult: null, note: '' };
                                const isConfirmed = verification.status === 'confirmed';
                                const isEdited = verification.status === 'edited';
                                const statusColor = verification.status === 'pending' ? STATUS_PENDING : STATUS_DONE;
                                const buttonLabel = isConfirmed ? 'Confirmed' : isEdited ? 'Edited' : 'Verify Result';

                                const openDialog = () => {
                                    setDraftResult(verification.clinicianResult ?? activeView.result);
                                    setDraftNote(verification.note ?? '');
                                    setEditingView(true);
                                };
                                const handleSave = () => {
                                    if (!draftResult) return;
                                    const status = draftResult === activeView.result ? 'confirmed' : 'edited';
                                    onVerifyView(currentView, { status, clinicianResult: draftResult, note: draftNote });
                                    setEditingView(false);
                                };
                                const handleUndo = () => {
                                    onVerifyView(currentView, { status: 'pending', clinicianResult: null, note: '' });
                                    setEditingView(false);
                                };

                            return (
                                <>
                                    <Box
                                        onClick={openDialog}
                                        title={verification.note || undefined}
                                        sx={{
                                            display: 'flex', alignItems: 'center', gap: 0.85,
                                            px: 2.25, py: 0.85, borderRadius: 99, cursor: 'pointer',
                                            background: t.card, border: `1px solid ${statusColor}66`,
                                            transition: 'all 0.15s ease',
                                            '&:hover': { borderColor: statusColor, background: `${statusColor}14` },
                                        }}
                                    >
                                        {isEdited ? (
                                            <EditIcon sx={{ fontSize: 13, color: statusColor }} />
                                        ) : isConfirmed ? (
                                            <CheckIcon sx={{ fontSize: 14, color: statusColor }} />
                                        ) : (
                                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                                        )}
                                        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>
                                            {buttonLabel} <Box component="span" sx={{ color: t.muted, fontWeight: 400 }}>· {currentView}</Box>
                                        </Typography>
                                        {verification.note && (
                                            <StickyNote2OutlinedIcon sx={{ fontSize: 13, color: t.muted, ml: 0.25 }} />
                                        )}
                                    </Box>

                                    <Dialog
                                        open={editingView} onClose={() => setEditingView(false)}
                                        maxWidth="xs" fullWidth
                                        PaperProps={{ sx: { background: t.shell, border: `1px solid ${t.line}`, borderRadius: 2.5 } }}
                                    >
                                        <DialogTitle sx={{ ...MONO, fontSize: 14.5, fontWeight: 700, color: t.text, px: 3.5, pt: 3, pb: 0.5 }}>
                                            Verify Result
                                        </DialogTitle>
                                        <Typography sx={{ fontSize: 12, color: t.muted, px: 3.5, pb: 2 }}>
                                            {currentView}
                                        </Typography>

                                        <DialogContent sx={{ px: 3.5, pt: 0, pb: 1, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <Label sx={{ color: t.muted }}>AI reads</Label>
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    {cnnView && (
                                                        <Box sx={{ flex: 1, borderRadius: 1.5, border: `1px solid ${t.line}`, background: t.card, px: 1.5, py: 1 }}>
                                                            <Typography sx={{ ...MONO, fontSize: 10, fontWeight: 700, color: CNN_C, letterSpacing: '0.06em' }}>
                                                                CLASSICAL
                                                            </Typography>
                                                            <Typography sx={{ fontSize: 14, fontWeight: 700, color: getColor(cnnView.result), mt: 0.25 }}>
                                                                {cnnView.result}
                                                            </Typography>
                                                            <Typography sx={{ fontSize: 11.5, color: t.dim }}>
                                                                {pct(cnnView.score).toFixed(1)}% confidence
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                    {qmlView && (
                                                        <Box sx={{ flex: 1, borderRadius: 1.5, border: `1px solid ${t.line}`, background: t.card, px: 1.5, py: 1 }}>
                                                            <Typography sx={{ ...MONO, fontSize: 10, fontWeight: 700, color: QML_C, letterSpacing: '0.06em' }}>
                                                                QUANTUM
                                                            </Typography>
                                                            <Typography sx={{ fontSize: 14, fontWeight: 700, color: getColor(qmlView.result), mt: 0.25 }}>
                                                                {qmlView.result}
                                                            </Typography>
                                                            <Typography sx={{ fontSize: 11.5, color: t.dim }}>
                                                                {pct(qmlView.score).toFixed(1)}% confidence
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                </Box>
                                            </Box>

                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <Label sx={{ color: t.muted }}>Your verdict</Label>
                                                <Box sx={{ display: 'flex', gap: 0.75 }}>
                                                    {['Malignant', 'Benign', 'Normal'].map((label) => {
                                                        const active = draftResult === label;
                                                        const lc = getColor(label);
                                                        return (
                                                            <Box key={label} onClick={() => setDraftResult(label)} sx={{
                                                                flex: 1, textAlign: 'center', py: 0.9, borderRadius: 1.5, cursor: 'pointer',
                                                                background: active ? `${lc}22` : t.card,
                                                                border: `1px solid ${active ? lc : t.line}`,
                                                                transition: 'all 0.15s ease',
                                                            }}>
                                                                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: active ? lc : t.dim }}>
                                                                    {label}
                                                                </Typography>
                                                            </Box>
                                                        );
                                                    })}
                                                </Box>
                                            </Box>

                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <Label sx={{ color: t.muted }}>Note (optional)</Label>
                                                <TextField
                                                    multiline minRows={2} placeholder="Add context for this read — kept whether you confirm or override."
                                                    value={draftNote} onChange={(e) => setDraftNote(e.target.value)}
                                                    sx={{
                                                        '& .MuiOutlinedInput-root': { fontSize: 12.5, color: t.body, background: t.card },
                                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: t.line },
                                                    }}
                                                />
                                            </Box>
                                        </DialogContent>
                                        <DialogActions sx={{ px: 3.5, pb: 2.75, pt: 1, justifyContent: 'space-between' }}>
                                            {verification.status !== 'pending' ? (
                                                <Box onClick={handleUndo} sx={{ px: 1.75, py: 0.65, borderRadius: 1.5, cursor: 'pointer', border: `1px solid ${t.line}` }}>
                                                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: t.dim }}>Undo</Typography>
                                                </Box>
                                            ) : <Box />}
                                            <Box sx={{ display: 'flex', gap: 0.75 }}>
                                                <Box onClick={() => setEditingView(false)} sx={{ px: 1.75, py: 0.65, borderRadius: 1.5, cursor: 'pointer', border: `1px solid ${t.line}` }}>
                                                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: t.dim }}>Cancel</Typography>
                                                </Box>
                                                <Box
                                                    onClick={handleSave}
                                                    sx={{ px: 1.75, py: 0.65, borderRadius: 1.5, cursor: draftResult ? 'pointer' : 'default', opacity: draftResult ? 1 : 0.5, background: CNN_C }}
                                                >
                                                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#08131f' }}>
                                                        {draftResult === activeView.result ? '✓ Confirm' : 'Save Override'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </DialogActions>
                                    </Dialog>
                                </>
                            );
                        })()}

                            <Box sx={{
                                display: 'flex', alignItems: 'center', gap: 0.9,
                                px: 1.5, py: 0.85, borderRadius: 99,
                                background: t.card, border: `1px solid ${t.line}`,
                            }}>
                                <Typography sx={{ ...MONO, fontSize: 9.5, color: t.muted, whiteSpace: 'nowrap' }}>
                                    OCCL
                                </Typography>
                                <Box
                                    component="input" type="range" min={0} max={100} value={opacity}
                                    onChange={(e) => setOpacity(Number(e.target.value))}
                                    aria-label="Heatmap opacity"
                                    sx={{
                                        width: 90, cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none',
                                        background: 'transparent', outline: 'none', m: 0,
                                        '&::-webkit-slider-runnable-track': { height: 3, borderRadius: 99, background: t.track },
                                        '&::-moz-range-track': { height: 3, borderRadius: 99, background: t.track },
                                        '&::-webkit-slider-thumb': {
                                            WebkitAppearance: 'none', marginTop: '-4.5px',
                                            width: 12, height: 12, borderRadius: '50%',
                                            background: CNN_C, border: '2px solid #08131f', cursor: 'pointer',
                                        },
                                        '&::-moz-range-thumb': {
                                            width: 12, height: 12, borderRadius: '50%',
                                            background: CNN_C, border: '2px solid #08131f', cursor: 'pointer',
                                        },
                                    }}
                                />
                                <Typography sx={{ ...MONO, fontSize: 10.5, color: CNN_C, minWidth: 28, textAlign: 'right' }}>
                                    {opacity}%
                                </Typography>
                            </Box>
                        </Box>
                    </Box>

                    {/* right panel */}
                    <Box sx={{
                        width: 352, flex: 'none', p: 3, borderLeft: `1px solid ${t.line}`,
                        background: t.panel, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto',
                    }}>
                        {/* headline metrics */}
                        {isBoth ? (
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, rowGap: 0.4 }}>
                                <Label sx={{ color: t.muted }}>Classical</Label>
                                <Label sx={{ color: t.muted }}>Quantum</Label>
                                <Label sx={{ color: t.muted }}>Verdict</Label>

                                <Typography sx={{ ...MONO, fontSize: 18, color: getColor(cnnView?.result) }}>
                                    {cnnView?.result ?? '—'}
                                </Typography>
                                <Typography sx={{ ...MONO, fontSize: 18, color: getColor(qmlView?.result) }}>
                                    {qmlView?.result ?? '—'}
                                </Typography>
                                <Typography sx={{ ...MONO, fontSize: 18, color: verdictColor }}>
                                    {verdictText}
                                </Typography>
                            </Box>
                        ) : (
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                {[
                                    { k: 'Result', v: activeView.result, c: resultColor },
                                    { k: 'Confidence', v: `${pct(activeView.score).toFixed(2)}%`, c: t.text },
                                ].map(({ k, v, c }) => (
                                    <Box key={k} sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                                        <Label sx={{ color: t.muted }}>{k}</Label>
                                        <Typography sx={{ ...MONO, fontSize: 18, color: c }}>{v}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}


                        <Box sx={{ height: '1px', background: t.line }} />

                        {/* classifications */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Label sx={{ color: t.muted }}>All classifications · {currentView}</Label>

                            </Box>

                            {classes.map(({ label, color, single, cnn: cv, qml: qv }, i) => (
                                <Box key={label} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <Typography sx={{ fontSize: 13, color: t.body }}>{label}</Typography>
                                        <Typography sx={{ ...MONO, fontSize: 12, color: isBoth ? (cv - qv >= 0 ? CNN_C : QML_C) : color }}>
                                            {isBoth
                                                ? `${cv - qv >= 0 ? 'C +' : 'Q +'}${Math.abs(cv - qv).toFixed(1)}`
                                                : `${single.toFixed(2)}%`}
                                        </Typography>
                                    </Box>

                                    {isBoth ? (
                                        [{ tag: 'C', val: cv, c: color, tc: CNN_C }, { tag: 'Q', val: qv, c: QML_C, tc: QML_C }]
                                            .map(({ tag, val, c, tc }) => (
                                                <Box key={tag} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography sx={{ ...MONO, fontSize: 10, color: tc, width: 16 }}>{tag}</Typography>
                                                    <Bar value={val} color={c} track={t.track} delay={i * 120} />
                                                    <Typography sx={{ ...MONO, fontSize: 11, color: tc, width: 44, textAlign: 'right' }}>
                                                        {val.toFixed(2)}
                                                    </Typography>
                                                </Box>
                                            ))
                                    ) : (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Bar value={single} color={color} track={t.track} delay={i * 120} />
                                        </Box>
                                    )}
                                </Box>
                            ))}
                        </Box>

                        <Box sx={{ height: '1px', background: t.line }} />

                        {/* per-view summary */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                            <Label sx={{ color: t.muted }}>{isBoth ? 'Agreement by view' : 'Per-view summary'}</Label>
                            {perView.map((v) => {
                                const verification = verifications?.[v.id];
                                const overridden = verification?.status === 'edited' && verification.clinicianResult;
                                return (
                                    <Box key={v.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                                            <Typography sx={{ ...MONO, fontSize: 13, color: t.dim }}>{v.id}</Typography>
                                            {onVerifyView && (
                                                <Box title={[
                                                    verification?.status === 'confirmed' ? 'Confirmed' : verification?.status === 'edited' ? 'Edited by clinician' : 'Awaiting review',
                                                    verification?.note ? `— "${verification.note}"` : null,
                                                ].filter(Boolean).join(' ')} sx={{
                                                    width: 8, height: 8, borderRadius: '50%',
                                                    background: verification?.status === 'pending' ? STATUS_PENDING : STATUS_DONE,
                                                    boxShadow: `0 0 5px 1px ${(verification?.status === 'pending' ? STATUS_PENDING : STATUS_DONE)}88`,
                                                }} />
                                            )}
                                        </Box>
                                        {isBoth ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>

                                                <Typography sx={{ fontSize: 13, textAlign: 'right' }}>
                                                    <Box component="span" sx={{ color: getColor(v.cnnResult) }}>{v.cnnResult ?? '—'}</Box>
                                                    {!v.agree && (
                                                        <>
                                                            <Box component="span" sx={{ color: t.dim }}> vs </Box>
                                                            <Box component="span" sx={{ color: getColor(v.qmlResult) }}>{v.qmlResult ?? '—'}</Box>
                                                        </>
                                                    )}
                                                </Typography>
                                            </Box>
                                        ) : overridden ? (
                                            <Typography sx={{ fontSize: 13, textAlign: 'right' }}>
                                                <Box component="span" sx={{ color: t.dim, textDecoration: 'line-through' }}>{v.result ?? '—'}</Box>
                                                <Box component="span" sx={{ color: t.dim }}> → </Box>
                                                <Box component="span" sx={{ color: getColor(verification.clinicianResult), fontWeight: 700 }}>{verification.clinicianResult}</Box>
                                            </Typography>
                                        ) : (
                                            <Typography sx={{ fontSize: 13, textAlign: 'right', color: getColor(v.result) }}>
                                                {`${v.result ?? '—'} ${v.score.toFixed(2)}%`}
                                            </Typography>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>

                        {onGenerateExplanation && (
                            <>
                                <Box sx={{ height: '1px', background: t.line }} />

                                {isBoth ? (

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                        <Label sx={{ color: t.muted }}>AI Explanation</Label>
                                        <Typography sx={{ fontSize: 12, color: t.dim, lineHeight: 1.5 }}>
                                            Per-view explanations aren't available in Comparison mode. The full explanation panel covers both models together.
                                        </Typography>
                                        {onOpenFullExplanation && (
                                            <Box onClick={onOpenFullExplanation} sx={{ cursor: 'pointer', display: 'inline-flex', width: 'fit-content' }}>
                                                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: theme.palette.primary.main }}>
                                                    Open AI Explanation →
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>
                                ) : (

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1, minHeight: 0 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Label sx={{ color: t.muted }}>
                                                {summary ? `AI Explanation: ${currentView}` : 'Per View Explanation'}
                                            </Label>
                                            <Box sx={{ display: 'flex', gap: 0.4, p: 0.3, borderRadius: 1.25, background: t.card, border: `1px solid ${t.line}` }}>
                                                {[{ v: 'clinician', l: 'Clinician' }, { v: 'patient', l: 'Patient' }].map(({ v, l }) => {
                                                    const activeAud = audience === v;
                                                    return (
                                                        <Box key={v} onClick={() => setAudience?.(v)} sx={{
                                                            px: 1, py: 0.35, borderRadius: 0.75, cursor: 'pointer',
                                                            background: activeAud ? t.selBg : 'transparent',
                                                            transition: 'background 0.15s ease',
                                                        }}>
                                                            <Typography sx={{ fontSize: 10, fontWeight: 700, color: activeAud ? t.text : t.dim }}>{l}</Typography>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
                                        </Box>

                                        {summary ? (
                                            <Box sx={{
                                                flex: 1, minHeight: 140, p: 1.5, borderRadius: 1,
                                                background: t.card, border: `1px solid ${t.line}`, overflowY: 'auto',
                                            }}>
                                                <Typography sx={{ fontSize: 12.5, color: t.body, lineHeight: 1.65 }}>
                                                    {summary.per_view?.[currentView] ?? summary.explanation}
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Box sx={{
                                                flex: 1, minHeight: 170, p: 2.5, borderRadius: 1, border: `1px dashed ${t.line}`,
                                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                justifyContent: 'center', gap: 1.5, textAlign: 'center',
                                            }}>
                                                <Typography sx={{ fontSize: 12.5, color: t.dim, lineHeight: 1.5, maxWidth: 260 }}>
                                                    Generate an AI explanation covering all four views — you'll be able to switch between them once it's ready.
                                                </Typography>
                                                <Box
                                                    onClick={!LLMloading ? onGenerateExplanation : undefined}
                                                    sx={{
                                                        px: 2, py: 0.9, borderRadius: 1.5, cursor: LLMloading ? 'default' : 'pointer',
                                                        background: t.selLine, opacity: LLMloading ? 0.6 : 1,
                                                        transition: 'opacity 0.15s ease',
                                                    }}
                                                >
                                                    <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>
                                                        {LLMloading ? 'Generating…' : 'Generate AI Explanation'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        )}
                                    </Box>
                                )}
                            </>
                        )}

                        <Label sx={{ mt: 'auto', color: MC, letterSpacing: '0.08em', fontWeight: 700, fontSize: 9.5, whiteSpace: 'nowrap' }}>
                            Research prototype · Not for clinical use
                        </Label>
                    </Box>
                </Box>
            </Box>

            {/* Zoom popup — full view with scroll-to-zoom and drag-to-pan. */}
            <Dialog
                open={!!zoomModel} onClose={() => setZoomModel(null)}
                maxWidth="lg" fullWidth
                PaperProps={{ sx: { background: '#000', border: `1px solid ${t.line}`, borderRadius: 2, overflow: 'hidden' } }}
            >
                <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', overflow: 'hidden' }}>
                    {zoomModel && (
                        <Box
                            ref={zoomStageRef}
                            onMouseDown={handleZoomMouseDown}
                            onMouseMove={handleZoomMouseMove}
                            onMouseUp={stopZoomPan}
                            onMouseLeave={stopZoomPan}
                            sx={{
                                position: 'relative', width: '100%', height: '70vh',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: zoomScale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                            }}
                        >
                            <Box sx={{
                                position: 'relative',
                                transform: `translate(${zoomPan.x}px, ${zoomPan.y}px) scale(${zoomScale})`,
                                transition: isPanning ? 'none' : 'transform 0.08s ease-out',
                                willChange: 'transform',
                            }}>
                                <Box component="img" src={baseSrc(currentView)} alt={`${currentView} mammogram, enlarged`} draggable={false}
                                    sx={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', display: 'block', userSelect: 'none' }} />
                                {heatSrc(zoomModel, currentView) && (
                                    <Box component="img" src={heatSrc(zoomModel, currentView)} alt="" aria-hidden draggable={false}
                                        sx={{
                                            position: 'absolute', inset: 0, width: '100%', height: '100%',
                                            objectFit: 'contain', pointerEvents: 'none',
                                            mixBlendMode: 'multiply', opacity: opacity / 100,
                                        }} />
                                )}
                            </Box>
                        </Box>
                    )}

                    <Box sx={{
                        position: 'absolute', top: 14, left: 14,
                        display: 'flex', alignItems: 'center', gap: 1.25,
                        background: 'rgba(0,0,0,0.6)', borderRadius: 1.5, px: 1.5, py: 0.75,
                        whiteSpace: 'nowrap',
                    }}>
                        <Typography sx={{ ...MONO, fontSize: 12, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>
                            {currentView} · {zoomModel}
                        </Typography>
                        <Box sx={{ width: '1px', height: 14, flexShrink: 0, background: 'rgba(255,255,255,0.2)' }} />
                        <Typography sx={{ ...MONO, fontSize: 10.5, color: t.muted, whiteSpace: 'nowrap' }}>OCCL</Typography>
                        <Box
                            component="input" type="range" min={0} max={100} value={opacity}
                            onChange={(e) => setOpacity(Number(e.target.value))}
                            aria-label="Heatmap opacity"
                            sx={{
                                width: 90, flexShrink: 0, cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none',
                                background: 'transparent', outline: 'none', m: 0,
                                '&::-webkit-slider-runnable-track': { height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.3)' },
                                '&::-moz-range-track': { height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.3)' },
                                '&::-webkit-slider-thumb': {
                                    WebkitAppearance: 'none', marginTop: '-4.5px',
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: CNN_C, border: '2px solid #000', cursor: 'pointer',
                                },
                                '&::-moz-range-thumb': {
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: CNN_C, border: '2px solid #000', cursor: 'pointer',
                                },
                            }}
                        />
                        <Typography sx={{ ...MONO, fontSize: 10.5, color: CNN_C, minWidth: 26, textAlign: 'right', flexShrink: 0 }}>{opacity}%</Typography>
                    </Box>

                    {/* Magnification readout + zoom controls */}
                    <Box sx={{
                        position: 'absolute', bottom: 14, left: 14,
                        display: 'flex', alignItems: 'center', gap: 0.25,
                        background: 'rgba(0,0,0,0.6)', borderRadius: 1.5, px: 0.5, py: 0.5,
                    }}>
                        <Box
                            onClick={() => setZoomScale((s) => clampZoom(s - ZOOM_STEP))}
                            title="Zoom out"
                            sx={{
                                width: 26, height: 26, borderRadius: 1, cursor: zoomScale > ZOOM_MIN ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: zoomScale > ZOOM_MIN ? 1 : 0.35,
                                '&:hover': zoomScale > ZOOM_MIN ? { background: 'rgba(255,255,255,0.12)' } : {},
                            }}
                        >
                            <RemoveIcon sx={{ fontSize: 15, color: 'rgba(255,255,255,0.85)' }} />
                        </Box>
                        <Typography
                            onClick={() => { setZoomScale(1); setZoomPan({ x: 0, y: 0 }); }}
                            title="Reset zoom"
                            sx={{
                                ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.85)',
                                minWidth: 34, textAlign: 'center', cursor: zoomScale !== 1 ? 'pointer' : 'default',
                            }}
                        >
                            {zoomScale.toFixed(1)}×
                        </Typography>
                        <Box
                            onClick={() => setZoomScale((s) => clampZoom(s + ZOOM_STEP))}
                            title="Zoom in"
                            sx={{
                                width: 26, height: 26, borderRadius: 1, cursor: zoomScale < ZOOM_MAX ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: zoomScale < ZOOM_MAX ? 1 : 0.35,
                                '&:hover': zoomScale < ZOOM_MAX ? { background: 'rgba(255,255,255,0.12)' } : {},
                            }}
                        >
                            <AddIcon sx={{ fontSize: 15, color: 'rgba(255,255,255,0.85)' }} />
                        </Box>
                    </Box>

                    <Box
                        onClick={() => setZoomModel(null)}
                        title="Close"
                        sx={{
                            position: 'absolute', top: 14, right: 14,
                            width: 32, height: 32, borderRadius: 1.5, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)',
                            '&:hover': { background: 'rgba(0,0,0,0.8)' },
                        }}
                    >
                        <CloseIcon sx={{ fontSize: 18, color: 'rgba(255,255,255,0.85)' }} />
                    </Box>
                </Box>
            </Dialog>
        </Box>
    );
}