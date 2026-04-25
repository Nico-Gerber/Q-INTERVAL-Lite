import React from 'react';
import { Container, Typography, Box, Chip, Divider, Avatar } from '@mui/material';
import { School, Email } from '@mui/icons-material';


const TEAM_MEMBERS = [
  { name: 'Nico Gerber',      major: 'Software Development',   studentId: '104551609', email: '104551609@student.swin.edu.au', description: 'User interface and Full Stack Architecture' },
  { name: 'Josh Celestino',   major: 'Artificial Intelligence', studentId: '104550240', email: '104550240@student.swin.edu.au', description: '[Placeholder — add role description]' },
  { name: 'Campbell Sholl',   major: 'Cybersecurity',           studentId: '105375279', email: '105375279@student.swin.edu.au', description: '[Placeholder — add role description]' },
  { name: 'Vihanga Peiris',   major: 'Artificial Intelligence', studentId: '105006058', email: '105006058@student.swin.edu.au', description: '[Placeholder — add role description]' },
  { name: 'Pasindu Pahasara', major: 'Artificial Intelligence', studentId: '104348348', email: '104348348@student.swin.edu.au', description: '[Placeholder — add role description]' },
  { name: 'Chee Chen Guo',    major: 'Artificial Intelligence', studentId: '104829801', email: '104829801@student.swin.edu.au', description: '[Placeholder — add role description]' },
];


const CARD_ACCENTS = ['#2DD4BF', '#7C3AED', '#FBBF24', '#3B82F6', '#2DD4BF', '#7C3AED'];

const initials = (name) => name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

const OurTeam = () => (
  <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 10 }}>

    {/* ── Hero ── */}
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'background.default',
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary',
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
          background: (theme) =>
            `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`,
          pointerEvents: 'none',
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: (theme) => `
            linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px),
            linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      <Chip
        label="SWINBURNE UNIVERSITY · COS40005"
        size="small"
        sx={{
          mb: 3,
          bgcolor: (theme) => `${theme.palette.primary.main}14`,
          color: 'primary.main',
          letterSpacing: '0.08em',
          fontSize: '0.65rem',
          fontWeight: 700,
          border: '1px solid',
          borderColor: (theme) => `${theme.palette.primary.main}30`,
          borderRadius: '999px',
        }}
      />
      <Typography variant="h2" sx={{ fontWeight: 900, mb: 1.5, fontSize: { xs: '2rem', md: '3rem' }, color: 'text.primary' }}>
        Meet The Team
      </Typography>
      <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 520, mx: 'auto', lineHeight: 1.7 }}>
        Meet the members behind the Q-INTERVAL-Lite+ web application.
      </Typography>
    </Box>

    {/* ── Cards grid ── */}
    <Container maxWidth="lg" sx={{ mt: { xs: 4, md: 6 }, px: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
          gap: 3,
        }}
      >
        {TEAM_MEMBERS.map((member, index) => {
          const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
          return (
            <Box
              key={index}
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                backgroundColor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                transition: 'all 0.25s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  borderColor: `${accent}40`,
                  boxShadow: `0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px ${accent}20`,
                },
              }}
            >
              {/* Avatar banner */}
              <Box
                sx={{
                  height: 110,
                  background: `linear-gradient(135deg, ${accent}14, ${accent}06)`,
                  borderBottom: `1px solid ${accent}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Avatar
                  sx={{
                    width: 68,
                    height: 68,
                    backgroundColor: `${accent}14`,
                    border: `2px solid ${accent}35`,
                    color: accent,
                    fontSize: '1.3rem',
                    fontWeight: 800,
                  }}
                >
                  {initials(member.name)}
                </Avatar>
              </Box>

              {/* Content */}
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.25, fontSize: '1rem' }}>
                  {member.name}
                </Typography>
                <Typography variant="caption" sx={{ color: accent, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.68rem' }}>
                  {member.major}
                </Typography>

                <Divider sx={{ my: 2 }} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <School sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>
                      {member.studentId}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Email sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem', wordBreak: 'break-all' }}>
                      {member.email}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700, display: 'block', mb: 0.75 }}>
                    Roles &amp; Responsibilities
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.65, fontSize: '0.82rem' }}>
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
