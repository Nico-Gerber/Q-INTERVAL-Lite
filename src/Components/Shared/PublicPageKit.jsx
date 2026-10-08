import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { ArrowForwardRounded as ArrowForwardIcon, ImageOutlined as ImageIcon } from '@mui/icons-material';
import { motion, useReducedMotion } from 'framer-motion';

// Building blocks for the public marketing pages (Home and About): section bands, headings, reveal animations and motifs.
// Signed-in dashboard pages use DashboardHeader instead.

// Theme main cyan is only ~3.3:1 on the light page, so light mode uses a darker teal that also clears the tinted bands.
export const accent = (theme) => (theme.palette.mode === 'dark' ? theme.palette.primary.main : '#0A5C72');

export const PARAGRAPH_WRAP = { textWrap: 'pretty' };
export const HEADING_WRAP = { textWrap: 'balance' };

export const sectionSx = { py: { xs: 8, md: 11 }, position: 'relative', overflow: 'hidden' };

// Band ladder: base, soft and deep step evenly (about 5 L* each) away from the page colour; emphasis is the single teal band.
export const BAND = {
  soft: { bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#12253E' : '#CDEBF4') },
  deep: { bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#162F50' : '#B1E0EE') },
  emphasis: {
    bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#0B4A5E' : theme.palette.background.heroStatsBg),
  },
};
export const sectionTall = { ...sectionSx, py: { xs: 10, md: 16 } };
export const sectionCompact = { ...sectionSx, py: { xs: 6, md: 8 } };

export const SECTION_HEADING_SX = { ...HEADING_WRAP, fontSize: { xs: '1.75rem', md: '2.35rem' }, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', color: 'text.primary' };

// Smaller tier for utility sections (FAQ, resources, result clip).
export const SECTION_HEADING_COMPACT_SX = { ...SECTION_HEADING_SX, fontSize: { xs: '1.5rem', md: '1.85rem' } };

export const LEAD_SX = { color: 'text.secondary', fontSize: { xs: '0.98rem', md: '1.05rem' }, lineHeight: 1.75, maxWidth: '44ch', ...PARAGRAPH_WRAP };

export const SPLIT_SX = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 3fr' }, gap: { xs: 5, md: 10 }, alignItems: 'center' };

export function Reveal({ children, delay = 0 }) {
  const reduce = useReducedMotion();
  if (reduce) return <div>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

export function SlideIn({ children, delay = 0, sx }) {
  const reduce = useReducedMotion();
  return (
    <Box
      component={motion.span}
      initial={reduce ? false : { opacity: 0, x: 36 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.7, ease: 'easeOut', delay }}
      sx={{ display: 'block', ...sx }}
    >
      {children}
    </Box>
  );
}

export function ArrowLink({ to, onClick, onDark, children }) {
  const elementProps = to ? { component: RouterLink, to } : { component: 'button', type: 'button', onClick };
  return (
    <Box
      {...elementProps}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 1,
        fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit', letterSpacing: '0.01em',
        background: 'none', border: 0, p: 0.5, m: -0.5, cursor: 'pointer', textDecoration: 'none',
        color: onDark ? '#FFFFFF' : accent,
        '& .label': {
          backgroundImage: 'linear-gradient(currentColor, currentColor)',
          backgroundRepeat: 'no-repeat', backgroundPosition: '0 100%', backgroundSize: '0% 1.5px',
          pb: '2px', transition: 'background-size 0.25s ease',
        },
        '& .badge': {
          width: 22, height: 22, borderRadius: '50%', border: '1.5px solid currentColor',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background-color 0.2s, color 0.2s, transform 0.2s',
        },
        '&:hover .label, &:focus-visible .label': { backgroundSize: '100% 1.5px' },
        '&:hover .badge, &:focus-visible .badge': {
          backgroundColor: onDark ? '#FFFFFF' : accent, borderColor: onDark ? '#FFFFFF' : accent, transform: 'translateX(2px)',
          color: (theme) => (onDark ? '#0E7490' : theme.palette.mode === 'dark' ? theme.palette.primary.contrastText : '#FFFFFF'),
        },
        '&:focus-visible': { outline: '2px solid', outlineColor: onDark ? '#FFFFFF' : 'primary.main', outlineOffset: 4, borderRadius: 1 },
      }}
    >
      <span className="label">{children}</span>
      <span className="badge"><ArrowForwardIcon sx={{ fontSize: 14 }} aria-hidden="true" /></span>
    </Box>
  );
}

// Faint corner motifs for selected sections; each uses a different shape so none repeats.
export function SectionMotif({ type, corner = 'top right' }) {
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => {
        const dark = theme.palette.mode === 'dark';
        const tone = dark ? '34,211,238' : '10,92,114';
        const fade = `radial-gradient(circle at ${corner}, #000 0%, transparent 62%)`;
        const base = { position: 'absolute', pointerEvents: 'none', zIndex: 0 };
        if (type === 'grid') {
          const line = `rgba(${tone},${dark ? 0.1 : 0.08})`;
          return { ...base, inset: 0, backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`, backgroundSize: '48px 48px', WebkitMaskImage: fade, maskImage: fade };
        }
        if (type === 'dots') {
          return { ...base, inset: 0, backgroundImage: `radial-gradient(rgba(${tone},${dark ? 0.35 : 0.3}) 1.5px, transparent 1.6px)`, backgroundSize: '20px 20px', WebkitMaskImage: fade, maskImage: fade };
        }
        return { ...base, inset: 0, background: `radial-gradient(ellipse at ${corner}, rgba(${tone},${dark ? 0.2 : 0.18}) 0%, transparent 55%)` };
      }}
    />
  );
}

// Placeholder until a stock image is chosen: pass `src` and `alt` to render the photo.
export function ImageSlot({ src, alt = '', label, ratio = '4 / 3', kind = 'Stock image', sx }) {
  if (src) {
    return <Box component="img" src={src} alt={alt} loading="lazy" sx={{ display: 'block', width: '100%', aspectRatio: ratio, objectFit: 'cover', borderRadius: 2, ...sx }} />;
  }
  return (
    <Box
      role="img"
      aria-label={`Image placeholder: ${label}`}
      sx={{
        width: '100%', aspectRatio: ratio, borderRadius: 2, border: '2px dashed', backgroundColor: 'background.paper',
        borderColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(14,116,144,0.55)'),
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 2, gap: 0.5,
        ...sx,
      }}
    >
      <ImageIcon sx={{ fontSize: 40, color: 'text.secondary' }} aria-hidden="true" />
      <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'text.primary' }}>{kind}</Typography>
      <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', maxWidth: '28ch' }}>{label}</Typography>
    </Box>
  );
}

// Italic accent word for headings; pass onDark inside the teal bands.
export function AccentWord({ children, onDark }) {
  return <Box component="span" sx={{ fontStyle: 'italic', color: onDark ? '#A5F3FC' : accent }}>{children}</Box>;
}

// Gentle lift-and-grow for cards worth exploring. Use on plain boxes; framer-motion elements use whileHover instead.
export const HOVER_LIFT = {
  transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
  '&:hover': {
    transform: 'translateY(-4px) scale(1.01)',
    borderColor: accent,
    boxShadow: (theme) => (theme.palette.mode === 'dark' ? '0 16px 36px rgba(0,0,0,0.4)' : '0 16px 36px rgba(14,116,144,0.2)'),
  },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
};
