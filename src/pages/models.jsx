import React, { useState } from 'react';
import { Box, Chip, Container, Typography, Divider } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Memory as CNNIcon,
  AutoAwesome as QMLIcon,
  ImageSearch as ClassifyIcon,
  MonitorHeart as RiskIcon,
  Build as ImprovingIcon,
  Schedule as SoonIcon,
  ChevronRight as ArrowIcon,
} from '@mui/icons-material';

const MODES = [
  {
    id: 'classification',
    label: 'Classification',
    paletteKey: 'classification',
    icon: <ClassifyIcon sx={{ fontSize: 17 }} />,
    description: 'Detect and classify anomalies across Normal, Benign, and Malignant categories from a single mammogram image.',
  },
  {
    id: 'risk',
    label: 'Risk Prediction',
    paletteKey: 'risk',
    icon: <RiskIcon sx={{ fontSize: 17 }} />,
    description: 'Composite and sequential risk scoring from single or multiple mammogram images.',
  },
];

const PIPELINES = {
  classification: {
    cnn: {
      label: 'Classical CNN',
      paletteKey: 'cnn',
      status: 'improving',
      method: 'Convolutional feature extraction via transfer learning',
      models: [
        { name: 'ResNet18',        role: 'Primary demo model'        },
        { name: 'EfficientNet-B0', role: 'Highest baseline accuracy' },
      ],
    },
    qml: {
      label: 'Quantum ML',
      paletteKey: 'qml',
      status: 'improving',
      method: 'Amplitude-encoded quantum circuits via PennyLane',
      models: [
        { name: 'VQC',  role: 'Variational Quantum Classifier' },
        { name: 'QSVM', role: 'Quantum Support Vector Machine'  },
      ],
    },
  },
  risk: {
    cnn: {
      label: 'Risk CNN',
      paletteKey: 'cnn',
      status: 'coming-soon',
      method: 'CNN-based density, BI-RADS, and malignancy scoring',
      models: [
        { name: 'Risk CNN', role: 'Composite risk scorer' },
      ],
    },
    qml: {
      label: 'Risk QML',
      paletteKey: 'qml',
      status: 'coming-soon',
      method: 'Quantum temporal encoding across sequential scans',
      models: [
        { name: 'Risk QML', role: 'Temporal quantum risk model' },
      ],
    },
  },
};

const STATUS_META = {
  'improving':   { label: 'Active · Improving', paletteKey: 'improving',  Icon: ImprovingIcon },
  'coming-soon': { label: 'Coming Soon',         paletteKey: 'comingSoon', Icon: SoonIcon      },
};

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: 'easeOut' },
});

function ModelNode({ model, paletteKey, index, isComingSoon }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.12 + index * 0.08, ease: 'easeOut' }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2.5,
        px: 3, py: 2.5, borderRadius: 2,
        border: '1px solid',
        borderColor: hovered
          ? (theme) => `${theme.palette[paletteKey].main}60`
          : 'rgba(255,255,255,0.07)',
        backgroundColor: hovered
          ? (theme) => `${theme.palette[paletteKey].main}0D`
          : 'rgba(255,255,255,0.025)',
        cursor: 'default',
        transition: 'border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease',
        transform: hovered ? 'translateX(8px)' : 'translateX(0)',
      }}>
        <Box sx={{
          width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
          backgroundColor: isComingSoon
            ? 'rgba(255,255,255,0.12)'
            : (theme) => theme.palette[paletteKey].main,
          boxShadow: (!isComingSoon && hovered)
            ? (theme) => `0 0 14px 4px ${theme.palette[paletteKey].main}88`
            : 'none',
          transition: 'box-shadow 0.18s ease',
        }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2,
            color: isComingSoon ? 'text.disabled' : 'text.primary',
          }}>
            {model.name}
          </Typography>
          <Typography variant="body2" sx={{
            color: isComingSoon ? 'rgba(255,255,255,0.2)' : 'text.secondary',
            fontSize: '0.82rem', mt: 0.25,
          }}>
            {model.role}
          </Typography>
        </Box>
        <ArrowIcon sx={{
          fontSize: 20, flexShrink: 0,
          color: hovered ? (theme) => theme.palette[paletteKey].main : 'rgba(255,255,255,0.2)',
          transition: 'color 0.18s ease',
        }} />
      </Box>
    </motion.div>
  );
}

