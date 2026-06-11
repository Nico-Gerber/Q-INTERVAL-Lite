import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

function CustomTooltip({ active, payload, color, isDark, theme }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{
      background: isDark ? 'rgba(5,14,24,0.95)' : 'rgba(255,255,255,0.97)',
      border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(8,145,178,0.25)',
      borderRadius: 2, px: 2, py: 1.5,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    }}>
      <Typography sx={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#5a7080', fontSize: 11, fontWeight: 600, mb: 0.5 }}>
        Year {payload[0].payload.year}
      </Typography>
      <Typography sx={{ color, fontSize: 15, fontWeight: 700 }}>
        {payload[0].value.toFixed(1)}%
      </Typography>
    </Box>
  );
}

export default function RiskChart({ data, color = 'rgba(178,34,34,1)', label = 'Risk Over Time', threshold = null, thresholdLabel = 'Elevated Threshold' }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const gridStroke  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(8,145,178,0.08)';
  const axisColor   = isDark ? 'rgba(255,255,255,0.35)' : '#5a7080';
  const axisLine    = isDark ? 'rgba(255,255,255,0.1)'  : 'rgba(8,145,178,0.15)';
  const labelColor  = isDark ? 'rgba(255,255,255,0.5)'  : '#4a6070';
  const refColor    = isDark ? 'rgba(229,255,0,0.5)'    : 'rgba(180,140,0,0.7)';
  const refLabel    = isDark ? 'rgba(229,255,0,0.75)'   : 'rgba(150,110,0,0.9)';
  const gradId      = `rg${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography sx={{ color: labelColor, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, mb: 2 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minHeight: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 40, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="year" stroke={axisColor} tick={{ fontSize: 12, fill: axisColor, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: axisLine }} />
            <YAxis stroke={axisColor} tick={{ fontSize: 12, fill: axisColor, fontWeight: 600 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 'dataMax + 4']} />
            <Tooltip content={<CustomTooltip color={color} isDark={isDark} theme={theme} />} cursor={{ stroke: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(8,145,178,0.2)', strokeWidth: 1, strokeDasharray: '3 3' }} />
            {threshold !== null && (
              <ReferenceLine y={threshold} stroke={refColor} strokeDasharray="4 4"
                label={{ value: thresholdLabel, position: 'insideTopRight', fill: refLabel, fontSize: 11, fontWeight: 700 }} />
            )}
            <Area type="monotone" dataKey="risk" stroke={color} strokeWidth={3} fill={`url(#${gradId})`}
              dot={{ fill: color, strokeWidth: 0, r: 5 }}
              activeDot={{ r: 7, strokeWidth: 2, stroke: isDark ? 'white' : theme.palette.background.paper }}
              animationDuration={1200} animationEasing="ease-out" />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}