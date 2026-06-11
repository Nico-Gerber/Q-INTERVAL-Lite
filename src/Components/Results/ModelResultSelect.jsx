import React from 'react';
import { Box, Container, Typography, Paper, useTheme } from '@mui/material';
import {
    ImageSearch as CNNIcon,
    AutoAwesome as QMLIcon,
    QueryStats as ComparisonIcon
} from '@mui/icons-material';

const MODELS = [
    {
        id: 'Classical',
        title: 'Classical AI',
        color: '#1565C0',
        description: 'Analyze a single mammogram image to detect and classify potential abnormalities including masses, calcifications, and other findings.',
        icon: <CNNIcon sx={{ fontSize: 32 }} />,
    },
    {
        id: 'Quantum',
        title: 'Quantum AI',
        color: '#6A0DAD',
        description: 'Upload sequential mammogram images over time to predict future breast cancer risk using temporal pattern analysis.',
        icon: <QMLIcon sx={{ fontSize: 32 }} />,
    },
    {
        id: 'Both',
        title: 'Comparison',
        color: '#C2185B',
        description: 'Upload sequential mammogram images over time to predict future breast cancer risk using temporal pattern analysis.',
        icon: <ComparisonIcon sx={{ fontSize: 32 }} />,
    },
];

export default function ModelSelect({ selectedModel, onModelSelect }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

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
                                    : `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : theme.palette.divider}`,
                                backgroundColor: isSelected
                                    ? 'rgba(100,181,246,0.2)'
                                    : isDark ? 'rgba(255,255,255,0.05)' : theme.palette.background.paper,
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    border: '2px solid rgba(100,181,246,0.5)',
                                    backgroundColor: 'rgba(100,181,246,0.05)',
                                    transform: 'translateY(-4px)',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                },
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0 }}>
                                <Box sx={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 2,
                                    backgroundColor: isSelected
                                        ? model.color
                                        : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: isSelected ? 'white' : theme.palette.text.secondary,
                                    flexShrink: 0,
                                    transition: 'background-color 0.2s ease',
                                }}>
                                    {model.icon}
                                </Box>
                                <Typography variant="h6" sx={{
                                    color: theme.palette.text.primary,
                                    fontWeight: 700,
                                }}>
                                    {model.title}
                                </Typography>
                            </Box>
                        </Paper>
                    );
                })}
            </Box>
        </Container>
    );
}