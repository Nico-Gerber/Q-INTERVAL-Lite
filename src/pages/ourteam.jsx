import React from 'react';
import {
  Container,
  Typography,
  Card,
  CardContent,
  Avatar,
  Box,
  Paper,
  Divider,
} from '@mui/material';
import { Person, School, Email } from '@mui/icons-material';


const OurTeam = () => {
  const teamMembers = [
    {
      name: "Nico Gerber",
      major: "Software Development",
      studentId: "104551609",
      email: "104551609@student.swin.edu.au",
      description: "User interface and Full Stack Architecture",

    },
    {
      name: "Josh Celestino",
      major: "Artificial Intelligence",
      studentId: "104550240",
      email: "104550240@student.swin.edu.au",
      description: " "
    },
    {
      name: "Campbell Sholl",
      major: "Cybersecurity",
      studentId: "105375279",
      email: "105375279@student.swin.edu.au",
      description: "",
    },
    {
      name: "Vihanga Peiris",
      major: "Artificial Intelligence",
      studentId: "105006058",
      email: "105006058@student.swin.edu.au",
      description: "",
    },
    {
      name: "Pasindu Pahasara",
      major: "Artificial Intelligence",
      studentId: "104348348",
      email: "104348348@student.swin.edu.au",
      description: "",
    },
    {
      name: "Chee Chen Guo",
      major: "Artificial Intelligence",
      studentId: "104829801",
      email: "104829801@student.swin.edu.au",
      description: "",
    },
  ];

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 12 }, px: { xs: 2, md: 4 } }}>
      {/* Heading */}
      <Typography
        variant="h3"
        component="h1"
        align="center"
        gutterBottom
        sx={{
          fontWeight: 700,
          mb: 2,
          background: 'linear-gradient(90deg, #667eea, #764ba2)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Meet The Team
      </Typography>

      <Typography
        variant="h6"
        align="center"
        color="text.secondary"
        sx={{ mb: 6, maxWidth: 720, mx: 'auto' }}
      >
        Meet the members behind the Q-INTERVAL-Lite+ web applicaiton
      </Typography>

      {/* Cards */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 4,

        }}
      >
        {teamMembers.map((member, index) => (
          <Card
            key={index}
            elevation={3}
            sx={{
              width: 469,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 3,
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-8px)',
                boxShadow: '0 16px 40px rgba(102, 126, 234, 0.25)',
              },
            }}
          >
            <Box
              sx={{
                height: 400,
                background: 'linear-gradient(135deg, #667eea 30%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Avatar
                sx={{
                  width: 90,
                  height: 90,
                  bgcolor: 'white',
                  color: '#667eea',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}
              >
                <Person fontSize="large" />
              </Avatar>
            </Box>

            <CardContent sx={{ textAlign: 'center', flexGrow: 1, p: 4 }}>
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 700, height: 40 }}>
                {member.name}
              </Typography>

              <Typography variant="subtitle1" color="primary.main" gutterBottom>
                {member.major}
              </Typography>

              <Box sx={{ my: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                  <School sx={{ mr: 1, fontSize: 20, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    Student ID: {member.studentId}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Email sx={{ mr: 1, fontSize: 20, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {member.email}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2, opacity: 1 }} />

              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                Roles and Responsibilities
              </Typography>

              <Typography variant="body1" color="text.primary" sx={{ lineHeight: 1.7 }}>
                {member.description}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

    </Container>
  );
};

export default OurTeam;