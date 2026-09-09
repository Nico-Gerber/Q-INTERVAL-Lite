import React, { useState } from 'react';
import {
  AppBar, Toolbar, Typography, Button, Box,
  IconButton, Drawer, List, ListItem, ListItemButton,
  ListItemText, Divider, useMediaQuery, useTheme, Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  LightMode as SunIcon,
  DarkMode as MoonIcon,
  LogoutRounded as LogoutIcon,
  HistoryRounded as HistoryIcon,
  SpaceDashboardRounded as DashboardIcon,
} from '@mui/icons-material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ColorModeContext } from '../../App';
import { useAuth } from '../../supabase/AuthContext';
import logoDark from '../../assets/logo-dark.svg';

// Shared hover treatment for every icon button in the desktop nav bar —
// theme toggle, My Sessions, Sign Out, and the logged-in dashboard icon —
// so none of them stand out from the others.
const NAV_ICON_SX = {
  width: 36, height: 36,
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '999px',
  color: 'rgba(255,255,255,0.75)',
  backgroundColor: 'rgba(255,255,255,0.06)',
  transition: 'all 0.2s',
  '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.4)', color: '#FFFFFF' },
};

const NAV_ITEMS = [
  { label: 'Home',     path: '/' },
  { label: 'About', path: '/About' },
  { label: 'Models',   path: '/Models' },
];

const LogoMark = ({ size = 44 }) => (
  <Box
    component="img"
    src={logoDark}
    alt="Q-INTERVAL-LITE+ logo mark"
    sx={{ width: size, height: size, flexShrink: 0, display: 'block', verticalAlign: 'middle' }}
  />
);

