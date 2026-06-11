import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Container, useTheme } from '@mui/material';
import { animate } from 'framer-motion';

import AnimatedRiskGauge from './AnimatedRiskGauge';
import RiskChart from './RiskChart';
import ExamTimeline from './Timeline';
import ExamContribution from './ContributionPanel';
import ComparisonRiskChart from './ComparisonRiskChart';

function findThresholdCrossing(data, threshold) {
    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1]; const curr = data[i];
        if (prev.risk < threshold && curr.risk >= threshold) {
            const fraction = (threshold - prev.risk) / (curr.risk - prev.risk);
            return parseFloat(prev.year) + fraction * (parseFloat(curr.year) - parseFloat(prev.year));
        }
    }
    return null;
}

const getRiskColor = (score) =>
    score >= 66 ? 'rgba(178,34,34,1)' : score >= 33 ? 'rgba(210,140,0,1)' : 'rgba(34,170,100,1)';

function horizonsFromYearly(yearly) {
    if (!yearly) return [];
    return Object.entries(yearly).map(([key, val]) => ({ year: key.replace('_year', ''), risk: val }));
}

function buildExamHistory(uploadedFiles, imageResults) {
    if (!uploadedFiles || uploadedFiles.length === 0) return [];
    const sorted = [...uploadedFiles].sort((a, b) => new Date(a.scanDate) - new Date(b.scanDate));
    const lastIdx = sorted.length - 1;
    return sorted.map((f, i) => {
        const apiResult = imageResults?.find(r => r.filename === f.file.name);
        const contribution = apiResult?.image_contribution_percent ?? null;
        return {
            year: new Date(f.scanDate).getFullYear(),
            scanDate: f.scanDate,
            filename: f.file.name,
            weight: contribution !== null ? contribution / 100 : 1 / sorted.length,
            isCurrent: i === lastIdx,
            label: i === lastIdx ? 'current' : contribution > 30 ? 'prior · key' : 'prior',
        };
    });
}

function useTokens() {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    return {
        isDark, theme,
        heading:    theme.palette.text.primary,
        body:       theme.palette.text.primary,
        secondary:  isDark ? 'rgba(255,255,255,0.65)' : theme.palette.text.secondary,
        muted:      isDark ? 'rgba(255,255,255,0.45)' : '#4a6070',
        caption:    isDark ? 'rgba(255,255,255,0.35)' : '#5a7080',
        cardBg:     isDark ? 'rgba(255,255,255,0.03)' : theme.palette.background.paper,
        border:     isDark ? 'rgba(255,255,255,0.09)' : 'rgba(8,145,178,0.2)',
    };
}

