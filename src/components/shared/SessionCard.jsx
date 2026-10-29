import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

// Phone layout for one session row. Tables need ~600px, so below `md` the session lists render these
// stacked cards instead of scrolling sideways. `actions` is a row of buttons that share the card width.
export default function SessionCard({ code, date, status, actions }) {
  const t = useTheme().palette.results;
  return (
    <Box sx={{ border: `1px solid ${t.lineStrong}`, borderRadius: 2, background: t.inputBg, p: 1.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: t.text, overflowWrap: 'anywhere' }}>
          {code}
        </Typography>
        {status}
      </Box>
      <Typography sx={{ mt: 0.5, fontSize: '0.8rem', color: t.body }}>{date}</Typography>
      <Box
        sx={{
          mt: 1.5, pt: 1, borderTop: `1px solid ${t.line}`, display: 'flex', gap: 0.5,
          '& > *': { flex: 1, minWidth: 0, minHeight: 40 },
        }}
      >
        {actions}
      </Box>
    </Box>
  );
}
