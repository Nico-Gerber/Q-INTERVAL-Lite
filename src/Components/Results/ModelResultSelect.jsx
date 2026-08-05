import React from 'react';
import { Box, Typography, Paper, useTheme } from '@mui/material';
import {
    ImageSearch as CNNIcon,
    AutoAwesome as QMLIcon,
    QueryStats as ComparisonIcon
} from '@mui/icons-material';

const MODELS = [
    { id: 'Classical', title: 'Classical AI', icon: <CNNIcon sx={{ fontSize: 24 }} /> },
    { id: 'Quantum', title: 'Quantum AI', icon: <QMLIcon sx={{ fontSize: 24 }} /> },
    { id: 'Both', title: 'Comparison', icon: <ComparisonIcon sx={{ fontSize: 24 }} /> },
];

export default function ModelSelect({ selectedModel, onModelSelect }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, pt: 2, pb: 1 }}>
            {MODELS.map((model) => {
                const isSelected = selectedModel === model.id;
                return (
                    <Paper
                        key={model.id}
                        onClick={() => onModelSelect(model.id)}
                        elevation={isSelected ? 3 : 0}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            px: 2.5,
                            py: 1.25,
                            cursor: 'pointer',
                            borderRadius: 2,
                            border: isSelected
                                ? '1.5px solid #64B5F6'
                                : `1.5px solid ${isDark ? 'rgba(255,255,255,0.08)' : theme.palette.divider}`,
                            backgroundColor: isSelected
                                ? 'rgba(100,181,246,0.15)'
                                : isDark ? 'rgba(255,255,255,0.03)' : theme.palette.background.paper,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                border: '1.5px solid rgba(100,181,246,0.4)',
                                backgroundColor: 'rgba(100,181,246,0.05)',
                            },
                        }}
                    >
                        <Box sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 1.5,
                            backgroundColor: isSelected
                                ? 'rgba(100,181,246,0.2)'
                                : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isSelected ? '#64B5F6' : theme.palette.text.secondary,
                            flexShrink: 0,
                            transition: 'all 0.2s ease',
                        }}>
                            {model.icon}
                        </Box>
                        <Typography sx={{
                            color: isSelected ? theme.palette.text.primary : theme.palette.text.secondary,
                            fontWeight: 600,
                            fontSize: 14,
                        }}>
                            {model.title}
                        </Typography>
                    </Paper>
                );
            })}
        </Box>
    );
}
