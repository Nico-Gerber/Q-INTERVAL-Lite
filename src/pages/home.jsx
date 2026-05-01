import React, { useState, useEffect, useCallback } from 'react';
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

const A = {
  teal:   '#2DD4BF',
  violet: '#7C3AED',
  amber:  '#FBBF24',
  red:    '#F87171',
  pink:   '#E8537A',
};

const NAV_H = 70;
const SECTION_IDS = ['hero', 'about', 'why', 'technology', 'support'];

const ICON_SX = { fontSize: 26, color: '#2DD4BF' };

const HERO_STATS = [
  { icon: <PeopleIcon   sx={ICON_SX} />, value: '1 in 7',      label: 'Australian women will be diagnosed with breast cancer in their lifetime.' },
  { icon: <CalendarIcon sx={ICON_SX} />, value: '1.9 Million', label: 'Australian women rely on routine screening cycles biennially.' },
  { icon: <WarningIcon  sx={ICON_SX} />, value: '22%',         label: "Of invasive cancers emerge as 'interval cancers' between routine clear screenings." },
  { icon: <EyeOffIcon   sx={ICON_SX} />, value: '80%+',        label: 'Of interval cancers are deemed clinically invisible to the human eye on prior scans.' },
];

const SUPPORT_ORGS = [
  { name: '[Organisation Name]', description: '[Placeholder — add a short description of this organisation and what support they offer.]', url: '#' },
  { name: '[Organisation Name]', description: '[Placeholder — add a short description of this organisation and what support they offer.]', url: '#' },
  { name: '[Organisation Name]', description: '[Placeholder — add a short description of this organisation and what support they offer.]', url: '#' },
  { name: '[Organisation Name]', description: '[Placeholder — add a short description of this organisation and what support they offer.]', url: '#' },
];



const SectionLabel = ({ icon, label, color }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 2.5, px: 1.5, py: 0.6, borderRadius: '999px', backgroundColor: `${color}12`, border: `1px solid ${color}28` }}>
    <Box sx={{ color, display: 'flex', alignItems: 'center' }}>{icon}</Box>
    <Typography variant="caption" sx={{ color, fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</Typography>
  </Box>
);

const ImageSlot = ({ accent, label, ratio = '4/3' }) => (
  <Box sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', aspectRatio: ratio, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, position: 'relative', overflow: 'hidden', '&::before': { content: '""', position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, ${accent}0D 0%, transparent 70%)`, pointerEvents: 'none' } }}>
    <ImageIcon sx={{ fontSize: 28, color: `${accent}40` }} />
    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', textAlign: 'center', px: 3 }}>{label}</Typography>
  </Box>
);

const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - NAV_H;
  window.scrollTo({ top, behavior: 'smooth' });
};

