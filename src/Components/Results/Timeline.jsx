import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

export default function ExamTimeline({ exams = [], confidence = null }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!exams.length) return null;

  // Tokens
  const cardBg      = isDark ? 'rgba(255,255,255,0.03)' : theme.palette.background.paper;
  const cardBorder  = isDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(8,145,178,0.2)';
  const heading     = isDark ? 'rgba(255,255,255,0.55)' : '#4a6070';
  const lineColor   = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(8,145,178,0.25)';
  const divider     = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(8,145,178,0.15)';
  const footerLabel = isDark ? 'rgba(255,255,255,0.45)' : '#4a6070';
  const footerValue = isDark ? 'rgba(255,255,255,0.85)' : theme.palette.text.primary;

  const defaultDot = {
    size: 13, fill: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(8,145,178,0.1)',
    stroke: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(8,145,178,0.35)',
    textColor: isDark ? 'rgba(255,255,255,0.7)' : theme.palette.text.secondary,
    weight: 500,
  };

  const priors = exams.filter(e => !e.isCurrent);
  const keyExam = priors.reduce((max, e) => (!max || e.weight > max.weight ? e : max), null);
  const years   = exams.map(e => e.year);
  const span    = Math.max(...years) - Math.min(...years);

  const getDotStyle = (exam) => {
    if (exam.isCurrent) return { size: 22, fill: '#FCEBEB', stroke: '#A32D2D', textColor: '#A32D2D', weight: 700 };
    if (exam === keyExam) return { size: 18, fill: '#FAEEDA', stroke: '#BA7517', textColor: '#854F0B', weight: 700 };
    return defaultDot;
  };

  return (
    <Box sx={{ background: cardBg, border: cardBorder, borderRadius: 3, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography sx={{ color: heading, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, mb: 3 }}>
        Exam History Used
      </Typography>

      <Box sx={{ position: 'relative', height: 100, mb: 2, alignItems: 'center', display: 'flex', flex: 1 }}>
        {/* Timeline line */}
        <Box sx={{ position: 'absolute', left: '4%', right: '4%', top: '40%', height: '1px', background: lineColor }} />

        {exams.map((exam, i) => {
          const style = getDotStyle(exam);
          const left  = exams.length === 1 ? '50%' : `${(i / (exams.length - 1)) * 92 + 4}%`;
          return (
            <Box key={exam.year} sx={{ position: 'absolute', left, top: '40%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, minWidth: 64 }}>
              <Box sx={{ width: style.size, height: style.size, borderRadius: '50%', background: style.fill, border: `1.5px solid ${style.stroke}`, mb: 0.5 }} />
              <Typography sx={{ color: style.textColor, fontSize: 12, fontWeight: style.weight }}>
                {exam.year}
              </Typography>
              <Typography sx={{ color: style.textColor, fontSize: 11, fontWeight: style.weight - 100, opacity: 0.85 }}>
                {exam.label}
              </Typography>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ pt: 2, borderTop: `1px solid ${divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ color: footerLabel, fontSize: 12, fontWeight: 600 }}>Span</Typography>
        <Typography sx={{ color: footerValue, fontSize: 12, fontWeight: 700 }}>
          {span} year{span !== 1 ? 's' : ''} · {exams.length} exam{exams.length !== 1 ? 's' : ''}
        </Typography>
        {confidence !== null && (
          <Typography sx={{ color: footerLabel, fontSize: 12, fontWeight: 600 }}>
            ±{(confidence * 100).toFixed(1)}% conf.
          </Typography>
        )}
      </Box>
    </Box>
  );
}