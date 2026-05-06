import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Container, Slider } from '@mui/material';
import { CircularProgressbar, buildStyles, CircularProgressbarWithChildren } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

import AnimatedRiskGauge from './animatedRiskGauge';

import RiskChart from './riskChart';

import { animate } from 'framer-motion';

import ExamTimeline from './timeLine';

import ExamContribution from './ContributionPanel';

import ComparisonRiskChart from './comparisonRiskChart';

function AnimatedBar({ value, color, delay = 0 }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(value), 100 + delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return (
        <Box sx={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', mt: 1 }}>
            <Box sx={{
                width: `${width}%`,
                height: '100%',
                backgroundColor: color,
                borderRadius: 99,
                transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: color !== 'rgba(255,255,255,0.25)' ? `0 0 12px ${color}88` : 'none',
            }} />
        </Box>
    );
}


function findThresholdCrossing(data, threshold) {

    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];


        if (prev.risk < threshold && curr.risk >= threshold) {

            const fraction = (threshold - prev.risk) / (curr.risk - prev.risk);


            const prevYear = parseFloat(prev.year);
            const currYear = parseFloat(curr.year);


            return prevYear + fraction * (currYear - prevYear);
        }
    }
    return null;
}



export default function FutureRiskResults({ analyisedImage, reset, currentModel, results }) {
    const [mounted, setMounted] = useState(false);
    const [animatedDiff, setAnimatedDiff] = useState(0);


    const classicalRisk = 14.2;

    const quantumRisk = 10.2;

    const ELEVATED_THRESHOLD = 6;




    const riskDiff = classicalRisk - quantumRisk;

    let verdictText;
    let verdictColor;

    if (riskDiff < 2) {
        verdictText = 'Models agree';
        verdictColor = 'rgba(34, 252, 27, 0.9)';
    } else if (riskDiff < 5) {
        verdictText = 'Models partially agree';
        verdictColor = 'rgba(229, 255, 0, 0.9)';
    } else {
        verdictText = 'Models disagree';
        verdictColor = 'rgba(255, 77, 77, 0.9)';
    }

    const cnnHorizons = [
        { year: '1 year', risk: 1.8 },
        { year: '2 year', risk: 4.1 },
        { year: '3 year', risk: 7.2 },
        { year: '4 year', risk: 10.8 },
        { year: '5 year', risk: 14.2 },
    ];

    const qmlHorizons = [
        { year: '1 year', risk: 0.3 },
        { year: '2 year', risk: 1.6 },
        { year: '3 year', risk: 4.7 },
        { year: '4 year', risk: 8.4 },
        { year: '5 year', risk: 10.2 },
    ];



    const examHistory = [
        { year: 2019, weight: 0.03, isCurrent: false, label: 'prior' },
        { year: 2021, weight: 0.07, isCurrent: false, label: 'prior' },
        { year: 2023, weight: 0.62, isCurrent: false, label: 'prior · key' },
        { year: 2025, weight: 0.28, isCurrent: true, label: 'current' },
    ];

    const classicalCrossYears = findThresholdCrossing(cnnHorizons, ELEVATED_THRESHOLD);
    const quantumCrossYears = findThresholdCrossing(qmlHorizons, ELEVATED_THRESHOLD);

    useEffect(() => {
        if (!mounted) {
            setAnimatedDiff(0);
            return;
        }
        const ctrl = animate(0, riskDiff, {
            duration: 1.2,
            ease: 'easeOut',
            onUpdate: (v) => setAnimatedDiff(v),
        });
        return ctrl.stop;
    }, [mounted, riskDiff]);


    useEffect(() => {
        setMounted(false);
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, [currentModel]);

    return (
        <>
            {currentModel === 'Both' ? (

                <Box sx={{
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'none' : 'translateY(16px)',
                    transition: 'opacity 0.6s ease, transform 0.6s ease',
                }}>

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 0 }}>
                        <Box sx={{
                            borderRadius: 3,
                            border: '1px solid rgba(255,255,255,0.07)',
                            background: 'rgba(255,255,255,0.02)',
                            p: 3.5,
                            mt: 4,
                            display: 'flex',
                            width: '100%',

                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>



                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>

                                <AnimatedRiskGauge
                                    targetValue={classicalRisk}
                                    color='rgba(178, 34, 34, 1)'
                                    label='Classical Model'
                                    isVisible={mounted}
                                    duration={1.2}
                                    insideText='5-year risk'
                                />
                            </Box>
                        </Box>

                        <Box sx={{
                            borderRadius: 3,
                            border: '1px solid rgba(255,255,255,0.07)',
                            background: 'rgba(255,255,255,0.02)',
                            p: 3.5,
                            mt: 4,
                            display: 'flex',
                            width: '100%',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 2.5,
                        }}>
                            {/* Small label */}
                            <Typography sx={{
                                color: 'rgba(255,255,255,0.5)',
                                fontSize: 11,
                                letterSpacing: '0.18em',
                                textTransform: 'uppercase',
                                fontWeight: 500,
                            }}>
                                Verdict
                            </Typography>


                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                <Typography sx={{
                                    fontSize: 14,
                                    color: 'rgba(255,255,255,0.4)',
                                    fontWeight: 400,
                                }}>
                                    Δ
                                </Typography>
                                <Typography sx={{
                                    fontSize: 96,
                                    fontWeight: 500,
                                    lineHeight: 1,
                                    color: verdictColor,
                                    fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {animatedDiff.toFixed(1)}
                                </Typography>
                                <Typography sx={{
                                    fontSize: 36,
                                    color: 'rgba(255,255,255,0.4)',
                                    fontWeight: 400,
                                }}>
                                    %
                                </Typography>
                            </Box>

                            {/* Verdict label as subtitle */}
                            <Typography sx={{
                                fontSize: 18,
                                fontWeight: 500,
                                color: verdictColor,
                                textAlign: 'center',
                            }}>
                                {verdictText}
                            </Typography>

                            {/* Small explanation */}
                            <Typography sx={{
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.4)',
                                textAlign: 'center',
                                maxWidth: 200,
                                lineHeight: 1.5,
                            }}>
                                absolute difference between models at 5 years
                            </Typography>
                        </Box>

                        <Box sx={{
                            borderRadius: 3,
                            border: '1px solid rgba(255,255,255,0.07)',
                            background: 'rgba(255,255,255,0.02)',
                            p: 3.5,
                            mt: 4,
                            display: 'flex',
                            width: '100%',

                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>

                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>

                                <AnimatedRiskGauge
                                    targetValue={quantumRisk}
                                    color='rgba(178, 34, 34, 1)'
                                    label='Quantum Model'
                                    isVisible={mounted}
                                    duration={1.2}
                                    insideText='5-year risk'
                                />
                            </Box>

                        </Box>

                    </Box>

                    <Box sx={{ mt: 2 }}>

                        <ComparisonRiskChart
                            classicalData={cnnHorizons}
                            quantumData={qmlHorizons}
                            threshold={6}
                            classicalCrossYears={(classicalCrossYears).toFixed(1)}
                            quantumCrossYears={(quantumCrossYears).toFixed(1)}
                        />

                    </Box>

                </Box>
            ) : (
                <Box sx={{
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'none' : 'translateY(16px)',
                    transition: 'opacity 0.6s ease, transform 0.6s ease',
                }}>

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2, mb: 0 }}>
                        <Box sx={{
                            borderRadius: 3,
                            border: '1px solid rgba(255,255,255,0.07)',
                            background: 'rgba(255,255,255,0.02)',
                            p: 3.5,
                            mt: 4,
                            display: 'flex',
                            width: '100%',

                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <Box>

                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>


                                    <AnimatedRiskGauge
                                        targetValue={14.2}
                                        color='rgba(178, 34, 34, 1)'
                                        label='5-Year Cumulative Risk'
                                        isVisible={mounted}
                                        duration={1.2}
                                        insideText='over the next 5 years'
                                    />


                                </Box>

                            </Box>

                        </Box>
                        <Box sx={{
                            borderRadius: 3,
                            border: '1px solid rgba(255,255,255,0.07)',
                            background: 'rgba(255,255,255,0.02)',
                            p: 3.5,
                            mt: 4,
                            display: 'flex',
                            width: '100%',

                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>



                            <RiskChart
                                data={currentModel === 'Classical' ? cnnHorizons : qmlHorizons}
                                color="rgba(178, 34, 34, 1)"
                                label="Risk Over Time"
                                threshold={6}

                            />


                        </Box>
                    </Box>


                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3, mt: 4 }}>


                        <ExamTimeline exams={examHistory} />


                        <ExamContribution exams={examHistory} />



                    </Box>



                </Box>
            )}
        </>
    );
}
