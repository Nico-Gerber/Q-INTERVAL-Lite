import React from 'react';
import {
  Box, Step, StepLabel, Stepper, Typography, Container
} from '@mui/material';
import { Check } from '@mui/icons-material';

const CustomStepIcon = ({ active, completed, icon }) => (
  <Box sx={{
    width: 52,
    height: 52,
    borderRadius: '50%',
    backgroundColor: active || completed
      ? '#2DD4BF'
      : 'rgba(255,255,255,0.1)',
    border: active
      ? '2px solid #2DD4BF'
      : completed
        ? '2px solid #2DD4BF'
        : '2px solid rgba(255,255,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: active || completed ? '#13121A' : 'rgba(255,255,255,0.5)',
    fontWeight: 700,
    fontSize: '1.1rem',
    boxShadow: active
      ? `0 0 0 6px rgba(45,212,191,0.2),
         0 0 12px 4px rgba(45,212,191,0.45),
         0 0 28px 10px rgba(45,212,191,0.2),
         inset 0 1px 3px rgba(255,255,255,0.2)`
      : completed
        ? `0 0 8px 2px rgba(45,212,191,0.3)`
        : 'none',
    transition: 'box-shadow 0.3s ease, background-color 0.3s ease',
  }}>
    {completed
      ? <Check sx={{ color: '#13121A', fontSize: '1.5rem' }} />
      : icon
    }
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
          '& .MuiStepConnector-root': {
            top: 26,
            left: 'calc(-50% + 36px)',
            right: 'calc(50% + 36px)',
          },
          '& .MuiStepConnector-line': {
            borderTopWidth: 2,
            borderColor: 'rgba(255,255,255,0.15)',
          },
          '& .MuiStepConnector-root.Mui-active .MuiStepConnector-line': {
            backgroundColor: '#2DD4BF',
            border: 'none',
            height: 2,
            boxShadow: `
              0 0 6px 2px rgba(45,212,191,0.7),
              0 0 14px 4px rgba(45,212,191,0.35)
            `,
          },
          '& .MuiStepConnector-root.Mui-completed .MuiStepConnector-line': {
            backgroundColor: '#2DD4BF',
            border: 'none',
            height: 2,
            boxShadow: `
              0 0 6px 2px rgba(45,212,191,0.7),
              0 0 14px 4px rgba(45,212,191,0.35)
            `,
          },
          '& .MuiStepLabel-label': {
            fontSize: '1rem',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.45)',
            mt: 0.5,
          },
          '& .MuiStepLabel-label.Mui-active': {
            color: 'white',
            fontWeight: 700,
          },
          '& .MuiStepLabel-label.Mui-completed': {
            color: '#2DD4BF',
            fontWeight: 600,
          },
        }}
      >
        {STEPS.map(({ label, sub }) => (
          <Step key={label}>
            <StepLabel
              StepIconComponent={CustomStepIcon}
              optional={
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px' }}>
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