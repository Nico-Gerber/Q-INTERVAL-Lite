import React, { useEffect, useRef, useState } from 'react';
import { Box, Container, Typography } from '@mui/material';
import {
  CheckRounded as CheckIcon,
  PeopleOutlined as PeopleIcon,
  CalendarMonthOutlined as CalendarIcon,
  WarningAmberRounded as WarningIcon,
  VisibilityOffOutlined as EyeOffIcon,
  CloudUploadOutlined as UploadIcon,
  MemoryOutlined as AnalyseIcon,
  AutoAwesomeOutlined as ExplainIcon,
  IosShareRounded as ShareIcon,
  VisibilityOutlined as SeenIcon,
  LayersOutlined as OcclusionIcon,
} from '@mui/icons-material';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import {
  accent, AccentWord, BAND, HEADING_WRAP, ImageSlot, LEAD_SX, PARAGRAPH_WRAP, Reveal, SECTION_HEADING_COMPACT_SX, SECTION_HEADING_SX, SectionMotif, SlideIn,
  SPLIT_SX, sectionSx, sectionTall,
} from '../Components/Shared/pageKit';
import logoDark from '../assets/logo-dark.svg';
import logoLight from '../assets/logo-light.svg';

// Figures supplied by the project team from the AIHW BreastScreen Australia Monitoring Report (2025) and Cancer Australia.
const STATS = [
  { Icon: PeopleIcon, prefix: '1 in ', end: 7, decimals: 0, suffix: '', label: 'Australian women will be diagnosed with breast cancer in their lifetime.' },
  { Icon: CalendarIcon, prefix: '', end: 1.9, decimals: 1, suffix: 'M', label: 'Australian women rely on routine screening cycles biennially.' },
  { Icon: WarningIcon, prefix: '', end: 22, decimals: 0, suffix: '%', label: "Of invasive cancers emerge as 'interval cancers' between routine clear screenings." },
  { Icon: EyeOffIcon, prefix: '', end: 80, decimals: 0, suffix: '%+', label: 'Of interval cancers are deemed clinically invisible to the human eye on prior scans.' },
];

const SOURCES = [
  { label: 'AIHW BreastScreen Australia Monitoring Report (2025)', href: 'https://www.aihw.gov.au/getmedia/24fb0319-2c95-4d6e-92d2-c9d87ead0e34/breastscreen-australia-monitoring-report-2025.pdf?v=20251027205626&inline=true' },
  { label: 'Cancer Australia', href: 'https://www.canceraustralia.gov.au/' },
];

const CHECKS = [
  { title: 'Every view is reviewed', body: 'A clinician reviews each view before a result can be published.' },
  { title: 'Two models, compared', body: 'A classical and a quantum-enhanced model read the same views, so any difference between them is visible.' },
  { title: 'Evidence you can inspect', body: 'Occlusion maps show which regions of an image influenced a result.' },
  { title: 'Shared only when ready', body: 'A patient can open a result only after it is published, through a private link.' },
];

const AUDIENCES = [
  {
    title: 'Clinicians',
    body: 'Upload the views from a mammogram, compare two models, and check what drove each result before sharing it.',
    points: ['Compare two models on every view', 'See which regions influenced a result', 'Verify each view, then publish a private link or export a PDF'],
    note: 'Access is granted by an administrator after a request is reviewed.',
    image: 'A clinician reviewing images on a screen',
  },
  {
    title: 'Patients',
    body: 'Your clinician gives you a private link once your result has been reviewed. You do not need an account to open it.',
    points: ['Opens in any web browser', 'Shows the final, reviewed result', 'Includes a written explanation in plain language'],
    note: 'No link yet? Your clinic can send one once your result is ready.',
    image: 'A calm, supportive consultation',
  },
  {
    title: 'Medical students',
    body: 'See how an AI system reaches a result, and learn to question it rather than take it on trust.',
    points: ['Occlusion maps show what the model focused on', 'Classical and quantum results sit side by side', 'Every decision on a result is recorded'],
    image: 'Students studying together',
  },
  {
    title: 'AI students',
    body: 'Study two model families on the same data, with results and evaluation status laid out openly.',
    points: ['A CNN and a quantum-enhanced model, compared directly', 'Occlusion-based explanations of each prediction', 'Evaluation figures published only once validated'],
    image: 'A student working on a laptop',
  },
];

