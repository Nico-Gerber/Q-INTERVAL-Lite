import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { useAuth } from './AuthContext';

function Centered({ children }) {
  return (
    <Box sx={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center', px: 2 }}>
      {children}
    </Box>
  );
}

// Logged in (any approval state). Unauthenticated → /login.
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Centered><CircularProgress size={28} /></Centered>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

// Logged in AND approved. pending → /awaiting-approval, rejected → /access-rejected.
export function RequireApprovedUser({ children }) {
  const { profile, profileError, refreshProfile, signOut } = useAuth();

  return (
    <RequireAuth>
      {profileError ? (
        <Centered>
          <Alert severity="error">{profileError}</Alert>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" onClick={refreshProfile}>Retry</Button>
            <Button variant="outlined" onClick={signOut}>Sign out</Button>
          </Box>
        </Centered>
      ) : profile?.status === 'approved' && profile.role ? (
        children
      ) : profile?.status === 'rejected' ? (
        <Navigate to="/access-rejected" replace />
      ) : (
        // pending, or no profile row yet — never grant access by default
        <Navigate to="/awaiting-approval" replace />
      )}
    </RequireAuth>
  );
}

// Approved AND role === 'admin'.
export function RequireAdmin({ children }) {
  const { profile } = useAuth();
  return (
    <RequireApprovedUser>
      {profile?.role === 'admin' ? children : <Navigate to="/Analysis" replace />}
    </RequireApprovedUser>
  );
}
