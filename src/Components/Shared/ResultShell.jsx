import { Box } from '@mui/material';

// The "shell" card used to wrap the results view in analysis.jsx
// (Classification Results / Risk Assessment). Extracted here so other
// pages (Sessions, patient Report) can match it exactly instead of
// drifting toward MUI's generic themed Paper.
export default function ResultShell({ sx, children }) {
  return (
    <Box sx={{
      borderRadius: 2.5, p: { xs: 2, md: 3 },
      background: (theme) => theme.palette.results.frame,
      border: (theme) => `1px solid ${theme.palette.results.frameBorder}`,
      boxShadow: (theme) => theme.palette.results.frameShadow,
      ...sx,
    }}>
      {children}
    </Box>
  );
}
