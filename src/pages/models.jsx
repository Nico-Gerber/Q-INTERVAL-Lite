import React, { useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Container, Typography } from '@mui/material';
import { ExpandMoreRounded as ExpandIcon } from '@mui/icons-material';
import { motion, useReducedMotion } from 'framer-motion';
import {
  accent, BAND, HOVER_LIFT, LEAD_SX, PARAGRAPH_WRAP, Reveal, SECTION_HEADING_SX, SectionMotif, SlideIn,
  SPLIT_SX, sectionCompact, sectionSx, sectionTall,
} from '../Components/Shared/PublicPageKit';

// Every figure on this page comes from the team's own testing, recorded in the Q-INTERVAL-LITE+ Technical Specification Document.

const MAMMO_BENCH_URL = 'https://www.medrxiv.org/content/10.1101/2025.01.31.25321510v1';
const EMBED_URL = 'https://registry.opendata.aws/emory-breast-imaging-dataset-embed/';

function ExtLink({ href, children }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ color: accent, fontWeight: 600, textDecorationThickness: '1px', textUnderlineOffset: 3, '&:hover': { textDecorationThickness: '2px' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 0.5 } }}
    >
      {children}
      <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> (opens in a new tab)</Box>
    </Box>
  );
}

const MODES = {
  classification: {
    label: 'Classification',
    blurb: 'Reads a mammogram view and labels it Normal, Benign or Malignant.',
    models: [
      {
        family: 'classical',
        name: 'Classical deep learning',
        status: 'In the app: v12 ensemble. Latest candidate: ConvNeXt V2-Huge, export verified, app integration pending.',
        reads: 'The whole mammogram image, one view at a time. The network learns visual patterns directly from the pixels.',
        output: 'Probabilities for Normal, Benign and Malignant, calibrated so they can be read as likelihoods.',
        steps: ['Crop to the breast and resize', 'A convolutional network reads the image', 'Calibrated class probabilities'],
        params: [
          ['Latest candidate', 'ConvNeXt V2-Huge, ImageNet pretrained'],
          ['Input size', '2048 × 1024, greyscale copied to 3 channels'],
          ['Trainable parameters', '657,481,091 (657,472,640 encoder, 8,451 head)'],
          ['Optimiser', 'AdamW, weight decay 0.05'],
          ['Learning rates', 'Encoder 0.00002, head 0.0001, layer-wise decay 0.8'],
          ['Regularisation', 'Drop-path 0.5, no augmentation'],
          ['Batch and precision', 'Effective batch 32, bf16, gradient clipping 1.0'],
          ['Training run', 'Seed 42, 21 of 60 epochs run, epoch 13 selected on validation macro-F1'],
          ['Calibration', 'Temperature scaling, T = 2.7834, fitted on a separate set'],
          ['In the app today', 'v12 ensemble: EfficientNetV2-S with CBAM (Group DRO) plus ResNet-101, source input removed'],
        ],
      },
      {
        family: 'quantum',
        name: 'Quantum kernel classifier',
        status: 'In the app: the fine-tuned, source-balanced version.',
        reads: 'Twelve numbers distilled from the image. A ResNet18 network extracts 512 features, and PCA reduces them to 12.',
        output: 'Normal, Benign or Malignant, chosen by a support vector machine that compares images using a quantum kernel.',
        steps: ['ResNet18 extracts features, then PCA keeps 12', 'Each image is encoded onto 12 qubits', 'Similarity between images is their quantum overlap'],
        params: [
          ['Feature extractor', 'ResNet18, last two stages fine-tuned, 512 features'],
          ['Reduction', 'PCA to 12 features'],
          ['Qubits', '12 (4 to 16 were tested, 16 did not fit in memory)'],
          ['Encoding', 'RY and RZ rotation per qubit, with a light entangling ring scaled by 0.03'],
          ['Circuit depth', 'The block repeats twice'],
          ['Kernel', 'Quantum fidelity, computed by exact statevector simulation'],
          ['Classifier', 'Support vector machine, C = 1.0, one-vs-one for three classes'],
          ['Training balance', 'Sampling shows every source all three diagnoses about equally often'],
        ],
      },
    ],
    data: {
      lead: <>Both models learn from <ExtLink href={MAMMO_BENCH_URL}>Mammo-Bench</ExtLink>, a pooled collection of mammograms from six sources.</>,
      stats: [
        { value: '19,731', label: 'image records in Mammo-Bench' },
        { value: '6', label: 'sources, each with its own scanners and labels' },
        { value: '19,443', label: 'images in the classical model\'s final cohort' },
        { value: '853', label: 'patients in its untouched test set' },
      ],
      table: {
        head: ['Source', 'Image records'],
        rows: [['DDSM', '10,400'], ['CMMD', '5,202'], ['KAU-BCMD', '2,206'], ['CDD-CESM', '1,003'], ['DMID', '510'], ['INbreast', '410']],
      },
      stepsTitle: 'How an image is prepared for the classical model',
      steps: [
        ['Check', 'Each image is decoded and checked against its metadata and its place in the split.'],
        ['Crop', 'The breast is cropped conservatively. Unclear crops fall back to the full frame and are flagged for review.'],
        ['Resize', 'The crop is resized to 2048 × 1024 without stretching, then padded with black.'],
        ['Normalise', 'Greyscale is copied to three channels and normalised with the standard ImageNet values.'],
      ],
      notes: [
        '235 records labelled Suspicious Malignant were left out of the three-class task rather than quietly reassigned. After preparation exclusions, 19,443 images remained.',
        'Patients are never split between training and test. 11,616 images from 3,421 patients trained the model, and 2,937 images from 853 patients tested it.',
        'The six sources differ, and a model can partly guess a diagnosis from the source alone. A classifier that only knew the source scored 55.8%. Both models were rebuilt so they do not rely on it, and neither is given the source as an input.',
      ],
    },
    results: {
      lead: 'Measured on images the models had never seen.',
      caution: 'The two models were tested on different held-out sets, so these figures are not a controlled head-to-head.',
      cards: [
        {
          family: 'classical',
          title: 'Classical, ConvNeXt V2-Huge',
          cohort: 'Internal test: 2,937 images from 853 patients, calibrated.',
          metrics: [
            { label: 'Accuracy', value: 0.7228, text: '72.3%', ci: '95% interval 70.1% to 74.5%' },
            { label: 'Macro-F1', value: 0.7209, text: '0.721', ci: '95% interval 0.699 to 0.742' },
            { label: 'Malignant ROC-AUC', value: 0.8829, text: '0.883', ci: '95% interval 0.866 to 0.899', chance: true },
            { label: 'Benign F1 (weakest class)', value: 0.5972, text: '0.597', ci: '95% interval 0.557 to 0.635' },
          ],
          notes: [
            'Recall by class: Normal 86.8%, Benign 58.2%, Malignant 73.5%. These are image-level results, not patient-level detection rates.',
            'Calibration cut the expected calibration error from 0.141 to 0.013.',
            'The earlier v12 ensemble, which is the version in the app, scored a macro-F1 of 0.706 on its own internal test.',
          ],
        },
        {
          family: 'quantum',
          title: 'Quantum kernel classifier',
          cohort: 'Held-out test: 3,000 images.',
          metrics: [
            { label: 'Accuracy', value: 0.671, text: '67.1%', ci: 'Up from 61.1% in the previous version' },
            { label: 'Macro-F1', value: 0.666, text: '0.666', ci: 'No interval reported' },
            { label: 'Malignant recall', value: 0.625, text: '62.5%', ci: 'Up from about 57% in the previous version' },
          ],
          notes: [
            'It beats a source-only classifier by 4.6 points on average, up from 0.7 points before fine-tuning.',
            'Per source, it clearly beats that shortcut on only two of the six sources, DDSM and CDD-CESM.',
            'Its targets were 80% accuracy and 0.80 malignant recall, which it has not yet reached.',
          ],
        },
      ],
    },
    findings: [
      ['The quantum kernel is not the limiting factor', 'A classical support vector machine given the same 12 features scored within a point or two of the quantum kernel at every stage, between 65.5% and 67.9% against 61.1% and 67.1%. The quality of the extracted features matters more than the kernel.'],
      ['The classical network is stronger overall', 'ConvNeXt V2-Huge reads the full image at high resolution. It also changed several things at once, including pretraining, resolution and training recipe, so the gain cannot be put down to architecture alone.'],
      ['Benign cases are the hardest', 'Of 901 benign test images, 254 were classed as malignant and 123 as normal. Separating benign from malignant is where both approaches struggle most.'],
    ],
  },

  future: {
    label: 'Future risk',
    blurb: 'Reads a patient\'s screening history and estimates cumulative risk over the next one to five years.',
    models: [
      {
        family: 'classical',
        name: 'Classical hazard model',
        status: 'Final research model: Mammo-CLIP V2D. Internal evaluation complete.',
        reads: 'A patient\'s history: up to five exams, each with up to four views, and the time between them. Missing views are marked as missing, never invented.',
        output: 'A yearly hazard for each of the next five years, turned into cumulative risk that can never fall as the horizon grows.',
        steps: ['A mammography-trained encoder turns each view into spatial features', 'Attention weighs image regions and views, and left-right differences are compared', 'An LSTM follows the exams in order and outputs the five yearly hazards'],
        params: [
          ['Image encoder', 'Mammo-CLIP EfficientNet-B5, frozen'],
          ['Spatial features', '2,048 × 8 × 8 per view, projected to 128 values'],
          ['Attention', 'Spatial attention per view, then attention across views'],
          ['Timing', '16-value timing representation, including recency weight'],
          ['Exam representation', '256 fused features per exam'],
          ['Sequence model', 'LSTM with 128 units over up to five exams'],
          ['Trainable parameters', '572,999 above the frozen features'],
          ['Training target', 'Discrete yearly hazards with at-risk masks, so censored years are not treated as negative'],
          ['Selection', 'Three seeds compared (42, 123, 2026), seed 2026 frozen before the test set was opened'],
          ['Ensemble check', 'A three-seed ensemble was tried and rejected under a rule set in advance'],
        ],
      },
      {
        family: 'quantum',
        name: 'Quantum-enhanced risk model (QeSFRP)',
        status: 'Verified engine v0.4. Results are close to chance, see below.',
        reads: 'Sixty-one hand-measured descriptors per image (intensity, density, texture and gradients), combined into a summary for each exam.',
        output: 'Calibrated one to five year risk, with a low, medium or high band based on the five-year value.',
        steps: ['Descriptors are reduced to 12 features', 'A 12-qubit circuit reads them, pretrained on breast density and then frozen', 'A small neural network follows the exams over time and outputs yearly hazards'],
        params: [
          ['Descriptors', '61 per image, 305 per exam after combining the four views'],
          ['Reduction', 'Quantile scaling, PCA to 192, then 12 features chosen by mutual information'],
          ['Circuit', '12 qubits, 5 data re-uploading blocks, 300 trainable parameters, 24 readouts'],
          ['Pretraining', 'Breast density (4 classes) and BI-RADS, then frozen'],
          ['Simulation', 'PennyLane on CPU'],
          ['Temporal head', '78 inputs, 32 hidden, 5 outputs, 2,693 parameters'],
          ['Recency weighting', 'Earlier exams weighted by e to the power of minus 0.5 times the years before the latest exam'],
          ['Calibration', 'Per-horizon isotonic calibration, plus an age factor'],
          ['Risk bands', 'Below 3% low, below 8% medium, otherwise high'],
          ['Evaluation', 'Five-fold patient-level cross-validation, three runs each, patient-level bootstrap intervals'],
        ],
      },
    ],
    data: {
      lead: <>Both models learn from <ExtLink href={EMBED_URL}>EMBED, the Emory Breast Imaging Dataset</ExtLink>, which links each patient&apos;s exams over time.</>,
      stats: [
        { value: '~480,000', label: 'images in the public subset used, about 20% of EMBED' },
        { value: '444,886', label: 'images that passed cleaning' },
        { value: '651', label: 'patients with a cancer-positive exam' },
        { value: '296', label: 'of them with earlier, cancer-free exams' },
      ],
      table: {
        head: ['Cleaning outcome', 'Count'],
        rows: [['Original image records', '480,323'], ['Successfully cleaned', '444,886'], ['Flagged by quality checks', '33,792'], ['Failed or missing', '1,645'], ['Unique patients', '23,241'], ['Unique exams', '72,408']],
      },
      stepsTitle: 'How the EMBED images were cleaned',
      steps: [
        ['Combine', 'Image information is joined with each exam\'s pathology result.'],
        ['Convert', 'DICOM files become PNG. Images stored with inverted brightness are flipped so all use the same convention.'],
        ['Standardise', 'Brightness is rescaled and every image is resized to 500 × 500.'],
        ['Filter', 'Images that are blank, near-uniform, more than 95% one colour or dominated by a bright line are set aside for review.'],
        ['Label', 'Each earlier exam gets the number of days before the patient\'s first cancer-positive exam.'],
      ],
      notes: [
        'A cancer-positive exam is one whose pathology severity code is below 2 (invasive or in-situ cancer). Exams with no biopsy count as negative for this project.',
        'The classical model\'s final cohort has 2,230 patients, 4,942 exams and 19,054 images, with 153 five-year cancers. The quantum model\'s has 10,640 patients, 39,645 exams and 154,418 images, with 134.',
        'An early check found that a model given only screening timing, with no images at all, reached an AUC of 0.86 to 0.99, because patients who later developed cancer had longer screening histories. Timing inputs were removed.',
      ],
    },
    results: {
      lead: 'Measured on patients the models had never seen.',
      caution: 'The two models use different cohorts and evaluation methods, a single held-out test against cross-validation, so these figures are not a controlled head-to-head.',
      cards: [
        {
          family: 'classical',
          title: 'Classical, Mammo-CLIP V2D',
          cohort: 'Untouched test: 330 patients, evaluated once.',
          metrics: [
            { label: 'Mean AUROC, 1 to 5 years', value: 0.8684, text: '0.868', ci: '95% interval 0.757 to 0.963', chance: true },
            { label: 'Mean AUPRC', value: 0.6424, text: '0.642', ci: '95% interval 0.464 to 0.817' },
            { label: 'AUROC at 2 years', value: 0.8479, text: '0.848', ci: '19 positive patients', chance: true },
            { label: 'AUROC at 5 years', value: 0.8427, text: '0.843', ci: '21 positive patients', chance: true },
          ],
          notes: [
            'Mean Brier score 0.026, expected calibration error 0.017 to 0.020 at two to five years, and no case where risk falls as the horizon grows.',
            'The one-year AUROC of 0.974 rests on only six positive patients and should not be read as a precise estimate.',
            'On the validation set the same model scored 0.892, so a moderate drop on unseen patients was expected.',
          ],
        },
        {
          family: 'quantum',
          title: 'Quantum-enhanced, QeSFRP',
          cohort: 'Five-fold cross-validation, three runs each.',
          metrics: [
            { label: 'Mean AUC, 1 to 5 years', value: 0.532, text: '0.532', ci: '95% interval 0.467 to 0.591', chance: true },
            { label: 'Lowest horizon', value: 0.525, text: '0.525', ci: 'Every horizon\'s interval includes 0.5', chance: true },
            { label: 'Highest horizon', value: 0.544, text: '0.544', ci: 'Five-year result rests on 134 cancers', chance: true },
          ],
          notes: [
            'The result is indistinguishable from chance and below the project\'s minimum target of 0.62 at five years.',
            'Earlier, higher figures were inflated by label errors and the screening-timing leak above. Finding and fixing them was part of the work.',
            'The deployed engine matches training output exactly, so these numbers are what the app reproduces.',
          ],
        },
      ],
    },
    findings: [
      ['The quantum circuit added no measurable signal', 'Models given the same inputs without the circuit performed the same. With the head held fixed, the circuit changed mean AUC by no more than 0.02 and every interval included zero.'],
      ['The inputs matter more than the circuit', 'The classical model learns features from the images and follows the full sequence of exams. The quantum model works from hand-measured summaries. The authors recommend learned image features before any quantum layer.'],
      ['Both are limited by few cancers', 'Only 21 five-year cancers were available in the classical test set and 134 in the quantum cross-validation, so intervals are wide and a single dataset cannot show how the models behave elsewhere.'],
    ],
  },
};

