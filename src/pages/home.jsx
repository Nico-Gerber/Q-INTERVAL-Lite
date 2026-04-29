import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Chip, Container, Paper, Typography,
} from '@mui/material';
import {
  FavoriteBorder as HeartIcon,
  Link as LinkIcon,
  School as SchoolIcon,
  Memory as ClassicalIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';

const C = {
  teal:        '#2DD4BF',
  tealLight:   '#5EEAD4',
  tealDark:    '#14B8A6',
  tealGlow:    'rgba(45,212,191,0.18)',
  tealTint:    'rgba(45,212,191,0.08)',
  tealBorder:  'rgba(45,212,191,0.2)',
  bgBase:      '#0B1120',
  bgCard:      '#111C2E',
  violet:      '#7C3AED',
  amber:       '#FBBF24',
  red:         '#F87171',
  textPrimary: '#E8EEF8',
  textMuted:   'rgba(232,238,248,0.5)',
  textFaint:   'rgba(232,238,248,0.25)',
  border:      'rgba(255,255,255,0.07)',
};

const SUPPORT_ORGS = [
  { name: '[Organisation Name]', description: '[Placeholder — add a short description of this organisation and what support they offer.]', url: '#' },
  { name: '[Organisation Name]', description: '[Placeholder — add a short description of this organisation and what support they offer.]', url: '#' },
  { name: '[Organisation Name]', description: '[Placeholder — add a short description of this organisation and what support they offer.]', url: '#' },
  { name: '[Organisation Name]', description: '[Placeholder — add a short description of this organisation and what support they offer.]', url: '#' },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <Box sx={{ backgroundColor: C.bgBase, minHeight: '100%', pb: 10 }}>

      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(160deg, #0B1120 0%, #0F1A2E 55%, #0B1120 100%)',
          color: C.textPrimary,
          py: { xs: 6, md: 10 },
          px: 2,
          textAlign: 'center',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-40%', left: '50%',
            transform: 'translateX(-50%)',
            width: '600px', height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(45,212,191,0.09) 0%, transparent 70%)',
            pointerEvents: 'none',
          },
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(rgba(45,212,191,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.03) 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

        <Chip label="● [Status badge — e.g. V1.4 Diagnostic Engine Live]" size="small"
          sx={{ mb: 3, backgroundColor: C.tealTint, color: C.teal, letterSpacing: '0.06em', fontSize: '0.7rem', fontWeight: 700, border: `1px solid ${C.tealBorder}`, borderRadius: '999px' }}
        />

        <Typography variant="h2" sx={{ fontWeight: 700, mb: 1, fontSize: { xs: '2.2rem', md: '3.25rem' }, color: C.textPrimary }}>
          [Primary Headline.]
        </Typography>
        <Typography variant="h2" sx={{ fontWeight: 700, mb: 3, fontSize: { xs: '2.2rem', md: '3.25rem' }, background: `linear-gradient(90deg, ${C.teal}, ${C.tealLight})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          [Accent Word.]
        </Typography>

        <Typography variant="h6" sx={{ color: C.textMuted, fontWeight: 400, maxWidth: 580, mx: 'auto', lineHeight: 1.75, mb: 5 }}>
          [Placeholder — add a 2–3 sentence description of what this project does and why it matters.]
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" size="large" onClick={() => navigate('/Analysis')}
            sx={{ px: 4, py: 1.5, fontSize: '1rem' }}>
            Launch Analysis Dashboard →
          </Button>
          <Button variant="outlined" size="large" onClick={() => navigate('/Models')}
            sx={{ px: 4, py: 1.5, fontSize: '1rem' }}>
            How It Works
          </Button>
        </Box>
      </Box>

      {/* ── About This Project ── */}
      <Container maxWidth="md" sx={{ mt: { xs: 6, md: 10 } }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Chip label="[Course code · Unit name]" size="small"
            sx={{ mb: 2, backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', border: `1px solid ${C.border}`, fontSize: '0.68rem', letterSpacing: '0.06em' }}
          />
          <Typography variant="h5" sx={{ fontWeight: 700, color: C.textPrimary, mb: 1 }}>About This Project</Typography>
          <Typography variant="body2" sx={{ color: C.textMuted, maxWidth: 480, mx: 'auto' }}>
            [Placeholder — one sentence summarising the project context.]
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.teal}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <SchoolIcon sx={{ fontSize: 18, color: C.teal }} />
              <Typography variant="caption" sx={{ color: C.teal, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>What is this?</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: C.textMuted, lineHeight: 1.7 }}>
              [Placeholder — describe the project goals, scope, and the problem it aims to solve.]
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.violet}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <HeartIcon sx={{ fontSize: 18, color: C.violet }} />
              <Typography variant="caption" sx={{ color: C.violet, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Why it matters</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: C.textMuted, lineHeight: 1.7 }}>
              [Placeholder — explain the clinical or research motivation.]
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <ClassicalIcon sx={{ fontSize: 18, color: C.amber }} />
              <Typography variant="caption" sx={{ color: C.amber, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Technology</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: C.textMuted, lineHeight: 1.7 }}>
              [Placeholder — overview of the tech stack and architecture.]
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, backgroundColor: 'rgba(248,113,113,0.04)', border: `1px solid rgba(248,113,113,0.12)`, borderLeft: `3px solid ${C.red}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <InfoIcon sx={{ fontSize: 18, color: C.red }} />
              <Typography variant="caption" sx={{ color: C.red, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Disclaimer</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: C.textMuted, lineHeight: 1.7 }}>
              [Placeholder — state clearly that this is a research prototype not intended for clinical use.]
            </Typography>
          </Paper>
        </Box>
      </Container>

      {/* ── Patient Support & Resources ── */}
      <Container maxWidth="md" sx={{ mt: { xs: 6, md: 8 } }}>
        <Box sx={{ position: 'relative', borderRadius: 3, overflow: 'hidden', background: 'linear-gradient(160deg, #0D1525 0%, #0F1A2E 60%, #0D1525 100%)', border: `1px solid ${C.tealBorder}`, p: { xs: 3, md: 5 }, textAlign: 'center' }}>
          <Box sx={{ position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <HeartIcon sx={{ fontSize: 36, color: C.teal, mb: 1.5, opacity: 0.8 }} />
          <Typography variant="h5" sx={{ fontWeight: 700, color: C.textPrimary, mb: 1 }}>Patient Support &amp; Resources</Typography>
          <Typography variant="body2" sx={{ color: C.textMuted, maxWidth: 500, mx: 'auto', mb: 4, lineHeight: 1.7 }}>
            [Placeholder — add a sentence or two explaining why you're pointing users to these organisations.]
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, textAlign: 'left' }}>
            {SUPPORT_ORGS.map((org, i) => (
              <Box key={i} component="a" href={org.url} target="_blank" rel="noopener noreferrer"
                sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, textDecoration: 'none', transition: 'all 0.2s', '&:hover': { backgroundColor: C.tealTint, borderColor: C.tealBorder, transform: 'translateY(-2px)' } }}>
                <LinkIcon sx={{ fontSize: 16, color: C.textFaint, mt: '3px', flexShrink: 0 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ color: C.textPrimary, fontWeight: 700, fontSize: '0.85rem', mb: 0.4 }}>{org.name}</Typography>
                  <Typography variant="body2" sx={{ color: C.textMuted, fontSize: '0.78rem', lineHeight: 1.5 }}>{org.description}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>

    </Box>
  );
}
