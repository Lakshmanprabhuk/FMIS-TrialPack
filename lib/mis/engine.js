import { isoDate, fmtMetric, fmtPct, fmtInt } from './format';

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');
export const GRANS = ['day', 'week', 'month', 'quarter', 'year'];
export const SEV_RANK = { high: 3, medium: 2, low: 1, ok: 0 };

// ── Periods ─────────────────────────────────────────────────────────────────
export function bucketKey(t, g) {
  const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  if (g === 'day') return isoDate(t);
  if (g === 'week') return isoDate(t - ((d.getUTCDay() + 6) % 7) * DAY);
  if (g === 'month') return `${y}-${pad(m)}`;
  if (g === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  return String(y);
}

export function addPeriod(key, g, k = 1) {
  if (g === 'day' || g === 'week') return isoDate(Date.parse(key + 'T00:00:00Z') + k * (g === 'day' ? 1 : 7) * DAY);
  if (g === 'month') {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  }
  if (g === 'quarter') {
    const [ys, qs] = key.split('-Q');
    const idx = +ys * 4 + (+qs - 1) + k;
    return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
  }
  return String(+key + k);
}

export function periodEndTs(key, g) {
  if (g === 'day') return Date.parse(key + 'T00:00:00Z');
  if (g === 'week') return Date.parse(key + 'T00:00:00Z') + 6 * DAY;
  if (g === 'month') {
    const [y, m] = key.split('-').map(Number);
    return Date.UTC(y, m, 0);
  }
  if (g === 'quarter') {
    const [y, q] = key.split('-Q').map(Number);
    return Date.UTC(y, q * 3, 0);
  }
  return Date.UTC(+key, 12, 0);
}

function periodRange(minT, maxT, g) {
  const out = [];
  let k = bucketKey(minT, g);
  const last = bucketKey(maxT, g);
  let guard = 0;
  while (k <= last && guard++ < 20000) {
    out.push(k);
    k = addPeriod(k, g, 1);
  }
  return out;
}

export function autoGran(ds) {
  if (ds.minDate == null) return 'month';
  const span = (ds.maxDate - ds.minDate) / DAY;
  if (span < 45) return 'day';
  if (span > 3650) return 'quarter';
  return 'month';
}

// ── Dimensions & metrics ────────────────────────────────────────────────────
export const dimCandidates = (ds) => ds.cats.filter((k) => ds.cols[k].dict.length >= 2);

export function pivotDims(ds) {
  return [...dimCandidates(ds), ...ds.dates.flatMap((d) => ['month', 'quarter', 'year'].map((g) => `${d}@${g}`))];
}

export function dimTitle(ds, key) {
  if (!key) return '';
  const at = key.lastIndexOf('@');
  if (at > 0 && GRANS.includes(key.slice(at + 1))) return `${key.slice(0, at)} (${key.slice(at + 1)})`;
  return key;
}

export function getDim(ds, key) {
  if (!ds._dims) ds._dims = new Map();
  if (ds._dims.has(key)) return ds._dims.get(key);
  let name = key, g = null;
  const at = key.lastIndexOf('@');
  if (at > 0 && GRANS.includes(key.slice(at + 1))) {
    name = key.slice(0, at);
    g = key.slice(at + 1);
  }
  const col = ds.cols[name];
  let dim;
  if (col.type === 'date') {
    const gg = g || 'month';
    const labels = periodRange(col.min, col.max, gg);
    const idx = new Map(labels.map((l, i) => [l, i]));
    const codes = new Int32Array(ds.n);
    for (let i = 0; i < ds.n; i++) {
      const t = col.data[i];
      codes[i] = t === t ? idx.get(bucketKey(t, gg)) : -1;
    }
    dim = { key, name, g: gg, codes, labels, ordered: true };
  } else {
    const labels = col.dict.slice();
    let codes = col.codes;
    if (col.missing > 0) {
      codes = new Int32Array(col.codes);
      const b = labels.length;
      labels.push('(blank)');
      for (let i = 0; i < ds.n; i++) if (codes[i] < 0) codes[i] = b;
    }
    dim = { key, name, codes, labels, ordered: false };
  }
  ds._dims.set(key, dim);
  return dim;
}

const mdata = (ds, metric) => (metric && metric !== '__count' && ds.cols[metric] ? ds.cols[metric].data : null);
export const metricLabel = (metric) => (metric === '__count' || !metric ? 'Records' : metric);
export function metricInfo(ds, metric) {
  const c = metric && metric !== '__count' ? ds.cols[metric] : null;
  return { money: !!(c && c.money), cur: ds.currency };
}

export function defaultView(ds) {
  const pri = [/revenue|sales|turnover|income/i, /amount|total|value/i, /profit|cost|expense/i, /qty|quantity|units|volume/i];
  let metric = null;
  for (const re of pri) {
    metric = ds.numeric.find((nm) => re.test(nm));
    if (metric) break;
  }
  if (!metric) metric = ds.numeric[0] || '__count';
  const metric2 = ds.numeric.find((nm) => nm !== metric) || null;
  const dims = dimCandidates(ds);
  const dimKey = dims.find((k) => ds.cols[k].dict.length >= 3 && ds.cols[k].dict.length <= 50) || dims[0] || null;
  return { metric, metric2, dimKey, gran: ds.primaryDate ? autoGran(ds) : 'month' };
}

// ── Filtering ───────────────────────────────────────────────────────────────
export function filtersActive(f) {
  return !!(f.from || f.to || f.dropDupes || Object.values(f.cats).some(Boolean));
}

export function buildMask(ds, f) {
  const n = ds.n;
  const mask = new Uint8Array(n).fill(1);
  if (f.dropDupes) for (let i = 0; i < n; i++) if (ds.dupFlag[i]) mask[i] = 0;
  if ((f.from || f.to) && ds.primaryDate) {
    const from = f.from ? Date.parse(f.from + 'T00:00:00Z') : -Infinity;
    const to = f.to ? Date.parse(f.to + 'T00:00:00Z') + DAY - 1 : Infinity;
    const d = ds.cols[ds.primaryDate].data;
    for (let i = 0; i < n; i++) {
      const t = d[i];
      if (t !== t || t < from || t > to) mask[i] = 0;
    }
  }
  for (const [name, val] of Object.entries(f.cats)) {
    if (!val) continue;
    const c = ds.cols[name];
    const code = c.dict.indexOf(val);
    for (let i = 0; i < n; i++) if (c.codes[i] !== code) mask[i] = 0;
  }
  return mask;
}

export function maskToIdx(mask) {
  const out = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  return out;
}

// ── Aggregations ────────────────────────────────────────────────────────────
export function totalsOf(ds, mask, metric) {
  const d = mdata(ds, metric);
  let count = 0, sum = 0, nn = 0, max = -Infinity, min = Infinity;
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    count++;
    if (d) {
      const v = d[i];
      if (v === v) {
        sum += v;
        nn++;
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
  }
  if (!d) return { count, sum: count, nn: count, avg: count ? 1 : 0, max: count ? 1 : 0, min: count ? 1 : 0 };
  return { count, sum, nn, avg: nn ? sum / nn : 0, max: isFinite(max) ? max : 0, min: isFinite(min) ? min : 0 };
}

export function groupTotals(ds, mask, dimKey, metric, agg = 'sum') {
  const dim = getDim(ds, dimKey), data = mdata(ds, metric), K = dim.labels.length;
  const cnt = new Float64Array(K), sum = new Float64Array(K), nn = new Float64Array(K);
  const mn = new Float64Array(K).fill(Infinity), mx = new Float64Array(K).fill(-Infinity);
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const c = dim.codes[i];
    if (c < 0) continue;
    cnt[c]++;
    const v = data ? data[i] : 1;
    if (v === v) {
      sum[c] += v;
      nn[c]++;
      if (v < mn[c]) mn[c] = v;
      if (v > mx[c]) mx[c] = v;
    }
  }
  const out = [];
  for (let c = 0; c < K; c++) {
    if (!cnt[c]) continue;
    const value = agg === 'avg' ? (nn[c] ? sum[c] / nn[c] : 0) : agg === 'count' ? cnt[c] : agg === 'min' ? mn[c] : agg === 'max' ? mx[c] : sum[c];
    out.push({ code: c, label: dim.labels[c], value, count: cnt[c] });
  }
  if (dim.ordered) out.sort((a, b) => a.code - b.code);
  else out.sort((a, b) => b.value - a.value);
  return out;
}

function seriesBundle(ds, mask, g, metrics, topDim, topCode) {
  const dim = getDim(ds, ds.primaryDate + '@' + g), P = dim.labels.length;
  const count = new Float64Array(P);
  const ms = metrics.map((m) => ({
    data: mdata(ds, m),
    sum: new Float64Array(P),
    nn: new Float64Array(P),
    max: new Float64Array(P).fill(-Infinity),
  }));
  const topSum = new Float64Array(P);
  const sets = topDim ? Array.from({ length: P }, () => new Set()) : null;
  const tdata = mdata(ds, metrics[0]);
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const p = dim.codes[i];
    if (p < 0) continue;
    count[p]++;
    for (const m of ms) {
      if (m.data) {
        const v = m.data[i];
        if (v === v) {
          m.sum[p] += v;
          m.nn[p]++;
          if (v > m.max[p]) m.max[p] = v;
        }
      } else {
        m.sum[p]++;
        m.nn[p]++;
        m.max[p] = 1;
      }
    }
    if (topDim) {
      const c = topDim.codes[i];
      sets[p].add(c);
      if (c === topCode) {
        if (tdata) {
          const v = tdata[i];
          if (v === v) topSum[p] += v;
        } else topSum[p]++;
      }
    }
  }
  let lo = 0, hi = P - 1;
  while (lo < P && !count[lo]) lo++;
  while (hi >= lo && !count[hi]) hi--;
  if (lo > hi) return null;
  const sl = (a) => a.slice(lo, hi + 1);
  return {
    labels: dim.labels.slice(lo, hi + 1),
    count: sl(count),
    ms: ms.map((m) => ({ sum: sl(m.sum), nn: sl(m.nn), max: sl(m.max).map((v) => (isFinite(v) ? v : 0)) })),
    topSum: sl(topSum),
    distinct: sets ? sets.slice(lo, hi + 1).map((s) => s.size) : null,
  };
}