const LIMITS = [
  ['No external validation yet', 'Every result above comes from the same collections the models were developed on. An earlier version of the classical classifier scored 0.867 internally but 0.586 on an external RSNA cohort. The latest candidates have not yet been tested externally.'],
  ['Few cancers in some tests', 'The future-risk tests have 21 or fewer cancers per horizon in the classical test set. Several sources in the classification data have only a handful of malignant images.'],
  ['One training run', 'The ConvNeXt classifier was trained once, with seed 42, and stopped at a time limit, so run-to-run variation was not measured.'],
  ['Resolution is not always real detail', 'Many source images were small and were enlarged to 2048 × 1024, which cannot add detail that was never captured.'],
  ['Explanations describe, they do not prove', 'Attention and occlusion maps show what a model used, not confirmed disease. The language-model explanations are restricted and reviewed, and are research descriptions only.'],
  ['Not clinically validated', 'The system has had no prospective evaluation, safety certification, fairness analysis across groups or regulatory review.'],
];

const STATUS_ROWS = [
  ['Classical classifier, ConvNeXt V2-Huge', 'Trained, calibrated and tested internally', 'App integration unconfirmed, external validation pending'],
  ['Quantum kernel classifier', 'Fine-tuned and in the app', 'Below its accuracy targets'],
  ['Classical future risk, Mammo-CLIP V2D', 'Internal test complete, explanations produced for selected cases', 'External validation not done'],
  ['Quantum future risk, QeSFRP', 'Engine verified against training output', 'Discrimination close to chance'],
];

