import React, { useEffect, useState } from 'react';
import { Box, Typography, Chip, Container, Button } from '@mui/material';
import AnimatedRiskGauge from './animatedRiskGauge';

// ─── helpers ────────────────────────────────────────────────
const getRiskColor = s => s >= 67 ? 'rgba(178,34,34,1)' : s >= 34 ? 'rgba(210,140,0,1)' : 'rgba(34,170,100,1)';
const getRiskLvlClr = s => s >= 67 ? '#e05252' : s >= 34 ? '#d4a017' : '#3fcf8e';

function extractSummary(data) {
    const isMalignant =
        data?.status === 'Malignant detected' ||
        data?.predicted_cancer_class === 'Malignant' ||
        data?.risk_level === 'Not Applicable';

    const isSingle = data?.number_of_images == null;
    const imageResults = data?.image_level_results ?? [];
    const densityOrder = ['A', 'B', 'C', 'D'];

    const classification = isMalignant
        ? 'Malignant'
        : isSingle
            ? (data?.predicted_cancer_class ?? '—')
            : (data?.final_predicted_class ?? '—');

    const highestDensity = isSingle
        ? (data?.predicted_density ?? '—')
        : imageResults.length
            ? imageResults.reduce((best, r) =>
                densityOrder.indexOf(r.predicted_density) > densityOrder.indexOf(best)
                    ? r.predicted_density : best, 'A')
            : '—';

    const highestBirads = isSingle
        ? (data?.predicted_birads ?? '—')
        : imageResults.length
            ? Math.max(...imageResults.map(r => r.predicted_birads))
            : '—';

    return {
        isMalignant,
        riskScore: data?.future_risk_score ?? null,
        riskLevel: data?.risk_level ?? 'N/A',
        feedback: data?.feedback ?? '',
        classification,
        highestDensity,
        highestBirads,
        numImages: isSingle ? 1 : (data?.number_of_images ?? 1),
    };
}

