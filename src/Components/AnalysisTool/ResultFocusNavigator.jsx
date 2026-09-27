import React, { useCallback, useEffect, useRef, useState } from 'react';
import VerticalNavigator from '../Shared/VerticalNavigator';

// Focus navigation for the analysis result components — not a section pager.
// Targets can be any height and sit close together; the navigator just brings
// one into focus and tracks which is nearest the middle of the visible area.

const headerHeight = () => document.querySelector('header')?.getBoundingClientRect().height ?? 0;
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Centre the element in the viewport. An element too tall to centre without its
// top sliding under the sticky header is aligned just below the header instead.
const focusPlan = (el) => {
  const header = headerHeight();
  const r = el.getBoundingClientRect();
  const fits = r.height <= window.innerHeight - header * 2;
  const focusedTop = fits ? (window.innerHeight - r.height) / 2 : header + 12;
  return { block: fits ? 'center' : 'start', header, distance: r.top - focusedTop };
};

export function focusElement(el) {
  if (!el) return;
  const { block, header } = focusPlan(el);
  el.style.scrollMarginTop = `${header + 12}px`;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block });
}

// Distance from the visible centre line to the element; 0 when the line is inside it.
// Positive = element is below the line, negative = above.
const offsetFromCentre = (el) => {
  const header = headerHeight();
  const centre = header + (window.innerHeight - header) / 2;
  const r = el.getBoundingClientRect();
  if (centre < r.top) return r.top - centre;
  if (centre > r.bottom) return r.bottom - centre;
  return 0;
};

const SCROLL_LOCK_MS = 900;
// How far (as a share of the visible height) a target may sit from its focused
// position before an arrow offers to bring it into focus.
const OUT_OF_FOCUS = 0.15;

/** targets: [{ ref, label }] — label is the accessible name, e.g. "Focus classification results". */
export default function ResultFocusNavigator({ targets, sx }) {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(0); // active target vs its focused position: -1 above, 0 in focus, 1 below
  const lockUntil = useRef(0);

  const measure = useCallback(() => {
    if (Date.now() < lockUntil.current) return;
    const offsets = targets.map((t) => (t.ref.current ? offsetFromCentre(t.ref.current) : Infinity));
    let best = 0;
    offsets.forEach((o, i) => { if (Math.abs(o) < Math.abs(offsets[best])) best = i; });
    setActive(best);
    const el = targets[best]?.ref.current;
    const { distance, header } = el ? focusPlan(el) : { distance: 0, header: 0 };
    setDirection(Math.abs(distance) > (window.innerHeight - header) * OUT_OF_FOCUS ? Math.sign(distance) : 0);
  }, [targets]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [measure]);

  // Clicking sets the active dot immediately; tracking pauses while the smooth
  // scroll runs so the dot doesn't flicker through intermediate positions.
  const focus = useCallback((i) => {
    setActive(i);
    setDirection(0);
    lockUntil.current = Date.now() + SCROLL_LOCK_MS;
    focusElement(targets[i]?.ref.current);
    setTimeout(measure, SCROLL_LOCK_MS + 50);
  }, [targets, measure]);

  // Arrows first bring the active target into focus if it's off-centre, then step.
  const upIndex = direction < 0 ? active : active - 1;
  const downIndex = direction > 0 ? active : active + 1;

  return (
    <VerticalNavigator
      ariaLabel="Analysis results"
      items={targets.map((t) => ({ label: t.label }))}
      current={active}
      onSelect={focus}
      up={upIndex >= 0 ? { label: targets[upIndex].label, onClick: () => focus(upIndex) } : null}
      down={downIndex < targets.length ? { label: targets[downIndex].label, onClick: () => focus(downIndex) } : null}
      size={{ xs: 30, sm: 36 }}
      sx={sx}
    />
  );
}
