import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';


const DATA_FONT = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function useStage(message, theme) {
    return useMemo(() => {
        const m = (message || '').toLowerCase();
        if (m.includes('quantum') || m.includes('qubit') || m.includes('circuit')) return theme.palette.qml.main;
        if (m.includes('cnn') || m.includes('model') || m.includes('heatmap')) return theme.palette.cnn.main;
        if (m.includes('risk') || m.includes('density') || m.includes('bi-rads')) return theme.palette.risk.main;
        return theme.palette.primary.main;
    }, [message, theme]);
}

// Progress is estimated, not measured — the backend doesn't stream real
// completion percentage. It rises steadily and roughly linearly with elapsed
// time against `expectedDurationMs`, capped short of 100% so it never claims
// to be done before the response actually lands, even if the real request
// runs a bit long.
const PROGRESS_CAP = 96;

function useEstimatedProgress(expectedDurationMs) {
    const [progress, setProgress] = useState(0);
    const startRef = useRef(null);

    useEffect(() => {
        startRef.current = performance.now();
        const id = setInterval(() => {
            const elapsed = performance.now() - startRef.current;
            const pct = Math.min(PROGRESS_CAP, (elapsed / expectedDurationMs) * PROGRESS_CAP);
            setProgress(pct);
        }, 150);
        return () => clearInterval(id);
    }, [expectedDurationMs]);

    return progress;
}

export default function ScanningLoader({ message, size = 108, expectedDurationMs = 15000 }) {
    const theme = useTheme();
    const color = useStage(message, theme);
    const progress = useEstimatedProgress(expectedDurationMs);

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

            <Box sx={{ width: size * 1.8, height: 4, borderRadius: 2, overflow: 'hidden',
                background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            }}>
                <Box sx={{
                    height: '100%', width: `${progress}%`, borderRadius: 2,
                    background: color, transition: 'width 0.15s linear, background 0.5s ease',
                }} />
            </Box>
        </Box>
    );
}