function PipelineColumn({ pipeline, side }) {
  const { label, paletteKey, status, method, models } = pipeline;
  const { label: statusLabel, paletteKey: statusKey, Icon: StatusIcon } = STATUS_META[status];
  const isComingSoon = status === 'coming-soon';

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: side === 'left' ? 0.05 : 0.15, ease: 'easeOut' }}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{
        flex: 1, borderRadius: 3, border: '2px solid',
        borderColor: isComingSoon
          ? 'rgba(255,255,255,0.07)'
          : (theme) => `${theme.palette[paletteKey].main}40`,
        backgroundColor: isComingSoon
          ? 'rgba(255,255,255,0.018)'
          : (theme) => `${theme.palette[paletteKey].main}07`,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <Box sx={{
          px: 4, pt: 4, pb: 3.5,
          borderBottom: '1px solid',
          borderColor: isComingSoon
            ? 'rgba(255,255,255,0.05)'
            : (theme) => `${theme.palette[paletteKey].main}22`,
          background: isComingSoon
            ? 'transparent'
            : (theme) => `linear-gradient(145deg, ${theme.palette[paletteKey].main}12 0%, transparent 55%)`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 2.5 }}>
            <Box sx={{
              width: 60, height: 60, borderRadius: 3, flexShrink: 0,
              backgroundColor: isComingSoon
                ? 'rgba(255,255,255,0.05)'
                : (theme) => `${theme.palette[paletteKey].main}22`,
              border: '2px solid',
              borderColor: isComingSoon
                ? 'rgba(255,255,255,0.1)'
                : (theme) => `${theme.palette[paletteKey].main}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isComingSoon ? 'rgba(255,255,255,0.25)' : (theme) => theme.palette[paletteKey].main,
            }}>
              {paletteKey === 'cnn' ? <CNNIcon sx={{ fontSize: 30 }} /> : <QMLIcon sx={{ fontSize: 30 }} />}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{
                fontWeight: 800,
                fontSize: { xs: '1.2rem', md: '1.4rem' },
                lineHeight: 1.1, letterSpacing: '-0.02em',
                color: isComingSoon ? 'text.secondary' : (theme) => theme.palette[paletteKey].light,
              }}>
                {label}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
            <Box sx={{
              px: 1.75, py: 0.6, borderRadius: 1.5,
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid', borderColor: 'rgba(255,255,255,0.07)',
            }}>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem', fontStyle: 'italic' }}>
                {method}
              </Typography>
            </Box>
            <Chip
              icon={<StatusIcon sx={{ fontSize: '12px !important' }} />}
              label={statusLabel}
              size="small"
              sx={{
                height: 24,
                bgcolor: (theme) => `${theme.palette[statusKey].main}14`,
                color: (theme) => theme.palette[statusKey].main,
                border: '1px solid',
                borderColor: (theme) => `${theme.palette[statusKey].main}30`,
                fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.03em',
                '& .MuiChip-icon': { ml: '6px' },
              }}
            />
          </Box>
        </Box>
        <Box sx={{
          px: 3, py: 3, display: 'flex', flexDirection: 'column',
          gap: 1.5, flex: 1,
          justifyContent: models.length === 1 ? 'center' : 'flex-start',
        }}>
          {models.map((model, i) => (
            <ModelNode key={model.name} model={model} paletteKey={paletteKey} index={i} isComingSoon={isComingSoon} />
          ))}
        </Box>
      </Box>
    </motion.div>
  );
}

const Models = () => {
  const [activeMode, setActiveMode] = useState('classification');
  const current = PIPELINES[activeMode];
  const activeModeData = MODES.find(m => m.id === activeMode);

  return (
    <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 8 }}>

      {/* ── Hero ── */}
      <Box sx={{
        position: 'relative', overflow: 'hidden',
        background: (theme) => theme.palette.background.hero,
        py: { xs: 6, md: 10 }, px: 2, textAlign: 'center',
        '&::before': {
          content: '""', position: 'absolute', top: '-40%', left: '50%',
          transform: 'translateX(-50%)', width: '500px', height: '500px', borderRadius: '50%',
          background: (theme) => `radial-gradient(circle, ${theme.palette.primary.main}0F 0%, transparent 70%)`,
          pointerEvents: 'none',
        },
      }}>
        <Box sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: (theme) =>
            `linear-gradient(${theme.palette.primary.main}07 1px, transparent 1px),
             linear-gradient(90deg, ${theme.palette.primary.main}07 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />
        <Chip
          label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
          size="small"
          sx={{
            mb: 3,
            bgcolor: (theme) => `${theme.palette.error.main}18`,
            color: 'error.main', letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700,
            border: '1px solid', borderColor: (theme) => `${theme.palette.error.main}35`,
            borderRadius: '999px',
          }}
        />
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
          Our AI Models
        </Typography>
        <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 580, mx: 'auto', lineHeight: 1.7 }}>
          Two pipelines — Classical CNN and Quantum ML — running in parallel across both
          Classification and Risk Prediction modes.
        </Typography>
      </Box>

      <Container maxWidth="lg" sx={{ mt: { xs: 4, md: 5 } }}>

        {/* ── Mode tab switcher ── */}
        <motion.div {...fadeUp(0)}>
          <Box sx={{
            display: 'flex', gap: 1, p: 0.75, mb: 3,
            borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid', borderColor: 'divider',
            width: 'fit-content', mx: 'auto',
          }}>
            {MODES.map((mode) => {
              const isActive = activeMode === mode.id;
              return (
                <Box
                  key={mode.id}
                  onClick={() => setActiveMode(mode.id)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    px: 2.5, py: 1.25, borderRadius: 2, cursor: 'pointer',
                    backgroundColor: isActive
                      ? (theme) => `${theme.palette[mode.paletteKey].main}18`
                      : 'transparent',
                    border: '1px solid',
                    borderColor: isActive
                      ? (theme) => theme.palette[mode.paletteKey].main
                      : 'transparent',
                    transition: 'all 0.2s ease',
                    '&:hover': { backgroundColor: !isActive ? 'rgba(255,255,255,0.04)' : undefined },
                  }}
                >
                  <Box sx={{
                    color: isActive ? (theme) => theme.palette[mode.paletteKey].main : 'text.disabled',
                    display: 'flex', transition: 'color 0.2s ease',
                  }}>
                    {mode.icon}
                  </Box>
                  <Typography sx={{
                    fontWeight: isActive ? 700 : 500, fontSize: '0.88rem',
                    color: isActive ? 'text.primary' : 'text.secondary',
                    transition: 'color 0.2s ease', whiteSpace: 'nowrap',
                  }}>
                    {mode.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </motion.div>

        {/* ── Animated content per mode ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeMode}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {/* Mode description */}
            <Typography variant="h6" sx={{
              color: 'text.secondary', fontWeight: 400, textAlign: 'center',
              mb: 3, maxWidth: 560, mx: 'auto', lineHeight: 1.7,
              fontSize: { xs: '1rem', md: '1.1rem' },
            }}>
              {activeModeData?.description}
            </Typography>

            {/* ── Classical vs Quantum divider ──
                Two equal halves (50% each). VS badge is absolutely centred
                over the full row so label lengths are irrelevant.
            ── */}
            <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', mb: 2.5 }}>

              {/* Left half */}
              <Box sx={{ width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 0.75 }}>
                <CNNIcon sx={{ fontSize: 14, color: (theme) => theme.palette.cnn.main, flexShrink: 0 }} />
                <Typography sx={{
                  color: (theme) => theme.palette.cnn.main,
                  fontWeight: 700, fontSize: '1.06rem', letterSpacing: '0.1em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>
                  Classical CNN
                </Typography>
                <Divider sx={{ flex: 1, ml: 1.5 }} />
              </Box>

              {/* VS badge — absolutely centred on the full row */}
              <Box sx={{
                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                px: 1.5, py: 0.35, borderRadius: 1, flexShrink: 0,
                border: '1px solid', borderColor: 'divider',
                backgroundColor: 'background.default',
                zIndex: 1,
              }}>
                <Typography sx={{
                  color: 'text.disabled', fontSize: '0.7rem',
                  letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600,
                }}>
                  vs
                </Typography>
              </Box>

              {/* Right half */}
              <Box sx={{ width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75 }}>
                <Divider sx={{ flex: 1, mr: 1.5 }} />
                <Typography sx={{
                  color: (theme) => theme.palette.qml.main,
                  fontWeight: 700, fontSize: '1.06rem', letterSpacing: '0.1em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>
                  Quantum ML
                </Typography>
                <QMLIcon sx={{ fontSize: 14, color: (theme) => theme.palette.qml.main, flexShrink: 0 }} />
              </Box>

            </Box>

            {/* Two-column pipeline layout */}
            <Box sx={{
              display: 'flex', gap: 3,
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: 'stretch',
              minHeight: { md: 360 },
            }}>
              <PipelineColumn pipeline={current.cnn} side="left" />
              <PipelineColumn pipeline={current.qml} side="right" />
            </Box>

          </motion.div>
        </AnimatePresence>

        {/* ── Bottom note ── */}
        <motion.div {...fadeUp(0.25)}>
          <Box sx={{
            mt: 4, px: 2.5, py: 2, borderRadius: 2,
            border: '1px solid', borderColor: 'divider',
            backgroundColor: 'rgba(255,255,255,0.02)',
            display: 'flex', alignItems: 'center', gap: 1.5,
          }}>
            <Box sx={{
              width: 4, alignSelf: 'stretch', borderRadius: 1,
              backgroundColor: (theme) => theme.palette.primary.main, flexShrink: 0,
            }} />
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.75, fontSize: '0.85rem' }}>
              Both pipelines run simultaneously in the Analysis dashboard — results from each model are surfaced side by side so you can directly compare how classical deep learning and quantum approaches interpret the same scan.
            </Typography>
          </Box>
        </motion.div>

      </Container>
    </Box>
  );
};

export default Models;