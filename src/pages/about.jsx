import React from 'react';
import { Container, Typography, Box, Chip, Divider, Avatar } from '@mui/material';
import { School, Email } from '@mui/icons-material';

const About = () => (
  <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 10 }}>
    <Box
      sx={{
        position: 'relative', overflow: 'hidden',
        background: (theme) => theme.palette.background.heroGradient,
        color: 'text.primary',
        py: { xs: 6, md: 10 }, px: 2, textAlign: 'center',
        '&::before': { content: '""', position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: '500px', height: '500px', borderRadius: '50%', background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`, pointerEvents: 'none' },
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: (theme) => `linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px), linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
      <Chip
        label="----"
        size="small"
        sx={{ mb: 3, bgcolor: (theme) => `${theme.palette.primary.main}14`, color: 'primary.main', letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700, border: '1px solid', borderColor: (theme) => `${theme.palette.primary.main}30`, borderRadius: '999px' }}
      />
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>About </Typography>
      <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 520, mx: 'auto', lineHeight: 1.7 }}>
        About Q-INTERVAL-LITE+
      </Typography>
    </Box>

  </Box>
);

export default About;