const STATUS = [
  { title: 'Free for education and research', body: 'There is no charge, and it is not a commercial product.' },
  { title: 'A research prototype', body: 'It is not a diagnostic device and is not for clinical use.' },
  { title: 'Evaluation under way', body: 'How well each model performs is still being measured. Figures are published only once they have been validated.' },
];

const DATA_JOURNEY = [
  {
    Icon: UploadIcon,
    title: 'Upload',
    moves: 'The mammogram views, as JPEG, PNG or DICOM. DICOM files are converted to an image in the browser.',
    seenBy: 'The approved clinician who uploads them.',
  },
  {
    Icon: AnalyseIcon,
    title: 'Analysis',
    moves: 'The same views go to both models, one classical and one quantum-enhanced.',
    seenBy: 'The two models, which read every view.',
  },
  {
    Icon: ExplainIcon,
    title: 'Explanation',
    moves: 'The image and the model results go to a cloud-hosted vision-language model, which writes the explanation.',
    seenBy: 'That hosted model, which sits outside our own servers.',
  },
  {
    Icon: ShareIcon,
    title: 'Sharing',
    moves: 'The reviewed result, once a clinician has verified every view and published it.',
    seenBy: 'The patient, through a private link, with no account needed.',
  },
];

function IntroSection() {
  return (
    <Box
      component="section"
      aria-labelledby="about-heading"
      sx={{ ...sectionSx, ...BAND.emphasis, color: '#FFFFFF', py: { xs: 13, md: 20 } }}
    >
      <Box
        component="svg"
        viewBox="0 0 320 320"
        aria-hidden="true"
        focusable="false"
        sx={{ position: 'absolute', right: { xs: -180, md: -60 }, top: '50%', transform: 'translateY(-50%)', width: { xs: 380, md: 560 }, height: 'auto', color: '#FFFFFF', pointerEvents: 'none' }}
      >
        <g fill="none" stroke="currentColor">
          <circle cx="160" cy="160" r="150" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="2 8" />
          <circle cx="160" cy="160" r="118" strokeWidth="1.2" strokeOpacity="0.25" />
          <circle cx="160" cy="160" r="86" strokeWidth="1.2" strokeOpacity="0.3" />
          <circle cx="160" cy="160" r="54" strokeWidth="1.2" strokeOpacity="0.35" />
        </g>
        <circle cx="206" cy="122" r="6" fill="currentColor" fillOpacity="0.6" />
      </Box>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Typography
          id="about-heading"
          component="h1"
          sx={{ ...HEADING_WRAP, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, fontSize: { xs: '2.6rem', md: '4.4rem' }, color: '#FFFFFF', maxWidth: '13ch', mb: 4 }}
        >
          <SlideIn delay={0.1}>Hidden signals, <AccentWord onDark>confirmed</AccentWord> by clinicians.</SlideIn>
        </Typography>
        <Reveal delay={0.35}>
          <Typography sx={{ ...LEAD_SX, color: 'rgba(255,255,255,0.92)', maxWidth: '44ch', fontSize: { xs: '1.05rem', md: '1.2rem' } }}>
            Q-INTERVAL-Lite+ looks for signals in a mammogram that are hard to see by eye, and a clinician confirms every
            finding before it is shared.
          </Typography>
        </Reveal>
      </Container>
    </Box>
  );
}

function CountUp({ prefix, end, decimals, suffix }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [value, setValue] = useState(reduce ? end : 0);

  useEffect(() => {
    if (reduce || !inView) return undefined;
    const controls = animate(0, end, { duration: 1.4, ease: 'easeOut', onUpdate: (v) => setValue(v) });
    return () => controls.stop();
  }, [inView, reduce, end]);

  return <span ref={ref}>{prefix}{value.toFixed(decimals)}{suffix}</span>;
}