// ─── comparison view ────────────────────────────────────────
function BothView({ cnnResult, qmlResult, mounted }) {
    const cnn = extractSummary(cnnResult);
    const qml = extractSummary(qmlResult);

    const rows = [
        { label: 'Classification', cnn: cnn.classification, qml: qml.classification },
        { label: 'Risk level', cnn: cnn.riskLevel, qml: qml.riskLevel },
        { label: 'Risk score', cnn: cnn.riskScore != null ? `${cnn.riskScore}` : '—', qml: qml.riskScore != null ? `${qml.riskScore}` : '—' },
        { label: 'Highest density', cnn: cnn.highestDensity, qml: qml.highestDensity },
        { label: 'Highest BI-RADS', cnn: String(cnn.highestBirads), qml: String(qml.highestBirads) },
    ];

    const cellColor = (val, field) => {
        if (field === 'Classification') {
            return val === 'Malignant' ? '#e05252' : '#3fcf8e';
        }
        if (field === 'Risk level') {
            if (val === 'High Risk') return '#e05252';
            if (val === 'Medium Risk') return '#d4a017';
            if (val === 'Low Risk') return '#3fcf8e';
            return 'rgba(255,255,255,0.3)';
        }
        if (field === 'Risk score') {
            const n = parseFloat(val);
            if (isNaN(n)) return 'rgba(255,255,255,0.3)';
            return getRiskLvlClr(n);
        }
        return 'rgba(255,255,255,0.85)';
    };

    const agree = cnn.riskScore != null && qml.riskScore != null
        ? Math.abs(cnn.riskScore - qml.riskScore) <= 10
        : null;

    return (
        <Box sx={{ opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(16px)', transition: 'opacity 0.6s ease, transform 0.6s ease', width: '100%' }}>

            {/* header */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                        Model Comparison
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.35)' }}>
                        CNN (RESNET-50) vs QUANTUM (QML) · SIDE BY SIDE
                    </Typography>
                </Box>
                <Chip
                    label={agree === null ? 'Comparison' : agree ? 'Models agree' : 'Models diverge'}
                    size="small"
                    sx={{
                        backgroundColor: agree === null ? 'rgba(255,255,255,0.06)' : agree ? 'rgba(34,170,100,0.12)' : 'rgba(210,140,0,0.12)',
                        color: agree === null ? 'rgba(255,255,255,0.4)' : agree ? '#3fcf8e' : '#d4a017',
                        border: `1px solid ${agree === null ? 'rgba(255,255,255,0.12)' : agree ? 'rgba(34,170,100,0.3)' : 'rgba(210,140,0,0.3)'}`,
                        fontWeight: 500, fontSize: 11,
                    }}
                />
            </Box>

            {/* comparison table */}
            <Box sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden', mb: 2 }}>

                {/* column headers */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['Metric', 'CNN', 'Quantum'].map((h, i) => (
                        <Box key={h} sx={{ p: '10px 16px', background: 'rgba(255,255,255,0.04)', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
                                {h}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                {rows.map((row, i) => (
                    <Box key={row.label} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <Box sx={{ p: '12px 16px', borderRight: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.01)' }}>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                                {row.label}
                            </Typography>
                        </Box>
                        {[{ val: row.cnn }, { val: row.qml }].map((cell, j) => (
                            <Box key={j} sx={{ p: '12px 16px', borderRight: j === 0 ? '1px solid rgba(255,255,255,0.07)' : 'none', background: 'rgba(255,255,255,0.02)' }}>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 500, color: cellColor(cell.val, row.label), lineHeight: 1 }}>
                                    {cell.val}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                ))}
            </Box>

            {/* dual gauges */}
            {(cnn.riskScore != null || qml.riskScore != null) && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                    {[{ label: 'CNN risk index', data: cnn }, { label: 'Quantum risk index', data: qml }].map(({ label, data: d }) => (
                        <Box key={label} sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, p: 2, background: 'rgba(255,255,255,0.02)' }}>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', mb: 1 }}>
                                {label}
                            </Typography>
                            {d.riskScore != null ? (
                                <AnimatedRiskGauge
                                    targetValue={d.riskScore}
                                    color={getRiskColor(d.riskScore)}
                                    label={label}
                                    isVisible={mounted}
                                    duration={1.2}
                                    insideText="Risk"
                                />
                            ) : (
                                <Typography sx={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.3)', mt: 1 }}>
                                    Not applicable
                                </Typography>
                            )}
                        </Box>
                    ))}
                </Box>
            )}

            {/* feedback rows */}
            {[{ label: 'CNN', d: cnn }, { label: 'Quantum', d: qml }].map(({ label, d }) => (
                <Box key={label} sx={{ border: `1px solid ${d.isMalignant ? 'rgba(226,75,74,0.25)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 2, backgroundColor: d.isMalignant ? 'rgba(226,75,74,0.07)' : 'rgba(255,255,255,0.02)', p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 1.5 }}>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', mt: '2px', flexShrink: 0, minWidth: 60 }}>
                        {label}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                        {d.feedback || '—'}
                    </Typography>
                </Box>
            ))}

            <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', mt: 2.5, textAlign: 'center' }}>
                Research prototype · Not for clinical use
            </Typography>
        </Box>
    );
}

// ─── main component ─────────────────────────────────────────
export default function MammoRiskResults({ results, reset, currentModel }) {
    const [mounted, setMounted] = useState(false);
    const [barWidth, setBarWidth] = useState(0);

    const cnnResult = results?.resultFile?.cnn;
    const qmlResult = results?.resultFile?.qml;

    const data = currentModel === 'Quantum' ? qmlResult : cnnResult;

    const isMalignant =
        data?.status === 'Malignant detected' ||
        data?.predicted_cancer_class === 'Malignant' ||
        data?.risk_level === 'Not Applicable';

    const riskScore = data?.future_risk_score ?? null;
    const riskLevel = data?.risk_level ?? 'N/A';
    const feedback = data?.feedback ?? '';
    const isSingle = data?.number_of_images == null;
    const numImages = isSingle ? 1 : (data?.number_of_images ?? '—');

    const densityOrder = ['A', 'B', 'C', 'D'];
    const imageResults = data?.image_level_results ?? [];

    const classification = isMalignant
        ? 'Malignant'
        : isSingle
            ? (data?.predicted_cancer_class ?? 'Benign')
            : (data?.final_predicted_class ?? 'Benign');

    const highestDensity = isSingle
        ? (data?.predicted_density ?? '—')
        : imageResults.length
            ? imageResults.reduce((best, r) =>
                densityOrder.indexOf(r.predicted_density) > densityOrder.indexOf(best)
                    ? r.predicted_density : best, 'A')
            : '—';

    const highestBirads = isSingle
        ? (data?.predicted_birads ?? '—')
        : imageResults.length
            ? Math.max(...imageResults.map(r => r.predicted_birads))
            : '—';

    const riskColor = getRiskColor(riskScore);
    const riskLvlColor = getRiskLvlClr(riskScore);

    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (mounted && !isMalignant && riskScore != null) {
            const t = setTimeout(() => setBarWidth(riskScore), 200);
            return () => clearTimeout(t);
        }
    }, [mounted, isMalignant, riskScore]);

    // ── Both mode ──
    if (currentModel === 'Both') {
        return (
            <Box sx={{ opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(16px)', transition: 'opacity 0.6s ease, transform 0.6s ease', width: '100%' }}>
                <BothView cnnResult={cnnResult} qmlResult={qmlResult} mounted={mounted} />
                <Container sx={{ padding: 4, display: 'flex', justifyContent: 'center' }}>
                    <Button variant="contained" onClick={() => reset()}>Reset</Button>
                </Container>
            </Box>
        );
    }

    // ── Single model mode (CNN or Quantum) ──
    const metricCells = [
        { label: 'Classification', value: classification, color: isMalignant ? '#e05252' : '#3fcf8e' },
        { label: 'Risk level', value: riskLevel, color: isMalignant ? 'rgba(255,255,255,0.35)' : riskLvlColor },
        ...(!isMalignant
            ? [
                { label: 'Highest density', value: highestDensity, color: 'white' },
                { label: 'Highest BI-RADS', value: String(highestBirads), color: 'white' },
            ]
            : [
                { label: 'Future risk score', value: '—', color: 'rgba(255,255,255,0.3)' },
            ]
        ),
    ];

    return (
        <Box sx={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(16px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
            width: '100%',
        }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                        Risk Assessment
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.35)' }}>
                        {numImages} IMAGE{numImages !== 1 ? 'S' : ''} ANALYSED · MAMMO-BENCH MODEL
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.2)', mt: 0.5 }}>
                        SCORE = 0.6 × CNN + 0.25 × BI-RADS + 0.15 × DENSITY
                    </Typography>
                </Box>
                {isMalignant ? (
                    <Chip label="Malignant detected" size="small" sx={{ backgroundColor: 'rgba(226,75,74,0.12)', color: '#e05252', border: '1px solid rgba(226,75,74,0.3)', fontWeight: 500, fontSize: 11 }} />
                ) : (
                    <Chip label="No malignancy detected" size="small" sx={{ backgroundColor: 'rgba(34,170,100,0.12)', color: '#3fcf8e', border: '1px solid rgba(34,170,100,0.3)', fontWeight: 500, fontSize: 11 }} />
                )}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${metricCells.length}, minmax(0,1fr))`, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden', mb: 2 }}>
                {metricCells.map((item, i) => (
                    <Box key={item.label} sx={{ p: 2, background: 'rgba(255,255,255,0.02)', borderRight: i < metricCells.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', mb: 0.75 }}>
                            {item.label}
                        </Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 500, color: item.color, lineHeight: 1 }}>
                            {item.value}
                        </Typography>
                    </Box>
                ))}
            </Box>

            {isMalignant && (
                <Box sx={{ border: '1px solid rgba(226,75,74,0.25)', borderRadius: 2, backgroundColor: 'rgba(226,75,74,0.07)', p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Typography sx={{ fontSize: 16, color: '#e05252', mt: '1px', flexShrink: 0 }}>⚠</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>{feedback}</Typography>
                </Box>
            )}

            {!isMalignant && riskScore != null && (
                <>
                    <AnimatedRiskGauge
                        targetValue={riskScore}
                        color={riskColor}
                        label="Composite Risk Index"
                        isVisible={mounted}
                        duration={1.2}
                        insideText="Risk Index"
                    />
                    <Box sx={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.02)', p: 2, mt: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                        <Typography sx={{ fontSize: 16, color: riskLvlColor, mt: '1px', flexShrink: 0 }}>♥</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>{feedback}</Typography>
                    </Box>
                </>
            )}

            <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', mt: 2.5, textAlign: 'center' }}>
                Research prototype · Not for clinical use
            </Typography>

            <Container sx={{ padding: 4, display: 'flex', justifyContent: 'center' }}>
                <Button variant="contained" onClick={() => reset()}>Reset</Button>
            </Container>
        </Box>
    );
}