const pctChange = (a, b) => (a == null || b == null || b === 0 ? null : (a - b) / Math.abs(b));

function periodStats(series, partial) {
  const P = series.length;
  if (P < 2) return { pop: null, varAvg: null };
  const end = partial && P > 2 ? P - 2 : P - 1;
  let s = 0;
  for (let i = 0; i <= end; i++) s += series[i];
  const mean = s / (end + 1);
  return { pop: pctChange(series[end], series[end - 1]), varAvg: mean ? (series[end] - mean) / Math.abs(mean) : null };
}

export function seriesAnalytics(labels, values, g, partial) {
  const P = values.length;
  const lag = { day: 365, week: 52, month: 12, quarter: 4, year: null }[g];
  const pop = values.map((v, i) => (i ? pctChange(v, values[i - 1]) : null));
  const yoy = values.map((v, i) => (lag && i >= lag ? pctChange(v, values[i - lag]) : null));
  const ma = values.map((_, i) => (i < 2 ? null : (values[i] + values[i - 1] + values[i - 2]) / 3));
  const end = partial && P > 2 ? P - 2 : P - 1;
  let projection = null;
  const hist = values.slice(Math.max(0, end - 11), end + 1);
  if (hist.length >= 4) {
    const n = hist.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    hist.forEach((y, x) => {
      sx += x;
      sy += y;
      sxy += x * y;
      sxx += x * x;
    });
    const den = n * sxx - sx * sx;
    const slope = den ? (n * sxy - sx * sy) / den : 0;
    const icpt = (sy - slope * sx) / n;
    const nonneg = hist.every((v) => v >= 0);
    const vals = [];
    for (let s = 1; s <= 3; s++) {
      let y = icpt + slope * (n - 1 + s);
      if (nonneg) y = Math.max(0, y);
      vals.push(y);
    }
    projection = { values: vals, slope, basis: n };
  }
  const comps = [];
  const cur = values[end];
  const POP = { day: 'DoD', week: 'WoW', month: 'MoM', quarter: 'QoQ', year: 'YoY' }[g];
  if (end >= 1) comps.push({ key: 'pop', label: POP, cur, prev: values[end - 1], change: pctChange(cur, values[end - 1]), curLabel: labels[end], prevLabel: labels[end - 1] });
  if (g === 'month' && end >= 5) {
    const c = values[end] + values[end - 1] + values[end - 2];
    const p = values[end - 3] + values[end - 4] + values[end - 5];
    comps.push({ key: 'qoq', label: 'QoQ (rolling 3 months)', cur: c, prev: p, change: pctChange(c, p) });
  }
  if (lag && end >= lag) comps.push({ key: 'yoy', label: 'YoY', cur, prev: values[end - lag], change: pctChange(cur, values[end - lag]), curLabel: labels[end], prevLabel: labels[end - lag] });
  return { pop, yoy, ma, projection, comps, endIdx: end, lag };
}

