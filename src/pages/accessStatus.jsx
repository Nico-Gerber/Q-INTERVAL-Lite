import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, Container, Typography, Button, Alert } from '@mui/material';
import { useAuth } from '../supabase/AuthContext';
import { RequireAuth } from '../supabase/RouteGuards';
import NeuralCanvas from '../Components/Shared/NeuralCanvas';

const COPY = {
  pending: {
    title: 'Awaiting Approval',
    body: [
      'Your account has been created successfully.',
      'An administrator must approve your account before you can access Q-INTERVAL.',
    ],
  },
  rejected: {
    title: 'Access Request Rejected',
    body: [
      'Your request for access to Q-INTERVAL was not approved.',
      'If you believe this is a mistake, please contact an administrator.',
    ],
  },
};

function AccessStatusContent({ variant }) {
  const { profile, signOut, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  // Already in the right state for this page? Otherwise route to wherever the status says.
  if (profile?.status === 'approved' && profile.role) return <Navigate to="/Analysis" replace />;
  if (profile?.status === 'rejected' && variant !== 'rejected') return <Navigate to="/access-rejected" replace />;
  if (profile?.status !== 'rejected' && variant === 'rejected') return <Navigate to="/awaiting-approval" replace />;

  const copy = COPY[variant];

  const check = async () => {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  };

  return (
    <Box sx={{
      minHeight: '100vh', position: 'relative', overflow: 'clip',
      display: 'flex', alignItems: 'center',
      background: (theme) => theme.palette.background.hero,
    }}>
      <NeuralCanvas />
      <Container maxWidth="xs" sx={{ position: 'relative', zIndex: 1, py: 8, textAlign: 'center' }}>
        <Typography variant="h3" sx={{
          fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary',
          mb: 2, fontSize: { xs: '1.75rem', md: '2.25rem' },
        }}>
          {copy.title}
        </Typography>

        <Alert severity={variant === 'rejected' ? 'error' : 'warning'} sx={{ mb: 3, textAlign: 'left' }}>
          {copy.body.map((line) => <Typography key={line} sx={{ fontSize: '0.95rem' }}>{line}</Typography>)}
        </Alert>

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
          {variant === 'pending' && (
            <Button variant="contained" onClick={check} disabled={checking} sx={{ fontWeight: 700 }}>
              {checking ? 'Checking…' : 'Check status'}
            </Button>
          )}
          <Button variant="outlined" onClick={signOut}>Sign out</Button>
        </Box>
      </Container>
    </Box>
  );
}

export default function AccessStatus({ variant }) {
  return <RequireAuth><AccessStatusContent variant={variant} /></RequireAuth>;
}
