import { useEffect, useRef, useState } from 'react';

// Animates a number from its previous value (0 on first show) to `value`.
// While counting it shows whole numbers; at the end it shows `value` exactly,
// formatted with `format` (defaults to toLocaleString).
export default function CountUp({ value, duration = 800, format = (n) => n.toLocaleString() }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const from = useRef(reduce ? target : 0);
  const [shown, setShown] = useState(reduce ? target : 0);

  useEffect(() => {
    if (reduce) { setShown(target); return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) { setShown(Math.round(a + (target - a) * eased)); raf = requestAnimationFrame(tick); }
      else { setShown(target); from.current = target; }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, duration, reduce]);

  return <span className="count-up">{format(shown)}</span>;
}
