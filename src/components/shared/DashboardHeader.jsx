import React from 'react';
import { Box, Typography } from '@mui/material';
import { ShieldOutlined as ShieldIcon } from '@mui/icons-material';

export const greetingFor = (date = new Date()) => {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// Header pieces for the signed-in dashboard pages (My Sessions and My Patients).
// Same disclaimer as the Home hero.
export function PrototypeNotice({ sx }) {
  const tone = (theme) => (theme.palette.mode === 'dark' ? theme.palette.error.main : theme.palette.error.dark);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2.5, ...sx }}>
      <ShieldIcon sx={{ fontSize: 15, color: tone }} aria-hidden="true" />
      <Typography sx={{ color: tone, fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Research prototype · Not for clinical use
      </Typography>
    </Box>
  );
}

// Greeting, live figures and a short note, shared by My Sessions and My Patients.
// stats: [{ value, label, warn }]. Warn tiles use the "pending" status colour while value > 0.
export function GreetingBlock({ name, stats = [], note }) {
  const first = (name || '').split(/\s+/)[0];
  return (
    <Box sx={{ mb: 4, borderLeft: '3px solid', borderColor: 'primary.main', pl: 2 }}>
      <Typography
        component="p"
        sx={{ m: 0, mb: stats.length ? 1.5 : 1, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 0.75, fontSize: { xs: '1.15rem', md: '1.35rem' }, lineHeight: 1.3 }}
      >
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          {greetingFor()}{first ? ',' : ''}
        </Box>
        {first && <Box component="span" sx={{ color: 'text.primary', fontWeight: 800, letterSpacing: '-0.01em' }}>{first}</Box>}
      </Typography>

      {stats.length > 0 && (
        <Box component="dl" sx={{ m: 0, mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
          {stats.map((stat) => (
            <Box
              key={stat.label}
              sx={(theme) => {
                const { reportStatus, results } = theme.palette;
                const live = stat.warn && stat.value > 0;
                return {
                  minWidth: 120, px: 2, py: 1.25, borderRadius: 2, display: 'flex', flexDirection: 'column-reverse',
                  border: '1px solid', borderColor: live ? reportStatus.pending : results.lineStrong,
                  backgroundColor: live ? `${reportStatus.pending}1A` : results.inputBg,
                  '& .stat-value': { color: live ? reportStatus.pending : 'primary.main' },
                };
              }}
            >
              <Typography component="dt" sx={{ mt: 0.5, fontSize: '0.78rem', fontWeight: 600, color: 'text.secondary' }}>
                {stat.label}
              </Typography>
              <Typography component="dd" className="stat-value" sx={{ m: 0, fontSize: '1.9rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {stat.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {note && <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem', lineHeight: 1.65, maxWidth: 600 }}>{note}</Typography>}
    </Box>
  );
}
