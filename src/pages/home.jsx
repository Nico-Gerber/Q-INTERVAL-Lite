import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Chip, Container, Typography, Paper, IconButton,
} from '@mui/material';
import {
  FavoriteBorder as HeartIcon,
  Link as LinkIcon,
  School as SchoolIcon,
  Memory as ClassicalIcon,
  ImageOutlined as ImageIcon,
  ScienceOutlined as ScienceIcon,
  ShieldOutlined as ShieldIcon,
  PeopleAlt as PeopleIcon,
  CalendarMonth as CalendarIcon,
  Warning as WarningIcon,
  VisibilityOff as EyeOffIcon,
  KeyboardArrowUp as ArrowUpIcon,
  KeyboardArrowDown as ArrowDownIcon,
} from '@mui/icons-material';
import { motion, animate, AnimatePresence } from 'framer-motion';

const A = {
  teal:   '#2DD4BF',
  violet: '#7C3AED',
  amber:  '#FBBF24',
  red:    '#F87171',
  pink:   '#E8537A',
};

const TC = {
  mode:    '#94A3B8',
  upload:  '#2DD4BF',
  cnn:     '#38BDF8',
  qml:     '#9333EA',
  results: '#F59E0B',
};

const NAV_H = 70;
const SECTION_IDS = ['hero', 'about', 'why', 'technology', 'support'];
const ICON_SX = { fontSize: 26 };

const HERO_STATS = [
  {
    Icon: PeopleIcon,
    value: '1 in 7', numericEnd: 7, prefix: '1 in ', suffix: '',
    label: 'Australian women will be diagnosed with breast cancer in their lifetime.',
  },
  {
    Icon: CalendarIcon,
    value: '1.9 Million', numericEnd: 1.9, prefix: '', suffix: 'M',
    label: 'Australian women rely on routine screening cycles biennially.',
  },
  {
    Icon: WarningIcon,
    value: '22%', numericEnd: 22, prefix: '', suffix: '%',
    label: "Of invasive cancers emerge as 'interval cancers' between routine clear screenings.",
  },
  {
    Icon: EyeOffIcon,
    value: '80%+', numericEnd: 80, prefix: '', suffix: '%+',
    label: 'Of interval cancers are deemed clinically invisible to the human eye on prior scans.',
  },
];

const SUPPORT_ORGS = [
  {
    name: 'Cancer Council Australia',
    domain: 'cancer.org.au',
    description: 'Trusted cancer information, support programs, and a free 13 11 20 helpline for Australians affected by breast cancer.',
    url: 'https://www.cancer.org.au/',
  },
  {
    name: 'McGrath Foundation',
    domain: 'mcgrathfoundation.com.au',
    description: 'Providing free McGrath Breast Care Nurses and support to individuals and families experiencing breast cancer.',
    url: 'https://www.mcgrathfoundation.com.au/',
  },
  {
    name: 'Breast Cancer Network Australia',
    domain: 'bcna.org.au',
    description: "Australia's leading breast cancer network offering trusted resources, peer support, and the My Journey care tool.",
    url: 'https://www.bcna.org.au/',
  },
  {
    name: 'BreastScreen Victoria',
    domain: 'breastscreen.org.au',
    description: 'Free breast screening and mammogram services for Victorian women aged 40+, helping detect cancer early.',
    url: 'https://www.breastscreen.org.au/',
  },
];

const faviconUrl = (domain) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

// ── Section patterns ───────────────────────────────────────────────────────
const DotGrid = () => (
  <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
    <Box component="svg" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}
      sx={{ '& circle': { fill: (theme) => theme.palette.mode === 'dark' ? 'rgba(45,212,191,0.10)' : 'rgba(13,148,136,0.13)' } }}>
      <defs>
        <pattern id="pg-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pg-dots)" />
    </Box>
  </Box>
);

const HorizontalLines = () => (
  <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
    <Box component="svg" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}
      sx={{ '& line': { stroke: (theme) => theme.palette.mode === 'dark' ? 'rgba(45,212,191,0.08)' : 'rgba(13,148,136,0.12)' } }}>
      <defs>
        <pattern id="pg-hlines" x="0" y="0" width="1" height="32" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="9999" y2="0" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pg-hlines)" />
    </Box>
  </Box>
);

