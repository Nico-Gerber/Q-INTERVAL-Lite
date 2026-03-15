
import React from 'react';
import { 
  Box, Container, Grid, Typography, Link, IconButton, Divider, Chip, useTheme, useMediaQuery
} from '@mui/material';
import { 
  GitHub, LinkedIn, Email, Phone, LocationOn, 
  School, Code, Security, Analytics, Timeline
} from '@mui/icons-material';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box 
      component="footer"
      sx={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        pt: { xs: 4, sm: 5, md: 6 },
        pb: { xs: 2, sm: 2.5, md: 3 },
        mt: { xs: 4, sm: 6, md: 8 },
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <Container maxWidth="lg">

        {}
        <Box sx={{ mt: { xs: 1, md: 1 }, pt: { xs: 1, md: 1 } }}>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)', mb: { xs: 1, md: 3 } }} />
          <Typography 
            variant={isMobile ? "subtitle1" : "h6"}
            align="center" 
            gutterBottom 
            sx={{ 
              fontWeight: 'bold', 
              mb: { xs: 1.5, md: 2 }
            }}
          >
            Built With Modern Technology
          </Typography>
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            flexWrap: 'wrap', 
            gap: { xs: 0.5, sm: 1 }, 
            mb: { xs: 2, md: 3 }
          }}>
            {[
              'React.js', 'FastAPI', 'Material-UI', 'Chart.js', 'Python', 'Scikit-learn', 
              'Machine Learning', 'NLP', 'JavaScript', 'CSS3'
            ].map((tech, index) => (
              <Chip
                key={index}
                label={tech}
                size={isSmall ? "small" : "medium"}
                className="footer-tech-chip"
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                  height: { xs: '24px', sm: '28px', md: '32px' },
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    transform: 'translateY(-1px)'
                  },
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </Box>
        </Box>

        {}
        <Box sx={{
          position: 'absolute',
          bottom: { xs: -10, md: -20 },
          right: { xs: -10, md: -20 },
          width: { xs: 60, md: 100 },
          height: { xs: 60, md: 100 },
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
          zIndex: 0,
          display: { xs: 'none', sm: 'block' } 
        }} />
        <Box sx={{
          position: 'absolute',
          top: { xs: 10, md: 20 },
          left: { xs: -15, md: -30 },
          width: { xs: 50, md: 80 },
          height: { xs: 50, md: 80 },
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
          zIndex: 0,
          display: { xs: 'none', sm: 'block' } 
        }} />
      </Container>
    </Box>
  );
};

export default Footer;
