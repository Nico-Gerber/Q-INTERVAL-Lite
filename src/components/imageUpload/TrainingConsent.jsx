import React, { useState } from 'react';
import {
  Box, Checkbox, FormControlLabel, Typography, Link, Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from '@mui/material';

// Bump when the wording below changes; stored with each consent so we know which text was agreed to.
export const TRAINING_TERMS_VERSION = '2026-10-v1';

// DRAFT wording — to be reviewed by the client / ethics / legal before real use.
export const TRAINING_TERMS = [
  {
    heading: 'What this covers',
    body: 'If you opt in, the mammogram images uploaded in this session, the AI outputs for them, and the classification confirmed or corrected by a clinician for each view may be kept and used to evaluate and improve (retrain) the Q-INTERVAL classification models.',
  },
  {
    heading: 'What it does not cover',
    body: 'Only Session Analysis (classification) data is eligible. Future Risk analyses are never used. Only views that a clinician has verified are used, and your name and email are not part of the training data.',
  },
  {
    heading: 'It is optional',
    body: 'This is voluntary and off by default. Your analysis, results and access to Q-INTERVAL are the same whether or not you opt in.',
  },
  {
    heading: 'Withdrawing and deleting',
    body: 'You can withdraw consent for a session at any time from My Sessions, which stops any further use of it. Deleting a session permanently deletes its stored images and removes it from the training data. Data already used to train a model version may not be removable from that version.',
  },
  {
    heading: 'Uploading for a patient',
    body: 'If you are a clinician uploading on behalf of a patient, ticking this box confirms the patient has agreed to this use.',
  },
  {
    heading: 'Research prototype',
    body: 'Q-INTERVAL-LITE+ is a research prototype and is not for clinical use. These terms may be updated; the version you agreed to is recorded with the session.',
  },
];

export default function TrainingConsent({ checked, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{
      mt: 1.75, px: 1.75, py: 1, borderRadius: 1.5,
      border: '1px solid', borderColor: (theme) => theme.palette.results.line,
      background: (theme) => theme.palette.results.noteBg,
    }}>
      <FormControlLabel
        sx={{ alignItems: 'flex-start', m: 0 }}
        control={<Checkbox size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} sx={{ pt: 0.5 }} />}
        label={
          <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'text.secondary' }}>
            <b>Optional:</b> allow the images and clinician-verified results from this session to be used to improve
            Q-INTERVAL's classification models.{' '}
            <Link component="button" type="button" underline="always" onClick={(e) => { e.preventDefault(); setOpen(true); }} sx={{ fontSize: 'inherit', verticalAlign: 'baseline' }}>
              Read the terms
            </Link>
          </Typography>
        }
      />

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Model improvement — terms</DialogTitle>
        <DialogContent dividers>
          {TRAINING_TERMS.map((t) => (
            <Box key={t.heading} sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 0.25 }}>{t.heading}</Typography>
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', lineHeight: 1.65 }}>{t.body}</Typography>
            </Box>
          ))}
          <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>Version {TRAINING_TERMS_VERSION}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => { onChange(true); setOpen(false); }}>I agree</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
