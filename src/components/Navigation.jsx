import React, { useState } from 'react';
import {
  AppBar, Toolbar, Typography, Button, Box,
  IconButton, Drawer, List, ListItem, ListItemButton,
  ListItemText, Divider, useMediaQuery, useTheme,
} from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { label: 'Home',     path: '/' },
  { label: 'Models',   path: '/Models' },
  { label: 'Our Team', path: '/OurTeam' },
];

const ECGIcon = () => (
  <Box sx={{ width: 34, height: 34, borderRadius: '9px', background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 14px rgba(45,212,191,0.3)', flexShrink: 0 }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <polyline points="2,12 6,12 8,5 10,19 13,9 15,14 17,12 22,12" stroke="#0B1120" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </Box>
);

const Navigation = () => {
  const location = useLocation();
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ minHeight: { xs: 60, md: 64 }, px: { xs: 2, md: 4 }, display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : '1fr auto 1fr', alignItems: 'center', gap: 2 }}>

          <Box component={Link} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none' }}>
            <ECGIcon />
            <Box>
              <Typography sx={{ color: '#E8EEF8', fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.1 }}>Q-INTERVAL</Typography>
              <Typography sx={{ color: '#2DD4BF', fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.12em' }}>LITE+ EDITION</Typography>
            </Box>
          </Box>

          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '999px', px: 0.75, py: 0.5 }}>
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button key={item.path} component={Link} to={item.path} size="small"
                    sx={{ color: active ? '#2DD4BF' : 'rgba(255,255,255,0.5)', fontWeight: active ? 700 : 500, fontSize: '0.82rem', px: 1.75, py: 0.65, borderRadius: '999px', minWidth: 0, backgroundColor: active ? 'rgba(45,212,191,0.1)' : 'transparent', transition: 'all 0.18s', '&:hover': { color: '#E8EEF8', backgroundColor: 'rgba(255,255,255,0.05)' } }}>
                    {item.label}
                  </Button>
                );
              })}
            </Box>
          )}

          {!isMobile ? (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button component={Link} to="/Analysis" variant="contained" size="small" sx={{ px: 2.5, py: 0.9, fontSize: '0.82rem' }}>
                Launch Analysis Dashboard →
              </Button>
            </Box>
          ) : (
            <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)', justifySelf: 'end' }}>
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 260, backgroundColor: '#111C2E', borderLeft: '1px solid rgba(255,255,255,0.07)' } }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ECGIcon />
            <Typography sx={{ color: '#E8EEF8', fontWeight: 700, fontSize: '0.9rem' }}>Q-INTERVAL</Typography>
          </Box>
          <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)' }}><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)' }} />
        <List sx={{ pt: 1 }}>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <ListItem key={item.path} disablePadding>
                <ListItemButton component={Link} to={item.path} onClick={() => setDrawerOpen(false)}
                  sx={{ mx: 1, borderRadius: '8px', mb: 0.5, color: active ? '#2DD4BF' : 'rgba(255,255,255,0.65)', backgroundColor: active ? 'rgba(45,212,191,0.08)' : 'transparent', '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)', color: '#E8EEF8' } }}>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: active ? 700 : 500, fontSize: '0.9rem' }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
        <Box sx={{ p: 2, mt: 1 }}>
          <Button component={Link} to="/Analysis" variant="contained" fullWidth onClick={() => setDrawerOpen(false)}>
            Launch Analysis Dashboard →
          </Button>
        </Box>
      </Drawer>
    </>
  );
};

export default Navigation;
