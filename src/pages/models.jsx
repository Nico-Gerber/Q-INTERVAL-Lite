import React from 'react';
import { Typography, Box, Chip } from '@mui/material';

const Models = () => {
  return (
    <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 8 }}>
      {/* ── Hero ── */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #0D1B2A 0%, #1565C0 100%)',
          color: 'white',
          py: { xs: 5, md: 8 },
          px: 2,
          textAlign: 'center',
        }}
      >
        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{
            mb: 2,
            backgroundColor: 'rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.08em',
            fontSize: '0.65rem',
            fontWeight: 700,
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        />
        <Typography variant="h3" sx={{ fontWeight: 800, mb: 1.5, letterSpacing: '-0.02em' }}>
          Our AI Models
        </Typography>
        <Typography
          variant="h6"
          sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400, maxWidth: 580, mx: 'auto' }}
        >
          Explore the AI models that power our mammogram analysis system.
        </Typography>
      </Box>
    </Box>
  );
};

export default Models;
