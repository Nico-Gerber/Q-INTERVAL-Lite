import React from 'react';
import { Box, Step, StepLabel, Stepper, Typography, Container } from '@mui/material';
import { Check } from '@mui/icons-material';

const CustomStepIcon = ({ active, completed, icon }) => (
  <Box sx={{
    width: 48,
    height: 48,
    borderRadius: 2,
    backgroundColor: active || completed ? 'primary.main' : 'rgba(255,255,255,0.07)',
    border: '2px solid',
    borderColor: active || completed ? 'primary.main' : 'rgba(255,255,255,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: active || completed ? 'primary.contrastText' : 'text.disabled',
    fontWeight: 700,
    fontSize: '1rem',
    boxShadow: active
      ? (theme) =>
          `0 0 0 5px ${theme.palette.primary.main}22,
           0 0 18px 4px ${theme.palette.primary.main}55`
      : completed
        ? (theme) => `0 0 8px 2px ${theme.palette.primary.main}33`
        : 'none',
    transition: 'all 0.3s ease',
  }}>
    {completed ? <Check sx={{ fontSize: '1.1rem' }} /> : icon}
  </Box>
);

const STEPS = [
  { label: 'Select Mode',   sub: 'Choose analysis type' },
  { label: 'Upload Images', sub: 'Add mammogram scans'  },
  { label: 'View Results',  sub: 'AI analysis results'  },
];

export default function AnalysisStepper({ activeStep }) {
  return (
    <Container maxWidth="sm" sx={{ pt: 3, pb: 2 }}>
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          '& .MuiStepConnector-root': {
            top: 24,
            left: 'calc(-50% + 32px)',
            right: 'calc(50% + 32px)',
          },
          '& .MuiStepConnector-line': {
            borderTopWidth: 2,
            borderColor: 'divider',
          },
          '& .MuiStepConnector-root.Mui-active .MuiStepConnector-line': {
            backgroundColor: 'primary.main',
            border: 'none',
            height: 2,
            boxShadow: (theme) =>
              `0 0 8px 2px ${theme.palette.primary.main}AA,
               0 0 16px 4px ${theme.palette.primary.main}55`,
          },
          '& .MuiStepConnector-root.Mui-completed .MuiStepConnector-line': {
            backgroundColor: 'primary.main',
            border: 'none',
            height: 2,
            boxShadow: (theme) =>
              `0 0 8px 2px ${theme.palette.primary.main}AA,
               0 0 16px 4px ${theme.palette.primary.main}55`,
          },
          '& .MuiStepLabel-label': {
            fontSize: '0.78rem',
            fontWeight: 600,
            color: 'text.disabled',
            mt: 0.75,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          },
          '& .MuiStepLabel-label.Mui-active': {
            color: 'text.primary',
            fontWeight: 700,
          },
          '& .MuiStepLabel-label.Mui-completed': {
            color: 'primary.main',
            fontWeight: 700,
          },
        }}
      >
        {STEPS.map(({ label, sub }, index) => {
          const isActive    = activeStep === index;
          const isCompleted = activeStep > index;
          return (
            <Step key={label}>
              <StepLabel
                StepIconComponent={CustomStepIcon}
                optional={
                  <Typography variant="caption" sx={{
                    fontSize: '0.72rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive
                      ? 'text.primary'
                      : isCompleted
                        ? 'primary.main'
                        : 'text.disabled',
                    transition: 'color 0.2s ease',
                  }}>
                    {sub}
                  </Typography>
                }
              >
                {label}
              </StepLabel>
            </Step>
          );
        })}
      </Stepper>
    </Container>
  );
}