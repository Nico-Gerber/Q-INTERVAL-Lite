import React, { useState } from 'react';
import { Box, Container, Typography, Paper, Alert, Button } from '@mui/material';
import {
  ImageSearch as ClassificationIcon,
  TrendingUp as RiskIcon,
  MonitorHeart as MammoRiskIcon,
} from '@mui/icons-material';

const MODES = [
  {
    id: 'classification',
    title: 'Classification Analysis',
    description: 'Analyze a single mammogram image to detect and classify potential abnormalities including masses, calcifications, and other findings.',
    icon: <ClassificationIcon sx={{ fontSize: 26 }} />,
    color: 'primary',
    features: [
      'Single image analysis',
      'Three-way classification',
      'Lesion detection & localization',
      'Confidence scoring',
    ],
  },
  {
    id: 'mammo-risk',
    title: 'Composite Risk Assessment',
    description: 'Upload one or more mammogram images to assess breast cancer risk using CNN-based density, BI-RADS, and malignancy scoring.',
    icon: <MammoRiskIcon sx={{ fontSize: 26 }} />,
    color: 'warning',
    features: [
      'Single or multi-image support',
      'Malignancy & density classification',
      'BI-RADS scoring',
      'Weighted risk score (0–100)',
    ],
  },
  {
    id: 'future-risk',
    title: 'Sequential Future Risk',
    description: 'Upload sequential mammogram images over time to predict future breast cancer risk using temporal pattern analysis. (Coming Soon)',
    icon: <RiskIcon sx={{ fontSize: 26 }} />,
    color: 'secondary',
    features: [
      'Multi-image temporal analysis',
      '5-year risk prediction',
      'Density change tracking',
      'Trend visualization',
    ],
  },
];

export default function ModeSelect({ selectedMode, onModeSelect, setActiveStep }) {
  const [status, setStatus] = useState(false);

  return (
    <Container maxWidth="xl">
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
        gap: 2,
        pt: 1,
        pb: 0.5,
      }}>
        {MODES.map((mode) => {
          const isSelected = selectedMode === mode.id;
          return (
            <Paper
              key={mode.id}
              onClick={() => { onModeSelect(mode.id); setStatus(false); }}
              elevation={isSelected ? 6 : 1}
              sx={{
                p: 2.5,
                cursor: 'pointer',
                borderRadius: 3,
                border: '1px solid',
                borderColor: isSelected ? `${mode.color}.main` : 'divider',
                backgroundColor: isSelected
                  ? (theme) => `${theme.palette[mode.color].main}12`
                  : 'background.paper',
                transition: 'all 0.22s ease',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                  borderColor: `${mode.color}.main`,
                  backgroundColor: (theme) => `${theme.palette[mode.color].main}0C`,
                  transform: 'translateY(-3px)',
                  boxShadow: (theme) =>
                    `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${theme.palette[mode.color].main}25`,
                },
              }}
            >
              {/* Stacked icon */}
              <Box sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                backgroundColor: isSelected
                  ? `${mode.color}.main`
                  : 'rgba(255,255,255,0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isSelected ? `${mode.color}.contrastText` : 'text.secondary',
                mb: 1.5,
                transition: 'all 0.22s ease',
              }}>
                {mode.icon}
              </Box>

              {/* Title */}
              <Typography sx={{
                color: 'text.primary',
                fontWeight: 700,
                fontSize: '0.95rem',
                mb: 0.75,
                lineHeight: 1.3,
              }}>
                {mode.title}
              </Typography>

              {/* Description */}
              <Typography variant="body2" sx={{
                color: 'text.secondary',
                lineHeight: 1.6,
                fontSize: '0.8rem',
                mb: 1.5,
              }}>
                {mode.description}
              </Typography>

              {/* Feature bullets */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
                {mode.features.map((feature) => (
                  <Box key={feature} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      backgroundColor: isSelected ? `${mode.color}.main` : 'text.disabled',
                      flexShrink: 0,
                      transition: 'background-color 0.2s ease',
                    }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      {feature}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* Selected indicator — always reserves space */}
              <Box sx={{
                mt: 1.5,
                pt: 1.25,
                borderTop: '1px solid',
                borderColor: isSelected
                  ? (theme) => `${theme.palette[mode.color].main}30`
                  : 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                visibility: isSelected ? 'visible' : 'hidden',
              }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: `${mode.color}.main` }} />
                <Typography variant="caption" sx={{ color: `${mode.color}.main`, fontWeight: 600, fontSize: '0.72rem' }}>
                  Selected
                </Typography>
              </Box>
            </Paper>
          );
        })}
      </Box>

      {status && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          Please select an analysis mode to continue
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
        {selectedMode
          ? <Button variant="contained" size="large" onClick={() => setActiveStep(prev => prev + 1)} sx={{ px: 5, fontWeight: 700 }}>Continue →</Button>
          : <Button variant="contained" size="large" onClick={() => setStatus(true)} sx={{ px: 5, fontWeight: 700, opacity: 0.35 }}>Continue →</Button>
        }
      </Box>
    </Container>
  );
}