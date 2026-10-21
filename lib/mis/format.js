export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const GRAN_LABEL = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };
export const POP_LABEL = { day: 'DoD', week: 'WoW', month: 'MoM', quarter: 'QoQ', year: 'YoY' };

// "Yearless" mode: the file has month numbers (1-12) but no real dates, so periods are shown by
// month name only and a year is never invented.
let YEARLESS = false;
export const setYearless = (on) => { YEARLESS = !!on; };
export const isYearless = () => YEARLESS;

// Readable span between two timestamps, e.g. "2024-01-01 to 2026-10-12" or "Jan to Dec".
export function fmtSpan(min, max, sep = ' to ') {
  if (min == null || max == null || !isFinite(min) || !isFinite(max)) return '';
  if (YEARLESS) return MONTH_NAMES[new Date(min).getUTCMonth()] + sep + MONTH_NAMES[new Date(max).getUTCMonth()];
  return isoDate(min) + sep + isoDate(max);
}

export function isoDate(t) {
  if (t == null || !isFinite(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}

export function fmtInt(n) {
  if (n == null || !isFinite(n)) return '–';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtCompact(n) {
  if (n == null || !isFinite(n)) return '–';
  const a = Math.abs(n);
  const sg = n < 0 ? '-' : '';
  if (a >= 1e9) return sg + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return sg + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e5) return sg + (a / 1e3).toFixed(1) + 'K';
  return sg + a.toLocaleString('en-US', { maximumFractionDigits: a < 100 ? 2 : 0 });
}

export function fmtFull(n) {
  if (n == null || !isFinite(n)) return '–';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// m = { money: boolean, cur: string } | null
export function fmtMetric(n, m, full = false) {
  if (n == null || !isFinite(n)) return '–';
  const s = (full ? fmtFull : fmtCompact)(Math.abs(n));
  return (n < 0 ? '-' : '') + (m && m.money ? m.cur || '' : '') + s;
}

// p is a fraction (0.123 → 12.3%)
export function fmtPct(p, dec = 1) {
  if (p == null || !isFinite(p)) return '–';
  return (p * 100).toFixed(dec) + '%';
}

export function fmtSigned(p, dec = 1) {
  if (p == null || !isFinite(p)) return '–';
  return (p > 0 ? '+' : '') + (p * 100).toFixed(dec) + '%';
}

export function fmtPeriod(key) {
  if (!key) return '';
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-');
    return YEARLESS ? MONTH_NAMES[+m - 1] : MONTH_NAMES[+m - 1] + ' ' + y;
  }
  if (/^\d{4}-Q\d$/.test(key)) {
    const [y, q] = key.split('-');
    return q + ' ' + y;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const [y, m, d] = key.split('-');
    return `${+d} ${MONTH_NAMES[+m - 1]} ${y.slice(2)}`;
  }
  return key;
}

// Accepts "1.5M", "250k", "$40,000", "35%"
export function parseTarget(s) {
  const m = /^\s*(-?[\d,.]+)\s*([kmb])?\s*%?\s*$/i.exec(String(s || '').replace(/[€$£¥₹]/g, ''));
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return n * mult;
}
