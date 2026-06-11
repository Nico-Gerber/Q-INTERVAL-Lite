import React from 'react';
import { Box, Container, Typography, Paper, useTheme } from '@mui/material';

const VIEWS = [
    { id: 'L-CC' },
    { id: 'L-MLO' },
    { id: 'R-CC' },
    { id: 'R-MLO' },
];

const MONO = { fontFamily: 'monospace' };

export default function ViewSelect({ selectedView, onViewSelect }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Container maxWidth="md">
            <Box sx={{
                paddingTop: '20px',
                display: 'flex',
                justifyContent: 'space-between',
            }}>
                {VIEWS.map((view) => {
                    const isSelected = selectedView === view.id;
                    return (
                        <Paper
                            key={view.id}
                            onClick={() => onViewSelect(view.id)}
                            elevation={isSelected ? 4 : 1}
                            sx={{
                                mb: 2,
                                width: 100,
                                p: 0,
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
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 20, mb: 0, justifyContent: 'center' }}>
                                <Typography variant="h6" sx={{
                                    ...MONO,
                                    color: isSelected
                                        ? '#64B5F6'
                                        : theme.palette.text.primary,
                                    fontWeight: 700,
                                }}>
                                    {view.id}
                                </Typography>
                            </Box>
                        </Paper>
                    );
                })}
            </Box>
        </Container>
    );
}