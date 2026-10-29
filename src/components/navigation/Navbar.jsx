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
  AdminPanelSettingsRounded as AdminIcon,
  GroupsRounded as PatientsIcon,
  ArrowForwardRounded as ArrowIcon,
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

// Highlight for the icon whose page is currently open (same gradient the dashboard icon used to always have).
const NAV_ICON_ACTIVE_SX = (theme) => ({
  ...NAV_ICON_SX,
  color: '#FFFFFF',
  border: '1px solid transparent',
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #22D3EE, #0891B2)'
    : 'linear-gradient(135deg, #0891B2, #0E7490)',
  boxShadow: theme.palette.mode === 'dark' ? '0 0 20px rgba(34,211,238,0.22)' : '0 0 20px rgba(8,145,178,0.28)',
  '&:hover': {
    background: theme.palette.mode === 'dark'
      ? 'linear-gradient(135deg, #67E8F9, #22D3EE)'
      : 'linear-gradient(135deg, #22D3EE, #0891B2)',
    boxShadow: theme.palette.mode === 'dark' ? '0 0 28px rgba(34,211,238,0.32)' : '0 0 28px rgba(8,145,178,0.4)',
  },
});

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

// Every row in the mobile drawer shares one height, radius and left alignment so the list reads as one system.
const DRAWER_ROW_SX = {
  position: 'relative', minHeight: 48, borderRadius: '10px', px: 1.5,
  '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)', color: '#F0F9FF' },
  '&.Mui-focusVisible': { outline: '2px solid #22D3EE', outlineOffset: -2 },
};

const DrawerLink = ({ to, icon, label, active, onNavigate }) => (
  <ListItem disablePadding sx={{ mb: 0.5 }}>
    <ListItemButton
      component={Link} to={to} onClick={onNavigate} aria-current={active ? 'page' : undefined}
      sx={{ ...DRAWER_ROW_SX, gap: 1.5, color: active ? '#22D3EE' : 'rgba(255,255,255,0.8)', backgroundColor: active ? 'rgba(34,211,238,0.1)' : 'transparent' }}
    >
      {React.cloneElement(icon, { sx: { fontSize: 20 } })}
      <ListItemText primary={label} primaryTypographyProps={{ fontWeight: active ? 700 : 600, fontSize: '0.95rem' }} />
    </ListItemButton>
  </ListItem>
);

const Navigation = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const theme     = useTheme();
  const isMobile  = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const { mode, toggleColorMode } = React.useContext(ColorModeContext);
  const { user, profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin' && profile?.status === 'approved';
  const isClinician = profile?.role === 'clinician' && profile?.status === 'approved';
  const isDark = mode === 'dark';
  const isActive = (path) => location.pathname.toLowerCase().startsWith(path.toLowerCase());
  const iconSx = (path) => (isActive(path) ? NAV_ICON_ACTIVE_SX : NAV_ICON_SX);

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
                    sx={iconSx('/Analysis')}
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

              {isAdmin && (
                <Tooltip title="User Management" arrow>
                  <IconButton component={Link} to="/Admin" size="small" sx={iconSx('/Admin')}>
                    <AdminIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              )}
              {isClinician && (
                <Tooltip title="My Patients" arrow>
                  <IconButton component={Link} to="/Patients" size="small" sx={iconSx('/Patients')}>
                    <PatientsIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              )}
              {user && !isClinician && (
                <Tooltip title="My Sessions" arrow>
                  <IconButton component={Link} to="/Sessions" size="small" sx={iconSx('/Sessions')}>
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
        onClose={closeDrawer}
        PaperProps={{
          sx: {
            width: 'min(86vw, 320px)', backgroundColor: '#071020', borderLeft: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', flexDirection: 'column', height: '100dvh',
          },
        }}
      >
        <Box sx={{ px: 2.5, height: 64, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <LogoMark size={30} />
            <Typography sx={{ color: '#F0F9FF', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.02em', fontFamily: '"Plus Jakarta Sans", sans-serif', whiteSpace: 'nowrap' }}>
              Q-INTERVAL-<span style={{ color: '#22D3EE' }}>LITE+</span>
            </Typography>
          </Box>
          <IconButton onClick={closeDrawer} aria-label="Close menu" sx={{ color: 'rgba(255,255,255,0.6)', mr: -1 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)' }} />

        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 2 }}>
          <List disablePadding component="nav" aria-label="Main">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.path;
              return (
                <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    component={Link}
                    to={item.path}
                    onClick={() => { handleNavClick(item.path); closeDrawer(); }}
                    aria-current={active ? 'page' : undefined}
                    sx={{
                      ...DRAWER_ROW_SX,
                      color: active ? '#22D3EE' : 'rgba(255,255,255,0.8)',
                      backgroundColor: active ? 'rgba(34,211,238,0.1)' : 'transparent',
                      '&::before': { content: '""', position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, backgroundColor: active ? '#22D3EE' : 'transparent' },
                    }}
                  >
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: active ? 700 : 600, fontSize: '1rem' }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          <Button
            component={Link} to="/Analysis" variant="contained" fullWidth onClick={closeDrawer}
            endIcon={<ArrowIcon sx={{ fontSize: 18 }} />}
            sx={{ mt: 2, minHeight: 52, borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700, color: '#FFFFFF', justifyContent: 'space-between', px: 2.25, whiteSpace: 'nowrap', textTransform: 'none' }}
          >
            Launch Analysis Dashboard
          </Button>

          {(isAdmin || isClinician || user) && (
            <>
              <Typography sx={{ mt: 3, mb: 1, px: 1.5, color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Your account
              </Typography>
              <List disablePadding>
                {isAdmin && (
                  <DrawerLink to="/Admin" icon={<AdminIcon />} label="User Management" active={location.pathname === '/Admin'} onNavigate={closeDrawer} />
                )}
                {isClinician && (
                  <DrawerLink to="/Patients" icon={<PatientsIcon />} label="My Patients" active={location.pathname === '/Patients'} onNavigate={closeDrawer} />
                )}
                {user && !isClinician && (
                  <DrawerLink to="/Sessions" icon={<HistoryIcon />} label="My Sessions" active={location.pathname === '/Sessions'} onNavigate={closeDrawer} />
                )}
              </List>
            </>
          )}
        </Box>

        <Box sx={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.07)', px: 1.5, pt: 1.5, pb: 'max(12px, env(safe-area-inset-bottom))' }}>
          <ListItemButton onClick={toggleColorMode} sx={{ ...DRAWER_ROW_SX, color: 'rgba(255,255,255,0.8)', gap: 1.5 }}>
            {isDark ? <SunIcon sx={{ fontSize: 20 }} /> : <MoonIcon sx={{ fontSize: 20 }} />}
            <ListItemText primary={isDark ? 'Switch to light mode' : 'Switch to dark mode'} primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }} />
          </ListItemButton>
          {user && (
            <ListItemButton onClick={() => { closeDrawer(); handleSignOut(); }} sx={{ ...DRAWER_ROW_SX, color: 'rgba(255,255,255,0.8)', gap: 1.5, mt: 0.5 }}>
              <LogoutIcon sx={{ fontSize: 20 }} />
              <ListItemText primary="Sign Out" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }} />
            </ListItemButton>
          )}
        </Box>
      </Drawer>
    </>
  );
};

export default Navigation;