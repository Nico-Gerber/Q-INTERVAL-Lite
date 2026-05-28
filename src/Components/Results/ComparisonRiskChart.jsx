import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  ComposedChart,
} from 'recharts';

function CustomTooltip({ active, payload, classicalColor, quantumColor }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <Box sx={{
      background: 'rgba(0,0,0,0.85)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 1,
      px: 1.5, py: 1,
      backdropFilter: 'blur(8px)',
    }}>
      <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, mb: 0.5 }}>
        {point.year} horizon
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
        <Box sx={{ width: 8, height: 8, background: classicalColor, borderRadius: '50%' }} />
        <Typography sx={{ color: classicalColor, fontSize: 13, fontWeight: 700 }}>
          Classical: {point.classical?.toFixed(1)}%
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, background: quantumColor, borderRadius: '50%' }} />
        <Typography sx={{ color: quantumColor, fontSize: 13, fontWeight: 700 }}>
          Quantum: {point.quantum?.toFixed(1)}%
        </Typography>
      </Box>
    </Box>
  );
}

export default function ComparisonRiskChart({
  classicalData,
  quantumData,
  classicalColor = 'rgba(99, 153, 34, 1)',
  quantumColor = 'rgba(127, 119, 221, 1)',
  threshold = null,
  thresholdLabel = `Elevated Threshold ${threshold} %`,
  classicalCrossYears = null,
  quantumCrossYears = null,
}) {

  const merged = classicalData.map((c, i) => ({
    year: c.year,
    classical: c.risk,
    quantum: quantumData[i]?.risk ?? null,
  }));

  return (
    <Box sx={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 3,
      p: 3,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header row: title + legend */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography sx={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}>
          Risk Over Time · Both Models
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 14, height: 2, background: classicalColor }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Classical</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 14, height: 2, background: quantumColor }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Quantum</Typography>
          </Box>
        </Box>
      </Box>

      {/* Chart */}
      <Box sx={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 20, right: 40, left: 0, bottom: 10 }}>
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
              content={<CustomTooltip classicalColor={classicalColor} quantumColor={quantumColor} />}
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

            <Line
              type="monotone"
              dataKey="classical"
              stroke={classicalColor}
              strokeWidth={2.5}
              dot={{ fill: classicalColor, strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: 'white' }}
              animationDuration={1200}
              animationEasing="ease-out"
            />

            <Line
              type="monotone"
              dataKey="quantum"
              stroke={quantumColor}
              strokeWidth={2.5}
              dot={{ fill: quantumColor, strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: 'white' }}
              animationDuration={1200}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>


      {(classicalCrossYears !== null || quantumCrossYears !== null) && (
        <Box sx={{
          pt: 2,
          mt: 2,
          borderTop: '0.5px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          {classicalCrossYears !== null && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                Classical crosses elevated band at
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 500 }}>
                ~{classicalCrossYears} years
              </Typography>
            </Box>
          )}
          {quantumCrossYears !== null && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                Quantum crosses at
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 500 }}>
                ~{quantumCrossYears} years
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}