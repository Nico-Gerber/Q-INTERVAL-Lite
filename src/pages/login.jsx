import React, { useState } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { Box, Container, Typography, TextField, Button, Alert, Chip } from '@mui/material';
import { supabase } from '../supabase/supabase';
import { useAuth } from '../supabase/AuthContext';
import NeuralCanvas from '../Components/Shared/NeuralCanvas';

export default function Login() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const from = location.state?.from ?? '/Analysis';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err?.message ?? 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh', position: 'relative', overflow: 'clip',
      display: 'flex', alignItems: 'center',
      background: (theme) => theme.palette.background.hero,
    }}>
      <NeuralCanvas />

      {/* Radial glow — matches analysis.jsx */}
      <Box sx={{
        position: 'absolute', top: '-40%', left: '50%',
        transform: 'translateX(-50%)', width: '500px', height: '500px',
        borderRadius: '50%',
        background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Grid overlay — matches analysis.jsx */}
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: (theme) =>
          `linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px),
           linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />

      <Container maxWidth="xs" sx={{ position: 'relative', zIndex: 1, py: 8 }}>
        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{
            mb: 2.5, bgcolor: (theme) => `${theme.palette.error.main}18`, color: 'error.main',
            letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700,
            border: '1px solid', borderColor: (theme) => `${theme.palette.error.main}35`,
            borderRadius: '999px',
          }}
        />

        <Typography variant="h3" sx={{
          fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary',
          mb: 1.5, fontSize: { xs: '2rem', md: '2.5rem' },
        }}>
          Mammo
          <Box component="span" sx={{ color: 'primary.main', fontStyle: 'italic' }}>
            Analysis
          </Box>
        </Typography>

        <Typography sx={{ color: 'text.secondary', mb: 4, fontSize: '0.95rem' }}>
          Clinician sign in — accounts are provisioned by an administrator, there is no self-registration.
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Email" type="email" value={email} required autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password" type="password" value={password} required
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="contained" disabled={submitting} sx={{ py: 1.2, fontWeight: 700 }}>
            {submitting ? 'Signing in…' : 'Sign In'}
          </Button>
        </Box>

        <Typography sx={{ color: 'text.secondary', mt: 3, fontSize: '0.85rem' }}>
          Don't have an account? <Box component={Link} to="/request-access" sx={{ color: 'primary.main', fontWeight: 600, textDecoration: 'none' }}>Request access</Box>
        </Typography>
      </Container>
    </Box>
  );
}
