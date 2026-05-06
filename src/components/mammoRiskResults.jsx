import React, { useEffect, useState } from 'react';
import { Box, Typography, Chip, Container, Button } from '@mui/material';
import AnimatedRiskGauge from './animatedRiskGauge';

export default function MammoRiskResults({ results, reset }) {
    const [mounted, setMounted] = useState(false);
    const [barWidth, setBarWidth] = useState(0);

    const data = results?.resultFile;
    const isMalignant =
        data?.status === 'Malignant detected' ||
        data?.predicted_cancer_class === 'Malignant' ||
        data?.risk_level === 'Not Applicable';

    const riskScore = data?.future_risk_score ?? null;
    const riskLevel = data?.risk_level ?? 'N/A';
    const feedback = data?.feedback ?? '';


    const isSingle = data?.number_of_images == null;
    const numImages = isSingle ? 1 : (data?.number_of_images ?? '—');

    const classification = isMalignant
        ? 'Malignant'
        : isSingle
            ? (data?.predicted_cancer_class ?? 'Benign')
            : (data?.final_predicted_class ?? 'Benign');


    const densityOrder = ['A', 'B', 'C', 'D'];
    const imageResults = data?.image_level_results ?? [];

    const highestDensity = isSingle
        ? (data?.predicted_density ?? '—')
        : imageResults.length
            ? imageResults.reduce((best, r) => {
                return densityOrder.indexOf(r.predicted_density) > densityOrder.indexOf(best)
                    ? r.predicted_density
                    : best;
            }, 'A')
            : '—';

    const highestBirads = isSingle
        ? (data?.predicted_birads ?? '—')
        : imageResults.length
            ? Math.max(...imageResults.map(r => r.predicted_birads))
            : '—';

    const riskColor = riskScore >= 67
        ? 'rgba(178,34,34,1)'
        : riskScore >= 34
            ? 'rgba(210,140,0,1)'
            : 'rgba(34,170,100,1)';

    const riskLevelColor = riskScore >= 67
        ? '#e05252'
        : riskScore >= 34
            ? '#d4a017'
            : '#3fcf8e';

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

    const metricCells = [
        { label: 'Classification', value: classification, color: isMalignant ? '#e05252' : '#3fcf8e' },
        { label: 'Risk level', value: riskLevel, color: isMalignant ? 'rgba(255,255,255,0.35)' : riskLevelColor },
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


            <Box sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
                mb: 2.5,
            }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                        Risk Assessment
                    </Typography>
                    <Typography sx={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        letterSpacing: '0.06em',
                        color: 'rgba(255,255,255,0.35)',
                    }}>
                        {numImages} IMAGE{numImages !== 1 ? 'S' : ''} ANALYSED · MAMMO-BENCH MODEL
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.2)', mt: 0.5 }}>
                        SCORE = 0.6 × CNN + 0.25 × BI-RADS + 0.15 × DENSITY
                    </Typography>
                </Box>

                {isMalignant ? (
                    <Chip
                        label="Malignant detected"
                        size="small"
                        sx={{
                            backgroundColor: 'rgba(226,75,74,0.12)',
                            color: '#e05252',
                            border: '1px solid rgba(226,75,74,0.3)',
                            fontWeight: 500,
                            fontSize: 11,
                        }}
                    />
                ) : (
                    <Chip
                        label="No malignancy detected"
                        size="small"
                        sx={{
                            backgroundColor: 'rgba(34,170,100,0.12)',
                            color: '#3fcf8e',
                            border: '1px solid rgba(34,170,100,0.3)',
                            fontWeight: 500,
                            fontSize: 11,
                        }}
                    />
                )}
            </Box>


            <Box sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${metricCells.length}, minmax(0,1fr))`,
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 2,
                overflow: 'hidden',
                mb: 2,
            }}>
                {metricCells.map((item, i) => (
                    <Box key={item.label} sx={{
                        p: 2,
                        background: 'rgba(255,255,255,0.02)',
                        borderRight: i < metricCells.length - 1
                            ? '1px solid rgba(255,255,255,0.07)'
                            : 'none',
                    }}>
                        <Typography sx={{
                            fontFamily: 'monospace',
                            fontSize: 10,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.35)',
                            mb: 0.75,
                        }}>
                            {item.label}
                        </Typography>
                        <Typography sx={{
                            fontFamily: 'monospace',
                            fontSize: 20,
                            fontWeight: 500,
                            color: item.color,
                            lineHeight: 1,
                        }}>
                            {item.value}
                        </Typography>
                    </Box>
                ))}
            </Box>


            {isMalignant && (
                <Box sx={{
                    border: '1px solid rgba(226,75,74,0.25)',
                    borderRadius: 2,
                    backgroundColor: 'rgba(226,75,74,0.07)',
                    p: 2,
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-start',
                }}>
                    <Typography sx={{ fontSize: 16, color: '#e05252', mt: '1px', flexShrink: 0 }}>⚠</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                        {feedback}
                    </Typography>
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


                    <Box sx={{
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 2,
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        p: 2,
                        mt: 2,
                        display: 'flex',
                        gap: 1.5,
                        alignItems: 'flex-start',
                    }}>
                        <Typography sx={{ fontSize: 16, color: riskLevelColor, mt: '1px', flexShrink: 0 }}>♥</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                            {feedback}
                        </Typography>
                    </Box>
                </>
            )}


            <Typography sx={{
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.18)',
                textTransform: 'uppercase',
                mt: 2.5,
                textAlign: 'center',
            }}>
                Research prototype · Not for clinical use
            </Typography>

            <Container sx={{ padding: 4, display: 'flex', justifyContent: 'center' }}>
                <Button variant="contained" onClick={() => reset()}>Reset</Button>
            </Container>

        </Box>
    );
}
