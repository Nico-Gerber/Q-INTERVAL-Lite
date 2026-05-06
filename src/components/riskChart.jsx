import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

function CustomTooltip({ active, payload, color }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{
      background: 'rgba(0,0,0,0.85)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 1,
      px: 1.5, py: 1,
      backdropFilter: 'blur(8px)',
    }}>
      <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, mb: 0.25 }}>
        {payload[0].payload.year}
      </Typography>
      <Typography sx={{ color, fontSize: 14, fontWeight: 700 }}>
        {payload[0].value.toFixed(1)}%
      </Typography>
    </Box>
  );
}

export default function RiskChart({
  data,
  color = 'rgba(178, 34, 34, 1)',
  label = 'Risk Over Time',
  threshold = null,
  thresholdLabel = 'Elevated Threshold',

}) {
  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography sx={{
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        fontWeight: 500,
        mb: 2,
      }}>
        {label}
      </Typography>

      <Box sx={{ flex: 1, minHeight: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 40, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id={`riskGradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" vertical={false} />

            <XAxis
              dataKey="year"
              stroke="rgba(255,255,255,0.4)"
              tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.5)' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            />

            <YAxis
              stroke="rgba(255,255,255,0.4)"
              tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.5)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 'dataMax + 4']}
            />

            <Tooltip
              content={<CustomTooltip color={color} />}
              cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, strokeDasharray: '3 3' }}
            />

            {threshold !== null && (
              <ReferenceLine
                y={threshold}
                stroke="rgba(229, 255, 0, 0.4)"
                strokeDasharray="4 4"
                label={{
                  value: thresholdLabel,
                  position: 'insideTopRight',
                  fill: 'rgba(229, 255, 0, 0.7)',
                  fontSize: 10,
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="risk"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#riskGradient-${color})`}
              dot={{ fill: color, strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: 'white' }}
              animationDuration={1200}
              animationEasing="ease-out"

            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
