'use client';

import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../../../lib/mis/themes';
import { useTheme } from '../../../lib/mis/useTheme';

export default function ThemePicker({ compact = false }) {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="tp" ref={ref}>
      <button className="tp-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} title="Colour theme">
        <span className="tp-dot" style={{ background: THEMES[theme].primary }} />
        {!compact && <span>{THEMES[theme].label}</span>}
      </button>
      {open && (
        <div className="tp-pop" role="menu">
          {Object.entries(THEMES).map(([k, t]) => (
            <button
              key={k}
              role="menuitemradio"
              aria-checked={k === theme}
              className={'tp-opt' + (k === theme ? ' active' : '')}
              onClick={() => {
                setTheme(k);
                setOpen(false);
              }}
            >
              <span className="tp-sw">
                {t.swatches.slice(0, 4).map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
