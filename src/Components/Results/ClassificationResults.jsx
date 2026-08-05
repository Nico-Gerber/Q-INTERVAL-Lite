import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Slider, useTheme } from '@mui/material';
import Tooltip from './Tooltip';

const MONO = { fontFamily: 'monospace' };
const VIEWS = ['L-CC', 'L-MLO', 'R-CC', 'R-MLO'];
const MODELS = [
    { id: 'Classical', label: 'Classical AI' },
    { id: 'Quantum', label: 'Quantum AI' },
    { id: 'Both', label: 'Comparison' },
];

const MC = '#ff7a7a', BC = '#f5c451', NC = '#4fd1a1';
const CNN_C = '#5cc8f5', QML_C = '#c07ae0';

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

/**
 * Results screen — fixed-height reader shell.
 *  Classical / Quantum : filmstrip + single image + right breakdown
 *  Comparison ("Both") : filmstrip with agreement flags + paired heatmaps + C/Q bars with delta
 *
 * Pass onModelSelect to render the model tabs inside the top bar
 * (then drop the separate <ModelSelect/> above this component).
 */
export default function ClassificationResults({
    analyisedImage,
    currentModel,
    onModelSelect,
    results,
    height = 820,
}) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [mounted, setMounted] = useState(false);
    const [opacity, setOpacity] = useState(45);
    const [currentView, setCurrentView] = useState('L-CC');

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
        shell: theme.palette.background.paper, panel: theme.palette.background.default,
        card: theme.palette.background.paper, line: theme.palette.divider,
        selLine: '#2f7fb8', selBg: 'rgba(92,200,245,0.10)',
        text: theme.palette.text.primary, body: theme.palette.text.primary,
        muted: theme.palette.text.secondary, dim: theme.palette.text.secondary,
        track: 'rgba(0,0,0,0.08)', footer: theme.palette.text.disabled,
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
    const verdictText = agree ? 'Models agree' : 'Models disagree';

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
                {!title && (
                    <Box sx={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 1 }}>
                        {[currentView, `${currentModel === 'Quantum' ? 'OCCLUSION' : 'GRAD-CAM'} ${opacity}%`].map((txt, i) => (
                            <Typography key={txt} sx={{
                                ...MONO, fontSize: 11, whiteSpace: 'nowrap',
                                color: `rgba(255,255,255,${i ? 0.55 : 0.78})`,
                                background: 'rgba(0,0,0,0.45)', px: 1, py: 0.5, borderRadius: 1,
                            }}>{txt}</Typography>
                        ))}
                    </Box>
                )}
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
                borderRadius: 3.5, overflow: 'hidden',
                background: t.shell, border: `1px solid ${t.line}`,
            }}>
                {/* ── top bar ── */}
                <Box sx={{
                    flex: 'none', minHeight: 58, px: 2.75, py: 1,
                    display: 'flex', alignItems: 'center', gap: 2.75, flexWrap: 'wrap',
                    background: t.panel, borderBottom: `1px solid ${t.line}`,
                }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: t.text, whiteSpace: 'nowrap' }}>
                        Classification Results
                    </Typography>
                    <Label sx={{ color: t.muted, whiteSpace: 'nowrap' }}>
                        {isBoth ? 'Both models' : `${currentModel} model`} · {currentView}
                    </Label>
                    {isBoth && (
                        <Typography sx={{ ...MONO, fontSize: 12, color: verdictColor, whiteSpace: 'nowrap' }}>
                            {verdictText}
                        </Typography>
                    )}

                    {onModelSelect && (
                        <Box sx={{
                            ml: 'auto', flexShrink: 0, display: 'flex', gap: 0.4, p: 0.4,
                            background: t.card, border: `1px solid ${t.line}`, borderRadius: 2.25,
                        }}>
                            {MODELS.map(({ id, label }) => {
                                const sel = currentModel === id;
                                return (
                                    <Box key={id} onClick={() => onModelSelect(id)} sx={{
                                        px: 1.9, py: 0.9, borderRadius: 1.5, cursor: 'pointer',
                                        background: sel ? '#144063' : 'transparent',
                                        transition: 'background 0.15s ease',
                                        '&:hover': { background: sel ? '#144063' : 'rgba(92,200,245,0.08)' },
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

                    {/* filmstrip */}
                    <Box sx={{
                        width: 132, flex: 'none', p: '16px 14px', borderRight: `1px solid ${t.line}`,
                        display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto',
                    }}>
                        <Label sx={{ color: t.muted }}>Views</Label>
                        {perView.map((v) => {
                            const sel = currentView === v.id;
                            return (
                                <Box key={v.id} onClick={() => setCurrentView(v.id)}
                                    sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, cursor: 'pointer' }}>
                                    <Box sx={{
                                        height: 96, borderRadius: 1.75, overflow: 'hidden', background: '#000',
                                        border: `1px solid ${sel ? '#3f8fc4' : t.line}`,
                                        boxShadow: sel ? '0 0 0 3px rgba(92,200,245,0.12)' : 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.15s ease',
                                        '&:hover': { borderColor: '#3f8fc4' },
                                    }}>
                                        <Box component="img" src={baseSrc(v.id)} alt={v.id}
                                            sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography sx={{ ...MONO, fontSize: 11, color: sel ? CNN_C : t.dim }}>
                                            {v.id}
                                        </Typography>
                                        <Typography sx={{
                                            ...MONO, fontSize: 11,
                                            color: isBoth ? (v.agree ? NC : MC) : getColor(v.result),
                                        }}>
                                            {isBoth ? (v.agree ? '=' : '≠') : `${v.score.toFixed(0)}%`}
                                        </Typography>
                                    </Box>
                                </Box>
                            );
                        })}
                        {isBoth && (
                            <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                <Label sx={{ color: NC, fontSize: 10 }}>= agree</Label>
                                <Label sx={{ color: MC, fontSize: 10 }}>≠ disagree</Label>
                            </Box>
                        )}
                    </Box>

                    {/* reader */}
                    <Box sx={{ flex: 1, minWidth: 0, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {isBoth ? (
                            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1.75 }}>
                                <ImagePane
                                    model="Classical" title="Classical · Grad-CAM"
                                    titleColor={CNN_C} borderColor="#24506f"
                                    resultLine={{
                                        text: `${cnnView?.result ?? '—'} ${pct(cnnView?.score).toFixed(2)}%`,
                                        color: getColor(cnnView?.result),
                                    }}
                                />
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

                        {/* opacity slider */}
                        <Box sx={{
                            flex: 'none', display: 'flex', alignItems: 'center', gap: 2,
                            px: 2, py: 1.5, borderRadius: 2.5,
                            background: t.card, border: `1px solid ${t.line}`,
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                                <Label sx={{ color: t.muted, whiteSpace: 'nowrap' }}>
                                    {isBoth
                                        ? 'Overlay opacity · both'
                                        : currentModel === 'Quantum' ? 'Occlusion opacity' : 'Grad-CAM opacity'}
                                </Label>
                                <Tooltip text="Highlights the regions that most influenced the prediction." />
                            </Box>
                            <Slider
                                value={opacity} onChange={(_, v) => setOpacity(v)}
                                min={0} max={100} size="small" aria-label="Heatmap opacity"
                                sx={{ flex: 1, color: CNN_C }}
                            />
                            <Typography sx={{ ...MONO, fontSize: 12, color: CNN_C, minWidth: 38, textAlign: 'right' }}>
                                {opacity}%
                            </Typography>
                        </Box>
                    </Box>

                    {/* right panel */}
                    <Box sx={{
                        width: 352, flex: 'none', p: 2.25, borderLeft: `1px solid ${t.line}`,
                        background: t.panel, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto',
                    }}>
                        {/* headline metrics */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                            {(isBoth
                                ? [
                                    { k: 'Classical', v: cnnView?.result ?? '—', c: getColor(cnnView?.result) },
                                    { k: 'Quantum', v: qmlView?.result ?? '—', c: getColor(qmlView?.result) },
                                ]
                                : [
                                    { k: 'Result', v: activeView.result, c: resultColor },
                                    { k: 'Confidence', v: `${pct(activeView.score).toFixed(2)}%`, c: t.text },
                                ]
                            ).map(({ k, v, c }) => (
                                <Box key={k} sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                                    <Label sx={{ color: t.muted }}>{k}</Label>
                                    <Typography sx={{ ...MONO, fontSize: 18, color: c }}>{v}</Typography>
                                </Box>
                            ))}
                        </Box>

                        <Box sx={{ height: '1px', background: t.line }} />

                        {/* classifications */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Label sx={{ color: t.muted }}>All classifications · {currentView}</Label>
                                {isBoth && <Label sx={{ color: t.muted }}>Δ</Label>}
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
                            {perView.map((v) => (
                                <Box key={v.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                    <Typography sx={{ ...MONO, fontSize: 13, color: t.dim }}>{v.id}</Typography>
                                    <Typography sx={{
                                        fontSize: 13, textAlign: 'right',
                                        color: isBoth ? (v.agree ? NC : MC) : getColor(v.result),
                                    }}>
                                        {isBoth
                                            ? (v.agree ? `${v.cnnResult ?? '—'} · both` : `${v.cnnResult ?? '—'} vs ${v.qmlResult ?? '—'}`)
                                            : `${v.result ?? '—'} ${v.score.toFixed(2)}%`}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        <Label sx={{ mt: 'auto', color: t.footer, letterSpacing: '0.1em' }}>
                            Research prototype · Not for clinical use
                        </Label>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
