const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + x(f(0)) + x(f(8)) + x(f(4));
}

const BASE = {
  burgundy: { label: 'Burgundy', primary: '#7B1E30' },
  ocean: { label: 'Ocean', primary: '#1F5FBF' },
  emerald: { label: 'Emerald', primary: '#0F7B5F' },
  violet: { label: 'Violet', primary: '#6D3FC0' },
  amber: { label: 'Amber', primary: '#B45309' },
  rose: { label: 'Rose', primary: '#BE185D' },
  teal: { label: 'Teal', primary: '#0E7490' },
  slate: { label: 'Slate', primary: '#334155' },
};

const HUE_STEPS = [0, 38, -38, 150, 190, 75, -75, 215, 115, 260];

function derive(primary) {
  const [h, s, l] = hexToHsl(primary);
  const swatches = HUE_STEPS.map((off, i) => (i === 0 ? primary : hslToHex(h + off, clamp(s, 50, 70), 46 + (i % 3) * 5)));
  return {
    swatches,
    vars: {
      '--burg': primary,
      '--burg-dark': hslToHex(h, s, l - 9),
      '--burg-deep': hslToHex(h, s, l - 17),
      '--burg-mid': hslToHex(h, s * 0.95, l + 9),
      '--burg-light': hslToHex(h, s * 0.8, l + 24),
      '--rose-pale': hslToHex(h, s * 0.6, l + 40),
      '--rose-bg': hslToHex(h, clamp(s, 30, 70), 96),
      // aliases already used by globals.css
      '--rose': 'var(--burg)',
      '--rose-dark': 'var(--burg-dark)',
      '--sage': 'var(--burg)',
      '--sage-dark': 'var(--burg-dark)',
      '--sage-pale': 'var(--rose-pale)',
      '--sage-bg': 'var(--rose-bg)',
      '--burgundy': 'var(--burg)',
      '--burgundy-dark': 'var(--burg-dark)',
    },
  };
}

export const THEMES = Object.fromEntries(Object.entries(BASE).map(([k, t]) => [k, { ...t, ...derive(t.primary) }]));
export const DEFAULT_THEME = 'burgundy';

export function applyTheme(key) {
  if (typeof document === 'undefined') return;
  const t = THEMES[key] || THEMES[DEFAULT_THEME];
  const st = document.documentElement.style;
  Object.entries(t.vars).forEach(([k, v]) => st.setProperty(k, v));
  document.documentElement.dataset.theme = key;
}
