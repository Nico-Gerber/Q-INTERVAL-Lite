import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Box, Button, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  Skeleton, TextField, Typography,
} from '@mui/material';
import {
  Link as LinkIcon,
  ShieldOutlined as ShieldIcon,
  PlayCircleOutlineRounded as PlayIcon,
  ExpandMoreRounded as ExpandIcon,
  CheckRounded as CheckIcon,
  DocumentScannerOutlined as ScanNodeIcon,
  CloudUploadOutlined as UploadNodeIcon,
  MemoryOutlined as ClassifyNodeIcon,
  TimelineOutlined as RiskNodeIcon,
  LayersOutlined as OcclusionNodeIcon,
  AutoAwesomeOutlined as ExplainNodeIcon,
  VisibilityOutlined as ReviewNodeIcon,
  IosShareRounded as PublishNodeIcon,
  StorageOutlined as StorageNodeIcon,
} from '@mui/icons-material';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import NeuralCanvas from '../Components/Shared/NeuralCanvas';
import { useAuth } from '../supabase/AuthContext';
import logoDark from '../assets/logo-dark.svg';
import logoLight from '../assets/logo-light.svg';
import {
  accent, ArrowLink, BAND, ImageSlot, HEADING_WRAP, LEAD_SX, PARAGRAPH_WRAP, Reveal, SECTION_HEADING_COMPACT_SX, SECTION_HEADING_SX, SectionMotif, SlideIn,
  SPLIT_SX, sectionCompact, sectionSx, sectionTall,
} from '../Components/Shared/PublicPageKit';

const NAV_H = 70;

const EVALUATION_METRICS = ['Sensitivity', 'Specificity', 'AUC'];

const STEPS = [
  {
    title: 'AI analyses',
    body: 'Two independent models read every mammogram view and report side by side.',
    link: { label: 'The models', to: '/Models' },
  },
  {
    title: 'Clinician verifies',
    body: 'A clinician confirms or overrides each result, and every decision is recorded.',
    link: { label: 'Human review', to: '/About' },
  },
  {
    title: 'Shared with the patient',
    body: 'Once reviewed, a session can be shared as a private no-login link, exported as a PDF, or shown straight from the clinician\'s screen.',
    link: { label: 'Open Results from Link', action: true },
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

const faviconUrl = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

function RailFill({ delay = 0 }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      initial={reduce ? false : { scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 1 }}
      transition={{ duration: 0.9, ease: 'easeOut', delay }}
      style={{ position: 'absolute', top: -2, left: 0, width: '100%', height: 2, transformOrigin: 'left', background: 'currentColor', opacity: 0.9 }}
    />
  );
}

const extractToken = (input) => {
  const value = input.trim();
  if (!value) return null;
  const fromPath = value.match(/\/report\/([^/?#\s]+)/);
  const token = fromPath ? fromPath[1] : value;
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : null;
};

function OpenResultDialog({ open, onClose }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const close = () => { setValue(''); setError(''); onClose(); };

  const submit = (e) => {
    e.preventDefault();
    const token = extractToken(value);
    if (!token) {
      setError('Paste the full result link you were given, or just the code at the end of it.');
      return;
    }
    close();
    navigate(`/report/${token}`);
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs" aria-labelledby="open-result-title">
      <form onSubmit={submit} noValidate>
        <DialogTitle id="open-result-title" sx={{ fontWeight: 700 }}>Open your result</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mb: 2, lineHeight: 1.7 }}>
            Your clinician will have given you a private link. Paste it here to view your result. You do not need an account.
          </Typography>
          <TextField
            autoFocus fullWidth
            label="Result link or code"
            value={value}
            onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
            error={Boolean(error)}
            helperText={error || ' '}
            inputProps={{ 'aria-describedby': error ? 'open-result-error' : undefined }}
            FormHelperTextProps={{
              id: 'open-result-error',
              sx: { '&.Mui-error': { color: (theme) => (theme.palette.mode === 'dark' ? theme.palette.error.main : theme.palette.error.dark) } },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={close} color="inherit">Cancel</Button>
          <Button type="submit" variant="contained">Open result</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

// Mirrors the route guards: only an approved clinician is offered the dashboard.
function HeroActions({ onOpenResult }) {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }} aria-hidden="true">
        <Skeleton variant="rounded" width={180} height={38} sx={{ borderRadius: 999 }} />
        <Skeleton variant="rounded" width={130} height={38} sx={{ borderRadius: 999 }} />
      </Box>
    );
  }

  const approved = Boolean(user) && profile?.status === 'approved' && Boolean(profile?.role);
  const rejected = Boolean(user) && profile?.status === 'rejected';
  const btnSx = { px: 2.5, py: 0.8, fontSize: '0.85rem' };

  let primary; let secondary; let extra = null;

  if (approved) {
    primary = <Button component={RouterLink} to="/Analysis" variant="contained" sx={btnSx}>Launch Analysis Dashboard</Button>;
    secondary = <Button component={RouterLink} to="/Sessions" variant="outlined" sx={btnSx}>My Sessions</Button>;
    if (profile.role === 'admin') extra = <ArrowLink to="/Admin">User management</ArrowLink>;
  } else if (user) {
    primary = (
      <Button component={RouterLink} to={rejected ? '/access-rejected' : '/awaiting-approval'} variant="contained" sx={btnSx}>
        View access status
      </Button>
    );
    secondary = <Button onClick={signOut} variant="outlined" sx={btnSx}>Sign out</Button>;
  } else {
    primary = <Button component={RouterLink} to="/request-access" variant="contained" sx={btnSx}>Request Access</Button>;
    secondary = <Button component={RouterLink} to="/login" variant="outlined" sx={btnSx}>Sign In</Button>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
        {primary}
        {secondary}
        {!approved && (
          <Box sx={{ display: 'flex', alignItems: 'center', ml: { sm: 1.5 } }}>
            <ArrowLink onClick={onOpenResult}>Open Results from Link</ArrowLink>
          </Box>
        )}
      </Box>
      {extra}
    </Box>
  );
}

function EvaluationStrip() {
  return (
    <Box
      component="section"
      aria-labelledby="evaluation-heading"
      sx={(theme) => ({
        position: 'relative', zIndex: 1, flexShrink: 0,
        borderTop: `2px solid ${theme.palette.background.heroStatsBorder}`,
        backgroundColor: theme.palette.background.heroStatsBg,
        color: '#FFFFFF',
      })}
    >
      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 3 } }}>
        <Typography id="evaluation-heading" component="h2" sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', mb: 2, color: 'rgba(255,255,255,0.9)' }}>
          Model evaluation
        </Typography>
        <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
          {EVALUATION_METRICS.map((label, i, arr) => (
            <Box
              key={label}
              sx={(theme) => ({
                textAlign: 'center', py: { xs: 1.5, sm: 0.5 }, px: 2,
                borderRight: { xs: 'none', sm: i < arr.length - 1 ? `2px solid ${theme.palette.background.heroStatsBorder}` : 'none' },
                borderBottom: { xs: i < arr.length - 1 ? `1px solid ${theme.palette.background.heroStatsBorder}` : 'none', sm: 'none' },
              })}
            >
              <Typography component="dt" sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', mb: 0.5 }}>
                {label}
              </Typography>
              <Typography component="dd" sx={{ m: 0, fontSize: '1rem', fontWeight: 700, lineHeight: 1.3 }}>
                Evaluation in progress
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ textAlign: 'center', mt: 2, fontSize: '0.8rem', color: 'rgba(255,255,255,0.9)' }}>
          Both models are still being evaluated. Figures are published only once validated.
        </Typography>
      </Container>
    </Box>
  );
}

