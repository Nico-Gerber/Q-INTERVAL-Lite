import React, { useState } from 'react';
import {
  AppBar, Toolbar, Typography, Button, Box,
  IconButton, Drawer, List, ListItem, ListItemButton,
  ListItemText, Divider, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  Biotech as BiotechIcon,
} from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { label: 'Analysis', path: '/' },
  { label: 'Our Team', path: '/OurTeam' },
];

const Navigation = () => {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: '#0D1B2A',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 60, md: 68 } }}>
          {/* Brand */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
            <BiotechIcon sx={{ color: '#64B5F6', fontSize: 28 }} />
            <Box>
              <Typography
                variant="h6"
                sx={{ color: 'white', lineHeight: 1.1, letterSpacing: '0.02em' }}
              >
                Q-INTERVAL-Lite+
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', fontSize: '0.65rem' }}
              >
                MAMMOGRAM ANALYSIS SYSTEM
              </Typography>
            </Box>
          </Box>

          {/* Desktop nav */}
          {!isMobile && (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    component={Link}
                    to={item.path}
                    sx={{
                      color: active ? '#64B5F6' : 'rgba(255,255,255,0.75)',
                      borderBottom: active ? '2px solid #64B5F6' : '2px solid transparent',
                      borderRadius: 0,
                      px: 2,
                      pb: '4px',
                      '&:hover': { color: 'white', backgroundColor: 'transparent' },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Box>
          )}

          {/* Mobile hamburger */}
          {isMobile && (
            <IconButton color="inherit" onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile drawer */}
      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 240, backgroundColor: '#0D1B2A', height: '100%', color: 'white' }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
            <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
          <List>
            {NAV_ITEMS.map((item) => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  component={Link}
                  to={item.path}
                  onClick={() => setDrawerOpen(false)}
                  selected={location.pathname === item.path}
                  sx={{
                    color: 'rgba(255,255,255,0.85)',
                    '&.Mui-selected': { color: '#64B5F6', backgroundColor: 'rgba(100,181,246,0.1)' },
                  }}
                >
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
    </>
  );
};

export default Navigation;