// Arrow order: up arrow → dots → down arrow
const SectionArrows = ({ current, total, onUp, onDown }) => {
  const btnSx = {
    width: 34, height: 34,
    border: '1px solid rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(11,17,32,0.7)',
    backdropFilter: 'blur(8px)',
    color: '#2DD4BF',
    transition: 'all 0.2s',
    '&:hover': { backgroundColor: 'rgba(45,212,191,0.15)', borderColor: '#2DD4BF' },
  };

  return (
    <Box sx={{ position: 'fixed', right: { xs: 10, md: 20 }, top: '50%', transform: 'translateY(-50%)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>

      {/* Up arrow — top */}
      {current > 0 ? (
        <IconButton onClick={onUp} size="small" sx={btnSx}>
          <ArrowUpIcon sx={{ fontSize: 18 }} />
        </IconButton>
      ) : (
        // Invisible placeholder to keep dots centred
        <Box sx={{ width: 34, height: 34 }} />
      )}

      {/* Section dots — middle */}
      {Array.from({ length: total }).map((_, i) => (
        <Box
          key={i}
          onClick={() => scrollToId(SECTION_IDS[i])}
          sx={{ width: i === current ? 8 : 5, height: i === current ? 8 : 5, borderRadius: '50%', backgroundColor: i === current ? '#2DD4BF' : 'rgba(255,255,255,0.22)', transition: 'all 0.2s', cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(45,212,191,0.6)' } }}
        />
      ))}

      {/* Down arrow — bottom */}
      {current < total - 1 ? (
        <IconButton onClick={onDown} size="small" sx={btnSx}>
          <ArrowDownIcon sx={{ fontSize: 18 }} />
        </IconButton>
      ) : (
        <Box sx={{ width: 34, height: 34 }} />
      )}

    </Box>
  );
};

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

  return (
    <Box sx={{ backgroundColor: 'background.default' }}>

      <SectionArrows current={currentSection} total={SECTION_IDS.length} onUp={goUp} onDown={goDown} />

      {/* ── 1. HERO ── */}
      <Box id="hero" sx={{ height: sectionH, position: 'relative', overflow: 'hidden', background: (theme) => theme.palette.background.hero, display: 'flex', flexDirection: 'column', '&::before': { content: '""', position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '800px', borderRadius: '50%', background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`, pointerEvents: 'none' } }}>
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: (theme) => `linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px), linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 2, py: 2, position: 'relative' }}>
          <Chip label="● [Status badge — e.g. V1.4 Diagnostic Engine Live]" size="small"
            sx={{ mb: 2.5, bgcolor: (theme) => `${theme.palette.primary.main}12`, color: 'primary.main', letterSpacing: '0.06em', fontSize: '0.7rem', fontWeight: 700, border: '1px solid', borderColor: (theme) => `${theme.palette.primary.main}28`, borderRadius: '999px' }}
          />
          <Typography variant="h1" sx={{ mb: 1, fontSize: { xs: '2.2rem', md: '3.5rem' }, maxWidth: 800, mx: 'auto', color: 'text.primary' }}>
            [Primary Headline.]
          </Typography>
          <Typography variant="h1" sx={{ mb: 3, fontSize: { xs: '2.2rem', md: '3.5rem' }, maxWidth: 800, mx: 'auto', background: (theme) => `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            [Accent Word.]
          </Typography>
          <Typography sx={{ color: 'text.secondary', maxWidth: 540, mx: 'auto', lineHeight: 1.8, mb: 4, fontSize: '1rem' }}>
            [Placeholder — add a 2–3 sentence description of what this project does and why it matters.]
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={() => navigate('/Analysis')} sx={{ px: 3, py: 1.1, fontSize: '0.88rem' }}>
              Launch Analysis Dashboard →
            </Button>
            <Button onClick={() => navigate('/Models')}
              sx={{ px: 3, py: 1.1, fontSize: '0.88rem', color: 'rgba(232,238,248,0.75)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '999px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.3)', color: '#E8EEF8' } }}>
              Our Models
            </Button>
          </Box>
        </Box>
        <Box sx={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}>
          <Container maxWidth="lg">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' } }}>
              {HERO_STATS.map((stat, i, arr) => (
                <Box key={stat.value} sx={{ textAlign: 'center', py: { xs: 2.5, md: 3 }, px: { xs: 1.5, md: 2.5 }, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', borderRight: { xs: i % 2 === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none', md: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }, borderBottom: { xs: i < 2 ? '1px solid rgba(255,255,255,0.08)' : 'none', md: 'none' } }}>
                  {/* Icon — fixed height so all values start at same point */}
                  <Box sx={{ height: 36, display: 'flex', alignItems: 'center', mb: 1 }}>
                    {stat.icon}
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.5rem' }, color: 'primary.main', lineHeight: 1.1, mb: 0.75 }}>{stat.value}</Typography>
                  <Typography variant="caption" sx={{ color: '#E8EEF8', fontSize: '0.67rem', lineHeight: 1.45, display: 'block', maxWidth: 160 }}>{stat.label}</Typography>
                </Box>
              ))}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', pt: 0.5, pb: 1.5, color: 'rgba(232,238,248,0.22)', fontSize: '0.62rem', letterSpacing: '0.02em' }}>
              Data sourced from the AIHW BreastScreen Australia Monitoring Report (2025) and Cancer Australia.
            </Typography>
          </Container>
        </Box>
      </Box>

      {/* ── 2. ABOUT ── */}
      <Box id="about" sx={{ height: sectionH, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <Container maxWidth="lg" sx={{ width: '100%' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: { xs: 4, md: 8 }, alignItems: 'center' }}>
            <Box>
              <SectionLabel icon={<SchoolIcon sx={{ fontSize: 16 }} />} label="About the project" color={A.teal} />
              <Typography variant="h3" sx={{ mb: 2.5, lineHeight: 1.25, color: 'text.primary' }}>[What is Q-INTERVAL-Lite+?]</Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.9, fontSize: '1.05rem', mb: 2.5 }}>
                [Placeholder — describe the project goals, scope, and the problem it aims to solve. Give first-time visitors a clear understanding of what Q-INTERVAL-Lite+ is and the context it was built in.]
              </Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.9, fontSize: '1.05rem' }}>
                [Placeholder — a second paragraph if needed. Explain how it fits into the broader landscape of medical AI research.]
              </Typography>
            </Box>
            <ImageSlot accent={A.teal} label="Image / Diagram placeholder" />
          </Box>
        </Container>
      </Box>

      {/* ── 3. WHY IT MATTERS ── */}
      <Box id="why" sx={{ height: sectionH, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <Container maxWidth="lg" sx={{ width: '100%' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 3fr' }, gap: { xs: 4, md: 10 }, alignItems: 'center' }}>
            <Box sx={{ order: { xs: 1, md: 0 } }}>
              <ImageSlot accent={A.violet} label="Image / Diagram placeholder" ratio="3/4" />
            </Box>
            <Box sx={{ order: { xs: 0, md: 1 } }}>
              <SectionLabel icon={<HeartIcon sx={{ fontSize: 16 }} />} label="Why it matters" color={A.violet} />
              <Typography variant="h3" sx={{ mb: 2.5, lineHeight: 1.25, color: 'text.primary' }}>[Section Heading]</Typography>
              <Box sx={{ borderLeft: `3px solid ${A.violet}`, pl: 2.5, mb: 3, py: 0.5 }}>
                <Typography sx={{ color: 'text.primary', lineHeight: 1.75, fontSize: '1.1rem', fontStyle: 'italic', opacity: 0.8 }}>
                  "[Placeholder — a single impactful sentence or statistic about the clinical problem.]"
                </Typography>
              </Box>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.9, fontSize: '1.05rem' }}>
                [Placeholder — explain the clinical or research motivation. Why are interval cancers hard to detect?]
              </Typography>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ── 4. TECHNOLOGY ── */}
      <Box id="technology" sx={{ height: sectionH, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <Container maxWidth="lg" sx={{ width: '100%' }}>
          <Box sx={{ mb: 5 }}>
            <SectionLabel icon={<ClassicalIcon sx={{ fontSize: 16 }} />} label="Technology" color={A.amber} />
            <Typography variant="h3" sx={{ mb: 1.5, lineHeight: 1.25, maxWidth: 560, color: 'text.primary' }}>[How does it work?]</Typography>
            <Typography sx={{ color: 'text.secondary', lineHeight: 1.85, fontSize: '1.05rem', maxWidth: 620 }}>
              [Placeholder — a short intro to the technical approach.]
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1.5fr 1.5fr' }, gap: 2.5 }}>
            {[
              { icon: <ScienceIcon sx={{ fontSize: 22 }} />,   accent: A.teal,   title: 'Classical CNN', body: '[Placeholder — brief description of the CNN model, what it does, and what it was trained on.]', tall: true  },
              { icon: <ClassicalIcon sx={{ fontSize: 22 }} />, accent: A.violet, title: 'Quantum AI',    body: '[Placeholder — brief description of the quantum model and what makes it distinct.]',            tall: false },
              { icon: <SchoolIcon sx={{ fontSize: 22 }} />,   accent: A.amber,  title: 'Tech Stack',   body: '[Placeholder — React, FastAPI, PyTorch, PennyLane.]',                                          tall: false },
            ].map((card) => (
              <Paper key={card.title} elevation={0}
                sx={{ p: 3.5, pt: card.tall ? 5 : 3.5, pb: card.tall ? 5 : 3.5, display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', overflow: 'hidden', borderRadius: 3, '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '3px', backgroundColor: card.accent, opacity: 0.8 } }}>
                <Box sx={{ width: 44, height: 44, borderRadius: '10px', backgroundColor: `${card.accent}15`, border: `1px solid ${card.accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.accent }}>
                  {card.icon}
                </Box>
                <Typography variant="h6" sx={{ color: 'text.primary' }}>{card.title}</Typography>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.75, fontSize: '0.92rem' }}>{card.body}</Typography>
              </Paper>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ── 5. PATIENT SUPPORT + DISCLAIMER + FOOTER — all in one viewport ── */}
      <Box
        id="support"
        sx={{
          height: sectionH,
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Patient support — takes remaining space */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          <Container maxWidth="md" sx={{ width: '100%' }}>
            <Box sx={{ position: 'relative', borderRadius: 3, overflow: 'hidden', backgroundColor: 'background.default', border: '1px solid rgba(232,83,122,0.25)', boxShadow: '0 4px 24px rgba(232,83,122,0.08)', p: { xs: 3, md: 4 }, textAlign: 'center' }}>
              <Box sx={{ position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,83,122,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <HeartIcon sx={{ fontSize: 32, color: A.pink, mb: 1.25 }} />
              <Typography variant="h5" sx={{ mb: 1.25, color: 'text.primary', fontWeight: 700 }}>Patient Support &amp; Resources</Typography>
              <Typography sx={{ color: 'text.secondary', maxWidth: 500, mx: 'auto', mb: 3, lineHeight: 1.75, fontSize: '0.92rem' }}>
                [Placeholder — add a sentence or two explaining why you're pointing users to these organisations and what kind of support they can expect to find.]
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, textAlign: 'left' }}>
                {SUPPORT_ORGS.map((org, i) => (
                  <Box key={i} component="a" href={org.url} target="_blank" rel="noopener noreferrer"
                    sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2, borderRadius: 2, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', textDecoration: 'none', transition: 'all 0.2s', '&:hover': { backgroundColor: 'rgba(232,83,122,0.05)', borderColor: 'rgba(232,83,122,0.3)', transform: 'translateY(-2px)' } }}>
                    <LinkIcon sx={{ fontSize: 15, color: 'text.disabled', mt: '3px', flexShrink: 0 }} />
                    <Box>
                      <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700, fontSize: '0.82rem', mb: 0.25 }}>{org.name}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.76rem', lineHeight: 1.5 }}>{org.description}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Container>
        </Box>

        {/* Disclaimer bar */}
        <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', py: 3, backgroundColor: 'background.default' }}>
          <Container maxWidth="md">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: { xs: 'center', md: 'flex-start' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <ShieldIcon sx={{ fontSize: 20, color: A.red, opacity: 0.85 }} />
                <Typography sx={{ color: A.red, fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Disclaimer
                </Typography>
              </Box>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.6, fontWeight: 500 }}>
                Research prototype only. Not validated for clinical use. Must not be used to inform medical decisions.
              </Typography>
            </Box>
          </Container>
        </Box>


      </Box>

    </Box>
  );
}