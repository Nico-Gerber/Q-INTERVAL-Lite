import React, { useState } from 'react';
import {
  Typography, Box, Chip, Paper, Container, Divider, Grid,
} from '@mui/material';
import { motion } from 'framer-motion';
import {
  Memory as CNNIcon,
  AutoAwesome as QMLIcon,
  CompareArrows as DualIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';

// ── Animation helpers ──────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.4, delay, ease: 'easeOut' },
});

// ── Data ───────────────────────────────────────────────────────────────────
const CLASSICAL_MODELS = [
  {
    name: 'ResNet18',
    tag: 'Primary Demo Model',
    tagColor: 'primary',
    accuracy: '60.41%',
    description:
      'Uses transfer learning to extract complex visual features from mammogram tissue. Selected as the primary demonstration model after successfully learning discriminative features across all three classification categories.',
    highlights: ['Transfer learning', 'Spatial pattern detection', 'Three-class output'],
  },
  {
    name: 'EfficientNet-B0',
    tag: 'Highest Classical Accuracy',
    tagColor: 'success',
    accuracy: '62.19%',
    description:
      'A highly efficient architecture that achieved the top classical accuracy. Excelled at identifying normal tissue but highlighted the inherent difficulty models face distinguishing between visually similar benign and malignant patterns.',
    highlights: ['Top classical accuracy', 'Efficient feature scaling', 'Strong normal detection'],
  },
];

const QUANTUM_MODELS = [
  {
    name: 'VQC',
    fullName: 'Variational Quantum Classifier',
    tag: 'Proof of Concept',
    tagColor: 'secondary',
    accuracy: '45.56%',
    description:
      'A 4-qubit circuit designed to output probabilities across three classes — Normal, Benign, and Malignant. Established the first quantum baseline as an experimental proof-of-concept on the diagnostic pipeline.',
    highlights: ['4-qubit circuit', 'Three-class output', 'PennyLane implementation'],
  },
  {
    name: 'QSVM',
    fullName: 'Quantum Support Vector Machine',
    tag: 'Most Stable Quantum',
    tagColor: 'warning',
    accuracy: '55.00%',
    description:
      'Uses a quantum kernel to compute similarity between healthy and cancerous tissue states rather than trainable weights. Proved to be a more stable training approach and achieved the highest quantum accuracy in binary classification.',
    highlights: ['Quantum kernel method', 'Binary classification', 'Stable training curve'],
  },
];

const TECH_SECTIONS = [
  {
    title: 'Data Preprocessing',
    body: 'DICOM/JPEG files are downscaled, normalised, and passed through Principal Component Analysis (PCA) prior to quantum routing to reduce dimensionality while preserving discriminative tissue features.',
  },
  {
    title: 'Hyperparameter Tuning',
    body: 'Epoch counts, batch sizing, and optimiser selections (Adam) were systematically varied during training phases to maximise generalisation across the imbalanced three-class dataset.',
  },
  {
    title: 'Quantum Circuit Design',
    body: 'RY/RZ rotational gates and CNOT entanglement layers are utilised in the PennyLane circuits, encoding classical image features into quantum states via amplitude embedding.',
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────

function AccuracyBadge({ value, color }) {
  return (
    <Box sx={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      px: 2.5, py: 1.5, borderRadius: 2,
      backgroundColor: (theme) => `${theme.palette[color].main}14`,
      border: '1px solid',
      borderColor: (theme) => `${theme.palette[color].main}35`,
    }}>
      <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: `${color}.main` }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.6rem', mt: 0.25 }}>
        Test Accuracy
      </Typography>
    </Box>
  );
}

