import { getDim, groupTotals, totalsOf, dimCandidates, dimTitle, metricInfo, addPeriod } from './engine';
import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod, MONTH_NAMES } from './format';
import { forecast } from './forecast';

const DAY = 864e5;
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const mdata = (ds, m) => (m && m !== '__count' && ds.cols[m] ? ds.cols[m].data : null);
const periodKey = (ds, g) => `${ds.primaryDate}@${g}`;

export function restrict(ds, mask, dimKey, label) {
  const dim = getDim(ds, dimKey);
  const code = dim.labels.indexOf(label);
  const out = new Uint8Array(ds.n);
  if (code < 0) return out;
  for (let i = 0; i < ds.n; i++) if (mask[i] && dim.codes[i] === code) out[i] = 1;
  return out;
}

export function buildWaterfall(prev, cur, deltas, maxItems = 7, labels = ['Previous', 'Latest']) {
  const sorted = deltas.filter((d) => d.delta).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const shown = sorted.slice(0, maxItems);
  const restN = sorted.length - shown.length;
  const rest = sorted.slice(maxItems).reduce((a, d) => a + d.delta, 0);
  const rows = [{ label: labels[0], kind: 'total', start: prev, end: prev }];
  let run = prev;
  const push = (label, delta) => {
    rows.push({ label, kind: 'delta', start: run, end: run + delta, delta });
    run += delta;
  };
  shown.forEach((d) => push(d.label, d.delta));
  if (restN > 0 && rest) push(`${restN} other`, rest);
  rows.push({ label: labels[1], kind: 'total', start: cur, end: cur });
  const vals = rows.flatMap((r) => [r.start, r.end]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.1 || 1;
  return { rows, lo: lo - pad, hi: hi + pad };
}

// ── Compare ─────────────────────────────────────────────────────────────────
export function comparePeriods(ds, mask, o, dimKey, aLabel, bLabel) {
  const pk = periodKey(ds, o.gran);
  const mA = restrict(ds, mask, pk, aLabel), mB = restrict(ds, mask, pk, bLabel);
  let rows = [], totalA, totalB;
  if (dimKey) {
    const ga = groupTotals(ds, mA, dimKey, o.metric), gb = groupTotals(ds, mB, dimKey, o.metric);
    const map = new Map();
    ga.forEach((g) => map.set(g.label, { label: g.label, a: g.value, b: 0 }));
    gb.forEach((g) => {
      const r = map.get(g.label) || { label: g.label, a: 0, b: 0 };
      r.b = g.value;
      map.set(g.label, r);
    });
    rows = [...map.values()].map((r) => ({ ...r, delta: r.a - r.b, pct: r.b ? (r.a - r.b) / Math.abs(r.b) : null }));
    totalA = rows.reduce((s, r) => s + r.a, 0);
    totalB = rows.reduce((s, r) => s + r.b, 0);
  } else {
    totalA = totalsOf(ds, mA, o.metric).sum;
    totalB = totalsOf(ds, mB, o.metric).sum;
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const delta = totalA - totalB;
  return {
    aLabel, bLabel, totalA, totalB, delta,
    pct: totalB ? delta / Math.abs(totalB) : null,
    rows,
    waterfall: rows.length ? buildWaterfall(totalB, totalA, rows, 7, [fmtPeriod(bLabel), fmtPeriod(aLabel)]) : null,
  };
}

export function compareSegments(ds, mask, o, aLabel, bLabel) {
  const side = (label) => {
    const m = restrict(ds, mask, o.dimKey, label);
    const t = totalsOf(ds, m, o.metric);
    const ser = ds.primaryDate ? new Map(groupTotals(ds, m, periodKey(ds, o.gran), o.metric).map((x) => [x.label, x.value])) : null;
    return { label, total: t.sum, count: t.count, avg: t.avg, max: t.max, ser };
  };
  const A = side(aLabel), B = side(bLabel);
  const labels = [];
  let sa = [], sb = [];
  if (A.ser && (A.ser.size || B.ser.size)) {
    const all = [...A.ser.keys(), ...B.ser.keys()].sort();
    let k = all[0], guard = 0;
    const last = all[all.length - 1];
    while (k <= last && guard++ < 3000) {
      labels.push(k);
      k = addPeriod(k, o.gran, 1);
    }
    sa = labels.map((l) => A.ser.get(l) || 0);
    sb = labels.map((l) => B.ser.get(l) || 0);
  }
  const mk = (label, a, b, kind) => ({ label, a, b, delta: a - b, pct: b ? (a - b) / Math.abs(b) : null, kind });
  const cnt = o.metric === '__count';
  const rows = [mk(cnt ? 'Records' : `Total ${o.metric}`, A.total, B.total, cnt ? 'count' : 'metric')];
  if (!cnt) {
    rows.push(mk('Records', A.count, B.count, 'count'), mk('Average per record', A.avg, B.avg, 'metric'), mk('Largest value', A.max, B.max, 'metric'));
  }
  return { A, B, labels, sa, sb, rows };
}

// ── Drivers ─────────────────────────────────────────────────────────────────
export function drivers(ds, mask, o, ins, dimKey) {
  const s = ins.series;
  if (!s || s.endIdx < 1 || !dimKey) return null;
  const cur = s.labels[s.endIdx], prev = s.labels[s.endIdx - 1];
  const cmp = comparePeriods(ds, mask, o, dimKey, cur, prev);
  if (!cmp.rows.length) return null;
  const base = Math.abs(cmp.totalB) || null;
  const items = cmp.rows.map((r) => ({ ...r, pts: base ? r.delta / base : null }));
  return {
    dimKey, name: dimTitle(ds, dimKey), cur, prev,
    totalA: cmp.totalA, totalB: cmp.totalB, delta: cmp.delta, pct: cmp.pct,
    up: items.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3),
    down: items.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3),
    waterfall: cmp.waterfall,
  };
}