const Navigation = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const theme     = useTheme();
  const isMobile  = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode, toggleColorMode } = React.useContext(ColorModeContext);
  const { user, signOut } = useAuth();
  const isDark = mode === 'dark';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleNavClick = (path) => {
    if (path === '/' && location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      <AppBar position="sticky" elevation={0}>
        <Toolbar
          sx={{
            minHeight: { xs: 60, md: 70 },
            px: { xs: 2, md: 4 },
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr auto' : '1fr auto 1fr',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {/* Brand */}
          <Box
            component={Link}
            to="/"
            onClick={() => handleNavClick('/')}
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none' }}
          >
            <LogoMark />
            <Typography sx={{ color: '#F0F9FF', fontWeight: 800, fontSize: '1.05rem', lineHeight: 1, letterSpacing: '0.02em', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              Q-INTERVAL-<span style={{ color: '#22D3EE' }}>LITE+</span>
            </Typography>
          </Box>

          {/* Centre nav pill */}
          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '999px', px: 1, py: 0.75 }}>
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    component={Link}
                    to={item.path}
                    onClick={() => handleNavClick(item.path)}
                    size="small"
                    sx={{
                      color: active ? '#22D3EE' : 'rgba(255,255,255,0.75)',
                      fontWeight: active ? 700 : 600,
                      fontSize: '0.9rem',
                      px: 2, py: 0.8,
                      borderRadius: '999px',
                      minWidth: 0,
                      letterSpacing: '0.01em',
                      backgroundColor: active ? 'rgba(34,211,238,0.12)' : 'transparent',
                      transition: 'all 0.18s',
                      '&:hover': { color: '#F0F9FF', backgroundColor: 'rgba(255,255,255,0.08)' },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Box>
          )}

          {/* Right side */}
          {!isMobile ? (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
              <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} arrow>
                <IconButton onClick={toggleColorMode} size="small" sx={NAV_ICON_SX}>
                  {isDark ? <SunIcon sx={{ fontSize: 17 }} /> : <MoonIcon sx={{ fontSize: 17 }} />}
                </IconButton>
              </Tooltip>

              {user ? (
                <Tooltip title="Analysis Dashboard" arrow>
                  <IconButton
                    component={Link}
                    to="/Analysis"
                    size="small"
                    sx={(theme) => ({
                      width: 36, height: 36,
                      borderRadius: '999px',
                      color: '#FFFFFF',
                      background: theme.palette.mode === 'dark'
                        ? 'linear-gradient(135deg, #22D3EE, #0891B2)'
                        : 'linear-gradient(135deg, #0891B2, #0E7490)',
                      boxShadow: theme.palette.mode === 'dark' ? '0 0 20px rgba(34,211,238,0.22)' : '0 0 20px rgba(8,145,178,0.28)',
                      transition: 'all 0.2s',
                      '&:hover': {
                        background: theme.palette.mode === 'dark'
                          ? 'linear-gradient(135deg, #67E8F9, #22D3EE)'
                          : 'linear-gradient(135deg, #22D3EE, #0891B2)',
                        boxShadow: theme.palette.mode === 'dark' ? '0 0 28px rgba(34,211,238,0.32)' : '0 0 28px rgba(8,145,178,0.4)',
                      },
                    })}
                  >
                    <DashboardIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              ) : (
                <Button
                  component={Link}
                  to="/Analysis"
                  variant="contained"
                  size="small"
                  sx={{ height: 36, px: 2, fontSize: '0.8rem', fontWeight: 700, color: '#FFFFFF' }}
                >
                  Launch Analysis Dashboard →
                </Button>
              )}

              {user && (
                <Tooltip title="My Sessions" arrow>
                  <IconButton component={Link} to="/Sessions" size="small" sx={NAV_ICON_SX}>
                    <HistoryIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              )}
              {user && (
                <Tooltip title={`Sign out (${user.email})`} arrow>
                  <IconButton onClick={handleSignOut} size="small" sx={NAV_ICON_SX}>
                    <LogoutIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: 'end' }}>
              <IconButton onClick={toggleColorMode} size="small" sx={{ color: 'rgba(255,255,255,0.75)', '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF' } }}>
                {isDark ? <SunIcon sx={{ fontSize: 18 }} /> : <MoonIcon sx={{ fontSize: 18 }} />}
              </IconButton>
              <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: 'rgba(255,255,255,0.8)' }}>
                <MenuIcon />
              </IconButton>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 270, backgroundColor: '#071020', borderLeft: '1px solid rgba(255,255,255,0.07)' } }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <LogoMark size={30} />
            <Typography sx={{ color: '#F0F9FF', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.02em', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              Q-INTERVAL-<span style={{ color: '#22D3EE' }}>LITE+</span>
            </Typography>
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
                  onClick={() => { handleNavClick(item.path); setDrawerOpen(false); }}
                  sx={{ mx: 1, borderRadius: '8px', mb: 0.5, color: active ? '#22D3EE' : 'rgba(255,255,255,0.75)', backgroundColor: active ? 'rgba(34,211,238,0.08)' : 'transparent', '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)', color: '#F0F9FF' } }}
                >
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: active ? 700 : 600, fontSize: '0.95rem' }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)', mx: 2 }} />
        <Box sx={{ px: 2, pt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>
            {isDark ? 'Dark mode' : 'Light mode'}
          </Typography>
          <IconButton onClick={toggleColorMode} size="small" sx={{ color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', p: 0.75, '&:hover': { color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.08)' } }}>
            {isDark ? <SunIcon sx={{ fontSize: 16 }} /> : <MoonIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Box>
        <Box sx={{ p: 2, mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button component={Link} to="/Analysis" variant="contained" fullWidth onClick={() => setDrawerOpen(false)} sx={{ py: 1.2, fontSize: '0.9rem', fontWeight: 700, color: '#FFFFFF' }}>
            Launch Analysis Dashboard →
          </Button>
          {user && (
            <Button
              component={Link} to="/Sessions" fullWidth onClick={() => setDrawerOpen(false)}
              startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
              sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)', '&:hover': { color: '#FFFFFF' } }}
            >
              My Sessions
            </Button>
          )}
          {user && (
            <Button
              fullWidth
              onClick={() => { setDrawerOpen(false); handleSignOut(); }}
              sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#FFFFFF' } }}
            >
              Sign Out
            </Button>
          )}
        </Box>
      </Drawer>
    </>
  );
};

export default Navigation;