import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Container, Slider } from '@mui/material';
import Tooltip from '../components/Tooltip';
import ViewSelect from './viewSelector';

function AnimatedBar({ value, color, delay = 0 }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(value), 100 + delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return (
        <Box sx={{ height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', mt: 1 }}>
            <Box sx={{
                width: `${width}%`,
                height: '100%',
                backgroundColor: color,
                borderRadius: 99,
                transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />
        </Box>
    );
}

const MONO = { fontFamily: 'monospace' };

const MetricCell = ({ label, value, color, borderRight = true }) => (
    <Box sx={{
        p: 2,
        background: 'rgba(255,255,255,0.02)',
        borderRight: borderRight ? '1px solid rgba(255,255,255,0.07)' : 'none',
    }}>
        <Typography sx={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', mb: 0.75 }}>
            {label}
        </Typography>
        <Typography sx={{ ...MONO, fontSize: 20, fontWeight: 500, color: color ?? 'white', lineHeight: 1 }}>
            {value}
        </Typography>
    </Box>
);

export default function ClassificationResults({ analyisedImage, reset, currentModel, results }) {
    const [mounted, setMounted] = useState(false);
    const [heatmapOpacity, setHeatmapOpacity] = useState(0);

    const [currentView, setCurrentView] = useState("L-CC")
    const cnnResult = results?.resultFile?.cnn;
    const qmlResult = results?.resultFile?.qml;
    const activeResult = currentModel === 'Quantum' ? qmlResult : cnnResult;
    const activeView = activeResult?.views?.[currentView]
    const aggregated = activeResult?.aggregated
    console.log('gradcam data:', cnnResult?.views?.[currentView]?.gradcam)

    useEffect(() => {
        setMounted(false);
        if (!activeResult) return;
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, [activeResult]);

    if (!activeResult || !activeView) return null;

    const resultColor = activeView?.result === 'Malignant'
        ? '#e05252'
        : activeView?.result === 'Benign'
            ? '#d4a017'
            : '#3fcf8e';

    const verdictColor = qmlResult?.aggregated?.overall_classification === cnnResult?.aggregated?.overall_classification
        ? '#3fcf8e' : '#e05252'
    const verdictText = qmlResult?.aggregated?.overall_classification === cnnResult?.aggregated?.overall_classification
        ? 'Models agree' : 'Models disagree';
    const MalignantColor = '#e05252';
    const BenignColor = '#d4a017';
    const NormalColor = '#3fcf8e';



    const classifications = [
        { label: 'Malignant', value: (activeView?.class_probabilities?.Malignant * 100).toFixed(2), color: MalignantColor },
        { label: 'Benign', value: (activeView?.class_probabilities?.Benign * 100).toFixed(2), color: BenignColor },
        { label: 'Normal', value: (activeView?.class_probabilities?.Normal * 100).toFixed(2), color: NormalColor },
    ]

    const comparisonClassifications = [
        {
            label: 'Malignant',
            cnn: ((cnnResult?.views?.[currentView]?.class_probabilities?.Malignant ?? 0) * 100).toFixed(2),
            qml: ((qmlResult?.views?.[currentView]?.class_probabilities?.Malignant ?? 0) * 100).toFixed(2),
            color: MalignantColor
        },
        {
            label: 'Benign',
            cnn: ((cnnResult?.views?.[currentView]?.class_probabilities?.Benign ?? 0) * 100).toFixed(2),
            qml: ((qmlResult?.views?.[currentView]?.class_probabilities?.Benign ?? 0) * 100).toFixed(2),
            color: BenignColor
        },
        {
            label: 'Normal',
            cnn: ((cnnResult?.views?.[currentView]?.class_probabilities?.Normal ?? 0) * 100).toFixed(2),
            qml: ((qmlResult?.views?.[currentView]?.class_probabilities?.Normal ?? 0) * 100).toFixed(2),
            color: NormalColor
        },
    ]

    const cardBorder = { border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2 };

    return (
        <Box sx={{
            width: '100%',
            maxWidth: 1100,
            mx: 'auto',
            py: 4,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(16px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}>

            {/* ── Header ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                        Classification Results
                    </Typography>
                    <Typography sx={{ ...MONO, fontSize: 11, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.35)' }}>
                        {currentModel.toUpperCase()} MODEL · {currentView}
                    </Typography>
                </Box>
                <Box sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 1,
                    px: 1.5, py: 0.75, borderRadius: 999,
                    border: `1px solid ${resultColor}40`,
                    background: `${resultColor}12`,
                }}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: resultColor }} />
                    <Typography sx={{ ...MONO, fontSize: 11, fontWeight: 500, color: resultColor }}>
                        {activeView?.result}
                    </Typography>
                </Box>
            </Box>


            <Box>
                <ViewSelect selectedView={currentView} onViewSelect={setCurrentView} > </ViewSelect>
            </Box>

            {/* ── Metric cells ── */}
            {currentModel === 'Both' ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', ...cardBorder, overflow: 'hidden', mb: 2 }}>
                    <MetricCell label="Classical result" value={cnnResult?.views?.[currentView]?.result} color={cnnResult?.views?.[currentView]?.result === 'Malignant' ? '#e05252' :
                        cnnResult?.views?.[currentView]?.result === 'Benign' ? '#d4a017' : '#3fcf8e'} />
                    <MetricCell label="Classical conf." value={`${(cnnResult?.views?.[currentView]?.score * 100).toFixed(1)}%`} />
                    <MetricCell label="Quantum result" value={qmlResult?.views?.[currentView]?.result} color={qmlResult?.views?.[currentView]?.result === 'Malignant' ? '#e05252' :
                        qmlResult?.views?.[currentView]?.result === 'Benign' ? '#d4a017' : '#3fcf8e'} />
                    <MetricCell label="Verdict" value={verdictText} color={verdictColor} borderRight={false} />
                </Box>
            ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', ...cardBorder, overflow: 'hidden', mb: 2 }}>
                    <MetricCell label="Result" value={activeView.result} color={resultColor} />
                    <MetricCell label="Confidence" value={`${(activeView.score * 100).toFixed(2)}%`} />
                    <MetricCell label="Model" value={currentModel} borderRight={false} />
                </Box>
            )}

            {/* ── Main content ── */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

                {/* Image panel */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{
                        ...cardBorder,
                        overflow: 'hidden',
                        position: 'relative',
                        background: '#000',
                        minHeight: 360,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Box
                                component="img"
                                src={cnnResult?.views?.[currentView]?.gradcam?.base_image_base64
                                    ? `data:image/png;base64,${cnnResult.views[currentView].gradcam.base_image_base64}`
                                    : analyisedImage}
                                alt="Analysed mammogram"
                                sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                            />
                            {currentModel === 'Classical' && cnnResult?.views?.[currentView].gradcam?.heatmap_base64 && (
                                <Box
                                    component="img"
                                    src={`data:image/png;base64,${cnnResult?.views?.[currentView].gradcam?.heatmap_base64}`}
                                    alt="Grad-CAM heatmap"
                                    sx={{
                                        position: 'absolute', top: 0, left: 0,
                                        width: '100%', height: '100%',
                                        objectFit: 'contain',
                                        opacity: heatmapOpacity / 100,
                                        mixBlendMode: 'multiply',
                                        pointerEvents: 'none',
                                        transition: 'opacity 0.2s ease',
                                    }}
                                />
                            )}
                        </Box>
                        {/* Corner brackets */}
                        {[
                            { top: 10, left: 10, borderTop: `1px solid ${resultColor}60`, borderLeft: `1px solid ${resultColor}60` },
                            { top: 10, right: 10, borderTop: `1px solid ${resultColor}60`, borderRight: `1px solid ${resultColor}60` },
                            { bottom: 10, left: 10, borderBottom: `1px solid ${resultColor}60`, borderLeft: `1px solid ${resultColor}60` },
                            { bottom: 10, right: 10, borderBottom: `1px solid ${resultColor}60`, borderRight: `1px solid ${resultColor}60` },
                        ].map((style, i) => (
                            <Box key={i} sx={{ position: 'absolute', width: 16, height: 16, ...style }} />
                        ))}
                    </Box>

                    {/* Grad-CAM slider */}
                    {currentModel === 'Classical' && cnnResult?.views?.[currentView]?.gradcam?.heatmap_base64 && (
                        <Box sx={{ ...cardBorder, p: 2, background: 'rgba(255,255,255,0.02)' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography sx={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
                                        Grad-CAM opacity
                                    </Typography>
                                    <Tooltip text="Grad-CAM highlights which regions most influenced the model's prediction." />
                                </Box>
                                <Typography sx={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                                    {heatmapOpacity}%
                                </Typography>
                            </Box>
                            <Slider
                                value={heatmapOpacity}
                                onChange={(e, val) => setHeatmapOpacity(val)}
                                min={0} max={100}
                                aria-label="Heatmap opacity"
                            />
                        </Box>
                    )}
                </Box>

                {/* Classifications panel */}
                <Box sx={{
                    ...cardBorder,
                    background: 'rgba(255,255,255,0.02)',
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}>
                    <Box>
                        <Typography sx={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', mb: 2.5 }}>
                            {currentModel === 'Both' ? 'All classifications — both models' : 'All classifications'}
                        </Typography>

                        {/* Both model legend */}
                        {currentModel === 'Both' && (
                            <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
                                {[{ color: '#3fcf8e', label: 'Classical' }, { color: 'rgba(202,77,255,1)', label: 'Quantum' }].map(({ color, label }) => (
                                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
                                        <Typography sx={{ ...MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
                                            {label}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}

                        {currentModel === 'Both'
                            ? comparisonClassifications.map(({ label, cnn, qml, color }, i) => (
                                <Box key={label} sx={{ mb: i < comparisonClassifications.length - 1 ? 3 : 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                                        <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500 }}>{label}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography sx={{ ...MONO, fontSize: 11, color: '#3fcf8e' }}>Classical</Typography>
                                        <Typography sx={{ ...MONO, fontSize: 11, color: '#3fcf8e' }}>{cnn}%</Typography>
                                    </Box>
                                    <AnimatedBar value={cnn} color="#3fcf8e" delay={i * 150} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                                        <Typography sx={{ ...MONO, fontSize: 11, color: 'rgba(202,77,255,1)' }}>Quantum</Typography>
                                        <Typography sx={{ ...MONO, fontSize: 11, color: 'rgba(202,77,255,1)' }}>{qml}%</Typography>
                                    </Box>
                                    <AnimatedBar value={qml} color="rgba(202,77,255,1)" delay={i * 150 + 75} />
                                </Box>
                            ))
                            : classifications.map(({ label, value, color }, i) => (
                                <Box key={label} sx={{ mb: i < classifications.length - 1 ? 3 : 0 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                                            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500 }}>{label}</Typography>
                                        </Box>
                                        <Typography sx={{ ...MONO, fontSize: 12, color, fontWeight: 500 }}>{value}%</Typography>
                                    </Box>
                                    <AnimatedBar value={value} color={color} delay={i * 150} />
                                </Box>
                            ))
                        }
                    </Box>

                    <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <Typography sx={{ ...MONO, fontSize: 10, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>
                            Research prototype · Not for clinical use
                        </Typography>
                    </Box>
                </Box>
            </Box>

            <Container sx={{ padding: 4, display: 'flex', justifyContent: 'center' }}>
                <Button variant="contained" onClick={() => reset()}>Reset</Button>
            </Container>

        </Box>
    );
}