export function paretoAnalysis(groups) {
  const pos = groups.filter((g) => g.value > 0);
  const total = pos.reduce((a, g) => a + g.value, 0);
  let cum = 0;
  const items = pos.map((g) => {
    const share = total ? g.value / total : 0;
    const prev = cum;
    cum += share;
    return { ...g, share, cum, cls: prev < 0.8 ? 'A' : prev < 0.95 ? 'B' : 'C' };
  });
  const summary = { A: { n: 0, v: 0 }, B: { n: 0, v: 0 }, C: { n: 0, v: 0 } };
  items.forEach((it) => {
    summary[it.cls].n++;
    summary[it.cls].v += it.share;
  });
  const n80 = items.findIndex((it) => it.cum >= 0.8 - 1e-9) + 1;
  return { items, total, summary, n80, pct80: items.length ? n80 / items.length : 0, excluded: groups.length - pos.length };
}

export function concentration(ds, mask, metric, dimKeys) {
  const out = [];
  dimKeys.forEach((k, idx) => {
    const g = groupTotals(ds, mask, k, metric).filter((x) => x.value > 0);
    const total = g.reduce((a, x) => a + x.value, 0);
    if (g.length < 2 || !total) return;
    const sh = g.map((x) => x.value / total);
    const top1 = sh[0];
    const top3 = sh.slice(0, 3).reduce((a, b) => a + b, 0);
    const hhi = sh.reduce((a, s) => a + s * s, 0);
    const severity = top1 >= 0.5 || hhi >= 0.25 ? 'high' : top1 >= 0.3 || hhi >= 0.15 ? 'medium' : top1 >= 0.2 ? 'low' : 'ok';
    out.push({ id: 'conc_' + idx, dimKey: k, name: dimTitle(ds, k), n: g.length, top1, top3, hhi, topLabel: g[0].label, severity });
  });
  return out.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]).map((c, i) => ({ ...c, id: 'conc_' + i }));
}