// ── Segment quadrant (share vs growth) ──────────────────────────────────────
function segMatrix(ds, mask, g, dimKey, metric) {
  const dim = getDim(ds, dimKey), pd = getDim(ds, periodKey(ds, g));
  const K = dim.labels.length, P = pd.labels.length;
  if (K * P > 3e6) return null;
  const mat = new Float64Array(K * P), data = mdata(ds, metric);
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const c = dim.codes[i], p = pd.codes[i];
    if (c < 0 || p < 0) continue;
    const v = data ? data[i] : 1;
    if (v === v) mat[c * P + p] += v;
  }
  return { dim, pd, K, P, mat };
}

export function quadrant(ds, mask, o, ins) {
  const s = ins.series;
  if (!s || !o.dimKey) return { ok: false, reason: 'Needs a date column and a grouping dimension.' };
  const mx = segMatrix(ds, mask, o.gran, o.dimKey, o.metric);
  if (!mx) return { ok: false, reason: 'Too many segment and period combinations to analyse.' };
  const { dim, pd, K, P, mat } = mx;
  const e = pd.labels.indexOf(s.labels[s.endIdx]), lo = pd.labels.indexOf(s.labels[0]);
  const n = e - lo + 1;
  const w = n >= 8 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0;
  if (!w) return { ok: false, reason: 'Needs at least 2 complete periods.' };
  const sumR = (c, a, b) => {
    let t = 0;
    for (let p = a; p <= b; p++) t += mat[c * P + p];
    return t;
  };
  let totCur = 0, totPrev = 0, totAll = 0;
  const segs = [];
  for (let c = 0; c < K; c++) {
    const all = sumR(c, lo, e);
    if (all <= 0) continue;
    const cur = sumR(c, e - w + 1, e), prev = sumR(c, e - 2 * w + 1, e - w);
    totCur += cur; totPrev += prev; totAll += all;
    segs.push({ label: dim.labels[c], all, cur, prev });
  }
  if (segs.length < 3 || !totAll || totPrev <= 0) return { ok: false, reason: 'Needs at least 3 segments with positive totals and a prior window to compare with.' };
  const refGrowth = (totCur - totPrev) / totPrev;
  segs.sort((a, b) => b.all - a.all);
  const xRef = 1 / segs.length;
  const items = segs.slice(0, 24).filter((x) => x.prev > 0).map((x) => {
    const share = x.all / totAll, growth = (x.cur - x.prev) / x.prev;
    const hs = share >= xRef, hg = growth > refGrowth;
    return { ...x, share, growth, cls: hs ? (hg ? 'star' : 'cow') : hg ? 'question' : 'laggard' };
  });
  if (items.length < 3) return { ok: false, reason: 'Too few segments have a prior window to compare with.' };
  return { ok: true, items, xRef, refGrowth, w, count: segs.length };
}