// Two glows, one per model family, with two overlapping rings that echo the side-by-side comparison.
function ModelsHeroBackdrop() {
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      <Box
        sx={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 8% 115%, rgba(92,200,245,0.34) 0%, transparent 52%), radial-gradient(circle at 96% -10%, rgba(192,122,224,0.36) 0%, transparent 48%)',
        }}
      />
      <Box
        sx={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          WebkitMaskImage: 'linear-gradient(100deg, transparent 35%, #000 100%)', maskImage: 'linear-gradient(100deg, transparent 35%, #000 100%)',
        }}
      />
      <Box
        component="svg"
        viewBox="0 0 520 320"
        focusable="false"
        sx={{ display: { xs: 'none', lg: 'block' }, position: 'absolute', right: -40, top: '50%', transform: 'translateY(-50%)', width: 520, height: 'auto' }}
      >
        <circle cx="200" cy="160" r="120" fill="rgba(92,200,245,0.16)" stroke="rgba(92,200,245,0.85)" strokeWidth="2" />
        <circle cx="320" cy="160" r="120" fill="rgba(192,122,224,0.16)" stroke="rgba(192,122,224,0.9)" strokeWidth="2" />
        <circle cx="260" cy="160" r="6" fill="#FFFFFF" fillOpacity="0.9" />
      </Box>
    </Box>
  );
}

