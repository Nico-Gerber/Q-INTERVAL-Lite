import React, { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';


const DATA_FONT = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";


function useStage(message, theme) {
    return useMemo(() => {
        const m = (message || '').toLowerCase();
        if (m.includes('quantum') || m.includes('qubit') || m.includes('circuit')) return theme.palette.qml.main;
        if (m.includes('cnn') || m.includes('grad-cam') || m.includes('calibration')) return theme.palette.cnn.main;
        if (m.includes('risk') || m.includes('density') || m.includes('bi-rads')) return theme.palette.risk.main;
        return theme.palette.primary.main;
    }, [message, theme]);
}

export default function ScanningLoader({ message, size = 108 }) {
    const theme = useTheme();
    const color = useStage(message, theme);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5 }}>
            <Box sx={{
                position: 'relative', width: size, height: size, borderRadius: 2.5,
                border: '2px solid', borderColor: color, overflow: 'hidden',
                transition: 'border-color 0.5s ease',
            }}>
                <Box sx={{
                    position: 'absolute', left: 0, right: 0, height: 2, top: '10%',
                    background: color, boxShadow: `0 0 10px 1px ${color}`,
                    animation: 'q-scan-move 1.8s ease-in-out infinite',
                    transition: 'background 0.5s ease',
                    '@keyframes q-scan-move': {
                        '0%': { top: '8%' }, '50%': { top: '84%' }, '100%': { top: '8%' },
                    },
                }} />
            </Box>
            <Typography sx={{
                fontFamily: DATA_FONT, fontSize: 13, letterSpacing: '0.04em',
                color: theme.palette.text.secondary, textAlign: 'center', minHeight: 18,
            }}>
                {message}
            </Typography>
        </Box>
    );
}