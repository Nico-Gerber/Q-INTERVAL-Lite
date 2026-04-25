import React from 'react';
import {
  Box, Step, StepLabel, Stepper, Typography, Container
} from '@mui/material';
import { Check } from '@mui/icons-material';

const CustomStepIcon = ({ active, completed, icon }) => (
  <Box sx={{
    width: 60,
    height: 60,
    borderRadius: '50%',
    backgroundColor: active || completed
      ? '#64B5F6'
      : 'rgba(255,255,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: 700,
    fontSize: '1.2rem',
    boxShadow: active
      ? `0 0 0 6px rgba(100,181,246,0.25),
         0 0 12px 4px rgba(100,181,246,0.55),
         0 0 28px 10px rgba(100,181,246,0.25),
         inset 0 1px 3px rgba(255,255,255,0.3)`
      : 'none',
    transition: 'box-shadow 0.3s ease, background-color 0.3s ease',
  }}>
    {completed ? <Check sx={{ color: 'white', fontSize: '1.8rem' }} /> : icon}
  </Box>
);

const STEPS = [
  { label: 'Select Mode', sub: 'Choose analysis type' },
  { label: 'Upload Images', sub: 'Add mammogram scans' },
  { label: 'View Results', sub: 'AI analysis results' },
];

export default function AnalysisStepper({ activeStep }) {
  return (
    <Container maxWidth="lg" sx={{ py: '3rem' }}>
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          '& .MuiStepConnector-root': { top: 30, left: 'calc(-50% + 40px)', right: 'calc(50% + 40px)' },
          '& .MuiStepConnector-line': { borderTopWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
          '& .MuiStepConnector-root.Mui-active .MuiStepConnector-line': {
            backgroundColor: '#64B5F6',
            boxShadow: `
    0 0 6px 2px rgba(100,181,246,0.8),
    0 0 14px 4px rgba(100,181,246,0.4)
  `,
          },
          '& .MuiStepConnector-root.Mui-completed .MuiStepConnector-line': {
            backgroundColor: '#64B5F6',
            boxShadow: `
    0 0 6px 2px rgba(100,181,246,0.8),
    0 0 14px 4px rgba(100,181,246,0.4)
  `,
          },
          '& .MuiStepLabel-label': { fontSize: '1.2rem', fontWeight: 0, color: 'white' },
          '& .MuiStepLabel-label.Mui-active': { color: 'white', fontWeight: 1000, },
          '& .MuiStepLabel-label.Mui-completed': { color: 'white' },
        }}
      >
        {STEPS.map(({ label, sub }) => (
          <Step key={label}>
            <StepLabel
              StepIconComponent={CustomStepIcon}
              optional={
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px' }}>
                  {sub}
                </Typography>
              }
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Container>
  );
}