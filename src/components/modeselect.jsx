import React, { useCallback, useState } from 'react';
import { Box, Container, Typography, Paper, Alert } from '@mui/material';
import {
    ImageSearch as ClassificationIcon,
    TrendingUp as RiskIcon,
} from '@mui/icons-material';

import { Button } from '@mui/material';

const MODES = [
    {
        id: 'classification',
        title: 'Classification Analysis',
        description: 'Analyze a single mammogram image to detect and classify potential abnormalities including masses, calcifications, and other findings.',
        icon: <ClassificationIcon sx={{ fontSize: 32 }} />,
        features: [
            'Single image analysis',
            'Three-way classification',
            'Lesion detection & localization',
            'Confidence scoring',
        ],
    },
    {
        id: 'future-risk',
        title: 'Future Risk Prediction',
        description: 'Upload sequential mammogram images over time to predict future breast cancer risk using temporal pattern analysis.',
        icon: <RiskIcon sx={{ fontSize: 32 }} />,
        features: [
            'Multi-image temporal analysis',
            '5-year risk prediction',
            'Density change tracking',
            'Trend visualization',
        ],
    },
];

export default function ModeSelect({ selectedMode, onModeSelect, setActiveStep }) {

    const [status, setStatus] = useState(false);

    return (

        <Container maxWidth="lg">
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 3,
                padding: 5,
            }}>
                {MODES.map((mode) => {
                    const isSelected = selectedMode === mode.id;
                    return (
                        <Paper
                            key={mode.id}
                            onClick={() => { onModeSelect(mode.id); setStatus(false); }}
                            elevation={isSelected ? 4 : 1}
                            sx={{

                                p: 3,
                                cursor: 'pointer',
                                minHeight: 430,
                                borderRadius: 3,
                                border: isSelected
                                    ? '2px solid #64B5F6'
                                    : '2px solid rgba(255,255,255,0.1)',
                                backgroundColor: isSelected
                                    ? 'rgba(100,181,246,0.2)'
                                    : 'rgba(255,255,255,0.05)',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    border: '2px solid rgba(100,181,246,0.5)',
                                    backgroundColor: 'rgba(100,181,246,0.05)',
                                    transform: 'translateY(-4px)',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                },
                            }}
                        >
                            {/* Icon + Title */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 2,
                                    backgroundColor: isSelected ? '#64B5F6' : 'rgba(255,255,255,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    flexShrink: 0,
                                }}>
                                    {mode.icon}
                                </Box>
                                <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>
                                    {mode.title}
                                </Typography>
                            </Box>

                            {/* Description */}
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 2, textAlign: 'left', fontSize: 20 }}>
                                {mode.description}
                            </Typography>

                            {/* Features */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, alignItems: 'flex-start', }}>
                                {mode.features.map((feature) => (
                                    <Box key={feature} sx={{ display: 'flex', alignItems: 'center', gap: 1, }}>
                                        <Box sx={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: '50%',
                                            backgroundColor: isSelected ? '#64B5F6' : 'rgba(255,255,255,0.4)',
                                            flexShrink: 0,
                                        }} />
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 20 }}>
                                            {feature}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>

                            {/* Selected indicator */}
                            {isSelected && (
                                <Box sx={{
                                    mt: 2,
                                    pt: 2,
                                    borderTop: '1px solid rgba(100,181,246,0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                }}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#64B5F6' }} />
                                    <Typography variant="caption" sx={{ color: '#64B5F6', fontWeight: 600 }}>
                                        Selected
                                    </Typography>
                                </Box>
                            )}
                        </Paper>
                    );
                })}
            </Box>

            {status && (
                <Alert severity="warning" sx={{ mt: 0 }}>
                    Please select an analysis mode
                </Alert>
            )}
            <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                <Button disabled></Button>

                {selectedMode ? (<Button variant="contained" onClick={() => setActiveStep(prev => prev + 1)}>Next</Button>) : (<Button variant="contained" onClick={() => setStatus(true)} sx={{ opacity: 0.3 }} >Next</Button>)}
            </Container>





        </Container >
    );
}