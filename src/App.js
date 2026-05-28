import React, { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import './App.css';

import Navigation from './Components/Navigation/Navbar';
import Footer from './Components/Navigation/Footer';
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
        backgroundColor: isDark ? '#0D1B2E' : '#E8F6FA',
        color: isDark ? '#F0F9FF' : '#0C1E2A',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        overflowX: 'hidden',
      },
      '*': { fontFamily: '"Plus Jakarta Sans", sans-serif' },
      '*::-webkit-scrollbar': { width: '6px' },
      '*::-webkit-scrollbar-track': { background: 'transparent' },
      '*::-webkit-scrollbar-thumb': { background: isDark ? 'rgba(34,211,238,0.2)' : 'rgba(14,116,144,0.3)', borderRadius: '3px' },
      '*::-webkit-scrollbar-thumb:hover': { background: isDark ? 'rgba(34,211,238,0.35)' : 'rgba(14,116,144,0.5)' },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: { textTransform: 'none', fontWeight: 600, borderRadius: '999px', fontFamily: '"Plus Jakarta Sans", sans-serif' },
      containedPrimary: {
        background: isDark
          ? 'linear-gradient(135deg, #22D3EE, #0891B2)'
          : 'linear-gradient(135deg, #0891B2, #0E7490)',
        color: '#FFFFFF',
        boxShadow: isDark ? '0 0 20px rgba(34,211,238,0.22)' : '0 0 20px rgba(8,145,178,0.28)',
        '&:hover': {
          background: isDark
            ? 'linear-gradient(135deg, #67E8F9, #22D3EE)'
            : 'linear-gradient(135deg, #22D3EE, #0891B2)',
          boxShadow: isDark ? '0 0 28px rgba(34,211,238,0.32)' : '0 0 28px rgba(8,145,178,0.4)',
        },
      },
      outlined: {
        borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(8,145,178,0.35)',
        color: isDark ? '#F0F9FF' : '#0C1E2A',
        '&:hover': { borderColor: isDark ? '#22D3EE' : '#0891B2', backgroundColor: isDark ? 'rgba(34,211,238,0.06)' : 'rgba(8,145,178,0.06)' },
      },
      text: {
        color: isDark ? '#8BAFC4' : '#2C5A6E',
        '&:hover': { color: isDark ? '#22D3EE' : '#0891B2', backgroundColor: isDark ? 'rgba(34,211,238,0.06)' : 'rgba(8,145,178,0.06)' },
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
        backgroundColor: isDark ? '#112038' : '#DAF0F7',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(8,145,178,0.12)'}`,
        boxShadow: isDark ? 'none' : '0 1px 4px rgba(8,145,178,0.06)',
      },
    },
  },
  MuiAppBar: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
        backgroundColor: 'rgba(5,14,24,0.96)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)', boxShadow: 'none',
      },
    },
  },
  MuiChip: { styleOverrides: { root: { borderRadius: '999px', fontFamily: '"Plus Jakarta Sans", sans-serif' } } },
  MuiDivider: { styleOverrides: { root: { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(8,145,178,0.14)' } } },
  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: 10 },
      standardSuccess: { backgroundColor: isDark ? 'rgba(34,211,238,0.08)' : 'rgba(8,145,178,0.1)', color: isDark ? '#22D3EE' : '#0891B2' },
      standardError:   { backgroundColor: isDark ? 'rgba(239,68,68,0.1)'   : 'rgba(239,68,68,0.08)',  color: isDark ? '#EF4444' : '#DC2626' },
      standardWarning: { backgroundColor: isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.1)',  color: isDark ? '#FBBF24' : '#D97706' },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
        backgroundColor: isDark ? '#112038' : '#DAF0F7',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(8,145,178,0.12)'}`,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          borderColor: isDark ? 'rgba(34,211,238,0.3)' : 'rgba(8,145,178,0.4)',
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.35)' : '0 6px 24px rgba(8,145,178,0.1)',
        },
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: '10px',
        backgroundColor: isDark ? '#112038' : '#DAF0F7',
        '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(8,145,178,0.18)' },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(8,145,178,0.35)' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#22D3EE' : '#0891B2', boxShadow: `0 0 0 3px ${isDark ? 'rgba(34,211,238,0.12)' : 'rgba(8,145,178,0.12)'}` },
      },
    },
  },
  MuiStepper: {
    styleOverrides: {
      root: {
        '& .MuiStepIcon-root.Mui-active':    { color: isDark ? '#22D3EE' : '#0891B2' },
        '& .MuiStepIcon-root.Mui-completed': { color: isDark ? '#22D3EE' : '#0891B2' },
      },
    },
  },
});

// ── Dark theme — Deep Ocean ────────────────────────────────────────────────
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    ...sharedPalette,
    primary: { main: '#22D3EE', light: '#67E8F9', dark: '#0891B2', contrastText: '#050E18' },
    success: { main: '#22D3EE' },
    background: {
      default: '#0D1B2E',
      paper:   '#112038',
      heroGradient: 'linear-gradient(160deg, #0D1B2E 0%, #112038 55%, #0D1B2E 100%)',
      hero:         'linear-gradient(160deg, #0D1B2E 0%, #112038 55%, #0D1B2E 100%)',
      heroGlow:     'radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 70%)',
      heroGrid:     'rgba(34,211,238,0.05)',
      heroStatsBg:  '#071020',
      heroStatsBorder: 'rgba(255,255,255,0.22)',
    },
    text: {
      primary:   '#F0F9FF',
      secondary: '#8BAFC4',
      disabled:  '#4A6A80',
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  typography: sharedTypography,
  shape: sharedShape,
  components: sharedComponents(true),
});

// ── Light theme — Deep Ocean ───────────────────────────────────────────────
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    ...sharedPalette,
    primary: { main: '#0891B2', light: '#22D3EE', dark: '#0E7490', contrastText: '#FFFFFF' },
    success: { main: '#0891B2' },
    background: {
      default: '#E8F6FA',
      paper:   '#DAF0F7',
      heroGradient: 'linear-gradient(160deg, #E8F6FA 0%, #F0FBFF 50%, #E8F6FA 100%)',
      hero:         'linear-gradient(160deg, #E8F6FA 0%, #F0FBFF 50%, #E8F6FA 100%)',
      heroGlow:     'radial-gradient(circle, rgba(8,145,178,0.14) 0%, transparent 70%)',
      heroGrid:     'rgba(8,145,178,0.07)',
      heroStatsBg:  '#0E7490',
      heroStatsBorder: 'rgba(255,255,255,0.22)',
    },
    text: {
      primary:   '#0C1E2A',
      secondary: '#2C5A6E',
      disabled:  '#5A8A9E',
    },
    divider: 'rgba(8,145,178,0.14)',
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