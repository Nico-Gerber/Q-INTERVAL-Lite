import React, { useEffect, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { CircularProgressbarWithChildren, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { animate } from 'framer-motion';

function AnimatedRiskGauge({ targetValue, color, label, isVisible = true, duration = 1.8, insideText, showPercenage = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [animatedValue, setAnimatedValue] = useState(0);

  const labelColor      = isDark ? 'rgba(255,255,255,0.55)' : '#4a6070';
  const insideTextColor = isDark ? 'rgba(255,255,255,0.55)' : '#5a7080';
  const trailColor      = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(8,145,178,0.08)';

  useEffect(() => {
    if (!isVisible) { setAnimatedValue(0); return; }
    const ctrl = animate(0, targetValue, { duration, ease: 'easeOut', onUpdate: (v) => setAnimatedValue(parseFloat(v.toFixed(1))) });
    return ctrl.stop;
  }, [isVisible, targetValue, duration]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Typography sx={{ color: labelColor, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
        {label}
      </Typography>
      <Box sx={{ width: 280, height: 280 }}>
        <CircularProgressbarWithChildren value={animatedValue} strokeWidth={7}
          styles={buildStyles({ pathColor: color, trailColor, strokeLinecap: 'round', pathTransitionDuration: 0 })}>
          <Typography sx={{ color, fontSize: 60, fontWeight: 700, lineHeight: 1 }}>
            {animatedValue.toFixed(1)}{showPercenage && '%'}
          </Typography>
          <Typography sx={{ color: insideTextColor, fontSize: 15, fontWeight: 600, mt: 1 }}>
            {insideText}
          </Typography>
        </CircularProgressbarWithChildren>
      </Box>
    </Box>
  );
}

export default AnimatedRiskGauge;