// ── Patterns ────────────────────────────────────────────────────────────────
function seasonBlock(sums, sets, names, need) {
  const obs = [];
  sums.forEach((s, i) => { if (sets[i].size) obs.push({ i, avg: s / sets[i].size }); });
  if (obs.length < need) return null;
  const mean = obs.reduce((a, x) => a + x.avg, 0) / obs.length;
  if (!(mean > 0)) return null;
  const items = obs.map((x) => ({ i: x.i, name: names[x.i], idx: x.avg / mean }));
  const peak = items.reduce((a, b) => (b.idx > a.idx ? b : a));
  const low = items.reduce((a, b) => (b.idx < a.idx ? b : a));
  return peak.idx - low.idx < 0.1 ? null : { items, peak, low };
}

export function patterns(ds, mask, o) {
  const out = { month: null, weekday: null, correlations: [] };
  const metric = mdata(ds, o.metric);
  if (ds.primaryDate) {
    const d = ds.cols[ds.primaryDate].data;
    const ms = new Float64Array(12), ws = new Float64Array(7), years = new Set();
    const mset = Array.from({ length: 12 }, () => new Set()), wset = Array.from({ length: 7 }, () => new Set());
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i]) continue;
      const t = d[i];
      if (t !== t) continue;
      const v = metric ? metric[i] : 1;
      if (v !== v) continue;
      const dt = new Date(t), m = dt.getUTCMonth(), y = dt.getUTCFullYear();
      ms[m] += v; mset[m].add(y); years.add(y);
      if (ds.dateHasDays) {
        const w = dt.getUTCDay();
        ws[w] += v; wset[w].add(Math.floor(t / DAY));
      }
    }
    const mb = seasonBlock(ms, mset, MONTH_NAMES, 6);
    if (mb) out.month = { ...mb, years: years.size };
    if (ds.dateHasDays) out.weekday = seasonBlock(ws, wset, WD, 5);
  }
  const cols = ds.numeric.slice(0, 8).map((n) => ({ n, d: ds.cols[n].data }));
  for (let a = 0; a < cols.length; a++) {
    for (let b = a + 1; b < cols.length; b++) {
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      const X = cols[a].d, Y = cols[b].d;
      for (let i = 0; i < ds.n; i++) {
        if (!mask[i]) continue;
        const x = X[i], y = Y[i];
        if (x !== x || y !== y) continue;
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      }
      const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
      if (n < 30 || !(den > 0)) continue;
      const r = (n * sxy - sx * sy) / den;
      if (Math.abs(r) >= 0.3) out.correlations.push({ a: cols[a].n, b: cols[b].n, r, n });
    }
  }
  out.correlations.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  out.correlations = out.correlations.slice(0, 6);
  return out;
}

// ── Opportunity sizing ──────────────────────────────────────────────────────
export function opportunity(ds, mask, o, ins) {
  if (o.metric === '__count' || !o.dimKey) return null;
  const g = groupTotals(ds, mask, o.dimKey, o.metric, 'avg').filter((x) => x.count >= 5 && isFinite(x.value));
  if (g.length < 4) return null;
  const v = g.map((x) => x.value).sort((a, b) => a - b);
  const median = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  if (!(median > 0)) return null;
  const items = g.filter((x) => x.value < median).map((x) => ({ label: x.label, avg: x.value, count: x.count, upside: (median - x.value) * x.count })).sort((a, b) => b.upside - a.upside);
  const upside = items.reduce((s, x) => s + x.upside, 0);
  if (!(upside > 0)) return null;
  return { median, upside, below: items.length, total: ins.tot.sum, items: items.slice(0, 8), segments: g.length };
}