export default function FutureRiskResults({ analyisedImage, reset, currentModel, results, uploadedFiles }) {
    const t = useTokens();
    const [mounted, setMounted] = useState(false);
    const [animatedDiff, setAnimatedDiff] = useState(0);
    const ELEVATED_THRESHOLD = 6;

    const qmlData   = results?.resultFile?.qml;
    const cnnData   = results?.resultFile?.cnn;
    const qmlSource = qmlData?.patient_summary ?? qmlData;
    const cnnSource = cnnData?.patient_summary ?? cnnData;

    const qmlYearly  = qmlSource?.final_patient_yearly_future_risk ?? qmlSource?.yearly_future_risk;
    const cnnYearly  = cnnSource?.final_patient_yearly_future_risk ?? cnnSource?.yearly_future_risk;
    const qmlRisk5y  = qmlSource?.final_patient_5_year_risk_score ?? qmlSource?.final_5_year_risk_score ?? qmlSource?.["5_year_risk_score"] ?? 0;
    const cnnRisk5y  = cnnSource?.final_patient_5_year_risk_score ?? cnnSource?.final_5_year_risk_score ?? cnnSource?.["5_year_risk_score"] ?? 0;

    const imageResults = currentModel === 'Classical' ? (cnnData?.image_level_results ?? []) : (qmlData?.image_level_results ?? []);
    const activeRisk   = currentModel === 'Classical' ? cnnRisk5y : qmlRisk5y;
    const activeYearly = currentModel === 'Classical' ? cnnYearly : qmlYearly;
    const activeHorizons = horizonsFromYearly(activeYearly);
    const qmlHorizons    = horizonsFromYearly(qmlYearly);
    const cnnHorizons    = horizonsFromYearly(cnnYearly);
    const examHistory    = buildExamHistory(uploadedFiles, imageResults);

    const riskDiff = Math.abs(cnnRisk5y - qmlRisk5y);
    let verdictText, verdictColor;
    if      (riskDiff < 2) { verdictText = 'Models agree';           verdictColor = t.isDark ? 'rgba(34,252,27,0.9)' : 'rgba(22,163,74,1)'; }
    else if (riskDiff < 5) { verdictText = 'Models partially agree'; verdictColor = t.isDark ? 'rgba(229,255,0,0.9)' : 'rgba(202,138,4,1)'; }
    else                   { verdictText = 'Models disagree';        verdictColor = 'rgba(220,38,38,1)'; }

    const qmlCrossYears = findThresholdCrossing(qmlHorizons, ELEVATED_THRESHOLD);
    const cnnCrossYears = findThresholdCrossing(cnnHorizons, ELEVATED_THRESHOLD);

    useEffect(() => { setMounted(false); const id = setTimeout(() => setMounted(true), 50); return () => clearTimeout(id); }, [currentModel]);
    useEffect(() => {
        if (!mounted) { setAnimatedDiff(0); return; }
        const ctrl = animate(0, riskDiff, { duration: 1.2, ease: 'easeOut', onUpdate: (v) => setAnimatedDiff(v) });
        return ctrl.stop;
    }, [mounted, riskDiff]);

    if (!qmlData) {
        return (
            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <Typography sx={{ color: t.caption, fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>No results available.</Typography>
            </Box>
        );
    }

    const cardSx = { borderRadius: 3, border: `1px solid ${t.border}`, background: t.cardBg };
    const riskColor = getRiskColor(activeRisk);

    // ── Both Models ──────────────────────────────────────────
    if (currentModel === 'Both') {
        return (
            <Box sx={{ opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(16px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 0 }}>

                    <Box sx={{ ...cardSx, p: 3.5, mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                        <AnimatedRiskGauge targetValue={cnnRisk5y} color={getRiskColor(cnnRisk5y)} label='Classical Model' isVisible={mounted} duration={1.2} insideText='5-year risk' showPercenage={true} />
                    </Box>

                    {/* Verdict */}
                    <Box sx={{ ...cardSx, p: 3.5, mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: t.muted }}>
                            Verdict
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                            <Typography sx={{ fontSize: 14, color: t.muted, fontWeight: 600 }}>Δ</Typography>
                            <Typography sx={{ fontSize: 88, fontWeight: 700, lineHeight: 1, color: verdictColor, fontVariantNumeric: 'tabular-nums' }}>
                                {animatedDiff.toFixed(1)}
                            </Typography>
                            <Typography sx={{ fontSize: 32, color: t.muted, fontWeight: 600 }}>%</Typography>
                        </Box>
                        <Typography sx={{ fontSize: 17, fontWeight: 700, color: verdictColor, textAlign: 'center' }}>
                            {verdictText}
                        </Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 500, color: t.caption, textAlign: 'center', maxWidth: 200, lineHeight: 1.5 }}>
                            absolute difference between models at 5 years
                        </Typography>
                    </Box>

                    <Box sx={{ ...cardSx, p: 3.5, mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                        <AnimatedRiskGauge targetValue={qmlRisk5y} color={getRiskColor(qmlRisk5y)} label='Quantum Model' isVisible={mounted} duration={1.2} insideText='5-year risk' showPercenage={true} />
                    </Box>
                </Box>

                {qmlHorizons.length > 0 && cnnHorizons.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                        <ComparisonRiskChart classicalData={cnnHorizons} quantumData={qmlHorizons} threshold={ELEVATED_THRESHOLD} classicalCrossYears={cnnCrossYears?.toFixed(1) ?? 'N/A'} quantumCrossYears={qmlCrossYears?.toFixed(1) ?? 'N/A'} />
                    </Box>
                )}
                <Container sx={{ padding: 4, display: 'flex', justifyContent: 'center' }}>
                    <Button variant="contained" onClick={() => reset()}>Reset</Button>
                </Container>
            </Box>
        );
    }

    // ── Single model ─────────────────────────────────────────
    return (
        <Box sx={{ opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(16px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2, mb: 0 }}>
                <Box sx={{ ...cardSx, p: 3.5, mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AnimatedRiskGauge targetValue={activeRisk} color={riskColor} label='5-Year Cumulative Risk' isVisible={mounted} duration={1.2} insideText='over the next 5 years' showPercenage={true} />
                </Box>
                <Box sx={{ ...cardSx, p: 3.5, mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                    {activeHorizons.length > 0
                        ? <RiskChart data={activeHorizons} color={riskColor} label="Risk Over Time" threshold={ELEVATED_THRESHOLD} />
                        : <Typography sx={{ color: t.caption, fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>No horizon data available</Typography>
                    }
                </Box>
            </Box>

            {examHistory.length > 0 && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3, mt: 4 }}>
                    <ExamTimeline exams={examHistory} />
                    <ExamContribution exams={examHistory} />
                </Box>
            )}

            <Container sx={{ padding: 4, display: 'flex', justifyContent: 'center' }}>
                <Button variant="contained" onClick={() => reset()}>Reset</Button>
            </Container>
        </Box>
    );
}