function ModelCard({ model, color, index }) {
  return (
    <motion.div {...fadeUp(index * 0.1)} style={{ height: '100%' }}>
      <Paper sx={{
        p: 3, height: '100%', borderRadius: 3,
        border: '2px solid',
        borderColor: (theme) => `${theme.palette[color].main}25`,
        backgroundColor: 'background.paper',
        display: 'flex', flexDirection: 'column', gap: 2,
        transition: 'all 0.22s ease',
        '&:hover': {
          borderColor: `${color}.main`,
          transform: 'translateY(-3px)',
          boxShadow: (theme) => `0 10px 32px rgba(0,0,0,0.35), 0 0 0 1px ${theme.palette[color].main}20`,
        },
      }}>
        {/* Header row */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: 'text.primary', lineHeight: 1.2 }}>
              {model.name}
            </Typography>
            {model.fullName && (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>
                {model.fullName}
              </Typography>
            )}
          </Box>
          <AccuracyBadge value={model.accuracy} color={color} />
        </Box>

        {/* Tag */}
        <Chip
          label={model.tag}
          size="small"
          sx={{
            alignSelf: 'flex-start',
            bgcolor: (theme) => `${theme.palette[model.tagColor].main}14`,
            color: `${model.tagColor}.main`,
            border: '1px solid',
            borderColor: (theme) => `${theme.palette[model.tagColor].main}30`,
            fontWeight: 600, fontSize: '0.68rem', letterSpacing: '0.04em',
          }}
        />

        {/* Description */}
        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7, fontSize: '0.85rem', flex: 1 }}>
          {model.description}
        </Typography>

        {/* Highlights */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {model.highlights.map((h) => (
            <Box key={h} sx={{
              px: 1.25, py: 0.35, borderRadius: 1,
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid', borderColor: 'divider',
            }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                {h}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </motion.div>
  );
}

function PipelineSection({ icon, label, color, subtitle, models, index }) {
  return (
    <motion.div {...fadeUp(index * 0.1)}>
      <Box sx={{ mb: 4 }}>
        {/* Section header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: 2,
            backgroundColor: (theme) => `${theme.palette[color].main}18`,
            border: '1px solid',
            borderColor: (theme) => `${theme.palette[color].main}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: `${color}.main`,
          }}>
            {icon}
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>
              {label}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>
              {subtitle}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        <Grid container spacing={2}>
          {models.map((model, i) => (
            <Grid item xs={12} md={6} key={model.name}>
              <ModelCard model={model} color={color} index={i} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
const Models = () => {
  const [techOpen, setTechOpen] = useState(false);

  return (
    <Box sx={{ backgroundColor: 'background.default', minHeight: '100%', pb: 10 }}>

      {/* ── Hero ── */}
      <Box sx={{
        position: 'relative', overflow: 'hidden',
        background: (theme) => theme.palette.background.hero,
        py: { xs: 6, md: 10 }, px: 2, textAlign: 'center',
        '&::before': {
          content: '""', position: 'absolute', top: '-40%', left: '50%',
          transform: 'translateX(-50%)', width: '500px', height: '500px',
          borderRadius: '50%',
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

        <motion.div {...fadeUp(0)}>
          <Chip
            label="RESEARCH PROTOTYPE · NOT FOR CLINICAL USE"
            size="small"
            sx={{
              mb: 3,
              bgcolor: (theme) => `${theme.palette.error.main}18`,
              color: 'error.main', letterSpacing: '0.08em', fontSize: '0.65rem', fontWeight: 700,
              border: '1px solid', borderColor: (theme) => `${theme.palette.error.main}35`, borderRadius: '999px',
            }}
          />
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
            Our AI Models
          </Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, maxWidth: 580, mx: 'auto', lineHeight: 1.7 }}>
            Two completely distinct computational pipelines process the same mammogram — so you can see how classical deep learning and quantum machine learning approach the same tissue data.
          </Typography>
        </motion.div>
      </Box>

      <Container maxWidth="lg" sx={{ mt: { xs: 5, md: 7 } }}>

        {/* ── Dual approach banner ── */}
        <motion.div {...fadeUp(0)}>
          <Paper sx={{
            p: { xs: 2.5, md: 3.5 }, mb: 5, borderRadius: 3,
            border: '2px solid',
            borderColor: (theme) => `${theme.palette.primary.main}25`,
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}08 0%, ${theme.palette.secondary.main}08 100%)`,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <Box sx={{
                width: 44, height: 44, borderRadius: 2, flexShrink: 0,
                background: (theme) =>
                  `linear-gradient(135deg, ${theme.palette.primary.main}30, ${theme.palette.secondary.main}30)`,
                border: '1px solid',
                borderColor: (theme) => `${theme.palette.primary.main}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'primary.main',
              }}>
                <DualIcon sx={{ fontSize: 22 }} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary', mb: 0.5 }}>
                  The Dual-Engine Diagnostic Approach
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.75, maxWidth: 720 }}>
                  Rather than relying on a single "black box" algorithm, Q-INTERVAL-Lite+ processes every uploaded mammogram through two entirely distinct pipelines simultaneously. Classical CNNs scan for spatial patterns in tissue density using established deep learning, while Quantum models map those same features into a high-dimensional quantum feature space — looking for non-linear correlations that standard algorithms may completely overlook. Comparing both outputs side by side gives users a transparent window into how each paradigm interprets the same scan.
                </Typography>
              </Box>
            </Box>
          </Paper>
        </motion.div>

        {/* ── Classical pipeline ── */}
        <PipelineSection
          icon={<CNNIcon sx={{ fontSize: 20 }} />}
          label="Classical Pipeline"
          color="primary"
          subtitle="Convolutional Neural Networks — industry-standard deep learning"
          models={CLASSICAL_MODELS}
          index={0}
        />

        {/* ── Quantum pipeline ── */}
        <PipelineSection
          icon={<QMLIcon sx={{ fontSize: 20 }} />}
          label="Quantum Pipeline"
          color="secondary"
          subtitle="Quantum Machine Learning — experimental frontier models"
          models={QUANTUM_MODELS}
          index={1}
        />

        {/* ── Sprint 1 metric cards ── */}
        <motion.div {...fadeUp(0.1)}>
          <Box sx={{ mb: 5 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
              Sprint 1 Milestone Metrics
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
              Foundational proof-of-concept results — baselines to build from.
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Grid container spacing={2}>
              {[
                { label: 'Top Classical Accuracy', value: '62.19%', sub: 'EfficientNet-B0', color: 'primary' },
                { label: 'Top Quantum Accuracy',   value: '55.00%', sub: 'QSVM',            color: 'secondary' },
              ].map((stat, i) => (
                <Grid item xs={12} sm={6} key={stat.label}>
                  <motion.div {...fadeUp(i * 0.08)}>
                    <Paper sx={{
                      p: 3, borderRadius: 3, textAlign: 'center',
                      border: '2px solid',
                      borderColor: (theme) => `${theme.palette[stat.color].main}25`,
                      backgroundColor: (theme) => `${theme.palette[stat.color].main}08`,
                      transition: 'all 0.22s ease',
                      '&:hover': {
                        borderColor: `${stat.color}.main`,
                        transform: 'translateY(-2px)',
                        boxShadow: (theme) => `0 8px 28px rgba(0,0,0,0.3)`,
                      },
                    }}>
                      <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.68rem' }}>
                        {stat.label}
                      </Typography>
                      <Typography sx={{ fontSize: '2.8rem', fontWeight: 800, color: `${stat.color}.main`, lineHeight: 1.1, my: 0.5 }}>
                        {stat.value}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        {stat.sub}
                      </Typography>
                    </Paper>
                  </motion.div>
                </Grid>
              ))}
            </Grid>
          </Box>
        </motion.div>

        {/* ── Road ahead ── */}
        <motion.div {...fadeUp(0.1)}>
          <Paper sx={{
            p: { xs: 2.5, md: 3 }, mb: 4, borderRadius: 3,
            border: '1px solid', borderColor: 'divider',
          }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
              The Road Ahead
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.8 }}>
              These metrics represent our foundational proof-of-concept. Upcoming sprints are focused on pushing these boundaries by increasing training datasets, fine-tuning feature extraction pipelines, and moving toward continuous risk-score probability models required for professional clinical use.
            </Typography>
          </Paper>
        </motion.div>

        {/* ── Technical deep dive accordion ── */}
        <motion.div {...fadeUp(0.1)}>
          <Paper sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            {/* Toggle header */}
            <Box
              onClick={() => setTechOpen(o => !o)}
              sx={{
                px: 3, py: 2, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'background-color 0.2s ease',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.03)' },
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}>
                  Technical Architecture
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  Under Construction — expand for current implementation notes
                </Typography>
              </Box>
              {techOpen
                ? <CollapseIcon sx={{ color: 'text.disabled' }} />
                : <ExpandIcon sx={{ color: 'text.disabled' }} />
              }
            </Box>

            {/* Collapsible content */}
            {techOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <Divider />
                <Box sx={{ px: 3, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {TECH_SECTIONS.map((s) => (
                    <Box key={s.title}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                        {s.title}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.75 }}>
                        {s.body}
                      </Typography>
                    </Box>
                  ))}
                  <Box sx={{
                    mt: 0.5, px: 2, py: 1.5, borderRadius: 2,
                    backgroundColor: (theme) => `${theme.palette.warning.main}0A`,
                    border: '1px solid', borderColor: (theme) => `${theme.palette.warning.main}25`,
                  }}>
                    <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
                      This section will be expanded in future sprints with full model cards, training curves, and circuit diagrams.
                    </Typography>
                  </Box>
                </Box>
              </motion.div>
            )}
          </Paper>
        </motion.div>

      </Container>
    </Box>
  );
};

export default Models;