// ── Scenario (user assumptions, not a prediction) ───────────────────────────
export function scenarioModel(ins, o, deep, p) {
  const s = ins.series;
  if (!s) return null;
  const latest = s.values[s.endIdx];
  if (!isFinite(latest)) return null;
  const H = p.horizon;
  const pos = ins.groups.reduce((a, g) => a + Math.max(0, g.value), 0);
  const topShare = pos && ins.groups.length ? Math.max(0, ins.groups[0].value) / pos : 0;
  const fc = deep.forecast.ok ? deep.forecast.points : null;
  const labels = [s.labels[s.endIdx]], base = [latest], scen = [latest];
  for (let k = 1; k <= H; k++) {
    labels.push(addPeriod(s.labels[s.endIdx], o.gran, k));
    base.push(fc && fc[k - 1] ? fc[k - 1].value : latest);
    scen.push(latest * Math.pow(1 + p.growth, k) * (1 + topShare * p.topDelta));
  }
  const sum = (a) => a.slice(1).reduce((x, y) => x + y, 0);
  const vals = s.values.slice(0, s.endIdx + 1);
  return {
    labels, base, scen, topShare, usesForecast: !!fc,
    sumBase: sum(base), sumScen: sum(scen),
    histGrowth: vals.length >= 2 && vals[0] > 0 && latest > 0 ? Math.pow(latest / vals[0], 1 / (vals.length - 1)) - 1 : null,
    requiredGrowth: p.target > 0 && latest > 0 && H > 0 ? Math.pow(p.target / latest, 1 / H) - 1 : null,
    gap: p.target ? p.target - scen[H] : null,
  };
}

