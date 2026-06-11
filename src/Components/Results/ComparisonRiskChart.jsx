import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart } from 'recharts';

function CustomTooltip({ active, payload, classicalColor, quantumColor, isDark }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <Box sx={{
      background: isDark ? 'rgba(5,14,24,0.95)' : 'rgba(255,255,255,0.97)',
      border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(8,145,178,0.25)',
      borderRadius: 2, px: 2, py: 1.5,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    }}>
      <Typography sx={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#5a7080', fontSize: 11, fontWeight: 600, mb: 0.75 }}>
        Year {point.year}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Box sx={{ width: 8, height: 8, background: classicalColor, borderRadius: '50%' }} />
        <Typography sx={{ color: classicalColor, fontSize: 13, fontWeight: 700 }}>Classical: {point.classical?.toFixed(1)}%</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, background: quantumColor, borderRadius: '50%' }} />
        <Typography sx={{ color: quantumColor, fontSize: 13, fontWeight: 700 }}>Quantum: {point.quantum?.toFixed(1)}%</Typography>
      </Box>
    </Box>
  );
}

export default function ComparisonRiskChart({
  classicalData, quantumData,
  classicalColor = 'rgba(99,153,34,1)', quantumColor = 'rgba(127,119,221,1)',
  threshold = null, thresholdLabel,
  classicalCrossYears = null, quantumCrossYears = null,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const cardBg      = isDark ? 'rgba(255,255,255,0.03)' : theme.palette.background.paper;
  const cardBorder  = isDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(8,145,178,0.2)';
  const headingColor = isDark ? 'rgba(255,255,255,0.5)'  : '#4a6070';
  const legendColor  = isDark ? 'rgba(255,255,255,0.75)' : theme.palette.text.primary;
  const gridStroke   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(8,145,178,0.08)';
  const axisColor    = isDark ? 'rgba(255,255,255,0.45)' : '#5a7080';
  const axisLine     = isDark ? 'rgba(255,255,255,0.1)'  : 'rgba(8,145,178,0.15)';
  const divider      = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(8,145,178,0.15)';
  const footerLabel  = isDark ? 'rgba(255,255,255,0.5)'  : '#4a6070';
  const footerValue  = isDark ? 'rgba(255,255,255,0.9)'  : theme.palette.text.primary;
  const refColor     = isDark ? 'rgba(229,255,0,0.45)'   : 'rgba(180,140,0,0.6)';
  const refLabel     = isDark ? 'rgba(229,255,0,0.75)'   : 'rgba(150,110,0,0.9)';
  const refText      = thresholdLabel ?? `Elevated Threshold ${threshold}%`;

  const merged = classicalData.map((c, i) => ({ year: c.year, classical: c.risk, quantum: quantumData[i]?.risk ?? null }));

  return (
    <Box sx={{ background: cardBg, border: cardBorder, borderRadius: 3, p: 3, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Typography sx={{ color: headingColor, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>
          Risk Over Time · Both Models
        </Typography>
        <Box sx={{ display: 'flex', gap: 2.5 }}>
          {[{ color: classicalColor, label: 'Classical' }, { color: quantumColor, label: 'Quantum' }].map(({ color, label }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 16, height: 2.5, background: color, borderRadius: 1 }} />
              <Typography sx={{ color: legendColor, fontSize: 12, fontWeight: 600 }}>{label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Chart */}
      <Box sx={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 20, right: 40, left: 0, bottom: 10 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="year" stroke={axisColor} tick={{ fontSize: 12, fill: axisColor, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: axisLine }} />
            <YAxis stroke={axisColor} tick={{ fontSize: 12, fill: axisColor, fontWeight: 600 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 'dataMax + 4']} />
            <Tooltip content={<CustomTooltip classicalColor={classicalColor} quantumColor={quantumColor} isDark={isDark} />}
              cursor={{ stroke: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(8,145,178,0.2)', strokeWidth: 1, strokeDasharray: '3 3' }} />
            {threshold !== null && (
              <ReferenceLine y={threshold} stroke={refColor} strokeDasharray="4 4"
                label={{ value: refText, position: 'insideTopRight', fill: refLabel, fontSize: 11, fontWeight: 700 }} />
            )}
            <Line type="monotone" dataKey="classical" stroke={classicalColor} strokeWidth={3}
              dot={{ fill: classicalColor, strokeWidth: 0, r: 5 }}
              activeDot={{ r: 7, strokeWidth: 2, stroke: isDark ? 'white' : theme.palette.background.paper }}
              animationDuration={1200} animationEasing="ease-out" />
            <Line type="monotone" dataKey="quantum" stroke={quantumColor} strokeWidth={3}
              dot={{ fill: quantumColor, strokeWidth: 0, r: 5 }}
              activeDot={{ r: 7, strokeWidth: 2, stroke: isDark ? 'white' : theme.palette.background.paper }}
              animationDuration={1200} animationEasing="ease-out" />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>

      {/* Footer */}
      {(classicalCrossYears !== null || quantumCrossYears !== null) && (
        <Box sx={{ pt: 2, mt: 2, borderTop: `1px solid ${divider}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          {classicalCrossYears !== null && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ color: footerLabel, fontSize: 12, fontWeight: 600 }}>Classical crosses elevated band at</Typography>
              <Typography sx={{ color: footerValue, fontSize: 12, fontWeight: 700 }}>~{classicalCrossYears} years</Typography>
            </Box>
          )}
          {quantumCrossYears !== null && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ color: footerLabel, fontSize: 12, fontWeight: 600 }}>Quantum crosses at</Typography>
              <Typography sx={{ color: footerValue, fontSize: 12, fontWeight: 700 }}>~{quantumCrossYears} years</Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}