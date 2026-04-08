import React from 'react';
import { Box, Chip, Container, Divider, Typography } from '@mui/material';

const TECH_STACK = [
  'React.js', 'FastAPI', 'Material UI', 'Python',
  'PyTorch', 'CNN', 'Quantum Computing', 'PennyLane',
];

const Footer = () => (
  <Box
    component="footer"
    sx={{
      backgroundColor: '#0D1B2A',
      color: 'white',
      pt: 4,
      pb: 2,
      mt: 'auto',
    }}
  >
    <Container maxWidth="lg">
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'rgba(255,255,255,0.9)', mb: 0.5 }}>
          Q-INTERVAL-Lite+
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>
          MAMMOGRAM ANALYSIS SYSTEM · FOR RESEARCH USE ONLY
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 2 }} />

      <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {TECH_STACK.map((tech) => (
          <Chip
            key={tech}
            label={tech}
            size="small"
            sx={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontSize: '0.72rem',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.15)' },
            }}
          />
        ))}
      </Box>

      <Typography variant="caption" align="center" display="block" sx={{ color: 'rgba(255,255,255,0.3)' }}>
        © {new Date().getFullYear()} Swinburne University · COS40005 Computing Technology Inquiry Project
      </Typography>
    </Container>
  </Box>
);

export default Footer;
