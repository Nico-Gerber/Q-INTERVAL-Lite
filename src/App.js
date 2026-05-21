import React, { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import './App.css';

import Navigation from './components/Navigation';
import Footer from './components/Footer';
import Home from './pages/home';
import Models from './pages/models';
import OurTeam from './pages/ourteam';
import Analysis from './pages/analysis';

export const ColorModeContext = createContext({ toggleColorMode: () => {}, mode: 'dark' });
export const useColorMode = () => useContext(ColorModeContext);

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// ── Shared across both themes ──────────────────────────────────────────────
const sharedPalette = {
  secondary:      { main: '#9333EA', light: '#C084FC', dark: '#7E22CE', contrastText: '#FFFFFF' },
  cnn:            { main: '#3B82F6', light: '#93C5FD', dark: '#1D4ED8', contrastText: '#FFFFFF' },
  qml:            { main: '#9333EA', light: '#C084FC', dark: '#7E22CE', contrastText: '#FFFFFF' },
  classification: { main: '#94A3B8', light: '#CBD5E1', dark: '#64748B', contrastText: '#0B1120' },
  risk:           { main: '#F59E0B', light: '#FCD34D', dark: '#B45309', contrastText: '#0B1120' },
  compositeRisk:  { main: '#F97316', light: '#FDBA74', dark: '#C2410C', contrastText: '#0B1120' },
  sequentialRisk: { main: '#F43F5E', light: '#FDA4AF', dark: '#BE123C', contrastText: '#FFFFFF' },
  improving:      { main: '#FB923C', light: '#FDBA74', dark: '#EA580C', contrastText: '#0B1120' },
  comingSoon:     { main: '#64748B', light: '#94A3B8', dark: '#475569', contrastText: '#FFFFFF' },
  error:          { main: '#EF4444', light: '#FCA5A5', dark: '#B91C1C', contrastText: '#FFFFFF' },
  warning:        { main: '#FBBF24', light: '#FDE68A', dark: '#D97706', contrastText: '#0B1120' },
};

const sharedTypography = {
  fontFamily: '"Plus Jakarta Sans", sans-serif',
  h1: { fontWeight: 700, letterSpacing: '-0.02em' },
  h2: { fontWeight: 700, letterSpacing: '-0.02em' },
  h3: { fontWeight: 700, letterSpacing: '-0.01em' },
  h4: { fontWeight: 700 },
  h5: { fontWeight: 600 },
  h6: { fontWeight: 600 },

};

const sharedShape = { borderRadius: 12 };

const sharedComponents = (isDark) => ({
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        backgroundColor: isDark ? '#0B1120' : '#D8DEF0',
        color: isDark ? '#E8EEF8' : '#0F1923',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        overflowX: 'hidden',
      },
      '*': { fontFamily: '"Plus Jakarta Sans", sans-serif' },
      '*::-webkit-scrollbar': { width: '6px' },
      '*::-webkit-scrollbar-track': { background: 'transparent' },
      '*::-webkit-scrollbar-thumb': { background: isDark ? 'rgba(45,212,191,0.2)' : 'rgba(13,148,136,0.35)', borderRadius: '3px' },
      '*::-webkit-scrollbar-thumb:hover': { background: isDark ? 'rgba(45,212,191,0.35)' : 'rgba(13,148,136,0.55)' },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: { textTransform: 'none', fontWeight: 600, borderRadius: '999px', fontFamily: '"Plus Jakarta Sans", sans-serif' },
      containedPrimary: {
        background: isDark
          ? 'linear-gradient(135deg, #2DD4BF, #14B8A6)'
          : 'linear-gradient(135deg, #0D9488, #0F766E)',
        color: isDark ? '#0B1120' : '#FFFFFF',
        boxShadow: isDark ? '0 0 20px rgba(45,212,191,0.22)' : '0 0 20px rgba(13,148,136,0.3)',
        '&:hover': {
          background: isDark
            ? 'linear-gradient(135deg, #5EEAD4, #2DD4BF)'
            : 'linear-gradient(135deg, #14B8A6, #0D9488)',
          boxShadow: isDark ? '0 0 28px rgba(45,212,191,0.32)' : '0 0 28px rgba(13,148,136,0.45)',
        },
      },
      outlined: {
        borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,25,35,0.2)',
        color: isDark ? '#E8EEF8' : '#0F1923',
        '&:hover': { borderColor: isDark ? '#2DD4BF' : '#0D9488', backgroundColor: isDark ? 'rgba(45,212,191,0.06)' : 'rgba(13,148,136,0.06)' },
      },
      text: {
        color: isDark ? '#8A96B0' : '#2A3A50',
        '&:hover': { color: isDark ? '#2DD4BF' : '#0D9488', backgroundColor: isDark ? 'rgba(45,212,191,0.06)' : 'rgba(13,148,136,0.06)' },
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
        backgroundColor: isDark ? '#111C2E' : '#E4E9F5',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,25,35,0.1)'}`,
        boxShadow: isDark ? 'none' : '0 1px 4px rgba(15,25,35,0.08)',
      },
    },
  },
  MuiAppBar: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
        backgroundColor: 'rgba(11,17,32,0.95)', // always dark nav
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)', boxShadow: 'none',
      },
    },
  },
  MuiChip: { styleOverrides: { root: { borderRadius: '999px', fontFamily: '"Plus Jakarta Sans", sans-serif' } } },
  MuiDivider: { styleOverrides: { root: { borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,25,35,0.12)' } } },
  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: 10 },
      standardSuccess: { backgroundColor: isDark ? 'rgba(45,212,191,0.08)' : 'rgba(13,148,136,0.1)', color: isDark ? '#2DD4BF' : '#0D9488' },
      standardError:   { backgroundColor: isDark ? 'rgba(239,68,68,0.1)'   : 'rgba(239,68,68,0.08)',  color: isDark ? '#EF4444' : '#DC2626' },
      standardWarning: { backgroundColor: isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.1)',  color: isDark ? '#FBBF24' : '#D97706' },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
        backgroundColor: isDark ? '#111C2E' : '#E4E9F5',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,25,35,0.1)'}`,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          borderColor: isDark ? 'rgba(45,212,191,0.25)' : 'rgba(13,148,136,0.4)',
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.35)' : '0 6px 24px rgba(15,25,35,0.12)',
        },
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: '10px',
        backgroundColor: isDark ? '#111C2E' : '#E4E9F5',
        '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,25,35,0.15)' },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,25,35,0.3)' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#2DD4BF' : '#0D9488', boxShadow: `0 0 0 3px ${isDark ? 'rgba(45,212,191,0.12)' : 'rgba(13,148,136,0.12)'}` },
      },
    },
  },
  MuiStepper: {
    styleOverrides: {
      root: {
        '& .MuiStepIcon-root.Mui-active':    { color: isDark ? '#2DD4BF' : '#0D9488' },
        '& .MuiStepIcon-root.Mui-completed': { color: isDark ? '#2DD4BF' : '#0D9488' },
      },
    },
  },
});

