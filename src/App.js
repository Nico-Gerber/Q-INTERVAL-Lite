import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import './App.css';

import Navigation from './components/Navigation';
import Footer from './components/Footer';
import Home from './pages/home';
import Models from './pages/models';
import OurTeam from './pages/ourteam';
import Analysis from './pages/analysis';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const theme = createTheme({
  palette: {
    mode: 'dark',

    // ── Core brand ──────────────────────────────────────────────────────
    // Teal — UI chrome only: nav, stepper, buttons, active states, branding
    primary: {
      main:         '#2DD4BF',
      light:        '#5EEAD4',
      dark:         '#14B8A6',
      contrastText: '#0B1120',
    },
    secondary: {
      main:         '#9333EA',
      light:        '#C084FC',
      dark:         '#7E22CE',
      contrastText: '#FFFFFF',
    },

    // ── Model type colours ──────────────────────────────────────────────
    // Used everywhere a CNN model is mentioned (columns, cards, labels)
    cnn: {
      main:         '#3B82F6',
      light:        '#93C5FD',
      dark:         '#1D4ED8',
      contrastText: '#FFFFFF',
    },
    // Used everywhere a QML model is mentioned — contrasts CNN intentionally
    qml: {
      main:         '#9333EA',
      light:        '#C084FC',
      dark:         '#7E22CE',
      contrastText: '#FFFFFF',
    },

    // ── Analysis mode colours ───────────────────────────────────────────
    // Classification — slate grey: industry standard, nothing flashy
    classification: {
      main:         '#94A3B8',
      light:        '#CBD5E1',
      dark:         '#64748B',
      contrastText: '#0B1120',
    },
    // Risk tab on Models page — amber: sits between orange and rose,
    // unifies Composite Risk and Sequential Risk under one concept
    risk: {
      main:         '#F59E0B',
      light:        '#FCD34D',
      dark:         '#B45309',
      contrastText: '#0B1120',
    },
    // Composite Risk Assessment mode — orange: immediate, weighted scoring
    compositeRisk: {
      main:         '#F97316',
      light:        '#FDBA74',
      dark:         '#C2410C',
      contrastText: '#0B1120',
    },
    // Sequential Future Risk mode — rose: forward-looking, predictive urgency
    sequentialRisk: {
      main:         '#F43F5E',
      light:        '#FDA4AF',
      dark:         '#BE123C',
      contrastText: '#FFFFFF',
    },

    // ── Status colours ──────────────────────────────────────────────────
    // Active · Improving — warm orange (reuses compositeRisk family feel)
    improving: {
      main:         '#FB923C',
      light:        '#FDBA74',
      dark:         '#EA580C',
      contrastText: '#0B1120',
    },
    // Coming Soon — muted slate
    comingSoon: {
      main:         '#64748B',
      light:        '#94A3B8',
      dark:         '#475569',
      contrastText: '#FFFFFF',
    },

    // ── Standard MUI ───────────────────────────────────────────────────
    success: { main: '#2DD4BF' },
    error: {
      main:         '#EF4444',
      light:        '#FCA5A5',
      dark:         '#B91C1C',
      contrastText: '#FFFFFF',
    },
    warning: {
      main:         '#FBBF24',
      light:        '#FDE68A',
      dark:         '#D97706',
      contrastText: '#0B1120',
    },

    // ── Surface ─────────────────────────────────────────────────────────
    background: {
      default: '#0B1120',
      paper:   '#111C2E',
      hero:    'linear-gradient(160deg, #0B1120 0%, #0F1A2E 55%, #0B1120 100%)',
    },
    text: {
      primary:   '#E8EEF8',
      secondary: '#d7deef',
      disabled:  '#4A5568',
    },
    divider: 'rgba(255,255,255,0.07)',
  },

  typography: {
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontWeight: 700, letterSpacing: '-0.01em' },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    body1: { fontWeight: 400 },
    body2: { fontWeight: 400 },
  },

  shape: { borderRadius: 12 },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { fontFamily: '"Plus Jakarta Sans", sans-serif', backgroundColor: '#0B1120', color: '#E8EEF8' },
        '*': { fontFamily: '"Plus Jakarta Sans", sans-serif' },
        '*::-webkit-scrollbar': { width: '6px' },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '*::-webkit-scrollbar-thumb': { background: 'rgba(45,212,191,0.2)', borderRadius: '3px' },
        '*::-webkit-scrollbar-thumb:hover': { background: 'rgba(45,212,191,0.35)' },
      },
    },
    MuiTypography: { styleOverrides: { root: { fontFamily: '"Plus Jakarta Sans", sans-serif' } } },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, borderRadius: '999px', fontFamily: '"Plus Jakarta Sans", sans-serif' },
        containedPrimary: {
          background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
          color: '#0B1120',
          boxShadow: '0 0 20px rgba(45,212,191,0.22)',
          '&:hover': { background: 'linear-gradient(135deg, #5EEAD4, #2DD4BF)', boxShadow: '0 0 28px rgba(45,212,191,0.32)' },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.15)', color: '#E8EEF8',
          '&:hover': { borderColor: '#2DD4BF', backgroundColor: 'rgba(45,212,191,0.06)' },
        },
        text: {
          color: '#8A96B0',
          '&:hover': { color: '#2DD4BF', backgroundColor: 'rgba(45,212,191,0.06)' },
        },
      },
    },
    MuiInputBase: { styleOverrides: { root: { fontFamily: '"Plus Jakarta Sans", sans-serif' } } },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: '#111C2E', border: '1px solid rgba(255,255,255,0.07)' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', backgroundColor: 'rgba(11,17,32,0.92)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)', boxShadow: 'none',
        },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: '999px', fontFamily: '"Plus Jakarta Sans", sans-serif' } } },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', fontWeight: 600, borderRadius: '10px !important',
          border: '1px solid rgba(255,255,255,0.08) !important', color: '#8A96B0',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          '&.Mui-selected': { color: '#2DD4BF', backgroundColor: 'rgba(45,212,191,0.1)', borderColor: '#2DD4BF !important' },
          '&:hover': { backgroundColor: 'rgba(45,212,191,0.06)' },
        },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: 'rgba(255,255,255,0.07)' } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10, fontFamily: '"Plus Jakarta Sans", sans-serif' },
        standardSuccess: { backgroundColor: 'rgba(45,212,191,0.08)', color: '#2DD4BF' },
        standardError:   { backgroundColor: 'rgba(239,68,68,0.1)',   color: '#EF4444' },
        standardWarning: { backgroundColor: 'rgba(251,191,36,0.08)', color: '#FBBF24' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: '#111C2E', backgroundImage: 'none', border: '1px solid rgba(255,255,255,0.08)' },
      },
    },
    MuiStepper: {
      styleOverrides: {
        root: {
          '& .MuiStepIcon-root.Mui-active':    { color: '#2DD4BF' },
          '& .MuiStepIcon-root.Mui-completed': { color: '#2DD4BF' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', backgroundColor: '#111C2E',
          border: '1px solid rgba(255,255,255,0.07)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:hover': { borderColor: 'rgba(45,212,191,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: '10px', backgroundColor: '#111C2E', fontFamily: '"Plus Jakarta Sans", sans-serif',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2DD4BF', boxShadow: '0 0 0 3px rgba(45,212,191,0.12)' },
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
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
  );
}

export default App;