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
      backgroundColor: '#080D16',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      color: 'white',
      pt: 4,
      pb: 3,
      mt: 'auto',
    }}
  >
    <Container maxWidth="lg">

      {/* Brand row */}
      <Box sx={{ textAlign: 'center', mb: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mb: 1 }}>
          {/* ECG icon */}
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '7px',
              background: 'linear-gradient(135deg, #00D4A0, #00A87E)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <polyline
                points="2,12 6,12 8,5 10,19 13,9 15,14 17,12 22,12"
                stroke="#0A0F1A"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Box>
          <Typography
            variant="subtitle1"
            fontWeight={800}
            sx={{ color: 'rgba(255,255,255,0.95)', letterSpacing: '0.01em' }}
          >
            Q-INTERVAL-Lite+
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', fontSize: '0.62rem' }}
        >
          MAMMOGRAM ANALYSIS SYSTEM · FOR RESEARCH USE ONLY
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)', mb: 2.5 }} />

      {/* Tech stack chips */}
      <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0.75, mb: 2.5 }}>
        {TECH_STACK.map((tech) => (
          <Chip
            key={tech}
            label={tech}
            size="small"
            sx={{
              backgroundColor: 'rgba(0,212,160,0.07)',
              color: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(0,212,160,0.15)',
              fontSize: '0.7rem',
              fontWeight: 500,
              '&:hover': {
                backgroundColor: 'rgba(0,212,160,0.13)',
                color: '#00D4A0',
              },
              transition: 'all 0.2s',
            }}
          />
        ))}
      </Box>

      <Typography
        variant="caption"
        align="center"
        display="block"
        sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}
      >
        © {new Date().getFullYear()} Swinburne University · COS40005 Computing Technology Inquiry Project
      </Typography>

    </Container>
  </Box>
);

export default Footer;