// ── Dark theme ─────────────────────────────────────────────────────────────
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    ...sharedPalette,
    primary: { main: '#2DD4BF', light: '#5EEAD4', dark: '#14B8A6', contrastText: '#0B1120' },
    success: { main: '#2DD4BF' },
    background: {
      default: '#0B1120',
      paper:   '#111C2E',
      // Hero tokens — used directly in home.jsx
      heroGradient: 'linear-gradient(160deg, #0B1120 0%, #0F1A2E 55%, #0B1120 100%)',
      heroGlow:     'radial-gradient(circle, rgba(45,212,191,0.10) 0%, transparent 70%)',
      heroGrid:     'rgba(45,212,191,0.06)',
      heroStatsBg:  'rgba(0,0,0,0.35)',
      heroStatsBorder: 'rgba(255,255,255,0.08)',
    },
    text: {
      primary:   '#E8EEF8',
      // Bumped from #8A96B0 — was too faint, now clearly legible
      secondary: '#A0AABE',
      disabled:  '#4A5568',
    },
    divider: 'rgba(255,255,255,0.07)',
  },
  typography: sharedTypography,
  shape: sharedShape,
  components: sharedComponents(true),
});

// ── Light theme ────────────────────────────────────────────────────────────
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    ...sharedPalette,
    primary: { main: '#0D9488', light: '#2DD4BF', dark: '#0F766E', contrastText: '#FFFFFF' },
    success: { main: '#0D9488' },
    background: {
      default: '#D8DEF0',
      paper:   '#E4E9F5',
      // Hero is now fully light in light mode
      heroGradient: 'linear-gradient(160deg, #E8F4F2 0%, #F0FBF9 50%, #E4EEF8 100%)',
      heroGlow:     'radial-gradient(circle, rgba(13,148,136,0.18) 0%, transparent 70%)',
      heroGrid:     'rgba(13,148,136,0.08)',
      heroStatsBg:  'rgba(0,0,0,0.45)',
      heroStatsBorder: 'rgba(0,0,0,0.18)',
    },
    text: {
      primary:   '#0F1923',
      // Bumped from #2A3A50 — darker, clearly readable body text
      secondary: '#1E3048',
      disabled:  '#7A8FA8',
    },
    divider: 'rgba(15,25,35,0.12)',
  },
  typography: sharedTypography,
  shape: sharedShape,
  components: sharedComponents(false),
});

function App() {
  // Read saved preference on first load, default to dark
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('colorMode') || 'dark'; }
    catch { return 'dark'; }
  });

  const colorMode = useMemo(() => ({
    mode,
    toggleColorMode: () => setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('colorMode', next); } catch {}
      return next;
    }),
  }), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={mode === 'dark' ? darkTheme : lightTheme}>
        <CssBaseline />
        <ScrollToTop />
        <div className="app-root">
          <Navigation />
          <Routes>
            <Route path="/"         element={<Home />} />
            <Route path="/Models"   element={<Models />} />
            <Route path="/OurTeam"  element={<OurTeam />} />
            <Route path="/Analysis" element={<Analysis />} />
          </Routes>
          <Footer />
        </div>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export default App;