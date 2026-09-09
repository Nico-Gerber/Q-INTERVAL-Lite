import { Box } from '@mui/material';

// The dark "shell" card used to wrap the results view in analysis.jsx
// (Classification Results / Risk Assessment). Extracted here so other
// pages (Sessions, patient Report) can match it exactly instead of
// drifting toward MUI's generic themed Paper.
export default function ResultShell({ sx, children }) {
  return (
    <Box sx={{
      borderRadius: 2.5, p: { xs: 2, md: 3 },
      background: (theme) => theme.palette.mode === 'dark' ? '#060f1c' : '#0A1525',
      border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(34,211,238,0.15)'}`,
      boxShadow: (theme) => theme.palette.mode === 'dark'
        ? '0 24px 70px rgba(0,0,0,0.45)'
        : '0 24px 70px rgba(0,0,0,0.35)',
      ...sx,
    }}>
      {children}
    </Box>
  );
}
