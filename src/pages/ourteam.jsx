import React from 'react';
import {
  Container, Typography, Box, Chip, Divider,
  Avatar,
} from '@mui/material';
import { Person, School, Email } from '@mui/icons-material';

const teamMembers = [
  { name: 'Nico Gerber',       major: 'Software Development', studentId: '104551609', email: '104551609@student.swin.edu.au', description: 'User interface and Full Stack Architecture' },
  { name: 'Josh Celestino',    major: 'Artificial Intelligence', studentId: '104550240', email: '104550240@student.swin.edu.au', description: '[Placeholder — add role description]' },
  { name: 'Campbell Sholl',    major: 'Cybersecurity',           studentId: '105375279', email: '105375279@student.swin.edu.au', description: '[Placeholder — add role description]' },
  { name: 'Vihanga Peiris',    major: 'Artificial Intelligence', studentId: '105006058', email: '105006058@student.swin.edu.au', description: '[Placeholder — add role description]' },
  { name: 'Pasindu Pahasara',  major: 'Artificial Intelligence', studentId: '104348348', email: '104348348@student.swin.edu.au', description: '[Placeholder — add role description]' },
  { name: 'Chee Chen Guo',     major: 'Artificial Intelligence', studentId: '104829801', email: '104829801@student.swin.edu.au', description: '[Placeholder — add role description]' },
];

// Derive initials from name
const initials = (name) => name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

// Cycle accent colours per card
const ACCENTS = ['#00D4A0', '#7C3AED', '#F59E0B', '#3B82F6', '#00D4A0', '#7C3AED'];

const OurTeam = () => (
  <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 10 }}>

    {/* ── Hero ── */}
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #0A0F1A 0%, #0D1F3C 60%, #0A1628 100%)',
        color: 'white',
        py: { xs: 6, md: 10 },
        px: 2,
        textAlign: 'center',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-40%', left: '50%',
          transform: 'translateX(-50%)',
          width: '500px', height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,160,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        },
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(rgba(0,212,160,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,160,0.03) 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

      <Chip
        label="SWINBURNE UNIVERSITY · COS40005"
        size="small"
        sx={{ mb: 3, backgroundColor: 'rgba(0,212,160,0.1)', color: '#00D4A0', letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700, border: '1px solid rgba(0,212,160,0.25)', borderRadius: '999px' }}
      />
      <Typography variant="h2" sx={{ fontWeight: 900, mb: 1.5, fontSize: { xs: '2rem', md: '3rem' }, color: 'white' }}>
        Meet The Team
      </Typography>
      <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400, maxWidth: 520, mx: 'auto', lineHeight: 1.7 }}>
        Meet the members behind the Q-INTERVAL-Lite+ web application.
      </Typography>
    </Box>

    {/* ── Cards ── */}
    <Container maxWidth="lg" sx={{ mt: { xs: 4, md: 6 } }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
          gap: 3,
        }}
      >
        {teamMembers.map((member, index) => {
          const accent = ACCENTS[index % ACCENTS.length];
          return (
            <Box
              key={index}
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                backgroundColor: '#111827',
                border: '1px solid rgba(255,255,255,0.07)',
                transition: 'all 0.25s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  borderColor: `${accent}40`,
                  boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${accent}20`,
                },
              }}
            >
              {/* Avatar banner */}
              <Box
                sx={{
                  height: 120,
                  background: `linear-gradient(135deg, ${accent}18, ${accent}08)`,
                  borderBottom: `1px solid ${accent}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <Avatar
                  sx={{
                    width: 72,
                    height: 72,
                    backgroundColor: `${accent}18`,
                    border: `2px solid ${accent}40`,
                    color: accent,
                    fontSize: '1.4rem',
                    fontWeight: 800,
                  }}
                >
                  {initials(member.name)}
                </Avatar>
              </Box>

              {/* Content */}
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'white', mb: 0.25, fontSize: '1rem' }}>
                  {member.name}
                </Typography>
                <Typography variant="caption" sx={{ color: accent, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.68rem' }}>
                  {member.major}
                </Typography>

                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.06)' }} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <School sx={{ fontSize: 14, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>
                      {member.studentId}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Email sx={{ fontSize: 14, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', wordBreak: 'break-all' }}>
                      {member.email}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700, display: 'block', mb: 0.75 }}>
                    Roles &amp; Responsibilities
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, fontSize: '0.82rem' }}>
                    {member.description}
                  </Typography>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Container>
  </Box>
);

export default OurTeam;
