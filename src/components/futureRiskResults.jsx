import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Container, Slider } from '@mui/material';
import { CircularProgressbar, buildStyles, CircularProgressbarWithChildren } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

import AnimatedRiskGauge from './animatedRiskGauge';

import RiskChart from './riskChart';


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

export default function FutureRiskResults({ analyisedImage, reset, currentModel, results }) {
    const [mounted, setMounted] = useState(false);

    const cnnHorizons = [
        { year: '1 year', risk: 1.8 },
        { year: '2 year', risk: 4.1 },
        { year: '3 year', risk: 7.2 },
        { year: '4 year', risk: 10.8 },
        { year: '5 year', risk: 14.2 },
    ];

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
                    <Box sx={{
                        borderRadius: 3,
                        border: '1px solid rgba(255,255,255,0.07)',
                        background: 'rgba(255,255,255,0.02)',
                        p: 3.5,
                        width: '100%',
                        height: 200,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                    }}>
                        <Typography variant="h6" sx={{ color: 'white' }}>
                            Comparison view
                        </Typography>
                    </Box>
                </Box>
            ) : (
                <Box sx={{
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'none' : 'translateY(16px)',
                    transition: 'opacity 0.6s ease, transform 0.6s ease',
                }}>

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2, mb: 3 }}>
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
                                data={cnnHorizons}
                                color="rgba(178, 34, 34, 1)"
                                label="Risk Over Time"
                                threshold={6}
                            />
                        </Box>
                    </Box>
                </Box>
            )}
        </>
    );
}
