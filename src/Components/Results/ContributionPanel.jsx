import React from 'react';
import { Box, Typography } from '@mui/material';

export default function ExamContribution({ exams = [] }) {
  if (!exams.length) return null;


  const sorted = [...exams].sort((a, b) => b.year - a.year);


  const priors = exams.filter(e => !e.isCurrent);
  const mostInfluential = priors.length
    ? priors.reduce((max, e) => (e.weight > max.weight ? e : max))
    : null;

  const getBarColor = (exam) => {
    if (exam.isCurrent) return '#A32D2D';
    if (mostInfluential && exam.year === mostInfluential.year) return '#BA7517';
    return 'rgba(255,255,255,0.3)';
  };

  const getTextColor = (exam) => {
    if (exam.isCurrent) return '#A32D2D';
    if (mostInfluential && exam.year === mostInfluential.year) return '#854F0B';
    return 'rgba(255,255,255,0.6)';
  };

  return (
    <Box sx={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 3,
      p: 3,
    }}>
      <Typography sx={{
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        fontWeight: 500,
        mb: 0.5,
      }}>
        Exam contribution
      </Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, mb: 3 }}>
        how much each prior exam informed this prediction
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {sorted.map((exam) => {
          const barColor = getBarColor(exam);
          const textColor = getTextColor(exam);
          const weightPct = exam.weight * 100;

          return (
            <Box key={exam.year}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{
                  fontSize: 12,
                  color: textColor,
                  fontWeight: exam.isCurrent || (mostInfluential && exam.year === mostInfluential.year) ? 500 : 400,
                }}>
                  {exam.year} · {exam.label}
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: textColor }}>
                  {weightPct.toFixed(0)}%
                </Typography>
              </Box>
              <Box sx={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                <Box sx={{
                  width: `${weightPct}%`,
                  height: '100%',
                  background: barColor,
                  borderRadius: 99,
                  transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }} />
              </Box>
            </Box>
          );
        })}
      </Box>

      {mostInfluential && (
        <Box sx={{
          mt: 2,
          pt: 2,
          borderTop: '0.5px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Most weight on</Typography>
          <Typography sx={{ color: '#854F0B', fontSize: 11, fontWeight: 500 }}>
            {mostInfluential.year} exam
          </Typography>
        </Box>
      )}
    </Box>
  );
}