export function decliningSegments(ds, mask, g, dimKey, metric, partial) {
  if (!ds.primaryDate || !dimKey) return [];
  const dim = getDim(ds, dimKey), pd = getDim(ds, ds.primaryDate + '@' + g);
  const K = dim.labels.length, P = pd.labels.length;
  if (K * P > 3e6 || P < 4) return [];
  const mat = new Float64Array(K * P), tot = new Float64Array(K), data = mdata(ds, metric);
  let any = false;
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const c = dim.codes[i], p = pd.codes[i];
    if (c < 0 || p < 0) continue;
    const v = data ? data[i] : 1;
    if (v === v) {
      mat[c * P + p] += v;
      tot[c] += v;
      any = true;
    }
  }
  if (!any) return [];
  // restrict to the active window (trimmed to observed periods)
  let lo = 0, hi = P - 1;
  const colHas = (p) => { for (let c = 0; c < K; c++) if (mat[c * P + p]) return true; return false; };
  while (lo < P && !colHas(lo)) lo++;
  while (hi > lo && !colHas(hi)) hi--;
  const end = partial && hi - lo > 1 ? hi - 1 : hi;
  const order = [...Array(K).keys()].filter((c) => tot[c] > 0).sort((a, b) => tot[b] - tot[a]).slice(0, 40);
  const out = [];
  for (const c of order) {
    let streak = 0;
    for (let i = end; i > lo; i--) {
      if (mat[c * P + i] < mat[c * P + i - 1]) streak++;
      else break;
    }
    if (streak >= 2) {
      const from = mat[c * P + end - streak], to = mat[c * P + end];
      const change = from ? (to - from) / Math.abs(from) : null;
      let lvl = streak >= 4 ? 2 : streak === 3 ? 1 : 0;
      if (change != null && change <= -0.4) lvl = Math.min(2, lvl + 1);
      out.push({ label: dim.labels[c], streak, change, from, to, severity: ['low', 'medium', 'high'][lvl] });
    }
  }
  out.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.streak - a.streak);
  return out.map((d, i) => ({ ...d, id: 'decl_' + i }));
}

