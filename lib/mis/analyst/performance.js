// lib/mis/analyst/performance.js
import { getDim, groupTotals, totalsOf, seriesAnalytics, bucketKey, addPeriod, metricInfo } from '../engine.js';
import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod, MONTH_NAMES } from '../format.js';
import { forecast } from '../forecast.js';

const DAY = 864e5;

function maskSig(mask) {
  let h = 0;
  for (let i = 0; i < mask.length; i += 137) h = (h * 31 + mask[i]) >>> 0;
  return h;
}

export function performance(ds, mask, o, ins, ctx = {}) {
  if (!ds.primaryDate || !ins.series) return null;
  const metric = o.metric;
  const info = metricInfo(ds, metric);
  const money = (v) => fmtMetric(v, info);
  const g = o.gran;

  const cacheKey = `perf_${metric}_${g}_${maskSig(mask)}`;
  if (ds._an && ds._an[cacheKey]) {
    return ds._an[cacheKey];
  }

  const s = ins.series;
  const labels = s.labels;
  const values = s.values;
  const endIdx = s.analytics.endIdx;
  const P = endIdx + 1; // number of complete periods

  if (P < 2) return null;

  const items = [];
  const add = (id, text) => {
    const t = String(text).slice(0, 260);
    if (t) items.push({ id: `an_performance_${id}`, text: t });
  };

  // ── MoM / QoQ / YoY comparisons ────────────────────────────────────────
  const comps = s.analytics.comps;
  for (const c of comps) {
    if (ds.yearless && c.key === 'yoy') continue;
    add(`comp_${c.key}`, `${c.label}: ${money(c.cur)}${c.curLabel ? ` (${fmtPeriod(c.curLabel)})` : ''} vs ${money(c.prev)}${c.prevLabel ? ` (${fmtPeriod(c.prevLabel)})` : ''}, change ${fmtSigned(c.change)}.`);
  }

  // ── YTD vs prior YTD (month/day gran, non-yearless) ────────────────────
  if (!ds.yearless && (g === 'month' || g === 'day' || g === 'week')) {
    const dateCol = ds.cols[ds.primaryDate].data;
    let ytdCur = 0, ytdPrior = 0, nCur = 0, nPrior = 0;
    const now = new Date(ds.maxDate);
    const curYear = now.getUTCFullYear();
    const dayOfYear = (t) => {
      const d = new Date(t);
      return Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY);
    };
    const curDoy = dayOfYear(ds.maxDate);
    const mdata = metric !== '__count' && ds.cols[metric] ? ds.cols[metric].data : null;
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i]) continue;
      const t = dateCol[i];
      if (t !== t) continue;
      const d = new Date(t);
      const yr = d.getUTCFullYear();
      const doy = dayOfYear(t);
      const v = mdata ? mdata[i] : 1;
      if (v !== v) continue;
      if (yr === curYear && doy <= curDoy) { ytdCur += v; nCur++; }
      else if (yr === curYear - 1 && doy <= curDoy) { ytdPrior += v; nPrior++; }
    }
    if (nCur > 0 && nPrior > 0) {
      const ytdChg = ytdPrior ? (ytdCur - ytdPrior) / Math.abs(ytdPrior) : null;
      add('ytd', `YTD ${curYear}: ${money(ytdCur)} vs same period ${curYear - 1}: ${money(ytdPrior)}${ytdChg != null ? `, change ${fmtSigned(ytdChg)}` : ''}.`);
    }
  }

  // ── Rolling averages (3 / 6 / 12) ──────────────────────────────────────
  const roll = (n) => {
    if (P < n) return null;
    let s = 0;
    for (let i = endIdx - n + 1; i <= endIdx; i++) s += values[i];
    return s / n;
  };
  const r3 = roll(3), r6 = roll(6), r12 = roll(12);
  if (r3 != null) add('roll3', `Rolling 3-${g} average: ${money(r3)} per period.`);
  if (r6 != null) add('roll6', `Rolling 6-${g} average: ${money(r6)} per period.`);
  if (r12 != null) add('roll12', `Rolling 12-${g} average: ${money(r12)} per period.`);

  // ── Run-rate (annualised from last 3 complete periods) ─────────────────
  const periodsPerYear = { day: 365, week: 52, month: 12, quarter: 4, year: 1 }[g];
  if (periodsPerYear > 1 && P >= 3) {
    const recentN = Math.min(3, P);
    let recentSum = 0;
    for (let i = endIdx - recentN + 1; i <= endIdx; i++) recentSum += values[i];
    const runRate = (recentSum / recentN) * periodsPerYear;
    add('runrate', `Annualised run-rate (last ${recentN} complete ${g}s): ${money(runRate)}.`);
  }

  // ── Best and worst period ───────────────────────────────────────────────
  let bestVal = -Infinity, worstVal = Infinity, bestIdx = 0, worstIdx = 0;
  for (let i = 0; i <= endIdx; i++) {
    if (values[i] > bestVal) { bestVal = values[i]; bestIdx = i; }
    if (values[i] < worstVal) { worstVal = values[i]; worstIdx = i; }
  }
  add('best', `Best ${g}: ${fmtPeriod(labels[bestIdx])} at ${money(bestVal)}.`);
  add('worst', `Worst ${g}: ${fmtPeriod(labels[worstIdx])} at ${money(worstVal)}.`);

  // ── Streaks (consecutive growth / decline) ──────────────────────────────
  let growStreak = 0, declStreak = 0;
  for (let i = endIdx; i > 0; i--) {
    if (values[i] > values[i - 1]) { if (declStreak === 0) growStreak++; else break; }
    else if (values[i] < values[i - 1]) { if (growStreak === 0) declStreak++; else break; }
    else break;
  }
  if (growStreak >= 2) add('streak_up', `Current growth streak: ${growStreak} consecutive ${g}s of increase (last at ${fmtPeriod(labels[endIdx])}).`);
  if (declStreak >= 2) add('streak_down', `Current decline streak: ${declStreak} consecutive ${g}s of decrease (last at ${fmtPeriod(labels[endIdx])}).`);

  // ── Momentum (acceleration of growth: is the rate of change itself growing?) ──
  if (P >= 4) {
    const pop = s.analytics.pop;
    const recentPops = pop.slice(Math.max(1, endIdx - 2), endIdx + 1).filter((v) => v != null);
    if (recentPops.length >= 2) {
      const accel = recentPops[recentPops.length - 1] - recentPops[0];
      const dir = Math.abs(accel) < 0.01 ? 'stable' : accel > 0 ? 'accelerating' : 'decelerating';
      add('momentum', `Growth momentum over recent ${g}s is ${dir} (period-over-period rate changed by ${fmtSigned(accel)}).`);
    }
  }

  // ── Target gap ─────────────────────────────────────────────────────────
  const target = ctx.target != null ? Number(ctx.target) : null;
  if (target != null && isFinite(target)) {
    const latest = values[endIdx];
    const gap = target - latest;
    const gapPct = latest ? gap / Math.abs(latest) : null;
    add('target', `Target: ${money(target)}; latest ${g} ${money(latest)}; gap ${money(gap)}${gapPct != null ? ` (${fmtSigned(gapPct)})` : ''}.`);
  }

  // ── Seasonal index per calendar month (>= 2 cycles needed) ─────────────
  let confidence = 'high';
  let seasonal = null;
  if (!ds.yearless && g === 'month' && P >= 24) {
    // Build monthly totals from the series values (already monthly buckets)
    const monthSums = new Float64Array(12);
    const monthCounts = new Float64Array(12);
    for (let i = 0; i <= endIdx; i++) {
      const m = /^(\d{4})-(\d{2})$/.exec(labels[i]);
      if (m) {
        const mo = +m[2] - 1;
        monthSums[mo] += values[i];
        monthCounts[mo]++;
      }
    }
    const avgs = monthSums.map((s, i) => (monthCounts[i] > 0 ? s / monthCounts[i] : 0));
    const mean = avgs.reduce((a, b) => a + b, 0) / 12;
    if (mean > 0) {
      const idx = avgs.map((v) => v / mean);
      const peakMo = idx.indexOf(Math.max(...idx));
      const lowMo = idx.indexOf(Math.min(...idx));
      seasonal = { peak: MONTH_NAMES[peakMo], peakIdx: idx[peakMo], low: MONTH_NAMES[lowMo], lowIdx: idx[lowMo] };
      add('seasonal', `Seasonal index: ${seasonal.peak} is typically the strongest month (index ${seasonal.peakIdx.toFixed(2)}) and ${seasonal.low} the weakest (${seasonal.lowIdx.toFixed(2)}). Based on ${Math.floor(P / 12)} full cycles.`);
    }
  } else if (g === 'month' && P < 24) {
    confidence = 'low';
    add('seasonal_low', `Seasonal index requires ≥ 24 monthly periods; only ${P} complete ${g}s available. Indicative only.`);
  }

  // ── Projection ─────────────────────────────────────────────────────────
  const proj = s.analytics.projection;
  if (proj) {
    const dir = Math.abs(proj.slope) < 1e-9 ? 'flat' : proj.slope > 0 ? 'upward' : 'downward';
    add('projection', `Linear trend over the last ${proj.basis} ${g}s is ${dir}; next-${g} indicative projection: ${money(proj.values[0])}. Indicative only.`);
  }

  const data = {
    gran: g,
    metric,
    labels: labels.slice(0, endIdx + 1),
    values: values.slice(0, endIdx + 1),
    comps,
    rolling: { r3, r6, r12 },
    best: { label: labels[bestIdx], value: bestVal },
    worst: { label: labels[worstIdx], value: worstVal },
    streaks: { growth: growStreak, decline: declStreak },
    seasonal,
    projection: proj ? { slope: proj.slope, next: proj.values[0] } : null,
  };

  const result = {
    key: 'performance',
    confidence,
    data,
    items: items.slice(0, 12),
  };

  ds._an = ds._an || {};
  ds._an[cacheKey] = result;
  return result;
}