// ── Insight items (cards in the UI AND facts for the narrative) ─────────────
function buildItems(ds, ins, o, d) {
  const it = [];
  const money = (v) => fmtMetric(v, metricInfo(ds, o.metric));
  const ml = o.metric === '__count' ? 'record count' : o.metric;
  const dn = o.dimKey ? dimTitle(ds, o.dimKey) : '';
  const pts = (x) => (x == null ? 'n/a' : (x > 0 ? '+' : '') + (x * 100).toFixed(1) + ' pts');
  const sg = (v) => (v >= 0 ? '+' : '') + money(v);
  const add = (id, kind, tone, title, text) => it.push({ id, kind, tone, title, text: String(text).slice(0, 290) });

  const d0 = d.drivers[0];
  if (d0) {
    add('drv_total', 'driver', d0.delta > 0 ? 'good' : d0.delta < 0 ? 'bad' : 'info', 'What moved the number',
      `${ml} went from ${money(d0.totalB)} in ${fmtPeriod(d0.prev)} to ${money(d0.totalA)} in ${fmtPeriod(d0.cur)} (${fmtSigned(d0.pct)}).`);
    const u = d0.up[0], dn0 = d0.down[0];
    if (u) add('drv_up', 'driver', 'good', `Biggest gain: ${u.label}`, `${u.label} (${d0.name}) changed by ${sg(u.delta)}, ${pts(u.pts)} of the overall move.`);
    if (dn0) add('drv_down', 'driver', 'bad', `Biggest drag: ${dn0.label}`, `${dn0.label} (${d0.name}) changed by ${sg(dn0.delta)}, ${pts(dn0.pts)} of the overall move.`);
    d.drivers.slice(1).forEach((x, i) => {
      const top = [...x.up.slice(0, 1), ...x.down.slice(0, 1)].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      if (top) add('drv_dim_' + i, 'driver', 'info', `By ${x.name}`, `Split by ${x.name}, the largest mover was ${top.label} (${sg(top.delta)}).`);
    });
  }

  const f = d.forecast;
  if (f.ok) {
    const p = f.points[0];
    add('fc_next', 'forecast', 'info', 'Next period outlook', `${fmtPeriod(p.label)} is projected at ${money(p.value)} (80% range ${money(p.lo)} to ${money(p.hi)}); reliability ${f.reliability}.`);
    add('fc_total', 'forecast', 'info', 'Outlook over the horizon', `Projected ${ml} over the next ${f.points.length} periods totals ${money(f.points.reduce((s, x) => s + x.value, 0))}.`);
    if (f.backtest) add('fc_rel', 'forecast', 'info', 'How far to trust it', `Tested on the last ${f.backtest.k} periods, the average error was ${fmtPct(f.backtest.mape)} versus ${fmtPct(f.backtest.naiveMape)} for repeating the last period. Method: ${f.method}.`);
  } else add('fc_none', 'forecast', 'warn', 'No forecast', f.reason);

  const pm = d.patterns.month;
  if (pm) add('pat_month', 'pattern', 'info', 'Seasonality by month', `${pm.peak.name} is typically the strongest month (index ${pm.peak.idx.toFixed(2)} against an average of 1.00) and ${pm.low.name} the weakest (${pm.low.idx.toFixed(2)})${pm.years < 2 ? '; less than 2 years of data, so treat as tentative' : ''}.`);
  const pw = d.patterns.weekday;
  if (pw) add('pat_weekday', 'pattern', 'info', 'Weekday rhythm', `${pw.peak.name} is typically the strongest weekday (index ${pw.peak.idx.toFixed(2)}) and ${pw.low.name} the weakest (${pw.low.idx.toFixed(2)}).`);
  d.patterns.correlations.slice(0, 2).forEach((c, i) =>
    add('pat_corr_' + i, 'pattern', 'info', `${c.a} and ${c.b}`, `${c.a} and ${c.b} move ${c.r > 0 ? 'together' : 'in opposite directions'} (r = ${c.r.toFixed(2)} across ${fmtInt(c.n)} records).`));

  const q = d.quadrant;
  if (q.ok) {
    const lab = (x) => `${x.label} (${fmtPct(x.share)} share, ${fmtSigned(x.growth)})`;
    const stars = q.items.filter((x) => x.cls === 'star');
    if (stars.length) add('quad_star', 'segment', 'good', 'Stars', `${stars.length} ${dn} values combine above-average share with above-average growth: ${stars.slice(0, 3).map(lab).join('; ')}.`);
    const watch = q.items.filter((x) => (x.cls === 'cow' || x.cls === 'laggard') && x.growth < q.refGrowth)[0];
    if (watch) add('quad_watch', 'segment', 'warn', `Watch ${watch.label}`, `${watch.label} holds ${fmtPct(watch.share)} of ${ml} but grew ${fmtSigned(watch.growth)} against ${fmtSigned(q.refGrowth)} overall.`);
    const rise = q.items.filter((x) => x.cls === 'question').sort((a, b) => b.growth - a.growth)[0];
    if (rise) add('quad_rise', 'segment', 'good', `Rising: ${rise.label}`, `${rise.label} has a small ${fmtPct(rise.share)} share but is growing ${fmtSigned(rise.growth)} against ${fmtSigned(q.refGrowth)} overall.`);
  }

  const op = d.opportunity;
  if (op) add('opp_upside', 'opportunity', 'good', 'Upside to the median',
    `If the ${op.below} ${dn} values below the median of ${money(op.median)} per record matched it, ${ml} would rise by about ${money(op.upside)} (${op.total > 0 ? fmtPct(op.upside / op.total) : 'n/a'} of the current total). Largest gaps: ${op.items.slice(0, 3).map((x) => x.label).join(', ')}.`);

  const c = ins.concentration[0];
  if (c && c.severity !== 'ok') add('risk_conc', 'risk', c.severity === 'high' ? 'bad' : 'warn', `Concentration in ${c.name}`, `"${c.topLabel}" holds ${fmtPct(c.top1)} of ${ml} and the top 3 hold ${fmtPct(c.top3)} (severity ${c.severity}).`);
  const dc = ins.declines[0];
  if (dc) add('risk_decl', 'risk', 'bad', `${dc.label} is slipping`, `${dc.label} fell for ${dc.streak} consecutive periods (${fmtSigned(dc.change)} overall).`);
  return it;
}

export function computeDeep(ds, mask, o, ins) {
  const dimKeys = [...new Set([o.dimKey, ...dimCandidates(ds)].filter(Boolean))].slice(0, 3);
  const s = ins.series;
  const deep = {
    drivers: s ? dimKeys.map((k) => drivers(ds, mask, o, ins, k)).filter(Boolean) : [],
    forecast: s ? forecast(s.labels.slice(0, s.endIdx + 1), s.values.slice(0, s.endIdx + 1), o.gran) : { ok: false, reason: 'No date column was detected, so no forecast is possible.' },
    quadrant: quadrant(ds, mask, o, ins),
    patterns: patterns(ds, mask, o),
    opportunity: opportunity(ds, mask, o, ins),
  };
  deep.items = buildItems(ds, ins, o, deep);
  return deep;
}
