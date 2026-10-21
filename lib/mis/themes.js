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

// Each theme = a colour AND a surface style. The style changes only colour-adjacent looks: card corner shape and shadow.
// It never changes sizes, spacing, fonts or layout, so nothing on the page moves when the theme changes.
const STYLES = {
  soft: {
    label: 'Soft glow',
    attrs: { card: 'soft', kpi: 'grid', kpiIn: 'label-first' },
    vars: {
      '--r-card': '18px', '--r-ctl': '10px', 
      '--sh-card': '0 1px 2px rgba(20,8,24,.04), 0 14px 34px -20px color-mix(in srgb,var(--burg) 38%,transparent)',
      '--sh-card-h': '0 1px 2px rgba(20,8,24,.04), 0 22px 44px -20px color-mix(in srgb,var(--burg) 48%,transparent)',
      '--kpi-geo': '0 12px 30px -22px', '--kpi-mix': '70%', '--kpi-geo-h': '0 24px 40px -22px', '--kpi-mix-h': '80%',
      '--sh-hero': '0 28px 64px -28px color-mix(in srgb,var(--burg) 75%,transparent)',
    },
  },
  crisp: {
    label: 'Crisp',
    attrs: { card: 'crisp', kpi: 'grid', kpiIn: 'label-first' },
    vars: {
      '--r-card': '8px', '--r-ctl': '6px', 
      '--sh-card': '0 1px 0 color-mix(in srgb,var(--burg) 14%,transparent), 0 1px 3px rgba(10,20,30,.08)',
      '--sh-card-h': '0 1px 0 color-mix(in srgb,var(--burg) 20%,transparent), 0 8px 18px -8px color-mix(in srgb,var(--burg) 40%,transparent)',
      '--kpi-geo': '0 1px 3px -1px', '--kpi-mix': '40%', '--kpi-geo-h': '0 10px 20px -10px', '--kpi-mix-h': '55%',
      '--sh-hero': '0 10px 24px -14px color-mix(in srgb,var(--burg) 60%,transparent)',
    },
  },
  bold: {
    label: 'Bold block',
    attrs: { card: 'bold', kpi: 'grid', kpiIn: 'label-first' },
    vars: {
      '--r-card': '24px', '--r-ctl': '14px', 
      '--sh-card': '5px 5px 0 color-mix(in srgb,var(--burg) 16%,transparent)',
      '--sh-card-h': '8px 8px 0 color-mix(in srgb,var(--burg) 28%,transparent)',
      '--kpi-geo': '5px 5px 0 0', '--kpi-mix': '24%', '--kpi-geo-h': '8px 8px 0 0', '--kpi-mix-h': '38%',
      '--sh-hero': '10px 10px 0 color-mix(in srgb,var(--burg) 24%,transparent)',
    },
  },
};

const BASE = {
  burgundy: { label: 'Burgundy', primary: '#7B1E30', style: 'soft' },
  ocean: { label: 'Ocean', primary: '#1F5FBF', style: 'crisp' },
  emerald: { label: 'Emerald', primary: '#0F7B5F', style: 'bold' },
  violet: { label: 'Violet', primary: '#6D3FC0', style: 'soft' },
  amber: { label: 'Amber', primary: '#B45309', style: 'bold' },
  rose: { label: 'Rose', primary: '#BE185D', style: 'soft' },
  teal: { label: 'Teal', primary: '#0E7490', style: 'crisp' },
  slate: { label: 'Slate', primary: '#334155', style: 'crisp' },
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

export const THEMES = Object.fromEntries(
  Object.entries(BASE).map(([k, t]) => {
    const d = derive(t.primary);
    const st = STYLES[t.style];
    return [k, { ...t, swatches: d.swatches, styleLabel: st.label, attrs: st.attrs, vars: { ...d.vars, ...st.vars } }];
  })
);
export const DEFAULT_THEME = 'burgundy';

export function applyTheme(key) {
  if (typeof document === 'undefined') return;
  const t = THEMES[key] || THEMES[DEFAULT_THEME];
  const st = document.documentElement.style;
  Object.entries(t.vars).forEach(([k, v]) => st.setProperty(k, v));
  const ds = document.documentElement.dataset;
  ds.theme = key;
  ds.card = t.attrs.card;
  ds.kpi = t.attrs.kpi;
  ds.kpiIn = t.attrs.kpiIn;
}