export function findOutliers(ds, mask, metric) {
  const d = mdata(ds, metric);
  if (!d) return { count: 0, items: [], mean: 0, std: 0, n: 0 };
  let n = 0, mean = 0, m2 = 0;
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const v = d[i];
    if (v !== v) continue;
    n++;
    const dl = v - mean;
    mean += dl / n;
    m2 += dl * (v - mean);
  }
  const std = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
  if (!std || n < 10) return { count: 0, items: [], mean, std, n };
  const found = [];
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const v = d[i];
    if (v !== v) continue;
    const z = (v - mean) / std;
    if (Math.abs(z) >= 3) found.push({ row: i, value: v, z });
  }
  found.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return {
    count: found.length,
    n, mean, std,
    items: found.slice(0, 25).map((f) => ({ ...f, severity: Math.abs(f.z) >= 5 ? 'high' : Math.abs(f.z) >= 4 ? 'medium' : 'low' })),
  };
}

export function periodAnomalies(labels, values, end) {
  const v = values.slice(0, end + 1);
  if (v.length < 6) return [];
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const std = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
  if (!std) return [];
  const out = [];
  v.forEach((x, i) => {
    const z = (x - mean) / std;
    if (Math.abs(z) >= 2) out.push({ label: labels[i], value: x, z, severity: Math.abs(z) >= 3 ? 'high' : Math.abs(z) >= 2.5 ? 'medium' : 'low' });
  });
  out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return out.slice(0, 8).map((a, i) => ({ ...a, id: 'anom_' + i }));
}

