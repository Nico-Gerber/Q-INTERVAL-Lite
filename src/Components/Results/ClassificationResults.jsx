import React, { useEffect, useState } from 'react';
import { Box, Typography, Slider, Paper, useTheme } from '@mui/material';
import Tooltip from './Tooltip';


function AnimatedBar({ value, color, delay = 0, trackColor }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(value), 100 + delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return (
        <Box sx={{ height: 3, backgroundColor: trackColor, borderRadius: 99, overflow: 'hidden', flex: 1 }}>
            <Box sx={{
                width: `${width}%`, height: '100%',
                backgroundColor: color, borderRadius: 99,
                transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />
        </Box>
    );
}

const MONO = { fontFamily: 'monospace' };
const VIEWS = ['L-CC', 'L-MLO', 'R-CC', 'R-MLO'];

export default function ClassificationResults({ analyisedImage, reset, currentModel, results }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [mounted, setMounted] = useState(false);
    const [heatmapOpacity, setHeatmapOpacity] = useState(0);
    const [currentView, setCurrentView] = useState('L-CC');

    const cnnResult = results?.resultFile?.cnn;
    const qmlResult = results?.resultFile?.qml;
    const activeResult = currentModel === 'Quantum' ? qmlResult : cnnResult;
    const activeView = activeResult?.views?.[currentView];

    /* ── Tokens ── */
    const border = isDark ? 'rgba(255,255,255,0.07)' : theme.palette.divider;
    const cardBg = isDark ? 'rgba(255,255,255,0.02)' : theme.palette.background.paper;
    const muted = isDark ? 'rgba(255,255,255,0.35)' : theme.palette.text.disabled;
    const body = isDark ? 'rgba(255,255,255,0.7)' : theme.palette.text.primary;
    const trackColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    const footerC = isDark ? 'rgba(255,255,255,0.18)' : theme.palette.text.disabled;
    const legendC = isDark ? 'rgba(255,255,255,0.35)' : theme.palette.text.secondary;
    const valColor = isDark ? 'white' : theme.palette.text.primary;
    const opacityC = isDark ? 'rgba(255,255,255,0.35)' : theme.palette.text.secondary;

    useEffect(() => {
        setMounted(false);
        if (!activeResult) return;
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, [activeResult]);

    if (!activeResult || !activeView) return null;

    const getColor = (r) => r === 'Malignant' ? '#e05252' : r === 'Benign' ? '#d4a017' : '#3fcf8e';
    const resultColor = getColor(activeView?.result);

    const verdictMatch = qmlResult?.views?.[currentView]?.result === cnnResult?.views?.[currentView]?.result;
    const verdictColor = verdictMatch ? '#3fcf8e' : '#e05252';
    const verdictText = verdictMatch ? 'Models agree' : 'Models disagree';

    const MC = '#e05252', BC = '#d4a017', NC = '#3fcf8e';

    const classifications = [
        { label: 'Malignant', value: (activeView?.class_probabilities?.Malignant * 100).toFixed(2), color: MC },
        { label: 'Benign', value: (activeView?.class_probabilities?.Benign * 100).toFixed(2), color: BC },
        { label: 'Normal', value: (activeView?.class_probabilities?.Normal * 100).toFixed(2), color: NC },
    ];

    const compClassifications = [
        {
            label: 'Malignant',
            cnn: ((cnnResult?.views?.[currentView]?.class_probabilities?.Malignant ?? 0) * 100).toFixed(2),
            qml: ((qmlResult?.views?.[currentView]?.class_probabilities?.Malignant ?? 0) * 100).toFixed(2),
            color: MC,
        },
        {
            label: 'Benign',
            cnn: ((cnnResult?.views?.[currentView]?.class_probabilities?.Benign ?? 0) * 100).toFixed(2),
            qml: ((qmlResult?.views?.[currentView]?.class_probabilities?.Benign ?? 0) * 100).toFixed(2),
            color: BC,
        },
        {
            label: 'Normal',
            cnn: ((cnnResult?.views?.[currentView]?.class_probabilities?.Normal ?? 0) * 100).toFixed(2),
            qml: ((qmlResult?.views?.[currentView]?.class_probabilities?.Normal ?? 0) * 100).toFixed(2),
            color: NC,
        },
    ];


    return (
        <Box sx={{
            width: '100%',
            maxWidth: 960,
            mx: 'auto',
            py: 3,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(12px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}>
            <Paper elevation={0} sx={{
                border: `1px solid ${border}`,
                borderRadius: 3,
                background: cardBg,
                p: { xs: 2, md: 3 },
                overflow: 'hidden',
            }}>

                {/* ── Top bar: title + badge left, view tabs right ── */}
                <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    mb: 2, flexWrap: 'wrap', gap: 1,
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
                            Classification Results
                        </Typography>
                        {/* Result badge */}
                        <Box sx={{
                            display: 'inline-flex', alignItems: 'center', gap: 0.6,
                            px: 1.25, py: 0.3, borderRadius: 999,
                            border: `1px solid ${resultColor}40`, background: `${resultColor}12`,
                        }}>
                            <Box sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: resultColor }} />
                            <Typography sx={{ ...MONO, fontSize: 10, fontWeight: 600, color: resultColor }}>
                                {activeView?.result}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Inline view tabs */}
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {VIEWS.map(v => {
                            const sel = currentView === v;
                            return (
                                <Box key={v} onClick={() => setCurrentView(v)} sx={{
                                    px: 1.5, py: 0.5, borderRadius: 1.5, cursor: 'pointer',
                                    border: sel ? '1.5px solid #64B5F6' : `1.5px solid ${border}`,
                                    background: sel ? 'rgba(100,181,246,0.15)' : 'transparent',
                                    transition: 'all 0.15s ease',
                                    '&:hover': { borderColor: 'rgba(100,181,246,0.4)', background: 'rgba(100,181,246,0.05)' },
                                }}>
                                    <Typography sx={{
                                        ...MONO, fontSize: 11, fontWeight: 700, lineHeight: 1,
                                        color: sel ? '#64B5F6' : (isDark ? 'rgba(255,255,255,0.45)' : theme.palette.text.secondary),
                                    }}>
                                        {v}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>

                {/* ── Main grid: image left | data right ── */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>

                    {/* ── LEFT — mammogram + slider ── */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{
                            border: `1px solid ${border}`, borderRadius: 2,
                            overflow: 'hidden', position: 'relative', background: '#000',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Box sx={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Box
                                    component="img"
                                    src={cnnResult?.views?.[currentView]?.gradcam?.base_image_base64
                                        ? `data:image/png;base64,${cnnResult.views[currentView].gradcam.base_image_base64}`
                                        : analyisedImage}
                                    alt="Analysed mammogram"
                                    sx={{ width: '100%', height: 'auto', maxHeight: 380, objectFit: 'contain', display: 'block' }}
                                />
                                <Box
                                    component="img"
                                    src={`data:image/png;base64,${activeResult?.views?.[currentView]?.gradcam?.heatmap_base64}`}
                                    alt="Heatmap overlay"
                                    sx={{
                                        position: 'absolute', inset: 0,
                                        width: '100%', height: '100%', objectFit: 'contain',
                                        opacity: heatmapOpacity / 100,
                                        mixBlendMode: 'multiply', pointerEvents: 'none',
                                        transition: 'opacity 0.2s ease',
                                    }}
                                />
                            </Box>

                            {/* Corner brackets */}
                            {[
                                { top: 8, left: 8, borderTop: `1px solid ${resultColor}50`, borderLeft: `1px solid ${resultColor}50` },
                                { top: 8, right: 8, borderTop: `1px solid ${resultColor}50`, borderRight: `1px solid ${resultColor}50` },
                                { bottom: 8, left: 8, borderBottom: `1px solid ${resultColor}50`, borderLeft: `1px solid ${resultColor}50` },
                                { bottom: 8, right: 8, borderBottom: `1px solid ${resultColor}50`, borderRight: `1px solid ${resultColor}50` },
                            ].map((s, i) => (
                                <Box key={i} sx={{ position: 'absolute', width: 14, height: 14, ...s }} />
                            ))}
                        </Box>

                        {/* Grad-CAM slider — single row */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                                <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: opacityC, whiteSpace: 'nowrap' }}>
                                    {currentModel === 'Classical' ? 'Grad-CAM Opacity' : 'Occlusion Sensitivity Opacity'}
                                </Typography>
                                <Tooltip text="Highlights regions that most influenced the prediction." />
                            </Box>
                            <Slider
                                value={heatmapOpacity}
                                onChange={(_, val) => setHeatmapOpacity(val)}
                                min={0} max={100} size="small"
                                sx={{ flex: 1 }}
                                aria-label="Heatmap opacity"
                            />
                            <Typography sx={{ ...MONO, fontSize: 10, color: opacityC, minWidth: 28, textAlign: 'right' }}>
                                {heatmapOpacity}%
                            </Typography>
                        </Box>
                    </Box>

                    {/* ── RIGHT — result summary + classifications ── */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

                        {/* Metrics row */}
                        {currentModel === 'Both' ? (
                            <Box sx={{ display: 'flex', gap: 3, mb: 2.5, flexWrap: 'wrap' }}>
                                <Box>
                                    <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, mb: 0.5 }}>
                                        Classical Result
                                    </Typography>
                                    <Typography sx={{ ...MONO, fontSize: 16, fontWeight: 600, color: getColor(cnnResult?.views?.[currentView]?.result) }}>
                                        {cnnResult?.views?.[currentView]?.result}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, mb: 0.5 }}>
                                        Quantum Result
                                    </Typography>
                                    <Typography sx={{ ...MONO, fontSize: 16, fontWeight: 600, color: getColor(qmlResult?.views?.[currentView]?.result) }}>
                                        {qmlResult?.views?.[currentView]?.result}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, mb: 0.5 }}>
                                        Verdict
                                    </Typography>
                                    <Typography sx={{ ...MONO, fontSize: 16, fontWeight: 600, color: verdictColor }}>
                                        {verdictText}
                                    </Typography>
                                </Box>
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', gap: 3, mb: 2.5, flexWrap: 'wrap' }}>
                                <Box>
                                    <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, mb: 0.5 }}>
                                        Result
                                    </Typography>
                                    <Typography sx={{ ...MONO, fontSize: 16, fontWeight: 600, color: resultColor }}>
                                        {activeView.result}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, mb: 0.5 }}>
                                        Confidence
                                    </Typography>
                                    <Typography sx={{ ...MONO, fontSize: 16, fontWeight: 600, color: valColor }}>
                                        {(activeView.score * 100).toFixed(2)}%
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, mb: 0.5 }}>
                                        Model
                                    </Typography>
                                    <Typography sx={{ ...MONO, fontSize: 16, fontWeight: 600, color: valColor }}>
                                        {currentModel}
                                    </Typography>
                                </Box>
                            </Box>
                        )}

                        {/* Divider */}
                        <Box sx={{ height: '1px', background: border, mb: 2 }} />

                        {/* Classification bars */}
                        <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, mb: 1.5 }}>
                            {currentModel === 'Both' ? 'All Classifications — Both Models' : 'All Classifications'}
                        </Typography>

                        {currentModel === 'Both' && (
                            <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                                {[{ c: '#3fcf8e', l: 'Classical' }, { c: 'rgba(202,77,255,1)', l: 'Quantum' }].map(({ c, l }) => (
                                    <Box key={l} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c }} />
                                        <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: legendC }}>{l}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}

                        {currentModel === 'Both'
                            ? compClassifications.map(({ label, cnn, qml, color }, i) => (
                                <Box key={label} sx={{ mb: i < compClassifications.length - 1 ? 2 : 0 }}>
                                    <Typography sx={{ color: body, fontSize: 13, fontWeight: 500, mb: 0.5 }}>{label}</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography sx={{ ...MONO, fontSize: 10, color: '#3fcf8e', minWidth: 52 }}>Classical</Typography>
                                        <AnimatedBar value={cnn} color="#3fcf8e" delay={i * 150} trackColor={trackColor} />
                                        <Typography sx={{ ...MONO, fontSize: 10, color: '#3fcf8e', minWidth: 40, textAlign: 'right' }}>{cnn}%</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                        <Typography sx={{ ...MONO, fontSize: 10, color: 'rgba(202,77,255,1)', minWidth: 52 }}>Quantum</Typography>
                                        <AnimatedBar value={qml} color="rgba(202,77,255,1)" delay={i * 150 + 75} trackColor={trackColor} />
                                        <Typography sx={{ ...MONO, fontSize: 10, color: 'rgba(202,77,255,1)', minWidth: 40, textAlign: 'right' }}>{qml}%</Typography>
                                    </Box>
                                </Box>
                            ))
                            : classifications.map(({ label, value, color }, i) => (
                                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: i < classifications.length - 1 ? 1.5 : 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 75 }}>
                                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                                        <Typography sx={{ color: body, fontSize: 13, fontWeight: 500 }}>{label}</Typography>
                                    </Box>
                                    <AnimatedBar value={value} color={color} delay={i * 150} trackColor={trackColor} />
                                    <Typography sx={{ ...MONO, fontSize: 11, color, fontWeight: 500, minWidth: 48, textAlign: 'right' }}>{value}%</Typography>
                                </Box>
                            ))
                        }
                    </Box>
                </Box>

                {/* Footer */}
                <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${border}`, textAlign: 'right' }}>
                    <Typography sx={{ ...MONO, fontSize: 9, letterSpacing: '0.06em', color: footerC, textTransform: 'uppercase' }}>
                        Research prototype · Not for clinical use
                    </Typography>
                </Box>
            </Paper>
        </Box>
    );
}