function StatsSection() {
  return (
    <Box component="section" aria-labelledby="stats-heading" sx={{ ...sectionSx, ...BAND.soft }}>
      <SectionMotif type="grid" corner="top left" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Typography id="stats-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: { xs: 4, md: 6 }, maxWidth: '22ch' }}>
            A common cancer, and one that can hide
          </Typography>
        </Reveal>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {STATS.map((stat) => (
            <Box
              component="li"
              key={stat.label}
              sx={{ p: 3, borderRadius: 3, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}
            >
              <Box
                aria-hidden="true"
                sx={{ width: 44, height: 44, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.default', mb: 2.5 }}
              >
                <stat.Icon sx={{ fontSize: 24 }} />
              </Box>
              <Typography sx={{ fontSize: { xs: '2.2rem', md: '2.3rem' }, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, whiteSpace: 'nowrap', color: accent, mb: 1.25, fontVariantNumeric: 'tabular-nums' }}>
                <CountUp {...stat} />
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', lineHeight: 1.65, ...PARAGRAPH_WRAP }}>{stat.label}</Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem', lineHeight: 1.7, mt: 4, maxWidth: '80ch' }}>
          Data sourced from the{' '}
          <Box component="a" href={SOURCES[0].href} target="_blank" rel="noopener noreferrer" sx={{ color: 'inherit', textDecorationColor: 'currentColor', '&:hover': { color: 'text.primary' } }}>{SOURCES[0].label}</Box>
          {' '}and{' '}
          <Box component="a" href={SOURCES[1].href} target="_blank" rel="noopener noreferrer" sx={{ color: 'inherit', textDecorationColor: 'currentColor', '&:hover': { color: 'text.primary' } }}>{SOURCES[1].label}</Box>.
        </Typography>
      </Container>
    </Box>
  );
}

function FloatingNote({ Icon, title, body, sx, delay = 0 }) {
  const reduce = useReducedMotion();
  return (
    <Box
      component={motion.div}
      animate={reduce ? undefined : { y: [0, -6, 0] }}
      transition={reduce ? undefined : { duration: 5, ease: 'easeInOut', repeat: Infinity, delay }}
      sx={{
        position: { xs: 'static', md: 'absolute' }, mt: { xs: 2, md: 0 }, display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, pr: 2.5,
        borderRadius: 3, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider',
        boxShadow: (theme) => (theme.palette.mode === 'dark' ? '0 14px 36px rgba(0,0,0,0.45)' : '0 14px 36px rgba(14,116,144,0.22)'),
        maxWidth: 270, zIndex: 2, ...sx,
      }}
    >
      <Box aria-hidden="true" sx={{ width: 40, height: 40, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.default' }}>
        <Icon sx={{ fontSize: 22 }} />
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'text.primary', lineHeight: 1.3 }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.4 }}>{body}</Typography>
      </Box>
    </Box>
  );
}

function ProblemSection() {
  return (
    <Box component="section" aria-labelledby="problem-heading" sx={{ ...sectionTall }}>
      <SectionMotif type="glow" corner="78% 50%" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ ...SPLIT_SX, gridTemplateColumns: { xs: '1fr', md: '2fr 3fr' } }}>
            <Box sx={{ borderLeft: '3px solid', borderColor: accent, pl: { xs: 2.5, md: 4 } }}>
              <Typography id="problem-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2.5 }}>
                Making faint signals visible
              </Typography>
              <Typography sx={{ ...LEAD_SX, mb: 2 }}>
                A routine mammogram holds far more detail than the eye can weigh at once. Q-INTERVAL-Lite+ analyses each view
                with two models and highlights the regions that shaped the result.
              </Typography>
              <Typography sx={LEAD_SX}>
                That gives a clinician something concrete to check, alongside everything else they know about the patient.
              </Typography>
            </Box>
            <Box sx={{ position: 'relative', pt: { md: 3 }, pb: { md: 4 }, px: { md: 3 } }}>
              <ImageSlot
                kind="Screenshot"
                label="A results page, captured with test data"
                ratio="16 / 10"
                sx={{ boxShadow: (theme) => (theme.palette.mode === 'dark' ? '0 24px 60px rgba(0,0,0,0.5)' : '0 24px 60px rgba(14,116,144,0.2)') }}
              />
              <FloatingNote
                Icon={AnalyseIcon}
                title="Two models, side by side"
                body="Classical and quantum-enhanced"
                sx={{ top: 0, left: 0 }}
              />
              <FloatingNote
                Icon={OcclusionIcon}
                title="Occlusion map"
                body="Marks the regions that shaped the result"
                sx={{ bottom: 0, right: 0 }}
                delay={1.2}
              />
            </Box>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

const VIEW_CARDS = [
  { label: 'R CC', x: 18, y: 78 },
  { label: 'L CC', x: 52, y: 54 },
  { label: 'R MLO', x: 86, y: 30 },
  { label: 'L MLO', x: 120, y: 6 },
];

function ViewsIllustration() {
  const reduce = useReducedMotion();
  const view = { once: true, amount: 0.5 };
  return (
    <Box
      component="svg"
      viewBox="0 0 320 300"
      aria-hidden="true"
      focusable="false"
      sx={{ display: 'block', width: '100%', maxWidth: 340, mx: 'auto', color: accent, overflow: 'visible' }}
    >
      {VIEW_CARDS.map((card, i) => (
        <motion.g
          key={card.label}
          {...(reduce ? {} : { initial: { opacity: 0, x: -24 }, whileInView: { opacity: 1, x: 0 }, viewport: view, transition: { duration: 0.6, ease: 'easeOut', delay: i * 0.18 } })}
        >
          <rect x={card.x} y={card.y} width="150" height="190" rx="14" style={{ fill: 'var(--views-card)' }} stroke="currentColor" strokeWidth="2" strokeOpacity={0.35 + i * 0.2} />
          <path
            d={`M${card.x + 24} ${card.y + 150} C${card.x + 30} ${card.y + 60}, ${card.x + 90} ${card.y + 40}, ${card.x + 126} ${card.y + 74}`}
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity={0.2 + i * 0.12}
          />
          <text x={card.x + 14} y={card.y + 26} style={{ fill: 'currentColor', fontSize: 13, fontWeight: 700, opacity: 0.5 + i * 0.15 }}>{card.label}</text>
        </motion.g>
      ))}
      <motion.g
        style={{ transformOrigin: '236px 232px' }}
        {...(reduce ? {} : { initial: { scale: 0 }, whileInView: { scale: 1 }, viewport: view, transition: { type: 'spring', stiffness: 220, damping: 12, delay: 0.95 } })}
      >
        <circle cx="236" cy="232" r="34" fill="currentColor" />
        <path d="M220 232l11 11 20-22" fill="none" stroke="var(--views-card)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </Box>
  );
}

function ChecksSection() {
  return (
    <Box component="section" aria-labelledby="checks-heading" sx={sectionSx}>
      <SectionMotif type="dots" corner="top right" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={SPLIT_SX}>
            <Box sx={(theme) => ({ '--views-card': theme.palette.background.paper, order: { xs: 2, md: 0 } })}>
              <ViewsIllustration />
            </Box>
            <Box>
              <Typography id="checks-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>
                Checks built into every result
              </Typography>
              <Typography sx={{ ...LEAD_SX, mb: 3 }}>Nothing is shared until each of these has happened.</Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {CHECKS.map((item) => (
                  <Box
                    component="li"
                    key={item.title}
                    sx={{ display: 'flex', gap: 2, py: 2, borderTop: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: '1px solid', borderBottomColor: 'divider' } }}
                  >
                    <CheckIcon aria-hidden="true" sx={{ fontSize: 22, mt: '2px', color: accent, flexShrink: 0 }} />
                    <Box>
                      <Typography component="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, color: 'text.primary', mb: 0.25 }}>{item.title}</Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>{item.body}</Typography>
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

function AudienceSection() {
  const reduce = useReducedMotion();
  return (
    <Box component="section" aria-labelledby="audience-heading" sx={{ ...sectionTall, ...BAND.deep }}>
      <SectionMotif type="glow" corner="50% 0%" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 7 } }}>
            <Typography id="audience-heading" component="h2" sx={{ ...SECTION_HEADING_SX, fontSize: { xs: '2rem', md: '3rem' }, mb: 1.5 }}>
              Who it is for
            </Typography>
            <Typography sx={{ ...LEAD_SX, mx: 'auto' }}>Everything each group needs to know is here.</Typography>
          </Box>
        </Reveal>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          {AUDIENCES.map((item, i) => (
            <Box
              component={motion.li}
              key={item.title}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.55, ease: 'easeOut', delay: (i % 2) * 0.12 }}
              sx={{ borderRadius: 4, overflow: 'hidden', backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}
            >
              <ImageSlot label={item.image} ratio="16 / 8" sx={{ borderRadius: 0, border: 0, borderBottom: '2px dashed', borderColor: 'divider' }} />
              <Box sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', flex: 1 }}>
                <Typography component="h3" sx={{ fontSize: { xs: '1.5rem', md: '1.8rem' }, fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary', mb: 1 }}>{item.title}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.98rem', lineHeight: 1.7, mb: 2, ...PARAGRAPH_WRAP }}>{item.body}</Typography>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mb: 3, flex: 1 }}>
                  {item.points.map((point) => (
                    <Box component="li" key={point} sx={{ display: 'flex', gap: 1.25, py: 0.5 }}>
                      <CheckIcon aria-hidden="true" sx={{ fontSize: 18, mt: '4px', color: accent, flexShrink: 0 }} />
                      <Typography sx={{ color: 'text.primary', fontSize: '0.92rem', lineHeight: 1.6 }}>{point}</Typography>
                    </Box>
                  ))}
                </Box>
                {item.note && (
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem', lineHeight: 1.6, ...PARAGRAPH_WRAP }}>{item.note}</Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

function StatusSection() {
  return (
    <Box component="section" aria-labelledby="status-heading" sx={{ ...sectionTall, ...BAND.emphasis, color: '#FFFFFF' }}>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Typography id="status-heading" component="h2" sx={{ ...SECTION_HEADING_SX, color: '#FFFFFF', maxWidth: '20ch', mb: { xs: 5, md: 7 }, fontSize: { xs: '2rem', md: '3rem' } }}>
            Where the project stands today
          </Typography>
        </Reveal>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: { xs: 3, md: 5 } }}>
          {STATUS.map((item, i) => (
            <Box component="li" key={item.title} sx={{ borderTop: '2px solid rgba(255,255,255,0.55)', pt: 2 }}>
              <Reveal delay={i * 0.1}>
                <Typography component="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF', mb: 0.75 }}>{item.title}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.92)', fontSize: '0.95rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>{item.body}</Typography>
              </Reveal>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

function ResponsibleSection() {
  const reduce = useReducedMotion();
  return (
    <Box component="section" aria-labelledby="responsible-heading" sx={{ ...sectionTall, ...BAND.soft }}>
      <SectionMotif type="dots" corner="bottom left" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ maxWidth: '62ch', mb: { xs: 5, md: 7 } }}>
            <Typography id="responsible-heading" component="h2" sx={{ ...SECTION_HEADING_SX, fontSize: { xs: '2rem', md: '2.8rem' }, mb: 2 }}>
              What happens to your data
            </Typography>
            <Typography sx={{ ...LEAD_SX, maxWidth: '54ch' }}>
              The route a result takes, what travels at each step, and who can see it.
            </Typography>
          </Box>
        </Reveal>

        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, columnGap: '16px', rowGap: { xs: 5, md: 0 } }}>
          {DATA_JOURNEY.map((step, i) => (
            <Box component="li" key={step.title} sx={{ position: 'relative', display: 'flex', flexDirection: 'column', color: accent }}>
              <Box
                aria-hidden="true"
                sx={{
                  position: 'relative', zIndex: 1, width: 48, height: 48, borderRadius: '50%', mb: 2.5, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'background.paper', border: '2px solid currentColor',
                }}
              >
                <step.Icon sx={{ fontSize: 24 }} />
              </Box>
              {i < DATA_JOURNEY.length - 1 && (
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <motion.span
                    aria-hidden="true"
                    initial={reduce ? false : { scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true, amount: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 + i * 0.25 }}
                    style={{ position: 'absolute', top: 23, left: 60, width: 'calc(100% - 44px)', height: 2, background: 'currentColor', opacity: 0.55, transformOrigin: 'left' }}
                  />
                </Box>
              )}
              <Box sx={{ borderRadius: 3, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, color: 'text.primary' }}>
                <Box sx={{ p: 2.5, flex: 1 }}>
                  <Typography component="h3" sx={{ fontSize: '1.15rem', fontWeight: 700, color: 'text.primary', mb: 1 }}>{step.title}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>{step.moves}</Typography>
                </Box>
                <Box
                  sx={(theme) => ({
                    p: 2.5, minHeight: { md: 140 }, borderTop: '1px solid', borderColor: 'divider',
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(34,211,238,0.08)' : 'rgba(14,116,144,0.08)',
                  })}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, color: accent }}>
                    <SeenIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'inherit' }}>Seen by</Typography>
                  </Box>
                  <Typography sx={{ color: 'text.primary', fontSize: '0.9rem', lineHeight: 1.6, fontWeight: 500, ...PARAGRAPH_WRAP }}>{step.seenBy}</Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>

        <Reveal delay={0.1}>
          <Box
            sx={{ mt: { xs: 5, md: 6 }, p: { xs: 2.5, md: 3 }, borderRadius: 3, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', display: 'flex', gap: 2, alignItems: 'flex-start' }}
          >
            <CheckIcon aria-hidden="true" sx={{ fontSize: 22, mt: '2px', color: accent, flexShrink: 0 }} />
            <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>Saved sessions stay private. </Box>
              Images and results are kept in private storage so a clinician can return to a session, and a patient sees a result only once it has been published.
            </Typography>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

function OriginSection() {
  return (
    <Box component="section" aria-labelledby="origin-heading" sx={sectionTall}>
      <SectionMotif type="glow" corner="80% 50%" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ ...SPLIT_SX, gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' } }}>
            <Box>
              <Typography id="origin-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2.5 }}>
                Where it came from
              </Typography>
              <Typography sx={{ ...LEAD_SX, maxWidth: '54ch', fontSize: { xs: '1.02rem', md: '1.15rem' }, mb: 2 }}>
                Q-INTERVAL-Lite+ began as a university research project exploring whether quantum-enhanced models can add to
                classical ones when looking for hidden precursors of breast cancer.
              </Typography>
              <Typography sx={{ ...LEAD_SX, maxWidth: '54ch', fontSize: { xs: '1.02rem', md: '1.15rem' } }}>
                It is built as a non-commercial project, so it can stay free for education and research.
              </Typography>
            </Box>
            <Box
              aria-hidden="true"
              sx={(theme) => ({
                display: 'flex', justifyContent: { xs: 'flex-start', md: 'center' },
                '& .origin-logo-dark': { display: theme.palette.mode === 'dark' ? 'block' : 'none' },
                '& .origin-logo-light': { display: theme.palette.mode === 'dark' ? 'none' : 'block' },
              })}
            >
              <Box component="img" className="origin-logo-dark" src={logoDark} alt="" sx={{ width: { xs: 140, md: 240 }, height: 'auto' }} />
              <Box component="img" className="origin-logo-light" src={logoLight} alt="" sx={{ width: { xs: 140, md: 240 }, height: 'auto' }} />
            </Box>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

const About = () => (
  <Box component="main" sx={{ backgroundColor: 'background.default' }}>
    <IntroSection />
    <StatsSection />
    <ProblemSection />
    <AudienceSection />
    <ChecksSection />
    <ResponsibleSection />
    <StatusSection />
    <OriginSection />
  </Box>
);

export default About;
