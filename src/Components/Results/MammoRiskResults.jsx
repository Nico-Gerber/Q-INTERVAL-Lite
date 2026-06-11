import React, { useEffect, useState } from 'react';
import { Box, Typography, Chip, Container, Button, useTheme } from '@mui/material';
import AnimatedRiskGauge from './AnimatedRiskGauge';

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
    const classification = isMalignant ? 'Malignant'
        : isSingle ? (data?.predicted_cancer_class ?? '—')
        : (data?.final_predicted_class ?? '—');
    const highestDensity = isSingle ? (data?.predicted_density ?? '—')
        : imageResults.length ? imageResults.reduce((best, r) =>
            densityOrder.indexOf(r.predicted_density) > densityOrder.indexOf(best) ? r.predicted_density : best, 'A') : '—';
    const highestBirads = isSingle ? (data?.predicted_birads ?? '—')
        : imageResults.length ? Math.max(...imageResults.map(r => r.predicted_birads)) : '—';
    return {
        isMalignant,
        riskScore: data?.future_risk_score ?? null,
        riskLevel: data?.risk_level ?? 'N/A',
        feedback: data?.feedback ?? '',
        classification, highestDensity, highestBirads,
        numImages: isSingle ? 1 : (data?.number_of_images ?? 1),
    };
}

// ─── shared token hook ───────────────────────────────────────
function useTokens() {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    return {
        isDark, theme,
        // Text
        heading:       theme.palette.text.primary,
        body:          theme.palette.text.primary,
        secondary:     isDark ? 'rgba(255,255,255,0.65)' : theme.palette.text.secondary,
        muted:         isDark ? 'rgba(255,255,255,0.45)' : '#4a6070',
        caption:       isDark ? 'rgba(255,255,255,0.4)'  : '#5a7080',
        footer:        isDark ? 'rgba(255,255,255,0.28)' : '#6a8090',
        // Surfaces
        cardBg:        isDark ? 'rgba(255,255,255,0.03)' : theme.palette.background.paper,
        rowAltBg:      isDark ? 'rgba(255,255,255,0.02)' : 'rgba(8,145,178,0.03)',
        headerBg:      isDark ? 'rgba(255,255,255,0.05)' : 'rgba(8,145,178,0.06)',
        // Borders
        border:        isDark ? 'rgba(255,255,255,0.09)' : 'rgba(8,145,178,0.2)',
        divider:       isDark ? 'rgba(255,255,255,0.07)' : 'rgba(8,145,178,0.15)',
        // Feedback bg
        feedbackBg:    isDark ? 'rgba(255,255,255,0.03)' : 'rgba(8,145,178,0.04)',
    };
}

// ─── MetricCell ──────────────────────────────────────────────
function MetricCell({ label, value, color, last, tokens }) {
    return (
        <Box sx={{
            p: 2.5,
            background: tokens.cardBg,
            borderRight: last ? 'none' : `1px solid ${tokens.border}`,
        }}>
            <Typography sx={{
                fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', fontWeight: 700,
                color: tokens.muted, mb: 1,
            }}>
                {label}
            </Typography>
            <Typography sx={{
                fontFamily: 'monospace', fontSize: 22, fontWeight: 700,
                color: color ?? tokens.body, lineHeight: 1,
            }}>
                {value}
            </Typography>
        </Box>
    );
}