const SparsePlus = () => (
  <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
    <Box component="svg" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}
      sx={{ '& line': { stroke: (theme) => theme.palette.mode === 'dark' ? 'rgba(45,212,191,0.08)' : 'rgba(13,148,136,0.12)' } }}>
      <defs>
        <pattern id="pg-plus" x="0" y="0" width="64" height="64" patternUnits="userSpaceOnUse">
          <line x1="32" y1="22" x2="32" y2="42" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="22" y1="32" x2="42" y2="32" strokeWidth="1.5" strokeLinecap="round" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pg-plus)" />
    </Box>
  </Box>
);

const DiagonalLines = () => (
  <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
    <Box component="svg" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}
      sx={{ '& line': { stroke: (theme) => theme.palette.mode === 'dark' ? 'rgba(45,212,191,0.08)' : 'rgba(13,148,136,0.12)' } }}>
      <defs>
        <pattern id="pg-diag" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="20" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pg-diag)" />
    </Box>
  </Box>
);

function NeuralCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    const NODE_COUNT = 48;
    const CONNECT_DIST = 160;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.2 + 0.6,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.12;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(45,212,191,${alpha})`; ctx.lineWidth = 0.8; ctx.stroke();
          }
        }
      }
      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0) n.x = canvas.width; if (n.x > canvas.width) n.x = 0;
        if (n.y < 0) n.y = canvas.height; if (n.y > canvas.height) n.y = 0;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(45,212,191,0.28)'; ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} />;
}

function AnimatedCounter({ end, prefix = '', suffix = '', isDecimal = false, isVisible }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isVisible) { setCount(0); return; }
    const ctrl = animate(0, end, {
      duration: 1.8, ease: 'easeOut',
      onUpdate: (v) => setCount(isDecimal ? parseFloat(v.toFixed(1)) : Math.round(v)),
    });
    return ctrl.stop;
  }, [isVisible, end, isDecimal]);
  return <span>{prefix}{count}{suffix}</span>;
}

function FadeUp({ children, delay = 0, isVisible }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: 0.55, ease: 'easeOut', delay }}
      style={{ width: '100%' }}
    >
      {children}
    </motion.div>
  );
}

const SectionLabel = ({ icon, label, color }) => (
  <Box sx={{
    display: 'inline-flex', alignItems: 'center', gap: 1, mb: 2.5, px: 1.5, py: 0.6,
    borderRadius: '999px',
    backgroundColor: (theme) => theme.palette.mode === 'dark' ? `${color}1A` : color,
    border: (theme) => theme.palette.mode === 'dark'
      ? `1px solid ${color}40`
      : '1.5px solid rgba(255,255,255,0.35)',
  }}>
    <Box sx={{ color: (theme) => theme.palette.mode === 'dark' ? color : '#FFFFFF', display: 'flex', alignItems: 'center' }}>{icon}</Box>
    <Typography variant="caption" sx={{ color: (theme) => theme.palette.mode === 'dark' ? color : '#FFFFFF', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</Typography>
  </Box>
);

const ImageSlot = ({ accent, label, ratio = '4/3' }) => (
  <Box sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', aspectRatio: ratio, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, position: 'relative', overflow: 'hidden', '&::before': { content: '""', position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, ${accent}0D 0%, transparent 70%)`, pointerEvents: 'none' } }}>
  <ImageIcon sx={{ fontSize: 28, color: `${accent}40` }} />
  <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', textAlign: 'center', px: 3 }}>{label}</Typography>
</Box>
);

function OrgLogo({ domain, name }) {
  const [failed, setFailed] = useState(false);
  const initial = name.charAt(0).toUpperCase();
  if (failed) {
    return (
      <Box sx={{ width: 32, height: 32, borderRadius: 1.5, flexShrink: 0, backgroundColor: 'rgba(232,83,122,0.12)', border: '1px solid rgba(232,83,122,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: A.pink, fontWeight: 800, fontSize: '0.85rem', lineHeight: 1 }}>{initial}</Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ width: 32, height: 32, borderRadius: 1.5, flexShrink: 0, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Box component="img" src={faviconUrl(domain)} alt={`${name} logo`} onError={() => setFailed(true)} sx={{ width: 20, height: 20, objectFit: 'contain' }} />
    </Box>
  );
}

const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - NAV_H, behavior: 'smooth' });
};

