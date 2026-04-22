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
    mode: 'light',
    primary: { main: '#1565C0' },   // Medical blue – classical AI
    secondary: { main: '#6A0DAD' },   // Deep violet – quantum AI
    background: { default: '#EEF2F7', paper: '#FFFFFF' },
    text: { primary: '#0D1B2A', secondary: '#546E7A' },
    success: { main: '#2E7D32' },
    error: { main: '#C62828' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
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
          <Route path="/" element={<Home />} />
          <Route path="/Models" element={<Models />} />
          <Route path="/OurTeam" element={<OurTeam />} />
          <Route path="/Analysis" element={<Analysis />} />

        </Routes>
        <Footer />
      </div>
    </ThemeProvider>
  );
}

export default App;
