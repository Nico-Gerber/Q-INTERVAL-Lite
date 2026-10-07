import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import { useReducedMotion } from 'framer-motion';
import {
  accent, AccentWord, ArrowLink, HEADING_WRAP, LEAD_SX, Reveal, SectionMotif, SlideIn,
} from '../Components/Shared/PublicPageKit';
import logoDark from '../assets/logo-dark.svg';
import logoLight from '../assets/logo-light.svg';

const NAV_H = 70;

// Slowly turning rings around the logo. Decorative only; it stands still when motion is reduced.
function ComingSoonMark() {
  const reduce = useReducedMotion();
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => {
        const dark = theme.palette.mode === 'dark';
        return {
          position: 'relative', width: '100%', maxWidth: 420, mx: 'auto', aspectRatio: '1', color: accent(theme),
          '@keyframes modelsSpin': { to: { transform: 'rotate(360deg)' } },
          '@keyframes modelsSpinBack': { to: { transform: 'rotate(-360deg)' } },
          '& .ring': { transformOrigin: '200px 200px', transformBox: 'view-box' },
          '& .ring-a': { animation: reduce ? 'none' : 'modelsSpin 60s linear infinite' },
          '& .ring-b': { animation: reduce ? 'none' : 'modelsSpinBack 26s linear infinite' },
          '& .ring-c': { animation: reduce ? 'none' : 'modelsSpin 14s linear infinite' },
          '& .logo-dark': { display: dark ? 'block' : 'none' },
          '& .logo-light': { display: dark ? 'none' : 'block' },
        };
      }}
    >
      <Box component="svg" viewBox="0 0 400 400" focusable="false" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        <g className="ring ring-a" fill="none" stroke="currentColor">
          <circle cx="200" cy="200" r="188" strokeWidth="1.2" strokeOpacity="0.45" strokeDasharray="2 10" />
        </g>
        <g className="ring ring-b" fill="none" stroke="currentColor">
          <circle cx="200" cy="200" r="150" strokeWidth="1.5" strokeOpacity="0.2" />
          <path d="M200 50 A150 150 0 0 1 350 200" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.9" />
        </g>
        <g className="ring ring-c" fill="none" stroke="currentColor">
          <circle cx="200" cy="200" r="112" strokeWidth="1.2" strokeOpacity="0.35" />
          <circle cx="200" cy="88" r="7" fill="currentColor" stroke="none" />
        </g>
      </Box>
      <Box sx={{ position: 'absolute', inset: '30%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box component="img" className="logo-dark" src={logoDark} alt="" sx={{ width: '100%', height: 'auto' }} />
        <Box component="img" className="logo-light" src={logoLight} alt="" sx={{ width: '100%', height: 'auto' }} />
      </Box>
    </Box>
  );
}

export default function Models() {
  return (
    <Box
      component="main"
      sx={{ position: 'relative', overflow: 'hidden', minHeight: { xs: 'auto', md: `calc(100dvh - ${NAV_H}px)` }, display: 'flex', alignItems: 'center', py: { xs: 10, md: 8 }, backgroundColor: 'background.default' }}
    >
      <SectionMotif type="glow" corner="78% 50%" />
      <SectionMotif type="dots" corner="bottom left" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: { xs: 6, md: 10 }, alignItems: 'center' }}>
          <Box>
            <Typography
              component="h1"
              sx={{ ...HEADING_WRAP, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.02, fontSize: { xs: '3rem', md: '5rem' }, color: 'text.primary', mb: 3 }}
            >
              <SlideIn delay={0.1}>Models</SlideIn>
              <SlideIn delay={0.35}>
                <AccentWord>coming soon.</AccentWord>
              </SlideIn>
            </Typography>
            <Reveal delay={0.5}>
              <Typography sx={{ ...LEAD_SX, maxWidth: '38ch', fontSize: { xs: '1.05rem', md: '1.2rem' }, mb: 4 }}>
                This page isn&apos;t ready yet. Please check back soon.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 2.5, md: 4 } }}>
                <ArrowLink to="/">Back to home</ArrowLink>
                <ArrowLink to="/About">About the project</ArrowLink>
              </Box>
            </Reveal>
          </Box>
          <ComingSoonMark />
        </Box>
      </Container>
    </Box>
  );
}
