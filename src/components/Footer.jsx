import React from 'react';
import { Box, Chip, Container, Divider, Typography } from '@mui/material';

const TECH_STACK = [
  'React.js', 'FastAPI', 'Material UI', 'Python',
  'PyTorch', 'CNN', 'Quantum Computing', 'PennyLane',
];

const Footer = () => (
  <Box component="footer" sx={{ backgroundColor: '#080E1C', borderTop: '1px solid rgba(255,255,255,0.07)', color: '#E8EEF8', pt: 4, pb: 3, mt: 'auto' }}>
    <Container maxWidth="lg">

      <Box sx={{ textAlign: 'center', mb: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ width: 26, height: 26, borderRadius: '7px', background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <polyline points="2,12 6,12 8,5 10,19 13,9 15,14 17,12 22,12" stroke="#0B1120" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Box>
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#E8EEF8' }}>
            Q-INTERVAL-Lite+
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', fontSize: '0.62rem' }}>
          MAMMOGRAM ANALYSIS SYSTEM · FOR RESEARCH USE ONLY
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)', mb: 2.5 }} />

      <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0.75, mb: 2.5 }}>
        {TECH_STACK.map((tech) => (
          <Chip key={tech} label={tech} size="small"
            sx={{ backgroundColor: 'rgba(45,212,191,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(45,212,191,0.12)', fontSize: '0.7rem', fontWeight: 500, transition: 'all 0.2s', '&:hover': { backgroundColor: 'rgba(45,212,191,0.12)', color: '#2DD4BF' } }}
          />
        ))}
      </Box>

      <Typography variant="caption" align="center" display="block" sx={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.7rem' }}>
        © {new Date().getFullYear()} Swinburne University · COS40005 Computing Technology Inquiry Project
      </Typography>

    </Container>
  </Box>
);

export default Footer;