// ── Pivot ───────────────────────────────────────────────────────────────────
export function pivot(ds, mask, { rowKey, colKey, metric, agg, maxRows = 25, maxCols = 12 }) {
  const rd = getDim(ds, rowKey), cd = colKey ? getDim(ds, colKey) : null;
  const data = mdata(ds, metric);
  const a = data ? agg : 'count';
  const C = cd ? cd.labels.length : 1;
  const newAcc = () => ({ n: 0, s: 0, k: 0, mn: Infinity, mx: -Infinity });
  const upd = (m, key, v, has) => {
    let x = m.get(key);
    if (!x) { x = newAcc(); m.set(key, x); }
    x.n++;
    if (has) { x.s += v; x.k++; if (v < x.mn) x.mn = v; if (v > x.mx) x.mx = v; }
  };
  const cells = new Map(), rows = new Map(), cols = new Map(), grand = newAcc();
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const r = rd.codes[i];
    if (r < 0) continue;
    const c = cd ? cd.codes[i] : 0;
    if (c < 0) continue;
    const v = data ? data[i] : 1;
    const has = v === v;
    upd(cells, r * C + c, v, has);
    upd(rows, r, v, has);
    if (cd) upd(cols, c, v, has);
    grand.n++;
    if (has) { grand.s += v; grand.k++; if (v < grand.mn) grand.mn = v; if (v > grand.mx) grand.mx = v; }
  }
  const fin = (x) => {
    if (!x) return null;
    if (a === 'count') return x.n;
    if (a === 'avg') return x.k ? x.s / x.k : null;
    if (a === 'min') return x.k ? x.mn : null;
    if (a === 'max') return x.k ? x.mx : null;
    return x.s;
  };
  const pick = (map, dim, limit) => {
    let list = [...map.entries()].map(([code, x]) => ({ code, val: fin(x) }));
    if (dim.ordered) list.sort((p, q) => p.code - q.code).splice(0, Math.max(0, list.length - limit));
    else list = list.sort((p, q) => (q.val ?? -Infinity) - (p.val ?? -Infinity)).slice(0, limit);
    return list;
  };
  const rowList = pick(rows, rd, maxRows);
  const colList = cd ? pick(cols, cd, maxCols) : [{ code: 0, val: fin(grand) }];
  let lo = Infinity, hi = -Infinity;
  const outRows = rowList.map(({ code: r }) => {
    const vals = colList.map(({ code: c }) => {
      const v = fin(cells.get(r * C + c));
      if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; }
      return v;
    });
    return { label: rd.labels[r], code: r, cells: vals, total: fin(rows.get(r)) };
  });
  return {
    rows: outRows,
    cols: colList.map(({ code }) => ({ label: cd ? cd.labels[code] : metricLabel(metric), code, total: cd ? fin(cols.get(code)) : fin(grand) })),
    grand: fin(grand),
    lo: isFinite(lo) ? lo : 0,
    hi: isFinite(hi) ? hi : 0,
    hasCols: !!cd,
    truncRows: rows.size > rowList.length ? rows.size : 0,
    truncCols: cd && cols.size > colList.length ? cols.size : 0,
    agg: a,
  };
}

// ── Everything the summary/trends/exceptions need ───────────────────────────
function buildKpis(ds, o, tot, tot2, groups, bundle, partial) {
  const k = [];
  const cnt = o.metric === '__count';
  const info = metricInfo(ds, o.metric);
  const info2 = o.metric2 ? metricInfo(ds, o.metric2) : null;
  const add = (id, label, value, kind, metric, series, sub) => {
    const s = series && series.length > 1 ? series : null;
    k.push({ id, label, value, kind, metric, series: s, sub: sub || '', ...(s ? periodStats(s, partial) : { pop: null, varAvg: null }) });
  };
  const b0 = bundle ? bundle.ms[0] : null;
  const perRec = (b) => (b ? Array.from(b.sum, (s, i) => (b.nn[i] ? s / b.nn[i] : 0)) : null);
  if (!cnt) {
    add('total', `Total ${o.metric}`, tot.sum, info.money ? 'money' : 'num', o.metric, b0 && Array.from(b0.sum));
    add('avg', `Avg ${o.metric} / record`, tot.avg, info.money ? 'money' : 'num', o.metric, perRec(b0));
  }
  add('records', 'Records', tot.count, 'count', null, bundle && Array.from(bundle.count));
  if (!cnt) add('max', `Largest ${o.metric}`, tot.max, info.money ? 'money' : 'num', o.metric, b0 && Array.from(b0.max));
  if (groups.length) {
    const total = groups.reduce((x, g) => x + Math.max(0, g.value), 0);
    const dn = dimTitle(ds, o.dimKey);
    add('topshare', `Top ${dn} share`, total ? groups[0].value / total : 0, 'pct', null, bundle && b0 && Array.from(bundle.topSum, (s, i) => (b0.sum[i] ? s / b0.sum[i] : 0)), groups[0].label);
    add('segments', `Active ${dn}`, groups.length, 'count', null, bundle && bundle.distinct);
  }
  if (o.metric2 && tot2) {
    const b1 = bundle ? bundle.ms[1] : null;
    add('total2', `Total ${o.metric2}`, tot2.sum, info2.money ? 'money' : 'num', o.metric2, b1 && Array.from(b1.sum));
    add('avg2', `Avg ${o.metric2} / record`, tot2.avg, info2.money ? 'money' : 'num', o.metric2, perRec(b1));
  }
  return k;
}

