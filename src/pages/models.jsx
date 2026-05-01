import React from 'react';
import { Typography, Box, Chip, Paper, Container, Divider } from '@mui/material';

const Models = () => (
  <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 8 }}>
    <Box
      sx={{
        position: 'relative', overflow: 'hidden',
        background: (theme) => theme.palette.background.hero,
        color: 'text.primary',
        py: { xs: 6, md: 10 }, px: 2, textAlign: 'center',
        '&::before': { content: '""', position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: '500px', height: '500px', borderRadius: '50%', background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`, pointerEvents: 'none' },
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: (theme) => `linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px), linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
      <Chip
        label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
        size="small"
        sx={{ mb: 3, bgcolor: (theme) => `${theme.palette.error.main}18`, color: 'error.main', letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700, border: '1px solid', borderColor: (theme) => `${theme.palette.error.main}35`, borderRadius: '999px' }}
      />
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>Our AI Models</Typography>
      <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 580, mx: 'auto' }}>
        Explore the AI models that power our mammogram analysis system.
      </Typography>
    </Box>

    <Container maxWidth="md" sx={{ mt: { xs: 4, md: 6 }, px: { xs: 2, md: 3 } }}>
      <Paper elevation={0} sx={{ p: { xs: 2.5, md: 4 }, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'text.primary' }}>About Our Models</Typography>
        <Divider sx={{ mb: 2.5 }} />
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
          This page will aim to break down the logic behind the AI predictions/confidence. Aims to educate
          users on exactly how Classical AI and Quantum Machine Learning process the same mammogram differently.
          Once complete, it will explain what each model actually looks for in the tissue, how they spot hidden
          risks, and the metrics we use to compare their accuracy side-by-side and its trainings.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic', opacity: 0.7 }}>
          May also incorporate other external APIs / resources
        </Typography>
      </Paper>
    </Container>
  </Box>
);

export default Models;
