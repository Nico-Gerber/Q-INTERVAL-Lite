import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Box, Container, Typography, TextField, Button, Alert, Chip } from '@mui/material';
import { supabase } from '../supabase/supabase';
import { useAuth } from '../supabase/AuthContext';
import NeuralCanvas from '../Components/Shared/NeuralCanvas';

function friendlyError(err) {
  const msg = (err?.message ?? '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already exists')) return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('password')) return 'That password was rejected. Choose a stronger password and try again.';
  if (msg.includes('rate limit') || err?.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Could not reach the server. Check your connection and try again.';
  return 'We could not create your account. Please try again.';
}

const EMPTY = { name: '', email: '', password: '', confirm: '', reason: '' };
const MIN_PASSWORD = 8;

function validate(f) {
  const errors = {};
  if (!f.name.trim()) errors.name = 'Full name is required.';
  if (!f.email.trim()) errors.email = 'Email is required.';
  else if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) errors.email = 'Enter a valid email address.';
  if (!f.password) errors.password = 'Password is required.';
  else if (f.password.length < MIN_PASSWORD) errors.password = `Password must be at least ${MIN_PASSWORD} characters.`;
  if (!f.confirm) errors.confirm = 'Please confirm your password.';
  else if (f.confirm !== f.password) errors.confirm = 'Passwords do not match.';
  if (!f.reason.trim()) errors.reason = 'Please tell us why you need access.';
  return errors;
}

export default function RequestAccess() {
  const { user, loading } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Signed in (e.g. right after signup with no email confirmation) → the route guards
  // send pending users to /awaiting-approval and approved users into the app.
  if (!loading && user) return <Navigate to="/Analysis" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!supabase) { setError('Sign up is unavailable right now.'); return; }
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setError(null);
    setSubmitting(true);
    try {
      // Role and status are never sent: the database trigger creates the profile as
      // 'pending' with no role, and only an administrator can change that.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { full_name: form.name.trim(), access_reason: form.reason.trim() } },
      });
      if (signUpError) throw signUpError;
      // With email confirmation on, an existing address returns a user with no identities.
      if (data.user && data.user.identities?.length === 0) {
        setError('An account with this email already exists. Try signing in instead.');
        return;
      }
      // Session present → AuthContext picks it up and the redirect above shows Awaiting Approval.
      if (!data.session) setNeedsEmailConfirm(true);
    } catch (err) {
      console.error('Signup failed:', err);
      setError(friendlyError(err));
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
      <Box sx={{
        position: 'absolute', top: '-40%', left: '50%',
        transform: 'translateX(-50%)', width: '500px', height: '500px',
        borderRadius: '50%',
        background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: (theme) =>
          `linear-gradient(${theme.palette.primary.main}${theme.palette.mode === 'dark' ? '07' : '14'} 1px, transparent 1px),
           linear-gradient(90deg, ${theme.palette.primary.main}${theme.palette.mode === 'dark' ? '07' : '14'} 1px, transparent 1px)`,
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
          <Box component="span" sx={{ display: 'block', color: 'text.primary', fontWeight: 700, fontSize: '1.15rem', mb: 0.5 }}>Create an Account</Box>
          Accounts require administrator approval before access to Q-INTERVAL is granted.
        </Typography>

        {needsEmailConfirm ? (
          <Alert severity="success">
            Account created. Check your inbox to confirm your email address, then sign in.
            An administrator must also approve your account before you can access Q-INTERVAL.
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Full name" value={form.name} required autoFocus autoComplete="name"
              onChange={set('name')} error={!!fieldErrors.name} helperText={fieldErrors.name} />
            <TextField label="Email" type="email" value={form.email} required autoComplete="email"
              onChange={set('email')} error={!!fieldErrors.email} helperText={fieldErrors.email} />
            <TextField label="Password" type="password" value={form.password} required autoComplete="new-password"
              onChange={set('password')} error={!!fieldErrors.password}
              helperText={fieldErrors.password || `At least ${MIN_PASSWORD} characters.`} />
            <TextField label="Confirm password" type="password" value={form.confirm} required autoComplete="new-password"
              onChange={set('confirm')} error={!!fieldErrors.confirm} helperText={fieldErrors.confirm} />
            <TextField label="Reason for access" value={form.reason} required multiline minRows={3}
              inputProps={{ maxLength: 1000 }}
              onChange={set('reason')} error={!!fieldErrors.reason} helperText={fieldErrors.reason} />
            <Button type="submit" variant="contained" disabled={submitting} sx={{ py: 1.2, fontWeight: 700 }}>
              {submitting ? 'Creating account…' : 'Create Account'}
            </Button>
          </Box>
        )}

        <Typography sx={{ color: 'text.secondary', mt: 3, fontSize: '0.85rem' }}>
          Already have an account? <Box component={Link} to="/login" sx={{ color: 'primary.main', fontWeight: 600, textDecoration: 'none' }}>Sign in</Box>
        </Typography>
      </Container>
    </Box>
  );
}
