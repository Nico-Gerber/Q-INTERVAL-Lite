import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

export default function ExamContribution({ exams = [] }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!exams.length) return null;

  const sorted = [...exams].sort((a, b) => b.year - a.year);
  const mostInfluential = exams.length ? exams.reduce((max, e) => (e.weight > max.weight ? e : max)) : null;

  // Tokens
  const cardBg       = isDark ? 'rgba(255,255,255,0.03)' : theme.palette.background.paper;
  const cardBorder   = isDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(8,145,178,0.2)';
  const heading      = isDark ? 'rgba(255,255,255,0.55)' : '#4a6070';
  const subtitle     = isDark ? 'rgba(255,255,255,0.4)'  : '#5a7080';
  const defaultText  = isDark ? 'rgba(255,255,255,0.75)' : theme.palette.text.primary;
  const trackBg      = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(8,145,178,0.08)';
  const defaultBar   = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(8,145,178,0.3)';
  const divider      = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(8,145,178,0.15)';
  const footerLabel  = isDark ? 'rgba(255,255,255,0.45)' : '#4a6070';

  const getBarColor  = (e) => e.isCurrent ? '#A32D2D' : (mostInfluential && e.year === mostInfluential.year) ? '#BA7517' : defaultBar;
  const getTextColor = (e) => e.isCurrent ? '#A32D2D' : (mostInfluential && e.year === mostInfluential.year) ? '#854F0B' : defaultText;
  const isHighlight  = (e) => e.isCurrent || (mostInfluential && e.year === mostInfluential.year);

  return (
    <Box sx={{ background: cardBg, border: cardBorder, borderRadius: 3, p: 3 }}>
      <Typography sx={{ color: heading, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, mb: 0.5 }}>
        Exam Contribution
      </Typography>
      <Typography sx={{ color: subtitle, fontSize: 12, fontWeight: 500, mb: 3 }}>
        How much each prior exam informed this prediction
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sorted.map((exam) => {
          const barColor  = getBarColor(exam);
          const textColor = getTextColor(exam);
          const weightPct = exam.weight * 100;
          return (
            <Box key={exam.year}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography sx={{ fontSize: 13, color: textColor, fontWeight: isHighlight(exam) ? 700 : 500 }}>
                  {exam.year} · {exam.label}
                </Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: textColor }}>
                  {weightPct.toFixed(0)}%
                </Typography>
              </Box>
              <Box sx={{ height: 7, background: trackBg, borderRadius: 99, overflow: 'hidden' }}>
                <Box sx={{ width: `${weightPct}%`, height: '100%', background: barColor, borderRadius: 99, transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }} />
              </Box>
            </Box>
          );
        })}
      </Box>

      {mostInfluential && (
        <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${divider}`, display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: footerLabel, fontSize: 12, fontWeight: 600 }}>Most weight on</Typography>
          <Typography sx={{ color: mostInfluential.isCurrent ? '#A32D2D' : '#854F0B', fontSize: 12, fontWeight: 700 }}>
            {mostInfluential.year} exam
          </Typography>
        </Box>
      )}
    </Box>
  );
}