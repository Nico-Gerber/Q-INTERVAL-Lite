import React from 'react';
import { Typography, Box, Chip, Paper, Container, Divider } from '@mui/material';

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

      <Container maxWidth="md" sx={{ mt: { xs: -3, md: -4 } }}>
        {/* ── Information Card ── */}
        <Paper elevation={2} sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom>
            About Our Models
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
            This page will aim to break down the logic behind the AI predictions/confidence. Aims to educate users on exactly how Classical AI and Quantum Machine Learning process the same mammogram differently. Once complete, it will explain what each model actually looks for in the tissue, how they spot hidden risks, and the metrics we use to compare their accuracy side-by-side / its trainings.
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
            May also incorporate other external APIs / resources
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};

export default Models;
