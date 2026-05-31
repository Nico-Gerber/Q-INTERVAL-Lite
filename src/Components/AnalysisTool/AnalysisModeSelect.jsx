import React, { useState } from 'react';
import { Box, Container, Typography, Paper, Alert, Button } from '@mui/material';
import { motion } from 'framer-motion';
import {
  ImageSearch as ClassificationIcon,
  TrendingUp as RiskIcon,
  MonitorHeart as MammoRiskIcon,
} from '@mui/icons-material';

// Palette keys (defined in App.js):
// classification → 'classification'  slate  #94A3B8 — industry standard
// mammo-risk     → 'compositeRisk'   orange #F97316 — weighted scoring
// future-risk    → 'sequentialRisk'  rose   #F43F5E — predictive urgency
const MODES = [
  {
    id: 'classification',
    title: 'Session Analysis',
    description: 'Upload all four standard mammogram views from a single screening session for classification and composite risk assessment.',
    icon: <ClassificationIcon sx={{ fontSize: 26 }} />,
    paletteKey: 'classification',
    features: [
      'Standard 4-view session (L-CC, L-MLO, R-CC, R-MLO)',
      'Per-view classification & Grad-CAM',
      'Aggregated patient-level verdict',
      'Composite risk index',
    ],
  },

  {
    id: 'future-risk',
    title: 'Sequential Future Risk',
    description: 'Upload sequential mammogram images over time to predict future breast cancer risk using temporal pattern analysis. (Coming Soon)',
    icon: <RiskIcon sx={{ fontSize: 26 }} />,
    paletteKey: 'sequentialRisk',
    features: [
      'Multi-image temporal analysis',
      '5-year risk prediction',
      'Density change tracking',
      'Trend visualization',
    ],
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.35, delay: i * 0.08, ease: 'easeOut' },
  }),
};

export default function ModeSelect({ selectedMode, onModeSelect, setActiveStep }) {
  const [status, setStatus] = useState(false);

  return (
    <Container maxWidth="xl">
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 2, pt: 1, pb: 0.5,
        alignItems: 'stretch',
        mx: 'auto',
        maxWidth: 'md'
      }}>
        {MODES.map((mode, i) => {
          const isSelected = selectedMode === mode.id;
          const pk = mode.paletteKey;

          return (
            <motion.div
              key={mode.id}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              style={{ display: 'flex' }}
            >
              <Paper
                onClick={() => { onModeSelect(mode.id); setStatus(false); }}
                elevation={isSelected ? 6 : 1}
                sx={{
                  p: 2.5, cursor: 'pointer', borderRadius: 3,
                  border: '2px solid',
                  borderColor: isSelected
                    ? (theme) => theme.palette[pk].main
                    : (theme) => theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.14)'
                      : 'rgba(8,145,178,0.30)',
                  backgroundColor: isSelected
                    ? (theme) => theme.palette.mode === 'dark'
                      ? `${theme.palette[pk].main}18`
                      : `${theme.palette[pk].main}16`
                    : (theme) => theme.palette.mode === 'dark'
                      ? 'background.paper'
                      : `${theme.palette[pk].main}07`,
                  transition: 'all 0.22s ease',
                  display: 'flex', flexDirection: 'column', width: '100%',
                  '&:hover': {
                    borderColor: (theme) => theme.palette[pk].main,
                    backgroundColor: (theme) => theme.palette.mode === 'dark'
                      ? `${theme.palette[pk].main}10`
                      : `${theme.palette[pk].main}12`,
                    transform: 'translateY(-3px)',
                    boxShadow: (theme) =>
                      `0 8px 28px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(8,145,178,0.15)'}, 0 0 0 1px ${theme.palette[pk].main}30`,
                  },
                }}
              >
                {/* Icon */}
                <Box sx={{
                  width: 48, height: 48, borderRadius: 2, flexShrink: 0,
                  backgroundColor: isSelected
                    ? (theme) => `${theme.palette[pk].main}22`
                    : (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(8,145,178,0.08)',
                  border: '1.5px solid',
                  borderColor: isSelected
                    ? (theme) => `${theme.palette[pk].main}55`
                    : (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(8,145,178,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isSelected ? (theme) => theme.palette[pk].main : 'text.secondary',
                  mb: 1.5, transition: 'all 0.22s ease',
                }}>
                  {mode.icon}
                </Box>

                {/* Title */}
                <Typography sx={{
                  color: 'text.primary', fontWeight: 800, fontSize: '0.95rem',
                  mb: 0.75, lineHeight: 1.3, flexShrink: 0,
                }}>
                  {mode.title}
                </Typography>

                {/* Description */}
                <Typography variant="body2" sx={{
                  color: 'text.secondary', lineHeight: 1.6, fontSize: '0.8rem',
                  mb: 1.5, flexShrink: 0,
                }}>
                  {mode.description}
                </Typography>

                {/* Feature bullets */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
                  {mode.features.map((feature) => (
                    <Box key={feature} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Box sx={{
                        width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: isSelected
                          ? (theme) => theme.palette.mode === 'dark'
                            ? theme.palette[pk].main
                            : theme.palette[pk].dark
                          : 'text.disabled',
                        transition: 'background-color 0.22s ease',
                      }} />
                      <Typography variant="caption" sx={{
                        color: isSelected
                          ? (theme) => theme.palette.mode === 'dark'
                            ? theme.palette[pk].light
                            : theme.palette[pk].dark
                          : 'text.primary',
                        fontSize: '0.75rem', transition: 'color 0.22s ease',
                      }}>
                        {feature}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Selected indicator */}
                <Box sx={{
                  mt: 1.5, pt: 1.25, flexShrink: 0,
                  borderTop: '1px solid',
                  borderColor: isSelected
                    ? (theme) => theme.palette.mode === 'dark'
                      ? `${theme.palette[pk].main}30`
                      : `${theme.palette[pk].dark}30`
                    : 'divider',
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  visibility: isSelected ? 'visible' : 'hidden',
                }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette[pk].main : theme.palette[pk].dark }} />
                  <Typography variant="caption" sx={{
                    color: (theme) => theme.palette.mode === 'dark' ? theme.palette[pk].main : theme.palette[pk].dark,
                    fontWeight: 600, fontSize: '0.72rem',
                  }}>
                    Selected
                  </Typography>
                </Box>
              </Paper>
            </motion.div>
          );
        })}
      </Box>

      {status && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          Please select an analysis mode to continue
        </Alert>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          {selectedMode
            ? <Button variant="contained" size="large" onClick={() => setActiveStep(prev => prev + 1)} sx={{ px: 5, fontWeight: 700 }}>Continue →</Button>
            : <Button variant="contained" size="large" onClick={() => setStatus(true)} sx={{ px: 5, fontWeight: 700, opacity: 0.35 }}>Continue →</Button>
          }
        </Box>
      </motion.div>
    </Container>
  );
}