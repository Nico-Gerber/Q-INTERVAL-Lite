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
  <Box
    sx={{
      width: 34,
      height: 34,
      borderRadius: '9px',
      background: 'linear-gradient(135deg, #00D4A0, #00A87E)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 0 14px rgba(0,212,160,0.35)',
      flexShrink: 0,
    }}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <polyline
        points="2,12 6,12 8,5 10,19 13,9 15,14 17,12 22,12"
        stroke="#0A0F1A"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
        <Toolbar
          sx={{
            minHeight: { xs: 60, md: 64 },
            px: { xs: 2, md: 4 },
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr auto' : '1fr auto 1fr',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {/* ── Left: Brand ── */}
          <Box
            component={Link}
            to="/"
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none' }}
          >
            <ECGIcon />
            <Box>
              <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.1 }}>
                Q-INTERVAL
              </Typography>
              <Typography sx={{ color: '#00D4A0', fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.12em' }}>
                LITE+ EDITION
              </Typography>
            </Box>
          </Box>

          {/* ── Centre: Nav pill (desktop) ── */}
          {!isMobile && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '999px',
                px: 0.75,
                py: 0.5,
              }}
            >
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    component={Link}
                    to={item.path}
                    size="small"
                    sx={{
                      color: active ? '#00D4A0' : 'rgba(255,255,255,0.55)',
                      fontWeight: active ? 700 : 500,
                      fontSize: '0.82rem',
                      px: 1.75,
                      py: 0.65,
                      borderRadius: '999px',
                      minWidth: 0,
                      backgroundColor: active ? 'rgba(0,212,160,0.1)' : 'transparent',
                      transition: 'all 0.18s',
                      '&:hover': { color: 'white', backgroundColor: 'rgba(255,255,255,0.06)' },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Box>
          )}

          {/* ── Right: CTA / Hamburger ── */}
          {!isMobile ? (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                component={Link}
                to="/Analysis"
                variant="contained"
                size="small"
                sx={{ px: 2.5, py: 0.9, fontSize: '0.82rem' }}
              >
                Launch Analysis Dashboard →
              </Button>
            </Box>
          ) : (
            <IconButton
              onClick={() => setDrawerOpen(true)}
              sx={{ color: 'rgba(255,255,255,0.8)', justifySelf: 'end' }}
            >
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* ── Mobile drawer ── */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: { width: 260, backgroundColor: '#0A0F1A', borderLeft: '1px solid rgba(255,255,255,0.07)' },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ECGIcon />
            <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>Q-INTERVAL</Typography>
          </Box>
          <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)' }} />
        <List sx={{ pt: 1 }}>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  component={Link}
                  to={item.path}
                  onClick={() => setDrawerOpen(false)}
                  sx={{
                    mx: 1, borderRadius: '8px', mb: 0.5,
                    color: active ? '#00D4A0' : 'rgba(255,255,255,0.7)',
                    backgroundColor: active ? 'rgba(0,212,160,0.08)' : 'transparent',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)', color: 'white' },
                  }}
                >
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontWeight: active ? 700 : 500, fontSize: '0.9rem' }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
        <Box sx={{ p: 2, mt: 1 }}>
          <Button
            component={Link}
            to="/Analysis"
            variant="contained"
            fullWidth
            onClick={() => setDrawerOpen(false)}
          >
            Launch Analysis Dashboard →
          </Button>
        </Box>
      </Drawer>
    </>
  );
};

export default Navigation;