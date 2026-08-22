import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Slider, useTheme } from '@mui/material';

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
        shell: '#0D1B2E', panel: '#112038', card: '#162840',
        line: 'rgba(34,211,238,0.18)',
        selLine: '#22D3EE', selBg: 'rgba(34,211,238,0.12)',
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
                        {[currentView, `${currentModel === 'Quantum' ? 'OCCLUSION' : 'GRAD-CAM'} ${opacity}%`].map((txt, i) => (
                            <Typography key={txt} sx={{
                                ...MONO, fontSize: 11, whiteSpace: 'nowrap',
                                color: `rgba(255,255,255,${i ? 0.65 : 0.88})`,
                                background: 'rgba(0,0,0,0.55)', px: 1, py: 0.5, borderRadius: 1,
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
                                    model="Classical" title="Classical · Grad-CAM"
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
                            {perView.map((v) => (
                                <Box key={v.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                    <Typography sx={{ ...MONO, fontSize: 13, color: t.dim }}>{v.id}</Typography>
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
                                    ) : (
                                        <Typography sx={{ fontSize: 13, textAlign: 'right', color: getColor(v.result) }}>
                                            {`${v.result ?? '—'} ${v.score.toFixed(2)}%`}
                                        </Typography>
                                    )}
                                </Box>
                            ))}
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
        </Box>
    );
}