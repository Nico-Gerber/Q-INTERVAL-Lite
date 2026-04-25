import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import './App.css';

import Navigation from './components/Navigation';
import Footer from './components/Footer';
import Home from './pages/home';
import Models from './pages/models';
import OurTeam from './pages/ourteam';
import Analysis from './pages/analysis';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#00D4A0' },        // teal accent
    secondary: { main: '#7C3AED' },       // violet – quantum AI
    background: {
      default: '#0A0F1A',                 // deep navy
      paper: '#111827',                   // card surfaces
    },
    text: {
      primary: '#F0F6FF',
      secondary: '#8B9CB8',
    },
    success: { main: '#00D4A0' },
    error:   { main: '#FF4D6A' },
    divider: 'rgba(255,255,255,0.07)',
  },
  typography: {
    fontFamily: '"DM Sans", "Inter", "Helvetica Neue", sans-serif',
    h1: { fontWeight: 900, letterSpacing: '-0.03em' },
    h2: { fontWeight: 800, letterSpacing: '-0.02em' },
    h3: { fontWeight: 800, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: '999px',
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #00D4A0, #00A87E)',
          color: '#0A0F1A',
          boxShadow: '0 0 20px rgba(0,212,160,0.3)',
          '&:hover': {
            background: 'linear-gradient(135deg, #00E8B0, #00C490)',
            boxShadow: '0 0 28px rgba(0,212,160,0.45)',
          },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.15)',
          color: '#F0F6FF',
          '&:hover': {
            borderColor: '#00D4A0',
            backgroundColor: 'rgba(0,212,160,0.06)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#111827',
          border: '1px solid rgba(255,255,255,0.07)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(10,15,26,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '999px',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: '10px !important',
          border: '1px solid rgba(255,255,255,0.1) !important',
          color: '#8B9CB8',
          '&.Mui-selected': {
            color: '#00D4A0',
            backgroundColor: 'rgba(0,212,160,0.1)',
            borderColor: '#00D4A0 !important',
          },
          '&:hover': {
            backgroundColor: 'rgba(0,212,160,0.06)',
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255,255,255,0.07)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#111827',
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.1)',
        },
      },
    },
    MuiStepper: {
      styleOverrides: {
        root: {
          '& .MuiStepIcon-root.Mui-active': { color: '#00D4A0' },
          '& .MuiStepIcon-root.Mui-completed': { color: '#00D4A0' },
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
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
