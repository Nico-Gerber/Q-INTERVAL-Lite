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

// ── Replace these with your real organisation links ──
const SUPPORT_ORGS = [
  {
    name: '[Organisation Name]',
    description: '[Placeholder — add a short description of this organisation and what support they offer.]',
    url: '#',
  },
  {
    name: '[Organisation Name]',
    description: '[Placeholder — add a short description of this organisation and what support they offer.]',
    url: '#',
  },
  {
    name: '[Organisation Name]',
    description: '[Placeholder — add a short description of this organisation and what support they offer.]',
    url: '#',
  },
  {
    name: '[Organisation Name]',
    description: '[Placeholder — add a short description of this organisation and what support they offer.]',
    url: '#',
  },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 10 }}>

      {/* ── Hero ── */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(160deg, #0A0F1A 0%, #0D1F3C 60%, #0A1628 100%)',
          color: 'white',
          py: { xs: 8, md: 14 },
          px: 2,
          textAlign: 'center',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-40%', left: '50%',
            transform: 'translateX(-50%)',
            width: '600px', height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,212,160,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          },
        }}
      >
        {/* Grid overlay */}
        <Box sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `linear-gradient(rgba(0,212,160,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,160,0.04) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />

        <Chip
          label="● [Status badge — e.g. V1.4 Diagnostic Engine Live]"
          size="small"
          sx={{ mb: 3, backgroundColor: 'rgba(0,212,160,0.1)', color: '#00D4A0', letterSpacing: '0.06em', fontSize: '0.7rem', fontWeight: 700, border: '1px solid rgba(0,212,160,0.3)', borderRadius: '999px' }}
        />

        {/* Main headline — replace with your project tagline */}
        <Typography variant="h2" sx={{ fontWeight: 900, mb: 1, fontSize: { xs: '2.4rem', md: '3.75rem' }, color: 'white' }}>
          [Primary Headline.]
        </Typography>
        <Typography variant="h2" sx={{ fontWeight: 900, mb: 3, fontSize: { xs: '2.4rem', md: '3.75rem' }, background: 'linear-gradient(90deg, #00D4A0, #00F5C4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          [Accent Word.]
        </Typography>

        {/* Subheading — replace with your project description */}
        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400, maxWidth: 580, mx: 'auto', lineHeight: 1.75, mb: 5 }}>
          [Placeholder — add a 2–3 sentence description of what this project does and why it matters. This is the first thing visitors read, so make it count.]
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/Analysis')}
            sx={{ px: 4, py: 1.5, fontSize: '1rem' }}
          >
            Launch Analysis Dashboard →
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => navigate('/Models')}
            sx={{ px: 4, py: 1.5, fontSize: '1rem' }}
          >
            How It Works
          </Button>
        </Box>
      </Box>

      {/* ── Patient Support & Resources ── */}
      <Container maxWidth="md" sx={{ mt: { xs: 6, md: 10 } }}>
        <Box
          sx={{
            position: 'relative',
            borderRadius: 3,
            overflow: 'hidden',
            background: 'linear-gradient(160deg, #0D1B2E 0%, #0A1628 60%, #0D2240 100%)',
            border: '1px solid rgba(0,212,160,0.12)',
            p: { xs: 3, md: 5 },
            textAlign: 'center',
          }}
        >
          <Box sx={{ position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,160,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <HeartIcon sx={{ fontSize: 36, color: '#00D4A0', mb: 1.5, opacity: 0.85 }} />

          <Typography variant="h5" sx={{ fontWeight: 800, color: 'white', mb: 1 }}>
            Patient Support &amp; Resources
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', maxWidth: 500, mx: 'auto', mb: 4, lineHeight: 1.7 }}>
            [Placeholder — add a sentence or two explaining why you're pointing users to these organisations and what kind of support they can expect to find.]
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, textAlign: 'left' }}>
            {SUPPORT_ORGS.map((org, i) => (
              <Box
                key={i}
                component="a"
                href={org.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.5,
                  p: 2.5, borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                  '&:hover': { backgroundColor: 'rgba(0,212,160,0.07)', borderColor: 'rgba(0,212,160,0.25)', transform: 'translateY(-2px)' },
                }}
              >
                <LinkIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.25)', mt: '3px', flexShrink: 0 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 700, fontSize: '0.85rem', mb: 0.4 }}>
                    {org.name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                    {org.description}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>

      {/* ── About This Project ── */}
      <Container maxWidth="md" sx={{ mt: { xs: 6, md: 8 } }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Chip
            label="[Course code · Unit name]"
            size="small"
            sx={{ mb: 2, backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.68rem', letterSpacing: '0.06em' }}
          />
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'white', mb: 1 }}>
            About This Project
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', maxWidth: 480, mx: 'auto' }}>
            [Placeholder — one sentence summarising the project context, e.g. institution and unit.]
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>

          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, borderLeft: '3px solid #00D4A0' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <SchoolIcon sx={{ fontSize: 18, color: '#00D4A0' }} />
              <Typography variant="caption" sx={{ color: '#00D4A0', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                What is this?
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              [Placeholder — describe the project goals, scope, and the problem it aims to solve.]
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, borderLeft: '3px solid #7C3AED' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <HeartIcon sx={{ fontSize: 18, color: '#7C3AED' }} />
              <Typography variant="caption" sx={{ color: '#7C3AED', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Why it matters
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              [Placeholder — explain the clinical or research motivation and the benefit this approach provides.]
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, borderLeft: '3px solid #F59E0B' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <ClassicalIcon sx={{ fontSize: 18, color: '#F59E0B' }} />
              <Typography variant="caption" sx={{ color: '#F59E0B', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Technology
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              [Placeholder — overview of the tech stack and architecture. e.g. React, FastAPI, PyTorch, PennyLane, CNN, quantum circuits.]
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, borderRadius: 2, borderLeft: '3px solid rgba(255,77,106,0.6)', backgroundColor: 'rgba(255,77,106,0.04)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <InfoIcon sx={{ fontSize: 18, color: '#FF4D6A' }} />
              <Typography variant="caption" sx={{ color: '#FF4D6A', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Disclaimer
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              [Placeholder — state clearly that this is a research prototype not intended for clinical use. Replace with your own wording if needed.]
            </Typography>
          </Paper>

        </Box>
      </Container>

    </Box>
  );
}