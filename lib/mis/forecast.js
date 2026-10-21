import { addPeriod } from './engine';

const SEASON = { day: 7, week: 52, month: 12, quarter: 4, year: 0 };
const HORIZON = { day: 14, week: 8, month: 6, quarter: 4, year: 2 };
const PHI = 0.9;
const Z80 = 1.2816;

function seasonalIndex(y, m) {
  const cycles = Math.floor(y.length / m);
  if (cycles < 2) return null;
  const sum = new Array(m).fill(0);
  let used = 0;
  for (let c = 0; c < cycles; c++) {
    let s = 0;
    for (let p = 0; p < m; p++) s += y[c * m + p];
    const mean = s / m;
    if (!(mean > 0)) continue;
    used++;
    for (let p = 0; p < m; p++) sum[p] += y[c * m + p] / mean;
  }
  if (used < 2) return null;
  const idx = sum.map((v) => v / used);
  const avg = idx.reduce((a, b) => a + b, 0) / m;
  const norm = idx.map((v) => v / avg);
  if (norm.some((v) => v < 0.1)) return null;
  return Math.max(...norm) - Math.min(...norm) < 0.1 ? null : norm; // ignore immaterial seasonality
}

function holt(z, a, b) {
  const k = Math.min(3, z.length - 1);
  let l = z[0], t = k ? (z[k] - z[0]) / k : 0, sse = 0;
  for (let i = 1; i < z.length; i++) {
    const f = l + PHI * t;
    const e = z[i] - f;
    sse += e * e;
    const ln = a * z[i] + (1 - a) * f;
    t = b * (ln - l) + (1 - b) * PHI * t;
    l = ln;
  }
  return { l, t, sse, sigma: Math.sqrt(sse / Math.max(1, z.length - 1)) };
}

function fit(z) {
  let best = null;
  for (const a of [0.2, 0.4, 0.6, 0.8]) {
    for (const b of [0.05, 0.15, 0.3]) {
      const r = holt(z, a, b);
      if (!best || r.sse < best.sse) best = r;
    }
  }
  return best;
}

function project(y, m, season, H) {
  let idx = null;
  if (season) {
    idx = seasonalIndex(y, m);
    if (!idx) return null;
  }
  const z = idx ? y.map((v, i) => v / idx[i % m]) : y;
  const f = fit(z);
  const out = [];
  let damp = 0, pw = 1;
  for (let h = 1; h <= H; h++) {
    pw *= PHI;
    damp += pw;
    const s = idx ? idx[(y.length + h - 1) % m] : 1;
    out.push({ value: (f.l + damp * f.t) * s, sigma: f.sigma * Math.sqrt(h) * s });
  }
  return out;
}

function backtest(y, m, season) {
  const k = Math.min(6, Math.floor(y.length / 4));
  if (k < 2 || y.length - k < 5) return null;
  const train = y.slice(0, -k), test = y.slice(-k);
  const fc = project(train, m, season, k);
  if (!fc) return null;
  const naive = train[train.length - 1];
  let e = 0, en = 0, c = 0;
  test.forEach((v, i) => {
    if (v !== 0) {
      e += Math.abs(fc[i].value - v) / Math.abs(v);
      en += Math.abs(naive - v) / Math.abs(v);
      c++;
    }
  });
  return c ? { k, mape: e / c, naiveMape: en / c } : null;
}

// labels/values: complete periods only.
export function forecast(labels, values, g) {
  const n = values.length;
  if (n < 6) return { ok: false, reason: `Only ${n} complete period${n === 1 ? '' : 's'} available; at least 6 are needed for a forecast.` };
  const nonneg = values.every((v) => v >= 0);
  const m = SEASON[g], H = HORIZON[g];
  let best = null;
  for (const season of m && n >= 2 * m ? [false, true] : [false]) {
    const fc = project(values, m, season, H);
    if (!fc) continue;
    const bt = backtest(values, m, season);
    const score = bt ? bt.mape : Infinity;
    if (!best || score < best.score) best = { season, fc, bt, score };
  }
  if (!best) return { ok: false, reason: 'The series could not be modelled.' };
  const cl = (v) => (nonneg ? Math.max(0, v) : v);
  const points = best.fc.map((p, i) => ({
    label: addPeriod(labels[n - 1], g, i + 1),
    value: cl(p.value),
    lo: cl(p.value - Z80 * p.sigma),
    hi: cl(p.value + Z80 * p.sigma),
  }));
  const bt = best.bt;
  let reliability = 'low';
  if (bt) {
    const beats = bt.mape <= bt.naiveMape * 1.05;
    reliability = bt.mape < 0.1 && beats ? 'high' : bt.mape < 0.25 && beats ? 'medium' : 'low';
    if (n < 12 && reliability === 'high') reliability = 'medium';
  }
  return { ok: true, points, backtest: bt, reliability, n, seasonal: best.season, method: best.season ? 'Damped trend with seasonality' : 'Damped trend' };
}