function ModeSwitch({ mode, setMode }) {
  const keys = Object.keys(MODES);
  const onKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = keys[(keys.indexOf(mode) + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    setMode(next);
    document.getElementById(`mode-${next}`)?.focus();
  };
  return (
    <Box role="radiogroup" aria-label="Mode" onKeyDown={onKeyDown} sx={{ display: 'inline-flex', p: 0.5, borderRadius: 999, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}>
      {keys.map((key) => {
        const selected = key === mode;
        return (
          <Box
            key={key}
            component="button"
            type="button"
            role="radio"
            id={`mode-${key}`}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setMode(key)}
            sx={(theme) => ({
              border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.92rem', fontWeight: 700, px: { xs: 2, md: 3 }, py: 1, borderRadius: 999,
              color: selected ? '#FFFFFF' : theme.palette.text.secondary,
              backgroundColor: selected ? (theme.palette.mode === 'dark' ? '#0B4A5E' : '#0A5C72') : 'transparent',
              transition: 'background-color 0.2s, color 0.2s',
              '&:hover': { color: selected ? '#FFFFFF' : theme.palette.text.primary },
              '&:focus-visible': { outline: '2px solid', outlineColor: theme.palette.primary.main, outlineOffset: 2 },
            })}
          >
            {MODES[key].label}
          </Box>
        );
      })}
    </Box>
  );
}

// Re-keyed on mode so the content eases in when the visitor switches.
function ModeContent({ mode, children }) {
  const reduce = useReducedMotion();
  return (
    <Box
      component={motion.div}
      key={mode}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {children}
    </Box>
  );
}

const familyColor = (family) => (theme) => theme.palette.modelAccent[family];

function FamilyLabel({ family, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
      <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: familyColor(family) }} />
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary' }}>{children}</Typography>
    </Box>
  );
}