export function computeInsights(ds, mask, o) {
  const hasTime = !!ds.primaryDate;
  const g = o.gran;
  const tot = totalsOf(ds, mask, o.metric);
  const tot2 = o.metric2 ? totalsOf(ds, mask, o.metric2) : null;
  const groups = o.dimKey ? groupTotals(ds, mask, o.dimKey, o.metric) : [];

  let minT = Infinity, maxT = -Infinity;
  if (hasTime) {
    const d = ds.cols[ds.primaryDate].data;
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i]) continue;
      const t = d[i];
      if (t === t) { if (t < minT) minT = t; if (t > maxT) maxT = t; }
    }
  }
  const period = isFinite(minT) ? { min: minT, max: maxT } : null;
  const partial = !!(period && g !== 'day' && ds.dateHasDays && maxT < periodEndTs(bucketKey(maxT, g), g));

  let bundle = null;
  if (period && tot.count) {
    const topDim = o.dimKey ? getDim(ds, o.dimKey) : null;
    bundle = seriesBundle(ds, mask, g, [o.metric, o.metric2].filter(Boolean), topDim, groups[0]?.code);
  }
  let series = null;
  if (bundle) {
    const values = Array.from(bundle.ms[0].sum);
    const analytics = seriesAnalytics(bundle.labels, values, g, partial);
    series = { labels: bundle.labels, values, analytics, endIdx: analytics.endIdx };
  }
  const kpis = buildKpis(ds, o, tot, tot2, groups, bundle, partial);
  const pareto = groups.length ? paretoAnalysis(groups) : null;
  const dimKeys = [...new Set([o.dimKey, ...dimCandidates(ds)].filter(Boolean))].slice(0, 6);
  const conc = concentration(ds, mask, o.metric, dimKeys);
  const declines = hasTime && o.dimKey && series ? decliningSegments(ds, mask, g, o.dimKey, o.metric, partial) : [];
  const outliers = findOutliers(ds, mask, o.metric);
  const anomalies = series ? periodAnomalies(series.labels, series.values, series.endIdx) : [];
  return { tot, tot2, groups, kpis, series, partial, period, pareto, concentration: conc, declines, outliers, anomalies, hasTime };
}

export function formatKpiValue(ds, k, v = k.value) {
  if (k.kind === 'pct') return fmtPct(v);
  if (k.kind === 'count') return fmtInt(v);
  return fmtMetric(v, k.kind === 'money' ? metricInfo(ds, k.metric) : null);
}

export function rowContext(ds, i) {
  const parts = [];
  if (ds.primaryDate) {
    const t = ds.cols[ds.primaryDate].data[i];
    if (t === t) parts.push(isoDate(t));
  }
  for (const nm of ds.cats.slice(0, 3)) {
    const c = ds.cols[nm];
    const code = c.codes[i];
    if (code >= 0) parts.push(c.dict[code]);
  }
  return parts.join(' · ');
}
