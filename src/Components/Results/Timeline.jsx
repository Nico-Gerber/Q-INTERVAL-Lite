import React from 'react';
import { Box, Typography } from '@mui/material';

export default function ExamTimeline({ exams = [], confidence = null }) {
  if (!exams.length) return null;

  const priors = exams.filter(e => !e.isCurrent);
  const keyExam = priors.reduce(
    (max, e) => (!max || e.weight > max.weight ? e : max),
    null
  );


  const years = exams.map(e => e.year);
  const span = Math.max(...years) - Math.min(...years);


  const getDotStyle = (exam) => {
    if (exam.isCurrent) return { size: 22, fill: '#FCEBEB', stroke: '#A32D2D', textColor: '#A32D2D', weight: 500 };
    if (exam === keyExam) return { size: 18, fill: '#FAEEDA', stroke: '#BA7517', textColor: '#854F0B', weight: 500 };
    return { size: 12, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.2)', textColor: 'rgba(255,255,255,0.7)', weight: 400 };
  };

  return (
    <Box sx={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 3,
      p: 3,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Typography sx={{
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        fontWeight: 500,
        mb: 3,
      }}>
        Exam history used
      </Typography>


      <Box sx={{ position: 'relative', height: 100, mb: 2, alignItems: 'center', display: 'flex', flex: 1 }}>

        <Box sx={{
          position: 'absolute',
          left: '4%',
          right: '4%',
          top: '40%',
          height: '0.5px',
          background: 'rgba(255,255,255,0.15)',
        }} />


        {exams.map((exam, i) => {
          const style = getDotStyle(exam);

          const left = exams.length === 1 ? '50%' : `${(i / (exams.length - 1)) * 92 + 4}%`;

          return (
            <Box key={exam.year} sx={{
              position: 'absolute',
              left,
              top: '40%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
              minWidth: 60,
            }}>

              <Box sx={{
                width: style.size,
                height: style.size,
                borderRadius: '50%',
                background: style.fill,
                border: `0.5px solid ${style.stroke}`,
                mb: 0.5,
              }} />
              <Typography sx={{ color: style.textColor, fontSize: 11, fontWeight: style.weight }}>
                {exam.year}
              </Typography>
              <Typography sx={{ color: style.textColor, fontSize: 10, opacity: 0.7 }}>
                {exam.label}
              </Typography>
            </Box>
          );
        })}
      </Box>


      <Box sx={{
        pt: 2,
        borderTop: '0.5px solid rgba(255,255,255,0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Span</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 500 }}>
          {span} year{span !== 1 ? 's' : ''} · {exams.length} exam{exams.length !== 1 ? 's' : ''}
        </Typography>
        {confidence !== null && (
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
            ±{(confidence * 100).toFixed(1)}% conf.
          </Typography>
        )}
      </Box>
    </Box>
  );
}