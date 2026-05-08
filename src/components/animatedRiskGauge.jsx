import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { CircularProgressbarWithChildren, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { animate } from 'framer-motion';

function AnimatedRiskGauge({ targetValue, color, label, isVisible = true, duration = 1.8, insideText, showPercenage = false }) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    if (!isVisible) { setAnimatedValue(0); return; }
    const ctrl = animate(0, targetValue, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setAnimatedValue(parseFloat(v.toFixed(1))),
    });
    return ctrl.stop;
  }, [isVisible, targetValue, duration]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Typography sx={{
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        fontWeight: 500,
      }}>
        {label}
      </Typography>

      <Box sx={{ width: 280, height: 280 }}>
        <CircularProgressbarWithChildren
          value={animatedValue}
          strokeWidth={6}
          styles={buildStyles({
            pathColor: color,
            trailColor: 'rgba(255,255,255,0.05)',
            strokeLinecap: 'round',
            pathTransitionDuration: 0,
          })}
        >
          <Typography sx={{ color, fontSize: 64, fontWeight: 500, lineHeight: 1 }}>
            {animatedValue.toFixed(1)}{showPercenage && '%'}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, mt: 1 }}>
            {insideText}
          </Typography>
        </CircularProgressbarWithChildren>
      </Box>
    </Box>
  );
}

export default AnimatedRiskGauge;