// ─── BothView ────────────────────────────────────────────────
function BothView({ cnnResult, qmlResult, mounted }) {
    const t = useTokens();
    const cnn = extractSummary(cnnResult);
    const qml = extractSummary(qmlResult);

    const rows = [
        { label: 'Highest Severity', cnn: cnn.classification, qml: qml.classification },
        { label: 'Risk level',       cnn: cnn.riskLevel,      qml: qml.riskLevel },
        { label: 'Risk score',       cnn: cnn.riskScore != null ? `${cnn.riskScore}` : '—', qml: qml.riskScore != null ? `${qml.riskScore}` : '—' },
        { label: 'Highest density',  cnn: cnn.highestDensity, qml: qml.highestDensity },
        { label: 'Highest BI-RADS',  cnn: String(cnn.highestBirads), qml: String(qml.highestBirads) },
    ];

    const cellColor = (val, field) => {
        if (field === 'Highest Severity') return val === 'Malignant' ? '#e05252' : '#3fcf8e';
        if (field === 'Risk level') {
            if (val === 'High Risk')    return '#e05252';
            if (val === 'Medium Risk')  return '#d4a017';
            if (val === 'Low Risk')     return '#3fcf8e';
            return t.secondary;
        }
        if (field === 'Risk score') {
            const n = parseFloat(val);
            return isNaN(n) ? t.secondary : getRiskLvlClr(n);
        }
        return t.body;
    };

    const agree = cnn.riskScore != null && qml.riskScore != null
        ? Math.abs(cnn.riskScore - qml.riskScore) <= 10 : null;

    return (
        <Box sx={{ opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(16px)', transition: 'opacity 0.6s ease, transform 0.6s ease', width: '100%' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: t.heading, mb: 0.5 }}>Model Comparison</Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, color: t.muted }}>
                        CNN (RESNET-50) vs QUANTUM (QML) · SIDE BY SIDE
                    </Typography>
                </Box>
                <Chip
                    label={agree === null ? 'Comparison' : agree ? 'Models agree' : 'Models diverge'}
                    size="small"
                    sx={{
                        backgroundColor: agree === null ? t.headerBg : agree ? 'rgba(34,170,100,0.12)' : 'rgba(210,140,0,0.12)',
                        color: agree === null ? t.secondary : agree ? '#3fcf8e' : '#d4a017',
                        border: `1px solid ${agree === null ? t.border : agree ? 'rgba(34,170,100,0.35)' : 'rgba(210,140,0,0.35)'}`,
                        fontWeight: 700, fontSize: 11,
                    }}
                />
            </Box>

            {/* Table */}
            <Box sx={{ border: `1px solid ${t.border}`, borderRadius: 2, overflow: 'hidden', mb: 2.5 }}>
                {/* Column headers */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', borderBottom: `1px solid ${t.border}` }}>
                    {['Metric', 'Classical (CNN)', 'Quantum (QML)'].map((h, i) => (
                        <Box key={h} sx={{ p: '12px 16px', background: t.headerBg, borderRight: i < 2 ? `1px solid ${t.border}` : 'none' }}>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.muted }}>
                                {h}
                            </Typography>
                        </Box>
                    ))}
                </Box>
                {rows.map((row, i) => (
                    <Box key={row.label} sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', borderBottom: i < rows.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                        <Box sx={{ p: '14px 16px', borderRight: `1px solid ${t.border}`, background: t.rowAltBg }}>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: t.caption, letterSpacing: '0.04em' }}>
                                {row.label}
                            </Typography>
                        </Box>
                        {[row.cnn, row.qml].map((val, j) => (
                            <Box key={j} sx={{ p: '14px 16px', borderRight: j === 0 ? `1px solid ${t.border}` : 'none', background: t.cardBg }}>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: cellColor(val, row.label), lineHeight: 1 }}>
                                    {val}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                ))}
            </Box>

            {/* Dual gauges */}
            {(cnn.riskScore != null || qml.riskScore != null) && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                    {[{ label: 'CNN Risk Index', data: cnn }, { label: 'Quantum Risk Index', data: qml }].map(({ label, data: d }) => (
                        <Box key={label} sx={{ border: `1px solid ${t.border}`, borderRadius: 2, p: 3, background: t.cardBg }}>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.muted, mb: 1.5 }}>
                                {label}
                            </Typography>
                            {d.riskScore != null
                                ? <AnimatedRiskGauge targetValue={d.riskScore} color={getRiskColor(d.riskScore)} label={label} isVisible={mounted} duration={1.2} insideText="Risk Index" />
                                : <Typography sx={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: t.secondary }}>N/A</Typography>
                            }
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}

// ─── main export ─────────────────────────────────────────────
export default function MammoRiskResults({ reset, currentModel, results }) {
    const t = useTokens();
    const [mounted, setMounted] = useState(false);
    const [barWidth, setBarWidth] = useState(0);

    const cnnResult = results?.resultFile?.CRcnn;
    const qmlResult = results?.resultFile?.CRqml;
    const data = currentModel === 'Quantum' ? qmlResult : cnnResult;

    const isMalignant = data?.status === 'Malignant detected' || data?.predicted_cancer_class === 'Malignant' || data?.risk_level === 'Not Applicable';
    const riskScore   = data?.future_risk_score ?? null;
    const riskLevel   = data?.risk_level ?? 'N/A';
    const feedback    = data?.feedback ?? '';
    const isSingle    = data?.number_of_images == null;
    const numImages   = isSingle ? 1 : (data?.number_of_images ?? '—');
    const densityOrder = ['A', 'B', 'C', 'D'];
    const imageResults = data?.image_level_results ?? [];

    const classification = isMalignant ? 'Malignant'
        : isSingle ? (data?.predicted_cancer_class ?? 'Benign')
        : (data?.final_predicted_class ?? 'Benign');

    const highestDensity = isSingle ? (data?.predicted_density ?? '—')
        : imageResults.length ? imageResults.reduce((best, r) =>
            densityOrder.indexOf(r.predicted_density) > densityOrder.indexOf(best) ? r.predicted_density : best, 'A') : '—';

    const highestBirads = isSingle ? (data?.predicted_birads ?? '—')
        : imageResults.length ? Math.max(...imageResults.map(r => r.predicted_birads)) : '—';

    const riskColor   = getRiskColor(riskScore);
    const riskLvlColor = getRiskLvlClr(riskScore);

    useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);
    useEffect(() => {
        if (mounted && !isMalignant && riskScore != null) {
            const timer = setTimeout(() => setBarWidth(riskScore), 200);
            return () => clearTimeout(timer);
        }
    }, [mounted, isMalignant, riskScore]);

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

    const metricCells = [
        { label: 'Highest Severity Classification', value: classification,     color: isMalignant ? '#e05252' : '#3fcf8e' },
        { label: 'Risk level',                       value: riskLevel,          color: isMalignant ? t.secondary : riskLvlColor },
        ...(!isMalignant
            ? [
                { label: 'Highest density',  value: highestDensity,        color: t.body },
                { label: 'Highest BI-RADS',  value: String(highestBirads), color: t.body },
              ]
            : [{ label: 'Future risk score', value: '—', color: t.secondary }]
        ),
    ];

    return (
        <Box sx={{ opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(16px)', transition: 'opacity 0.6s ease, transform 0.6s ease', width: '100%' }}>

            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: t.heading, mb: 0.5 }}>Risk Assessment</Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, color: t.muted, mb: 0.25 }}>
                        {numImages} IMAGE{numImages !== 1 ? 'S' : ''} ANALYSED · MAMMO-BENCH MODEL
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.06em', fontWeight: 600, color: t.caption }}>
                        SCORE = 0.6 × CNN + 0.25 × BI-RADS + 0.15 × DENSITY
                    </Typography>
                </Box>
                {isMalignant
                    ? <Chip label="Malignant detected"    size="small" sx={{ backgroundColor: 'rgba(226,75,74,0.12)', color: '#e05252', border: '1px solid rgba(226,75,74,0.35)', fontWeight: 700, fontSize: 11 }} />
                    : <Chip label="No malignancy detected" size="small" sx={{ backgroundColor: 'rgba(34,170,100,0.12)', color: '#3fcf8e', border: '1px solid rgba(34,170,100,0.35)', fontWeight: 700, fontSize: 11 }} />
                }
            </Box>

            {/* Metric cells */}
            <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${metricCells.length}, minmax(0,1fr))`, border: `1px solid ${t.border}`, borderRadius: 2, overflow: 'hidden', mb: 2.5 }}>
                {metricCells.map((item, i) => (
                    <MetricCell key={item.label} label={item.label} value={item.value} color={item.color} last={i === metricCells.length - 1} tokens={t} />
                ))}
            </Box>

            {/* Malignant warning */}
            {isMalignant && (
                <Box sx={{ border: '1px solid rgba(226,75,74,0.3)', borderRadius: 2, backgroundColor: 'rgba(226,75,74,0.07)', p: 2.5, display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 2 }}>
                    <Typography sx={{ fontSize: 18, color: '#e05252', mt: '1px', flexShrink: 0 }}>⚠</Typography>
                    <Typography variant="body2" sx={{ color: t.body, lineHeight: 1.75, fontWeight: 500, fontSize: 14 }}>{feedback}</Typography>
                </Box>
            )}

            {/* Risk gauge + feedback */}
            {!isMalignant && riskScore != null && (
                <>
                    <AnimatedRiskGauge targetValue={riskScore} color={riskColor} label="Composite Risk Index" isVisible={mounted} duration={1.2} insideText="Risk Index" />
                    <Box sx={{ border: `1px solid ${t.border}`, borderRadius: 2, backgroundColor: t.feedbackBg, p: 2.5, mt: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                        <Typography sx={{ fontSize: 18, color: riskLvlColor, mt: '1px', flexShrink: 0 }}>♥</Typography>
                        <Typography variant="body2" sx={{ color: t.body, lineHeight: 1.75, fontWeight: 500, fontSize: 14 }}>{feedback}</Typography>
                    </Box>
                </>
            )}

            <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em', fontWeight: 600, color: t.footer, textTransform: 'uppercase', mt: 3, textAlign: 'center' }}>
                Research prototype · Not for clinical use
            </Typography>

            <Container sx={{ padding: 4, display: 'flex', justifyContent: 'center' }}>
                <Button variant="contained" onClick={() => reset()}>Reset</Button>
            </Container>
        </Box>
    );
}