// Placeholder until a recording exists: pass `src` (and `poster`) to render the video.
function ResultsSection({ src, poster }) {
  const reduce = useReducedMotion();
  return (
    <Box component="section" aria-labelledby="result-heading" sx={sectionCompact}>
      <SectionMotif type="glow" corner="75% 50%" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={SPLIT_SX}>
            <Box>
              <Typography id="result-heading" component="h2" sx={{ ...SECTION_HEADING_COMPACT_SX, mb: 2 }}>
                See a result
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.75, mb: 1.5, ...PARAGRAPH_WRAP }}>
                A looped clip of a result being scrolled through and verified, with both models reporting side by side.
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem', lineHeight: 1.6, ...PARAGRAPH_WRAP }}>
                Recorded with test data only, never real patient images.
              </Typography>
            </Box>
            <Box
              sx={{
                position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 2, overflow: 'hidden',
                border: '2px dashed', backgroundColor: 'background.paper',
                borderColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(14,116,144,0.55)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {src ? (
                <video
                  src={src}
                  poster={poster}
                  controls
                  muted
                  loop
                  playsInline
                  autoPlay={!reduce}
                  preload="metadata"
                  aria-label="Looped clip of a result being scrolled through and verified"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Box sx={{ textAlign: 'center', px: 2 }}>
                  <PlayIcon sx={{ fontSize: 44, color: 'text.secondary', mb: 1 }} aria-hidden="true" />
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>Results clip</Typography>
                  <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', mt: 0.5 }}>A short looped clip will go here.</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

function StepsSection({ onOpenResult }) {
  return (
    <Box component="section" aria-labelledby="how-heading" sx={{ ...sectionCompact, ...BAND.soft }}>
      <Container maxWidth="lg" sx={{ width: '100%', position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Typography id="how-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: { xs: 5, md: 7 } }}>
            How it works
          </Typography>
        </Reveal>
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, columnGap: { md: 6 }, rowGap: 6 }}>
          {STEPS.map((step, i) => (
            <Box
              component="li"
              key={step.title}
              sx={{
                position: 'relative', pt: 3, borderTop: '2px solid', borderColor: 'divider', color: accent,
              }}
            >
              <RailFill delay={i * 0.15} />
              <Reveal delay={i * 0.08}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: { xs: 64, md: 76 }, height: { xs: 64, md: 76 }, borderRadius: 3, mb: 2.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider',
                    boxShadow: (theme) => (theme.palette.mode === 'dark' ? 'none' : '0 6px 18px rgba(14,116,144,0.14)'),
                    color: accent, fontSize: { xs: '1.7rem', md: '2.1rem' }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </Box>
                <Typography component="h3" sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  {step.title}
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.7, maxWidth: '34ch', mb: 2, ...PARAGRAPH_WRAP }}>
                  {step.body}
                </Typography>
                {step.link.action
                  ? <ArrowLink onClick={onOpenResult}>{step.link.label}</ArrowLink>
                  : <ArrowLink to={step.link.to}>{step.link.label}</ArrowLink>}
              </Reveal>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

function AssistSection() {
  return (
    <Box component="section" aria-labelledby="assist-heading" sx={{ ...sectionTall, ...BAND.emphasis, color: '#FFFFFF' }}>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={SPLIT_SX}>
            <Box sx={{ borderLeft: '3px solid #A5F3FC', pl: { xs: 2.5, md: 4 } }}>
              <Typography id="assist-heading" component="h2" sx={{ ...SECTION_HEADING_SX, color: '#FFFFFF', mb: 2 }}>
                Built to assist, never to replace
              </Typography>
              <Typography sx={{ ...LEAD_SX, color: 'rgba(255,255,255,0.92)', mb: 3 }}>
                Some signs of cancer are too subtle for the human eye to pick up on a routine mammogram.{' '}
                <Box component="span" sx={{ whiteSpace: 'nowrap' }}>Q-INTERVAL-Lite+</Box> is designed to flag
                those signals so a clinician can weigh them alongside everything else they know about the patient.
              </Typography>
              <ArrowLink to="/About" onDark>Why this exists</ArrowLink>
            </Box>
            <Typography
              component="p"
              sx={{ m: 0, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, fontSize: { xs: '2.4rem', md: '3.8rem' }, color: '#FFFFFF' }}
            >
              <SlideIn delay={0.2}>The AI flags.</SlideIn>
              <SlideIn delay={0.55} sx={{ color: '#A5F3FC' }}>The clinician decides.</SlideIn>
            </Typography>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

function OrgLogo({ domain, name }) {
  const [failed, setFailed] = useState(false);
  const base = { width: 40, height: 40, borderRadius: 1.5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', backgroundColor: 'background.default', overflow: 'hidden' };
  if (failed) {
    return (
      <Box sx={base} aria-hidden="true">
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1, color: 'text.secondary' }}>{name.charAt(0).toUpperCase()}</Typography>
      </Box>
    );
  }
  return (
    <Box sx={base}>
      <Box component="img" src={faviconUrl(domain)} alt="" onError={() => setFailed(true)} sx={{ width: 24, height: 24, objectFit: 'contain' }} />
    </Box>
  );
}

function ResourcesSection() {
  return (
    <Box component="section" aria-labelledby="resources-heading" sx={{ ...sectionSx, ...BAND.deep }}>
      <SectionMotif type="dots" corner="top right" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ ...SPLIT_SX, alignItems: 'start' }}>
          <Reveal>
            <Typography id="resources-heading" component="h2" sx={{ ...SECTION_HEADING_COMPACT_SX, mb: 2 }}>
              Patient resources
            </Typography>
            <Typography sx={{ ...LEAD_SX, mb: 4 }}>
              Whether you are navigating a diagnosis, supporting a loved one, or looking for guidance, these
              organisations provide trusted support, information, and free screening services across Australia.
            </Typography>
            <ImageSlot label="A calm, supportive consultation scene" />
          </Reveal>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
            {SUPPORT_ORGS.map((org) => (
              <Box component="li" key={org.name}>
                <Box
                  component="a"
                  href={org.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${org.name} (opens in a new tab)`}
                  sx={{
                    display: 'flex', alignItems: 'flex-start', gap: 2, p: 2.5, height: '100%',
                    borderRadius: 2, backgroundColor: 'background.paper',
                    border: '1px solid', borderColor: 'divider', textDecoration: 'none',
                    transition: 'border-color 0.2s, transform 0.2s',
                    '&:hover': { borderColor: accent, transform: 'translateY(-2px)' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  <OrgLogo domain={org.domain} name={org.name} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography component="span" sx={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: 'text.primary', mb: 0.5 }}>{org.name}</Typography>
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.85rem', lineHeight: 1.6, color: 'text.secondary', ...PARAGRAPH_WRAP }}>{org.description}</Typography>
                  </Box>
                  <LinkIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.5, flexShrink: 0 }} aria-hidden="true" />
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

const WORKFLOW_NODES = [
  { Icon: ScanNodeIcon, label: 'Mammogram scan', external: true, scatter: [120, 60], ring: [320, 65] },
  { Icon: UploadNodeIcon, label: 'Upload', scatter: [210, 300], ring: [471, 97] },
  { Icon: ClassifyNodeIcon, label: 'Classification', scatter: [560, 70], ring: [551, 177] },
  { Icon: RiskNodeIcon, label: 'Future risk', scatter: [120, 200], ring: [524, 268] },
  { Icon: OcclusionNodeIcon, label: 'Occlusion map', scatter: [330, 110], ring: [400, 327] },
  { Icon: ExplainNodeIcon, label: 'Explanation', scatter: [470, 330], ring: [240, 327] },
  { Icon: ReviewNodeIcon, label: 'Verification', scatter: [540, 200], ring: [116, 268] },
  { Icon: PublishNodeIcon, label: 'Publish', scatter: [90, 330], ring: [89, 177] },
  { Icon: StorageNodeIcon, label: 'Storage', scatter: [340, 330], ring: [169, 97] },
];
const WORKFLOW_SCATTER_LINKS = [[1, 4], [2, 5], [3, 6], [4, 8]];
const WORKFLOW_CENTRE = [320, 200];
const LOGO_CLEARANCE = 56;
const spokeStart = ([x, y]) => {
  const dx = x - WORKFLOW_CENTRE[0];
  const dy = y - WORKFLOW_CENTRE[1];
  const len = Math.hypot(dx, dy);
  return [WORKFLOW_CENTRE[0] + (dx / len) * LOGO_CLEARANCE, WORKFLOW_CENTRE[1] + (dy / len) * LOGO_CLEARANCE];
};

const WORKFLOW_VIEWS = {
  without: {
    label: 'Regular workflow',
    caption: 'Scans, scores and reports end up in separate places. Each step waits on the one before it, and the patient waits on all of them, in the appointment or out of it.',
  },
  with: {
    label: 'With Q-INTERVAL-Lite+',
    caption: 'One workflow: upload a scan taken elsewhere, classify it, assess future risk, see the occlusion map and an explanation, then verify, publish and store the session. It works during an appointment or afterwards.',
  },
};

function WorkflowSection() {
  const reduce = useReducedMotion();
  const [view, setView] = useState('without');
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.55 });
  const touched = useRef(false);
  const choose = (next) => { touched.current = true; setView(next); };

  useEffect(() => {
    if (!inView || reduce || touched.current) return undefined;
    const timer = setTimeout(() => { if (!touched.current) setView('with'); }, 1100);
    return () => clearTimeout(timer);
  }, [inView, reduce]);
  const isWith = view === 'with';
  const EASE = [0.45, 0, 0.15, 1];
  const nodeT = (i) => (reduce ? { duration: 0 } : { duration: 1.5, ease: EASE, delay: i * 0.07 });
  const logoT = reduce ? { duration: 0 } : { duration: 1.1, ease: 'easeOut', delay: isWith ? 0.45 : 0 };
  const fade = reduce ? { duration: 0 } : { duration: 0.9, ease: 'easeInOut', delay: isWith ? 0.8 : 0 };
  const keys = Object.keys(WORKFLOW_VIEWS);

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = keys[(keys.indexOf(view) + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    choose(next);
    document.getElementById(`workflow-tab-${next}`)?.focus();
  };

  return (
    <Box ref={sectionRef} component="section" aria-labelledby="workflow-heading" sx={sectionSx}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={SPLIT_SX}>
            <Box>
              <Typography id="workflow-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>
                One workflow, from scan to result
              </Typography>
              <Typography sx={{ ...LEAD_SX, mb: 4 }}>
                Watch the same steps come together around Q-INTERVAL-Lite+.
              </Typography>
              <Box role="tablist" aria-label="Workflow view" onKeyDown={onKeyDown} sx={{ display: 'inline-flex', borderBottom: '1px solid', borderColor: 'divider', mb: 3 }}>
                {keys.map((key) => {
                  const selected = key === view;
                  return (
                    <Box
                      key={key}
                      component="button"
                      type="button"
                      role="tab"
                      id={`workflow-tab-${key}`}
                      aria-selected={selected}
                      aria-controls="workflow-panel"
                      tabIndex={selected ? 0 : -1}
                      onClick={() => choose(key)}
                      sx={{
                        background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit',
                        px: { xs: 2, md: 3 }, py: 1.25, fontSize: '0.95rem', fontWeight: 600,
                        color: selected ? 'text.primary' : 'text.secondary',
                        borderBottom: '3px solid', borderColor: selected ? accent : 'transparent', mb: '-1px',
                        transition: 'color 0.2s, border-color 0.2s',
                        '&:hover': { color: 'text.primary' },
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 1 },
                      }}
                    >
                      {WORKFLOW_VIEWS[key].label}
                    </Box>
                  );
                })}
              </Box>
              <Typography aria-live="polite" sx={{ ...LEAD_SX, fontSize: '0.92rem', minHeight: '8em' }}>
                {WORKFLOW_VIEWS[view].caption}
              </Typography>
            </Box>
            <Box id="workflow-panel" role="tabpanel" aria-labelledby={`workflow-tab-${view}`}>
              <Box
                sx={(theme) => {
                  const dark = theme.palette.mode === 'dark';
                  return {
                    borderRadius: 2, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper',
                    p: { xs: 1, md: 2 },
                    '--wf-line': dark ? 'rgba(255,255,255,0.3)' : 'rgba(14,116,144,0.5)',
                    '--wf-muted': dark ? 'rgba(255,255,255,0.6)' : '#5B7280',
                    '--wf-accent': accent(theme),
                    '--wf-node': theme.palette.background.paper,
                    '--wf-text': theme.palette.text.primary,
                    '& text': { fontSize: { xs: 19, sm: 13 } },
                    '& .wf-note': { fontSize: { xs: 15, sm: 11 } },
                    '& .wf-logo-dark': { display: dark ? 'inline' : 'none' },
                    '& .wf-logo-light': { display: dark ? 'none' : 'inline' },
                  };
                }}
              >
                <Box component="svg" viewBox="0 0 640 420" role="img" aria-label={WORKFLOW_VIEWS[view].caption} sx={{ display: 'block', width: '100%', maxWidth: 720, mx: 'auto', height: 'auto' }}>
                  <motion.ellipse
                    cx={WORKFLOW_CENTRE[0]} cy={WORKFLOW_CENTRE[1]} rx={235} ry={135}
                    fill="none" strokeWidth={1.5} strokeDasharray="3 7"
                    animate={{ opacity: isWith ? 1 : 0 }} transition={fade}
                    style={{ stroke: 'currentColor', color: 'var(--wf-line)' }}
                  />
                  {WORKFLOW_NODES.map((n) => (
                    <motion.line
                      key={`spoke-${n.label}`}
                      initial={false}
                      animate={{ x1: spokeStart(n.ring)[0], y1: spokeStart(n.ring)[1], x2: n.ring[0], y2: n.ring[1], opacity: isWith && !n.external ? 1 : 0 }}
                      transition={fade}
                      strokeWidth={1.5}
                      style={{ stroke: 'currentColor', color: 'var(--wf-line)' }}
                    />
                  ))}
                  {WORKFLOW_SCATTER_LINKS.map(([a, b]) => (
                    <motion.line
                      key={`link-${a}-${b}`}
                      initial={false}
                      animate={{
                        x1: isWith ? WORKFLOW_CENTRE[0] : WORKFLOW_NODES[a].scatter[0],
                        y1: isWith ? WORKFLOW_CENTRE[1] : WORKFLOW_NODES[a].scatter[1],
                        x2: isWith ? WORKFLOW_CENTRE[0] : WORKFLOW_NODES[b].scatter[0],
                        y2: isWith ? WORKFLOW_CENTRE[1] : WORKFLOW_NODES[b].scatter[1],
                        opacity: isWith ? 0 : 1,
                      }}
                      transition={fade}
                      strokeWidth={1.5} strokeDasharray="2 6"
                      style={{ stroke: 'currentColor', color: 'var(--wf-muted)' }}
                    />
                  ))}

                  <motion.image
                    href={logoDark}
                    className="wf-logo wf-logo-dark"
                    x={WORKFLOW_CENTRE[0] - 44} y={WORKFLOW_CENTRE[1] - 44} width={88} height={88}
                    initial={false}
                    animate={{ opacity: isWith ? 1 : 0, scale: isWith ? 1 : 0.6 }}
                    transition={logoT}
                    style={{ transformOrigin: `${WORKFLOW_CENTRE[0]}px ${WORKFLOW_CENTRE[1]}px` }}
                  />
                  <motion.image
                    href={logoLight}
                    className="wf-logo wf-logo-light"
                    x={WORKFLOW_CENTRE[0] - 44} y={WORKFLOW_CENTRE[1] - 44} width={88} height={88}
                    initial={false}
                    animate={{ opacity: isWith ? 1 : 0, scale: isWith ? 1 : 0.6 }}
                    transition={logoT}
                    style={{ transformOrigin: `${WORKFLOW_CENTRE[0]}px ${WORKFLOW_CENTRE[1]}px` }}
                  />

                  {WORKFLOW_NODES.map((n, i) => {
                    const [x, y] = isWith ? n.ring : n.scatter;
                    return (
                      <motion.g key={n.label} initial={false} animate={{ x, y }} transition={nodeT(i)}>
                        <motion.circle
                          r={26} strokeWidth={2.5} strokeDasharray={n.external ? '5 4' : undefined}
                          style={{ fill: 'var(--wf-node)', stroke: isWith && !n.external ? 'var(--wf-accent)' : 'var(--wf-muted)', transition: 'stroke 0.9s ease' }}
                        />
                        <n.Icon x={-13} y={-13} width={26} height={26} viewBox="0 0 24 24" style={{ width: 26, height: 26, color: isWith && !n.external ? 'var(--wf-accent)' : 'var(--wf-muted)', transition: 'color 0.9s ease' }} aria-hidden="true" />
                        <text y={46} textAnchor="middle" style={{ fill: 'var(--wf-text)', fontWeight: 600 }}>{n.label}</text>
                        {n.external && <text y={64} textAnchor="middle" style={{ fill: 'var(--wf-muted)', fontWeight: 500 }} className="wf-note">Patient data </text>}
                      </motion.g>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

function LockIllustration() {
  const reduce = useReducedMotion();
  const view = { once: true, amount: 0.5 };
  const ring = (delay) => (reduce ? {} : { initial: { scale: 0.6, opacity: 0 }, whileInView: { scale: 1, opacity: 1 }, viewport: view, transition: { duration: 0.9, ease: 'easeOut', delay } });
  return (
    <Box
      component="svg"
      viewBox="0 0 320 320"
      aria-hidden="true"
      focusable="false"
      sx={{ display: 'block', width: '100%', maxWidth: 340, mx: 'auto', color: accent, overflow: 'visible' }}
    >
      <g fill="none" stroke="currentColor" style={{ transformOrigin: '160px 160px' }}>
        <motion.circle cx="160" cy="160" r="150" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="2 8" style={{ transformOrigin: '160px 160px' }} {...ring(0.3)} />
        <motion.circle cx="160" cy="160" r="118" strokeWidth="1.2" strokeOpacity="0.4" style={{ transformOrigin: '160px 160px' }} {...ring(0.15)} />
        <motion.circle cx="160" cy="160" r="86" strokeWidth="1.2" strokeOpacity="0.6" style={{ transformOrigin: '160px 160px' }} {...ring(0)} />
        <motion.path
          d="M122 142v-26a38 38 0 0 1 76 0v26" strokeWidth="9" strokeLinecap="round"
          {...(reduce ? {} : { initial: { y: -18 }, whileInView: { y: 0 }, viewport: view, transition: { type: 'spring', stiffness: 160, damping: 11, delay: 0.7 } })}
        />
      </g>
      <rect x="104" y="140" width="112" height="86" rx="16" fill="currentColor" />
      <circle cx="160" cy="176" r="11" fill="var(--lock-key)" />
      <rect x="156" y="182" width="8" height="24" rx="4" fill="var(--lock-key)" />
      <circle cx="268" cy="86" r="6" fill="currentColor" />
      <circle cx="56" cy="228" r="4.5" fill="currentColor" fillOpacity="0.6" />
      <circle cx="240" cy="262" r="3.5" fill="currentColor" fillOpacity="0.45" />
    </Box>
  );
}

const SECURE_POINTS = [
  { title: 'Every view reviewed', body: 'A result cannot be published until each view has been reviewed by a clinician.' },
  { title: 'Private by default', body: 'A patient can only open a result through its private link, and only once an authorised user has published it.' },
  { title: 'Approved clinicians only', body: 'Only approved clinicians can sign in to run and review analyses.' },
  { title: 'Cloud access, any screen', body: 'Hosted in the cloud and built for desktop and tablet, so a result can be reviewed wherever the clinician is.' },
];

function SecureSection() {
  return (
    <Box component="section" aria-labelledby="secure-heading" sx={{ ...sectionTall, ...BAND.deep }}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={SPLIT_SX}>
            <Box sx={(theme) => ({ '--lock-key': theme.palette.mode === 'dark' ? '#162F50' : '#B1E0EE', order: { xs: 2, md: 0 } })}>
              <LockIllustration />
            </Box>
            <Box>
              <Typography id="secure-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>
                Secure for patients and clinicians
              </Typography>
              <Typography sx={{ ...LEAD_SX, mb: 4 }}>
                Results stay private until a clinician has reviewed every view and chosen to publish.
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {SECURE_POINTS.map((point) => (
                  <Box
                    component="li"
                    key={point.title}
                    sx={{ display: 'flex', gap: 2, py: 2, borderTop: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: '1px solid', borderBottomColor: 'divider' } }}
                  >
                    <CheckIcon aria-hidden="true" sx={{ fontSize: 20, mt: '3px', color: accent, flexShrink: 0 }} />
                    <Box>
                      <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary', mb: 0.25 }}>{point.title}</Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>{point.body}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

const WHY_POINTS = [
  { title: 'Ready in seconds', body: 'Results appear on screen as soon as the analysis completes.' },
  { title: 'Shared your way', body: 'A private link, a PDF, or straight from the clinician\'s screen.' },
  { title: 'Explained for the reader', body: 'A written explanation tailored to a clinician or a patient, generated by a cloud-hosted vision-language model.' },
  { title: 'Faster for patients', body: 'A published result can be opened straight away, with no account and no waiting on a separate report.' },
];

function WhySection() {
  const reduce = useReducedMotion();
  const [lead, ...rest] = WHY_POINTS;
  return (
    <Box component="section" aria-labelledby="why-heading" sx={{ ...sectionSx, ...BAND.soft }}>
      <SectionMotif type="grid" corner="top right" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ maxWidth: '60ch', mb: { xs: 5, md: 6 } }}>
            <Typography id="why-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>
              Why <Box component="span" sx={{ whiteSpace: 'nowrap', color: accent }}>Q-INTERVAL-Lite+</Box>
            </Typography>
            <Typography sx={LEAD_SX}>
              Built to speed up access to results for clinicians and patients, without taking the decision out of a clinician's hands.
            </Typography>
          </Box>
        </Reveal>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 3fr 3fr' }, gridTemplateRows: { md: 'auto auto' }, gap: 2 }}>
          <Box
            component={motion.li}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            sx={(theme) => ({
              gridRow: { md: '1 / span 2' }, p: { xs: 3, md: 4 }, borderRadius: 3, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: { md: 300 },
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(34,211,238,0.1)' : 'rgba(14,116,144,0.1)',
              border: '1px solid', borderColor: theme.palette.mode === 'dark' ? 'rgba(34,211,238,0.35)' : 'rgba(14,116,144,0.45)',
            })}
          >
            <Typography component="h3" sx={{ fontSize: { xs: '2rem', md: '2.7rem' }, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: accent, mb: 1.5, ...HEADING_WRAP }}>
              {lead.title}
            </Typography>
            <Typography sx={{ color: 'text.primary', fontSize: '1rem', lineHeight: 1.7, maxWidth: '30ch', ...PARAGRAPH_WRAP }}>{lead.body}</Typography>
          </Box>
          {rest.map((point, i) => (
            <Box
              component={motion.li}
              key={point.title}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55, ease: 'easeOut', delay: 0.12 * (i + 1) }}
              whileHover={reduce ? undefined : { y: -4 }}
              sx={{
                p: 3, borderRadius: 3, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider',
                gridColumn: { md: i === 2 ? '2 / span 2' : 'auto' },
              }}
            >
              <Typography component="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, color: 'text.primary', mb: 0.75 }}>{point.title}</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>{point.body}</Typography>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

// Answers are statements of intended practice; the project team should confirm them before launch.
const FAQS = [
  {
    q: 'Is my medical information kept safe?',
    a: 'It is our highest priority. Only approved clinicians can sign in, and a patient result can only be reached through its private link after a clinician has published it. This is still a research prototype, so it should only be used with test data until it has had a formal security and ethics review.',
  },
  {
    q: 'Can I use it to make a diagnosis?',
    a: 'No. Q-INTERVAL-Lite+ assists a clinician by flagging signals that are hard to see. It is not a diagnostic device, and every result has to be reviewed by a clinician, who makes the decision.',
  },
  {
    q: 'Does a clinician have to review every result?',
    a: 'Yes. Each view must be reviewed before the result can be published, and nothing is shared with a patient until a clinician publishes it.',
  },
  {
    q: 'Is it free to use?',
    a: 'Yes. Q-INTERVAL-Lite+ is a non-commercial educational research project.',
  },
  {
    q: 'Is my data used for anything else?',
    a: 'Your data is used to produce the analysis that was requested. When a classification session is uploaded there is an optional, off-by-default choice to allow its verified images and results to help improve the models. Your result is the same either way, future risk analyses are never used, and the choice can be withdrawn from My Sessions.',
  },
  {
    q: 'Where does the written explanation come from?',
    a: 'It is generated by a cloud-hosted vision-language model rather than one running on our own servers. That model is sent the image along with the model results so it can describe what they show.',
  },
  {
    q: 'Why are there two models?',
    a: 'A standard CNN and a quantum-enhanced model analyse each view independently and report side by side, so a clinician can compare them. The Models page explains how each one works.',
  },
  {
    q: 'Can a patient see their result without an account?',
    a: 'Yes. Once a clinician publishes a result, the patient can open it with the private link they were given. No account is needed.',
  },
];

function FaqSection() {
  const [open, setOpen] = useState(null);
  return (
    <Box component="section" aria-labelledby="faq-heading" sx={sectionCompact}>
      <Container maxWidth="lg">
        <Box sx={{ ...SPLIT_SX, alignItems: 'start' }}>
          <Reveal>
            <Typography id="faq-heading" component="h2" sx={{ ...SECTION_HEADING_COMPACT_SX, mb: 1.5 }}>
              Frequently asked questions
            </Typography>
            <Typography sx={{ ...LEAD_SX, mb: 3 }}>
              Short answers about privacy, review and how results are shared.
            </Typography>
            <ArrowLink to="/About">About the project</ArrowLink>
          </Reveal>
          <Box>
            {FAQS.map((item, i) => (
              <Accordion
                key={item.q}
                expanded={open === i}
                onChange={(_, isOpen) => setOpen(isOpen ? i : null)}
                disableGutters
                elevation={0}
                square
                sx={{ backgroundColor: 'transparent', backgroundImage: 'none', boxShadow: 'none', border: 0, borderBottom: '1px solid', borderColor: 'divider', '&::before': { display: 'none' }, '&:first-of-type': { borderTop: '1px solid', borderTopColor: 'divider' }, '&.Mui-expanded': { margin: 0 } }}
              >
                <AccordionSummary
                  expandIcon={<ExpandIcon sx={{ color: 'text.secondary' }} aria-hidden="true" />}
                  aria-controls={`faq-panel-${i}`}
                  id={`faq-header-${i}`}
                  sx={{ px: 0, py: 0.5, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
                >
                  <Typography component="h3" sx={{ fontSize: '0.98rem', fontWeight: 600, color: 'text.primary', pr: 2 }}>
                    {item.q}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails id={`faq-panel-${i}`} sx={{ px: 0, pt: 0, pb: 2.5 }}>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.75, maxWidth: '60ch', ...PARAGRAPH_WRAP }}>
                    {item.a}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

function ContactSection() {
  const { user, profile } = useAuth();
  const approved = Boolean(user) && profile?.status === 'approved' && Boolean(profile?.role);
  return (
    <Box component="section" aria-labelledby="contact-heading" sx={{ ...sectionTall, ...BAND.emphasis, color: '#FFFFFF' }}>
      <Box
        component="svg"
        viewBox="0 0 320 320"
        aria-hidden="true"
        focusable="false"
        sx={{ position: 'absolute', right: { xs: -160, md: -40 }, top: '50%', transform: 'translateY(-50%)', width: { xs: 340, md: 460 }, height: 'auto', color: '#FFFFFF', pointerEvents: 'none' }}
      >
        <g fill="none" stroke="currentColor">
          <circle cx="160" cy="160" r="150" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="2 8" />
          <circle cx="160" cy="160" r="118" strokeWidth="1.2" strokeOpacity="0.25" />
          <circle cx="160" cy="160" r="86" strokeWidth="1.2" strokeOpacity="0.3" />
          <circle cx="160" cy="160" r="54" strokeWidth="1.2" strokeOpacity="0.35" />
        </g>
        <circle cx="160" cy="160" r="8" fill="currentColor" fillOpacity="0.5" />
        <circle cx="236" cy="104" r="6" fill="currentColor" fillOpacity="0.55" />
      </Box>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ maxWidth: 560 }}>
            <Typography id="contact-heading" component="h2" sx={{ ...SECTION_HEADING_SX, color: '#FFFFFF', mb: 2 }}>
              {approved ? 'Ready to review a scan?' : 'Interested in using it?'}
            </Typography>
            <Typography sx={{ ...LEAD_SX, color: 'rgba(255,255,255,0.92)', mb: 4 }}>
              {approved
                ? 'Open the dashboard to start a new session.'
                : 'Anyone can request an account, and each request is reviewed by an administrator.'}
            </Typography>
            <Button
              component={RouterLink}
              to={approved ? '/Analysis' : '/request-access'}
              variant="contained"
              sx={{
                px: 3.5, py: 1.1, fontSize: '0.95rem', backgroundImage: 'none', backgroundColor: '#FFFFFF', color: '#0A5C72', boxShadow: 'none',
                '&:hover': { backgroundColor: '#E6F7FB', boxShadow: 'none' },
                '&:focus-visible': { outline: '2px solid #FFFFFF', outlineOffset: 3 },
              }}
            >
              {approved ? 'Launch Analysis Dashboard' : 'Request Access'}
            </Button>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

const HERO_STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.14, delayChildren: 0.1 } } };
const HERO_ITEM = { hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' } } };

export default function Home() {
  const [resultOpen, setResultOpen] = useState(false);
  const openResult = () => setResultOpen(true);
  const reduce = useReducedMotion();
  const heroItem = reduce ? {} : { variants: HERO_ITEM };

  return (
    <Box component="main" sx={{ backgroundColor: 'background.default' }}>

      <Box
        sx={{
          position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          minHeight: { xs: 'auto', md: `calc(100dvh - ${NAV_H}px)` },
          background: (theme) => theme.palette.background.hero,
          '&::before': { content: '""', position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '800px', borderRadius: '50%', background: (theme) => theme.palette.background.heroGlow, pointerEvents: 'none' },
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden', backgroundImage: (theme) => `linear-gradient(${theme.palette.primary.main}${theme.palette.mode === 'dark' ? '06' : '14'} 1px, transparent 1px), linear-gradient(90deg, ${theme.palette.primary.main}${theme.palette.mode === 'dark' ? '06' : '14'} 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
        <NeuralCanvas />
        <Box
          component={motion.div}
          {...(reduce ? {} : { variants: HERO_STAGGER, initial: 'hidden', animate: 'show' })}
          sx={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 2, pt: { xs: 8, md: 6 }, pb: { xs: 6, md: 6 } }}
        >
          <Box component={motion.div} {...heroItem} sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0.75, mb: 2.5 }}>
            <ShieldIcon sx={{ fontSize: 15, color: (theme) => (theme.palette.mode === 'dark' ? theme.palette.error.main : theme.palette.error.dark) }} aria-hidden="true" />
            <Typography sx={{ color: (theme) => (theme.palette.mode === 'dark' ? theme.palette.error.main : theme.palette.error.dark), fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Research prototype · Not for clinical use
            </Typography>
          </Box>

          <Typography variant="h1" component="h1" sx={{ position: 'relative', fontSize: { xs: '2.2rem', md: '3.1rem' }, lineHeight: 1.1, mb: 3, color: 'text.primary' }}>
            <Box component={motion.span} {...heroItem} sx={{ display: 'block' }}>Revealing the</Box>
            {' '}
            <Box
              component={motion.span}
              {...(reduce ? {} : { variants: { hidden: { opacity: 0, filter: 'blur(10px)', y: 14 }, show: { opacity: 1, filter: 'blur(0px)', y: 0, transition: { duration: 1.1, ease: 'easeOut' } } } })}
              sx={{ display: 'block', fontStyle: 'italic', color: accent }}
            >
              Invisible.
            </Box>
          </Typography>

          <Typography component={motion.p} {...heroItem} sx={{ position: 'relative', color: 'text.secondary', maxWidth: 500, mx: 'auto', lineHeight: 1.8, mb: 4, mt: 0, fontSize: '1rem', fontStyle: 'italic' }}>
            An educational platform comparing standard and quantum-enhanced AI to detect hidden precursors of breast cancer, making complex diagnostics transparent and visual.
          </Typography>

          <Box component={motion.div} {...heroItem} sx={{ position: 'relative' }}>
            <HeroActions onOpenResult={openResult} />
          </Box>
        </Box>

        <EvaluationStrip />
      </Box>

      <WorkflowSection />
      <StepsSection onOpenResult={openResult} />
      <ResultsSection />
      <SecureSection />
      <AssistSection />
      <WhySection />
      <FaqSection />
      <ResourcesSection />
      <ContactSection />

      <OpenResultDialog open={resultOpen} onClose={() => setResultOpen(false)} />
    </Box>
  );
}
