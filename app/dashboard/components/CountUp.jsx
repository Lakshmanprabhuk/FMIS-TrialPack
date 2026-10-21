'use client';

import { useEffect, useRef, useState } from 'react';

// Animates between numeric values; `format` turns the in-flight number into text.
export default function CountUp({ value, format, duration = 900 }) {
  const [v, setV] = useState(0);
  const cur = useRef(0);

  useEffect(() => {
    if (value == null || !isFinite(value)) {
      cur.current = 0;
      setV(value);
      return undefined;
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cur.current = value;
      setV(value);
      return undefined;
    }
    const from = cur.current;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      cur.current = from + (value - from) * e;
      setV(cur.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(v)}</>;
}