const SectionArrows = ({ current, total, onUp, onDown }) => {
  const btnSx = {
    width: 36, height: 36,
    border: 'none',
    backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#0B1120' : '#0F766E',
    color: (theme) => theme.palette.mode === 'dark' ? '#2DD4BF' : '#FFFFFF',
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#111C2E' : '#0D9488',
      transform: 'scale(1.08)',
    },
  };
  const dotActiveSx = { width: 8, height: 8, borderRadius: '50%', backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#2DD4BF' : '#0F766E', transition: 'all 0.2s', cursor: 'pointer' };
  const dotInactiveSx = { width: 5, height: 5, borderRadius: '50%', backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(15,118,110,0.28)', transition: 'all 0.2s', cursor: 'pointer', '&:hover': { backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(45,212,191,0.6)' : 'rgba(15,118,110,0.55)' } };
  return (
    <Box sx={{ position: 'fixed', right: { xs: 10, md: 20 }, top: '50%', transform: 'translateY(-50%)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
      {current > 0 ? <IconButton onClick={onUp} size="small" sx={btnSx}><ArrowUpIcon sx={{ fontSize: 18 }} /></IconButton> : <Box sx={{ width: 36, height: 36 }} />}
      {Array.from({ length: total }).map((_, i) => (
        <Box key={i} onClick={() => scrollToId(SECTION_IDS[i])} sx={i === current ? dotActiveSx : dotInactiveSx} />
      ))}
      {current < total - 1 ? <IconButton onClick={onDown} size="small" sx={btnSx}><ArrowDownIcon sx={{ fontSize: 18 }} /></IconButton> : <Box sx={{ width: 36, height: 36 }} />}
    </Box>
  );
};

function TechCard({ accent, stepNum, icon, title, summary, delay }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{ flex: 1 }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: '2px solid rgba(0,0,0,0.18)',
          backgroundColor: accent,
          outline: '1.5px solid rgba(255,255,255,0.28)',
          outlineOffset: '-4px',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          transition: 'all 0.22s ease',
          transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
          boxShadow: hovered ? `0 10px 30px rgba(0,0,0,0.25), 0 0 0 2px ${accent}` : 'none',
          cursor: 'default',
          '&::before': {
            content: '""',
            position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
            backgroundColor: 'rgba(255,255,255,0.4)',
            opacity: hovered ? 1 : 0.7,
            transition: 'opacity 0.22s ease',
          },
        }}
      >
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.85)' }}>
          STEP {stepNum}
        </Typography>
        <Box sx={{
          width: 44, height: 44, borderRadius: 2, mb: 0.5, flexShrink: 0,
          backgroundColor: 'rgba(255,255,255,0.18)',
          border: '1.5px solid rgba(255,255,255,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FFFFFF',
          transition: 'all 0.22s ease',
        }}>
          {icon}
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', lineHeight: 1.3, color: '#FFFFFF' }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.82)', transition: 'color 0.22s ease' }}>
          {summary}
        </Typography>
      </Paper>
    </motion.div>
  );
}

