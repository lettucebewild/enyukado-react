// Confetti burst + animated checkmark. No dependencies.
// celebrate()               -> confetti + check badge
// celebrate({ label: '…' })  -> optional caption under the check
const COLORS = ['#6aa0ec', '#f7ae85', '#9fe0bd', '#ffd36e', '#c7a6f5', '#ffffff'];

export function celebrate({ label = '' } = {}) {
  if (typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { badge(label); return; }

  const canvas = document.createElement('canvas');
  canvas.className = 'celebrate-canvas';
  const dpr = window.devicePixelRatio || 1;
  const W = (canvas.width = window.innerWidth * dpr);
  const H = (canvas.height = window.innerHeight * dpr);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const originX = W / 2, originY = H * 0.42;
  const parts = Array.from({ length: 150 }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = (6 + Math.random() * 13) * dpr;
    return {
      x: originX, y: originY,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6 * dpr,
      w: (6 + Math.random() * 6) * dpr, h: (4 + Math.random() * 5) * dpr,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[(Math.random() * COLORS.length) | 0], round: Math.random() < 0.3,
    };
  });

  const t0 = performance.now();
  const DURATION = 2600;
  (function frame(now) {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    const fade = t > DURATION - 700 ? Math.max(0, (DURATION - t) / 700) : 1;
    for (const p of parts) {
      p.vy += 0.34 * dpr; p.vx *= 0.992; p.vy *= 0.992;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  })(t0);

  badge(label);
}

function badge(label) {
  const el = document.createElement('div');
  el.className = 'celebrate-badge';
  el.innerHTML = `
    <svg viewBox="0 0 52 52" aria-hidden="true">
      <circle class="cb-circle" cx="26" cy="26" r="23" />
      <path class="cb-check" d="M15 27 l8 8 l15 -17" />
    </svg>${label ? `<span>${label}</span>` : ''}`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1500);
  setTimeout(() => el.remove(), 1900);
}
