import React from 'react';
import { Box, IconButton } from '@mui/material';
import {
  KeyboardArrowUp as ArrowUpIcon,
  KeyboardArrowDown as ArrowDownIcon,
} from '@mui/icons-material';

// Fixed vertical dot + arrow navigator (the homepage section navigator's look).
// Purely presentational: callers decide what each dot/arrow does.
//
//   items     [{ label }]  — label is the dot's accessible name
//   current   index of the active item (drawn larger, and aria-current)
//   onSelect  (index) => void
//   up/down   { label, onClick } or null — a null arrow keeps its space so the
//             dots don't jump, matching the homepage behaviour
//   size      arrow button size; may be a responsive object
//   sx        positioning overrides for the fixed container

const btnSx = (size) => ({
  width: size, height: size,
  border: 'none',
  backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#071020' : '#0E7490',
  color: (theme) => theme.palette.mode === 'dark' ? '#22D3EE' : '#FFFFFF',
  transition: 'all 0.2s',
  '&:hover': {
    backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#0D1B2E' : '#0891B2',
    transform: 'scale(1.08)',
  },
});

const dotBaseSx = {
  display: 'block', p: 0, border: 0, borderRadius: '50%', cursor: 'pointer',
  position: 'relative', transition: 'all 0.2s',
  // Invisible halo so the small dots are comfortable touch/click targets.
  '&::after': { content: '""', position: 'absolute', inset: -7, borderRadius: '50%' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 3 },
};
const dotActiveSx = { ...dotBaseSx, width: 8, height: 8, backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#22D3EE' : '#0E7490' };
const dotInactiveSx = { ...dotBaseSx, width: 5, height: 5, backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(14,116,144,0.28)', '&:hover': { backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(34,211,238,0.6)' : 'rgba(14,116,144,0.55)' } };

export default function VerticalNavigator({ items, current, onSelect, up, down, size = 36, ariaLabel, sx }) {
  const arrow = (action, Icon) => action
    ? <IconButton onClick={action.onClick} size="small" aria-label={action.label} sx={btnSx(size)}><Icon sx={{ fontSize: 18 }} /></IconButton>
    : <Box sx={{ width: size, height: size }} />;

  return (
    <Box component="nav" aria-label={ariaLabel} sx={{ position: 'fixed', right: { xs: 10, md: 20 }, top: '50%', transform: 'translateY(-50%)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, ...sx }}>
      {arrow(up, ArrowUpIcon)}
      {items.map((item, i) => (
        <Box
          key={item.label}
          component="button"
          type="button"
          aria-label={item.label}
          aria-current={i === current ? 'true' : undefined}
          onClick={() => onSelect(i)}
          sx={i === current ? dotActiveSx : dotInactiveSx}
        />
      ))}
      {arrow(down, ArrowDownIcon)}
    </Box>
  );
}