function TechCards() {
  const HArrow = () => (
    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', flexShrink: 0, alignSelf: 'center' }}>
      <Box sx={{ width: 28, height: 3, backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(13,118,110,0.45)' }} />
      <Box sx={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: (theme) => `10px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(13,118,110,0.45)'}` }} />
    </Box>
  );

  const VConnector = () => (
    <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center' }}>
      <Box sx={{ width: 2, height: 16, backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(13,118,110,0.3)' }} />
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'center' }, gap: 0 }}>
      <TechCard accent={TC.mode}    stepNum="01" icon={<SchoolIcon    sx={{ fontSize: 22 }} />} title="Choose a Mode"       summary="Select your analysis type before uploading."      delay={0} />
      <HArrow />
      <TechCard accent={TC.upload}  stepNum="02" icon={<ImageIcon     sx={{ fontSize: 22 }} />} title="Upload Mammogram"    summary="Submit a single image or sequential scans."       delay={0.07} />
      <HArrow />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.14, ease: 'easeOut' }} style={{ flex: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <TechCard accent={TC.cnn} stepNum="03" icon={<ScienceIcon   sx={{ fontSize: 22 }} />} title="Classical CNN"       summary="[Placeholder]"                                   delay={0} />
          <VConnector />
          <TechCard accent={TC.qml} stepNum="04" icon={<ClassicalIcon sx={{ fontSize: 22 }} />} title="Quantum ML"          summary="[Placeholder]"                                   delay={0} />
        </Box>
      </motion.div>
      <HArrow />
      <TechCard accent={TC.results} stepNum="05" icon={<ScienceIcon   sx={{ fontSize: 22 }} />} title="Side-by-Side Results" summary="Compare CNN vs QML outputs directly."            delay={0.21} />
    </Box>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [currentSection, setCurrentSection] = useState(0);
  const sectionH = `calc(100vh - ${NAV_H}px)`;

  const goUp   = useCallback(() => scrollToId(SECTION_IDS[Math.max(0, currentSection - 1)]), [currentSection]);
  const goDown = useCallback(() => scrollToId(SECTION_IDS[Math.min(SECTION_IDS.length - 1, currentSection + 1)]), [currentSection]);

  useEffect(() => {
    const observers = SECTION_IDS.map((id, i) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setCurrentSection(i); },
        { rootMargin: `-${NAV_H}px 0px 0px 0px`, threshold: 0.5 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, []);

  const inHero    = currentSection === 0;
  const inAbout   = currentSection === 1;
  const inWhy     = currentSection === 2;
  const inTech    = currentSection === 3;
  const inSupport = currentSection === 4;

  return (
    <Box sx={{ backgroundColor: 'background.default' }}>

      <SectionArrows current={currentSection} total={SECTION_IDS.length} onUp={goUp} onDown={goDown} />

      {/* ── 1. HERO ── */}
      <Box id="hero" sx={{ height: sectionH, position: 'relative', background: (theme) => theme.palette.background.hero, display: 'flex', flexDirection: 'column', '&::before': { content: '""', position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '800px', borderRadius: '50%', background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}12 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 } }}>
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden', backgroundImage: (theme) => `linear-gradient(${theme.palette.primary.main}06 1px, transparent 1px), linear-gradient(90deg, ${theme.palette.primary.main}06 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
        <NeuralCanvas />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 2, py: 2, position: 'relative', zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
            <Chip label="● Version 0.2 - Sprint 2" size="small" sx={{ mb: 2.5, bgcolor: (theme) => `${theme.palette.primary.main}12`, color: 'primary.main', letterSpacing: '0.06em', fontSize: '0.7rem', fontWeight: 700, border: '1px solid', borderColor: (theme) => `${theme.palette.primary.main}28`, borderRadius: '999px' }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, ease: 'easeOut', delay: 0.1 }}>
            <Typography variant="h1" sx={{ mb: 1, fontSize: { xs: '2.2rem', md: '3.5rem' }, maxWidth: 800, mx: 'auto', color: 'text.primary' }}>Revealing the</Typography>
            <Typography variant="h1" sx={{ mb: 3, fontSize: { xs: '2.2rem', md: '3.5rem' }, maxWidth: 800, mx: 'auto', fontStyle: 'italic', background: (theme) => theme.palette.mode === 'dark' ? `linear-gradient(90deg, #2DD4BF, #5EEAD4)` : `linear-gradient(90deg, #0D9488, #14B8A6)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Invisible.</Typography>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut', delay: 0.25 }}>
            <Typography sx={{ color: 'text.secondary', maxWidth: 500, mx: 'auto', lineHeight: 1.8, mb: 4, fontSize: '1rem', fontStyle: 'italic' }}>
              An educational platform comparing standard and quantum-enhanced AI to detect hidden precursors of breast cancer — making complex diagnostics transparent and visual.
            </Typography>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut', delay: 0.4 }}>
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={() => navigate('/Analysis')} sx={{ px: 3, py: 1.1, fontSize: '0.88rem', color: '#FFFFFF !important' }}>Launch Analysis Dashboard →</Button>
              <Button onClick={() => navigate('/Models')} variant="outlined" sx={{ px: 3, py: 1.1, fontSize: '0.88rem', borderRadius: '999px', borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(13,118,110,0.6)', color: (theme) => theme.palette.mode === 'dark' ? '#E8EEF8' : '#0F766E', '&:hover': { backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(13,148,136,0.08)', borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.55)' : '#0D9488', color: (theme) => theme.palette.mode === 'dark' ? '#FFFFFF' : '#0D9488' } }}>Our Models</Button>
            </Box>
          </motion.div>
        </Box>

        {/* Stats strip */}
        <Box sx={(theme) => ({
          flexShrink: 0,
          borderTop: `2px solid ${theme.palette.background.heroStatsBorder}`,
          backgroundColor: theme.palette.background.heroStatsBg,
          position: 'relative',
          zIndex: 1,
        })}>
          <Container maxWidth="lg">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' } }}>
              {HERO_STATS.map((stat, i, arr) => (
                <Box key={stat.value} sx={(theme) => {
                  const b = `2px solid ${theme.palette.background.heroStatsBorder}`;
                  return {
                    textAlign: 'center',
                    py: { xs: 2.5, md: 3 },
                    px: { xs: 1.5, md: 2.5 },
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                    borderRight:  { xs: i % 2 === 0        ? b : 'none', md: i < arr.length - 1 ? b : 'none' },
                    borderBottom: { xs: i < 2              ? b : 'none', md: 'none' },
                  };
                }}>
                  <Box sx={{ height: 36, display: 'flex', alignItems: 'center', mb: 1, color: (theme) => theme.palette.mode === 'dark' ? '#2DD4BF' : 'rgba(255,255,255,0.95)' }}>
                    <stat.Icon sx={ICON_SX} />
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.5rem' }, color: (theme) => theme.palette.mode === 'dark' ? '#2DD4BF' : '#FFFFFF', lineHeight: 1.1, mb: 0.75 }}>
                    <AnimatedCounter end={stat.numericEnd} prefix={stat.prefix} suffix={stat.suffix} isDecimal={stat.value.includes('.')} isVisible={inHero} />
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.67rem', lineHeight: 1.45, display: 'block', maxWidth: 160, fontStyle: 'italic' }}>{stat.label}</Typography>
                </Box>
              ))}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', pt: 0.5, pb: 1.5, color: 'rgba(255,255,255,0.45)', fontSize: '0.62rem', letterSpacing: '0.02em' }}>
              Data sourced from the AIHW BreastScreen Australia Monitoring Report (2025) and Cancer Australia.
            </Typography>
          </Container>
        </Box>
      </Box>

      {/* ── 2. ABOUT ── */}
      <Box id="about" sx={{ height: sectionH, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <DotGrid />
        <Container maxWidth="lg" sx={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: { xs: 4, md: 8 }, alignItems: 'center' }}>
            <FadeUp isVisible={inAbout}>
              <SectionLabel icon={<SchoolIcon sx={{ fontSize: 16 }} />} label="About the project" color={A.teal} />
              <Typography variant="h3" sx={{ mb: 2, lineHeight: 1.25, color: 'text.primary' }}>
                What is Q-INTERVAL-Lite+?
              </Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.8, fontSize: '0.95rem', mb: 2 }}>
                Started as a Swinburne University capstone project, Q-INTERVAL-Lite+ is an interactive
                web platform exploring how quantum-enhanced AI can detect subtle, clinically invisible
                signs of breast cancer in mammograms. Whether classifying abnormalities, assessing
                composite risk, or predicting future risk from sequential scans, the platform aims to
                make complex AI diagnostics transparent, visual, and comparable.
              </Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.8, fontSize: '0.95rem' }}>
                Built by a multidisciplinary team of Swinburne students across Software Development,
                Artificial Intelligence, and Cybersecurity, the platform runs every uploaded scan
                through two entirely separate AI pipelines simultaneously — a Classical CNN and a
                Quantum ML model — surfacing both results side by side so users can directly observe
                how each paradigm interprets the same tissue data.
              </Typography>
            </FadeUp>
            <FadeUp isVisible={inAbout} delay={0.15}>
              <ImageSlot accent={A.teal} label="Image / Diagram placeholder" />
            </FadeUp>
          </Box>
        </Container>
      </Box>

      {/* ── 3. WHY ── */}
      <Box id="why" sx={{ height: sectionH, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <DiagonalLines />
        <Container maxWidth="lg" sx={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 3fr' }, gap: { xs: 4, md: 10 }, alignItems: 'center' }}>
            <FadeUp isVisible={inWhy} delay={0.1}>
              <Box sx={{ order: { xs: 1, md: 0 } }}>
                <ImageSlot accent={A.violet} label="Image / Diagram placeholder" ratio="3/4" />
              </Box>
            </FadeUp>
            <FadeUp isVisible={inWhy}>
              <Box sx={{ order: { xs: 0, md: 1 } }}>
                <SectionLabel icon={<HeartIcon sx={{ fontSize: 16 }} />} label="Why it matters" color={A.violet} />
                <Typography variant="h3" sx={{ mb: 2, lineHeight: 1.15, color: 'text.primary', fontSize: { xs: '2rem', md: '2.2rem' } }}>
                  The Gap in Standard Screening
                </Typography>
                <Box sx={{ borderLeft: `3px solid ${A.violet}`, pl: 2.5, mb: 2, py: 0.5 }}>
                  <Typography sx={{ color: 'text.primary', lineHeight: 1.65, fontSize: '0.88rem', fontStyle: 'italic', opacity: 0.85 }}>
                    Interval cancers are not simply missed tumors; they are biologically aggressive cancers that rapidly emerge between routine screenings.
                  </Typography>
                </Box>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.75, fontSize: '0.88rem' }}>
                  Because they often mask themselves within complex, dense breast tissue, they remain virtually invisible to the human eye on a baseline mammogram until they reach an advanced, highly dangerous stage. Catching them requires more than just looking closer.
                  <br /><br />
                  Q-INTERVAL-Lite+ investigates whether quantum-enhanced AI can penetrate this visual noise, detecting the microscopic, structural precursors of these deadly tumors before they ever have the chance to surface.
                </Typography>
              </Box>
            </FadeUp>
          </Box>
        </Container>
      </Box>

      {/* ── 4. TECHNOLOGY ── */}
      <Box id="technology" sx={{ height: sectionH, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <SparsePlus />
        <Container maxWidth="lg" sx={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <FadeUp isVisible={inTech}>
            <Box sx={{ mb: 4 }}>
              <SectionLabel icon={<ClassicalIcon sx={{ fontSize: 16 }} />} label="Technology" color={A.amber} />
              <Typography variant="h3" sx={{ mb: 1.5, lineHeight: 1.25, maxWidth: 560, color: 'text.primary' }}>
                How does it work?
              </Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.8, fontSize: '0.88rem', maxWidth: 560 }}>
                [Placeholder — a short intro to the technical approach.]
              </Typography>
            </Box>
            <TechCards />
          </FadeUp>
        </Container>
      </Box>

      {/* ── 5. SUPPORT ── */}
      <Box id="support" sx={{ height: sectionH, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <HorizontalLines />
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
          <Container maxWidth="md" sx={{ width: '100%' }}>
            <FadeUp isVisible={inSupport}>
              <Box sx={{ position: 'relative', borderRadius: 3, overflow: 'hidden', backgroundColor: 'background.default', border: '2px solid rgba(232,83,122,0.25)', boxShadow: '0 4px 24px rgba(232,83,122,0.08)', p: { xs: 3, md: 4 }, textAlign: 'center' }}>
                <Box sx={{ position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,83,122,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <HeartIcon sx={{ fontSize: 32, color: A.pink, mb: 1.25 }} />
                <Typography variant="h5" sx={{ mb: 1.25, color: 'text.primary', fontWeight: 700 }}>Patient Support &amp; Resources</Typography>
                <Typography sx={{ color: 'text.secondary', maxWidth: 500, mx: 'auto', mb: 3, lineHeight: 1.75, fontSize: '0.88rem' }}>
                  Whether you're navigating a diagnosis, supporting a loved one, or seeking guidance,
                  the organisations below provide trusted support, information, and free screening
                  services across Australia.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, textAlign: 'left' }}>
                  {SUPPORT_ORGS.map((org, i) => (
                    <motion.div key={i} whileHover={{ y: -3, transition: { duration: 0.18 } }}>
                      <Box
                        component="a"
                        href={org.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2,
                          borderRadius: 2, backgroundColor: 'background.paper',
                          border: '1px solid', borderColor: 'divider',
                          textDecoration: 'none', transition: 'border-color 0.2s, background-color 0.2s',
                          '&:hover': { backgroundColor: 'rgba(232,83,122,0.05)', borderColor: 'rgba(232,83,122,0.3)' },
                        }}
                      >
                        <OrgLogo domain={org.domain} name={org.name} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700, fontSize: '0.82rem', mb: 0.25 }}>{org.name}</Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.76rem', lineHeight: 1.5 }}>{org.description}</Typography>
                        </Box>
                        <LinkIcon sx={{ fontSize: 13, color: 'text.disabled', mt: '3px', flexShrink: 0 }} />
                      </Box>
                    </motion.div>
                  ))}
                </Box>
              </Box>
            </FadeUp>
          </Container>
        </Box>

        {/* Disclaimer */}
        <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', py: 3, backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'background.default' : '#1E3048', position: 'relative', zIndex: 1 }}>
          <Container maxWidth="md">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: { xs: 'center', md: 'flex-start' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <ShieldIcon sx={{ fontSize: 20, color: A.red, opacity: 0.85 }} />
                <Typography sx={{ color: A.red, fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Disclaimer</Typography>
              </Box>
              <Typography sx={{ color: (theme) => theme.palette.mode === 'dark' ? 'text.secondary' : 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.6, fontWeight: 500 }}>
                Research prototype only. Not validated for clinical use. Must not be used to inform medical decisions.
              </Typography>
            </Box>
          </Container>
        </Box>
      </Box>

    </Box>
  );
}