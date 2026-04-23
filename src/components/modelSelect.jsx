import React, { useState } from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';
import {
    ImageSearch as ClassificationIcon,
    TrendingUp as RiskIcon,
} from '@mui/icons-material';

const MODELS = [
    {
        id: 'classical',
        title: 'Classical AI',
        description: 'Analyze a single mammogram image to detect and classify potential abnormalities including masses, calcifications, and other findings.',
        icon: <ClassificationIcon sx={{ fontSize: 32 }} />,

    },
    {
        id: 'quantum',
        title: 'Quantum AI',
        description: 'Upload sequential mammogram images over time to predict future breast cancer risk using temporal pattern analysis.',
        icon: <RiskIcon sx={{ fontSize: 32 }} />,

    },
    {
        id: 'both',
        title: 'Comparison',
        description: 'Upload sequential mammogram images over time to predict future breast cancer risk using temporal pattern analysis.',
        icon: <RiskIcon sx={{ fontSize: 32 }} />,

    },
];

export default function ModelSelect({ selectedModel, onModelSelect }) {
    return (
        <Container maxWidth="md">
            <Box sx={{
                paddingTop: '20px',
                display: 'flex',
                justifyContent: 'space-between',



            }}>
                {MODELS.map((model) => {
                    const isSelected = selectedModel === model.id;
                    return (
                        <Paper
                            key={model.id}
                            onClick={() => onModelSelect(model.id)}
                            elevation={isSelected ? 4 : 1}
                            sx={{

                                width: 270,
                                p: 2,
                                cursor: 'pointer',
                                borderRadius: 2,
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
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0 }}>
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
                                    {model.icon}
                                </Box>
                                <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>
                                    {model.title}
                                </Typography>
                            </Box>





                        </Paper>
                    );
                })}
            </Box>
        </Container >
    );
}