function ReadsSection({ mode }) {
  const data = MODES[mode];
  return (
    <Box component="section" aria-labelledby="reads-heading" sx={sectionSx}>
      <SectionMotif type="glow" corner="85% 20%" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ maxWidth: '62ch', mb: { xs: 4, md: 6 } }}>
            <Typography id="reads-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>What each model reads</Typography>
            <Typography sx={LEAD_SX}>{data.blurb} The same task, approached in two different ways.</Typography>
          </Box>
        </Reveal>
        <ModeContent mode={mode}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {data.models.map((model) => (
              <Box
                key={model.name}
                sx={(theme) => ({ p: { xs: 3, md: 4 }, borderRadius: 4, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', borderTop: `4px solid ${theme.palette.modelAccent[model.family]}`, display: 'flex', flexDirection: 'column', '&:hover': { borderTopColor: theme.palette.modelAccent[model.family], transform: 'translateY(-4px) scale(1.01)', boxShadow: theme.palette.mode === 'dark' ? '0 16px 36px rgba(0,0,0,0.4)' : '0 16px 36px rgba(14,116,144,0.2)' }, transition: 'transform 0.25s ease, box-shadow 0.25s ease', '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } } })}
              >
                <FamilyLabel family={model.family}>{model.family === 'classical' ? 'Classical' : 'Quantum-enhanced'}</FamilyLabel>
                <Typography component="h3" sx={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'text.primary', mb: 1 }}>{model.name}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', lineHeight: 1.6, mb: 2.5 }}>{model.status}</Typography>

                <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>What it reads</Typography>
                <Typography sx={{ color: 'text.primary', fontSize: '0.98rem', lineHeight: 1.7, mb: 2, ...PARAGRAPH_WRAP }}>{model.reads}</Typography>

                <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>What it returns</Typography>
                <Typography sx={{ color: 'text.primary', fontSize: '0.98rem', lineHeight: 1.7, mb: 3, ...PARAGRAPH_WRAP }}>{model.output}</Typography>

                <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, mt: 'auto', borderTop: '1px solid', borderColor: 'divider' }}>
                  {model.steps.map((step, i) => (
                    <Box component="li" key={step} sx={{ display: 'flex', gap: 1.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Box aria-hidden="true" sx={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'text.primary', border: '1.5px solid', borderColor: familyColor(model.family) }}>{i + 1}</Box>
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', lineHeight: 1.6 }}>{step}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </ModeContent>
      </Container>
    </Box>
  );
}

function DataSection({ mode }) {
  const { data } = MODES[mode];
  return (
    <Box component="section" aria-labelledby="data-heading" sx={{ ...sectionSx, ...BAND.soft }}>
      <SectionMotif type="dots" corner="top right" />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ maxWidth: '62ch', mb: { xs: 4, md: 6 } }}>
            <Typography id="data-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>Where the data came from</Typography>
            <Typography sx={LEAD_SX}>{data.lead}</Typography>
          </Box>
        </Reveal>
        <ModeContent mode={mode}>
          <Box component="dl" sx={{ m: 0, mb: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            {data.stats.map((stat) => (
              <Box key={stat.label} sx={{ p: 2.5, borderRadius: 3, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column-reverse', ...HOVER_LIFT }}>
                <Typography component="dt" sx={{ mt: 0.75, fontSize: '0.85rem', lineHeight: 1.5, color: 'text.secondary' }}>{stat.label}</Typography>
                <Typography component="dd" sx={{ m: 0, fontSize: { xs: '1.7rem', md: '2rem' }, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, color: accent, fontVariantNumeric: 'tabular-nums' }}>{stat.value}</Typography>
              </Box>
            ))}
          </Box>

          <Box sx={{ ...SPLIT_SX, gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, alignItems: 'start' }}>
            <Box>
              <Typography component="h3" sx={{ fontSize: '1.2rem', fontWeight: 700, color: 'text.primary', mb: 2 }}>{data.stepsTitle}</Typography>
              <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {data.steps.map(([title, body], i) => (
                  <Box component="li" key={title} sx={{ display: 'flex', gap: 2, py: 1.75, borderTop: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: '1px solid', borderBottomColor: 'divider' } }}>
                    <Typography aria-hidden="true" sx={{ fontWeight: 800, fontSize: '1.05rem', color: accent, minWidth: 24 }}>{i + 1}</Typography>
                    <Box>
                      <Typography component="h4" sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary', mb: 0.25 }}>{title}</Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.65, ...PARAGRAPH_WRAP }}>{body}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', overflow: 'hidden' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', px: 2.5, py: 1.5, backgroundColor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
                {data.table.head.map((head, i) => (
                  <Typography key={head} sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', textAlign: i ? 'right' : 'left' }}>{head}</Typography>
                ))}
              </Box>
              {data.table.rows.map(([name, count]) => (
                <Box key={name} sx={{ display: 'grid', gridTemplateColumns: '1fr auto', px: 2.5, py: 1.5, '&:not(:last-of-type)': { borderBottom: '1px solid', borderColor: 'divider' } }}>
                  <Typography sx={{ fontSize: '0.92rem', color: 'text.primary', fontWeight: 600 }}>{name}</Typography>
                  <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{count}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: { xs: 5, md: 6 }, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {data.notes.map((note) => (
              <Box component="li" key={note} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', borderLeft: '4px solid', borderLeftColor: accent, backgroundColor: 'background.paper' }}>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>{note}</Typography>
              </Box>
            ))}
          </Box>
        </ModeContent>
      </Container>
    </Box>
  );
}

function ParametersSection({ mode }) {
  const { models } = MODES[mode];
  return (
    <Box component="section" aria-labelledby="params-heading" sx={sectionSx}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={SPLIT_SX}>
            <Box>
              <Typography id="params-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>Implementation details</Typography>
              <Typography sx={LEAD_SX}>The settings behind each model, for readers who want the technical detail.</Typography>
            </Box>
            <ModeContent mode={mode}>
              {models.map((model, i) => (
                <Accordion
                  key={model.name}
                  defaultExpanded={i === 0}
                  disableGutters
                  elevation={0}
                  square
                  sx={{ backgroundColor: 'transparent', backgroundImage: 'none', boxShadow: 'none', border: 0, borderBottom: '1px solid', borderColor: 'divider', '&::before': { display: 'none' }, '&:first-of-type': { borderTop: '1px solid', borderTopColor: 'divider' }, '&.Mui-expanded': { margin: 0 } }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandIcon sx={{ color: 'text.secondary' }} aria-hidden="true" />}
                    aria-controls={`params-${mode}-${i}`}
                    id={`params-head-${mode}-${i}`}
                    sx={{ px: 0, py: 0.75 }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                      <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: familyColor(model.family) }} />
                      <Typography component="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, color: 'text.primary' }}>{model.name}</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails id={`params-${mode}-${i}`} sx={{ px: 0, pt: 0, pb: 2.5 }}>
                    <Box component="dl" sx={{ m: 0 }}>
                      {model.params.map(([term, detail]) => (
                        <Box key={term} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' }, gap: { xs: 0.25, sm: 2 }, py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
                          <Typography component="dt" sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'text.primary' }}>{term}</Typography>
                          <Typography component="dd" sx={{ m: 0, fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.6 }}>{detail}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
            </ModeContent>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

function MetricBar({ metric, family }) {
  return (
    <Box sx={{ mb: 2.25 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, mb: 0.75 }}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'text.primary' }}>{metric.label}</Typography>
        <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{metric.text}</Typography>
      </Box>
      <Box
        role="img"
        aria-label={`${metric.label}: ${metric.text}`}
        sx={{ position: 'relative', height: 10, borderRadius: 999, backgroundColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(14,116,144,0.14)') }}
      >
        <Box sx={{ position: 'absolute', inset: 0, width: `${metric.value * 100}%`, borderRadius: 999, backgroundColor: familyColor(family) }} />
        {metric.chance && (
          <Box aria-hidden="true" sx={{ position: 'absolute', top: -3, bottom: -3, left: '50%', width: 2, backgroundColor: 'text.secondary', opacity: 0.8 }} />
        )}
      </Box>
      <Typography sx={{ mt: 0.5, fontSize: '0.78rem', color: 'text.secondary' }}>{metric.ci}</Typography>
    </Box>
  );
}

function ResultsSection({ mode }) {
  const { results } = MODES[mode];
  return (
    <Box component="section" aria-labelledby="results-heading" sx={{ ...sectionTall, ...BAND.deep }}>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Box sx={{ maxWidth: '62ch', mb: { xs: 4, md: 6 } }}>
            <Typography id="results-heading" component="h2" sx={{ ...SECTION_HEADING_SX, fontSize: { xs: '2rem', md: '2.8rem' }, mb: 2 }}>Results so far</Typography>
            <Typography sx={LEAD_SX}>{results.lead}</Typography>
          </Box>
        </Reveal>
        <ModeContent mode={mode}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 3 }}>
            {results.cards.map((card) => (
              <Box key={card.title} sx={(theme) => ({ p: { xs: 3, md: 4 }, borderRadius: 4, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', borderTop: `4px solid ${theme.palette.modelAccent[card.family]}`, '&:hover': { transform: 'translateY(-4px) scale(1.01)', boxShadow: theme.palette.mode === 'dark' ? '0 16px 36px rgba(0,0,0,0.4)' : '0 16px 36px rgba(14,116,144,0.2)' }, transition: 'transform 0.25s ease, box-shadow 0.25s ease', '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } } })}>
                <Typography component="h3" sx={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em', color: 'text.primary', mb: 0.5 }}>{card.title}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mb: 3 }}>{card.cohort}</Typography>
                {card.metrics.map((metric) => <MetricBar key={metric.label} metric={metric} family={card.family} />)}
                <Box component="ul" sx={{ m: 0, mt: 3, pl: 2.25, color: 'text.secondary' }}>
                  {card.notes.map((note) => (
                    <Typography component="li" key={note} sx={{ fontSize: '0.88rem', lineHeight: 1.65, mb: 0.75, ...PARAGRAPH_WRAP }}>{note}</Typography>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', lineHeight: 1.65 }}>
            {results.caution} The tick on a bar marks 0.5, the score a model would get by guessing, where that applies.
          </Typography>
        </ModeContent>
      </Container>
    </Box>
  );
}

function ComparisonSection({ mode }) {
  const { findings } = MODES[mode];
  return (
    <Box component="section" aria-labelledby="compare-heading" sx={sectionSx}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={{ maxWidth: '62ch', mb: { xs: 4, md: 6 } }}>
            <Typography id="compare-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>What the comparison shows</Typography>
            <Typography sx={LEAD_SX}>Putting the two approaches side by side is the point of the project, and the results are mixed.</Typography>
          </Box>
        </Reveal>
        <ModeContent mode={mode}>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
            {findings.map(([title, body], i) => (
              <Box component="li" key={title} sx={{ borderTop: '2px solid', borderColor: accent, pt: 2 }}>
                <Typography aria-hidden="true" sx={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', color: accent, lineHeight: 1, mb: 1.5 }}>{String(i + 1).padStart(2, '0')}</Typography>
                <Typography component="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, color: 'text.primary', mb: 1 }}>{title}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>{body}</Typography>
              </Box>
            ))}
          </Box>
        </ModeContent>
      </Container>
    </Box>
  );
}

function LimitsSection() {
  return (
    <Box component="section" aria-labelledby="limits-heading" sx={{ ...sectionTall, ...BAND.emphasis, color: '#FFFFFF' }}>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <Typography id="limits-heading" component="h2" sx={{ ...SECTION_HEADING_SX, color: '#FFFFFF', fontSize: { xs: '2rem', md: '3rem' }, maxWidth: '22ch', mb: { xs: 5, md: 7 } }}>
            What these results do not show
          </Typography>
        </Reveal>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: { xs: 3, md: 5 } }}>
          {LIMITS.map(([title, body]) => (
            <Box component="li" key={title} sx={{ borderTop: '2px solid rgba(255,255,255,0.55)', pt: 2 }}>
              <Typography component="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF', mb: 0.75 }}>{title}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.92)', fontSize: '0.92rem', lineHeight: 1.7, ...PARAGRAPH_WRAP }}>{body}</Typography>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

function StatusSection() {
  return (
    <Box component="section" aria-labelledby="status-heading" sx={sectionSx}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={SPLIT_SX}>
            <Box>
              <Typography id="status-heading" component="h2" sx={{ ...SECTION_HEADING_SX, mb: 2 }}>Where each model stands</Typography>
              <Typography sx={LEAD_SX}>A snapshot of what is finished and what is still open.</Typography>
            </Box>
            <Box sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', overflow: 'hidden' }}>
              {STATUS_ROWS.map(([name, done, open]) => (
                <Box key={name} sx={{ p: 2.5, '&:not(:first-of-type)': { borderTop: '1px solid', borderColor: 'divider' } }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.98rem', color: 'text.primary', mb: 0.5 }}>{name}</Typography>
                  <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.6 }}>
                    <Box component="span" sx={{ fontWeight: 700, color: accent }}>Done: </Box>{done}
                  </Typography>
                  <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', lineHeight: 1.6 }}>
                    <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>Open: </Box>{open}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Reveal>
      </Container>
    </Box>
  );
}

function SourceNote() {
  return (
    <Box component="section" aria-label="About these figures" sx={{ ...sectionCompact, ...BAND.soft, py: { xs: 4, md: 5 } }}>
      <Container maxWidth="md">
        <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem', lineHeight: 1.75, textAlign: 'center', mx: 'auto', maxWidth: '72ch', ...PARAGRAPH_WRAP }}>
          All figures on this page come from our own testing. The models were trained and tested on{' '}
          <ExtLink href={MAMMO_BENCH_URL}>Mammo-Bench</ExtLink> (classification) and the{' '}
          <ExtLink href={EMBED_URL}>Emory Breast Imaging Dataset, EMBED</ExtLink> (future risk).
          Q-INTERVAL-Lite+ is a research prototype and is not for clinical use.
        </Typography>
      </Container>
    </Box>
  );
}

export default function Models() {
  const [mode, setMode] = useState('classification');
  return (
    <Box component="main" sx={{ backgroundColor: 'background.default', '& > section + section': { borderTop: '1px solid', borderColor: 'divider' } }}>
      <Box component="section" aria-labelledby="models-heading" sx={{ ...sectionSx, ...BAND.emphasis, color: '#FFFFFF', py: { xs: 11, md: 16 } }}>
        <ModelsHeroBackdrop />
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <Typography id="models-heading" component="h1" sx={{ fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, fontSize: { xs: '2.5rem', md: '4.2rem' }, color: '#FFFFFF', maxWidth: '16ch', mb: 3 }}>
            <SlideIn delay={0.1}>Two kinds of model, side by side.</SlideIn>
          </Typography>
          <Reveal delay={0.3}>
            <Typography sx={{ ...LEAD_SX, color: 'rgba(255,255,255,0.92)', maxWidth: '56ch', fontSize: { xs: '1.05rem', md: '1.2rem' } }}>
              A classical deep-learning model and a quantum-enhanced model analyse the same mammograms, in two modes. This page
              shows how each one works and what it has achieved so far.
            </Typography>
          </Reveal>
        </Container>
      </Box>

      <Box
        sx={{
          position: 'sticky', top: { xs: 60, md: 70 }, zIndex: 5, py: 1.5,
          backgroundColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(13,27,46,0.92)' : 'rgba(232,246,250,0.92)'),
          backdropFilter: 'blur(8px)', borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Container maxWidth="lg" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 1.5, md: 3 } }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>Showing</Typography>
          <ModeSwitch mode={mode} setMode={setMode} />
          <Typography aria-live="polite" sx={{ display: { xs: 'none', lg: 'block' }, fontSize: '0.88rem', color: 'text.secondary' }}>{MODES[mode].blurb}</Typography>
        </Container>
      </Box>

      <ReadsSection mode={mode} />
      <DataSection mode={mode} />
      <ParametersSection mode={mode} />
      <ResultsSection mode={mode} />
      <ComparisonSection mode={mode} />
      <LimitsSection />
      <StatusSection />
      <SourceNote />
    </Box>
  );
}
