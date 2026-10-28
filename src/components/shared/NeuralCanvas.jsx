import { useEffect, useRef } from 'react';
import { useTheme } from '@mui/material';

export default function NeuralCanvas() {
  const canvasRef = useRef(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    const NODE_COUNT = 48;
    const CONNECT_DIST = 160;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.2 + 0.6,
    }));
    // Dark mode keeps the original light cyan (pops against navy). Light mode
    // swaps to a darker, more saturated teal at higher opacity — the pastel
    // cyan was nearly invisible against the pale page background.
    // The container can grow after mount (e.g. a long list loads in), so watch the canvas itself rather than
    // the window; a bitmap left at its first size gets stretched by the CSS size and the nodes smear.
    const resize = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      if (!w || !h || (w === canvas.width && h === canvas.height)) return;
      const sx = w / canvas.width, sy = h / canvas.height;
      nodes.forEach((n) => { n.x *= sx; n.y *= sy; });
      canvas.width = w; canvas.height = h;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const rgb = isDark ? '34,211,238' : '11,90,112';
    const lineAlphaMax = isDark ? 0.12 : 0.22;
    const nodeAlpha = isDark ? 0.28 : 0.5;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * lineAlphaMax;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(${rgb},${alpha})`; ctx.lineWidth = 0.8; ctx.stroke();
          }
        }
      }
      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0) n.x = canvas.width; if (n.x > canvas.width) n.x = 0;
        if (n.y < 0) n.y = canvas.height; if (n.y > canvas.height) n.y = 0;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${nodeAlpha})`; ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [isDark]);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} />;
}
