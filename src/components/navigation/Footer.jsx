import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Container, Divider, Typography } from '@mui/material';
import logoDark from '../../assets/logo-dark.svg';

const TECH_STACK = 'React, FastAPI, Material UI, Python, PyTorch, PennyLane';

const LINK_GROUPS = [
  {
    title: 'Explore',
    links: [
      { label: 'Home', to: '/' },
      { label: 'About', to: '/About' },
      { label: 'Models', to: '/Models' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Request Access', to: '/request-access' },
      { label: 'Sign In', to: '/login' },
    ],
  },
];

const GRID = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '2fr 1fr 1fr' }, columnGap: { xs: 4, md: 6 } };

const footerLinkSx = {
  color: 'rgba(232,238,248,0.78)', fontSize: '0.88rem', textDecoration: 'none', width: 'fit-content',
  '&:hover': { color: '#22D3EE', textDecoration: 'underline' },
  '&:focus-visible': { outline: '2px solid #22D3EE', outlineOffset: 3, borderRadius: 1 },
};

const Footer = () => (
  <Box component="footer" sx={{ backgroundColor: '#080E1C', borderTop: '1px solid rgba(255,255,255,0.07)', color: '#E8EEF8', pt: { xs: 5, md: 6 }, pb: 3, mt: 'auto' }}>
    <Container maxWidth="lg">
      <Box sx={{ ...GRID, rowGap: 4, mb: 4, alignItems: 'start' }}>
        <Box sx={{ gridColumn: { xs: 'auto', sm: '1 / -1', md: 'auto' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, height: 32, mb: 1.5 }}>
            <Box component="img" src={logoDark} alt="" sx={{ width: 32, height: 32 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#E8EEF8' }}>Q-INTERVAL-Lite+</Typography>
          </Box>
          <Typography sx={{ color: 'rgba(232,238,248,0.78)', fontSize: '0.88rem', lineHeight: 1.7, maxWidth: '44ch' }}>
            A second eye for clinicians, helping to reveal signals in a mammogram that are hard to see. It assists, and never replaces, clinical judgement.
          </Typography>
        </Box>

        {LINK_GROUPS.map((group) => (
          <Box component="nav" key={group.title} aria-label={group.title}>
            <Typography component="h2" sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(232,238,248,0.78)', height: 32, display: 'flex', alignItems: 'center', mb: 1.5 }}>
              {group.title}
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.links.map((link) => (
                <li key={link.label}>
                  <Box component={RouterLink} to={link.to} sx={footerLinkSx}>{link.label}</Box>
                </li>
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 2.5 }} />

      <Box sx={{ ...GRID, rowGap: 1 }}>
        <Typography sx={{ color: 'rgba(232,238,248,0.7)', fontSize: '0.78rem', lineHeight: 1.6, gridColumn: { sm: '1 / -1', md: 'auto' } }}>
          Research prototype. Not a diagnostic device and not for clinical use.
        </Typography>
        <Typography sx={{ color: 'rgba(232,238,248,0.7)', fontSize: '0.78rem', lineHeight: 1.6, gridColumn: { sm: '1 / -1', md: '2 / -1' } }}>
          © {new Date().getFullYear()} Swinburne University, COS40005 Computing Technology Inquiry Project
          <Box component="span" sx={{ display: 'block' }}>Built with {TECH_STACK}</Box>
        </Typography>
      </Box>
    </Container>
  </Box>
);

export default Footer;
