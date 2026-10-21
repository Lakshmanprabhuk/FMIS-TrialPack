// lib/mis/analyst/risk.js
import { getDim, groupTotals, totalsOf, metricInfo, dimTitle, dimCandidates } from '../engine.js';
import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod } from '../format.js';

function maskSig(mask) {
  let h = 0;
  for (let i = 0; i < mask.length; i += 137) h = (h * 31 + mask[i]) >>> 0;
  return h;
}

function percentile(sorted, p) {
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function risk(ds, mask, o, ins, ctx = {}) {
  if (o.metric === '__count' && ds.numeric.length === 0) return null;
  const metric = o.metric;
  const info = metricInfo(ds, metric);
  const money = (v) => fmtMetric(v, info);
  const mdata = metric !== '__count' && ds.cols[metric] ? ds.cols[metric].data : null;
  if (!mdata) return null;

  const cacheKey = `risk_${metric}_${o.dimKey || ''}_${o.gran}_${maskSig(mask)}`;
  ds._an = ds._an || {};
  if (ds._an[cacheKey]) return ds._an[cacheKey];

  const items = [];
  const add = (id, text) => items.push({ id: `an_risk_${id}`, text: String(text).slice(0, 260) });

  // ── Distribution stats (single pass) ───────────────────────────────────
  const vals = [];
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const v = mdata[i];
    if (v === v) vals.push(v);
  }
  if (vals.length < 5) return null;

  vals.sort((a, b) => a - b);
  const n = vals.length;
  const p5 = percentile(vals, 0.05);
  const p25 = percentile(vals, 0.25);
  const med = percentile(vals, 0.5);
  const p75 = percentile(vals, 0.75);
  const p95 = percentile(vals, 0.95);
  const iqr = p75 - p25;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const cv = mean !== 0 ? std / Math.abs(mean) : null;

  // Skewness (Pearson approximation)
  const skew = std > 0 ? (3 * (mean - med)) / std : 0;
  const skewDir = Math.abs(skew) < 0.5 ? 'roughly symmetric' : skew > 0 ? 'right-skewed (long upper tail)' : 'left-skewed (long lower tail)';

  // IQR outlier fences
  const lowerFence = p25 - 1.5 * iqr;
  const upperFence = p75 + 1.5 * iqr;
  const outlierCount = vals.filter((v) => v < lowerFence || v > upperFence).length;

  add('distribution', `${metric} distribution (${fmtInt(n)} records): p5 ${money(p5)}, p25 ${money(p25)}, median ${money(med)}, p75 ${money(p75)}, p95 ${money(p95)}; IQR ${money(iqr)}, ${skewDir}.`);
  add('fences', `IQR outlier fences: lower ${money(lowerFence)}, upper ${money(upperFence)}; ${fmtInt(outlierCount)} records (${fmtPct(outlierCount / n)}) fall outside these bounds.`);
  if (cv != null) add('cv', `Coefficient of variation (std/mean): ${fmtPct(cv)} — ${cv > 1 ? 'high' : cv > 0.5 ? 'moderate' : 'low'} dispersion.`);

  // ── Volatility ranking by segment ──────────────────────────────────────
  const dimKeys = [...new Set([o.dimKey, ...dimCandidates(ds)].filter(Boolean))].slice(0, 3);
  const volatilityRanks = [];
  for (const dimKey of dimKeys) {
    const dim = getDim(ds, dimKey);
    const K = dim.labels.length;
    // Per-segment CV
    const segMean = new Float64Array(K);
    const segM2 = new Float64Array(K);
    const segN = new Float64Array(K);
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i]) continue;
      const c = dim.codes[i];
      if (c < 0) continue;
      const v = mdata[i];
      if (v !== v) continue;
      segN[c]++;
      const delta = v - segMean[c];
      segMean[c] += delta / segN[c];
      segM2[c] += delta * (v - segMean[c]);
    }
    for (let c = 0; c < K; c++) {
      if (segN[c] < 5) continue;
      const segStd = Math.sqrt(segM2[c] / (segN[c] - 1));
      const segCv = segMean[c] !== 0 ? segStd / Math.abs(segMean[c]) : null;
      if (segCv != null) volatilityRanks.push({ dim: dimKey, label: dim.labels[c], cv: segCv, mean: segMean[c] });
    }
  }
  volatilityRanks.sort((a, b) => b.cv - a.cv);
  if (volatilityRanks.length >= 2) {
    const top = volatilityRanks[0];
    add('volatility', `Most volatile segment: "${top.label}" (${dimTitle(ds, top.dim)}) with CV ${fmtPct(top.cv)} around mean ${money(top.mean)}.`);
  }

  // ── Anomaly root cause ─────────────────────────────────────────────────
  if (ins.anomalies?.length && o.dimKey && ins.series) {
    const s = ins.series;
    for (let ai = 0; ai < Math.min(2, ins.anomalies.length); ai++) {
      const anom = ins.anomalies[ai];
      const anomPeriod = anom.label;
      // Restrict mask to that period
      if (!ds.primaryDate) continue;
      const dateDim = ds.cols[ds.primaryDate].data;
      const mAnom = new Uint8Array(ds.n);
      const mNorm = new Uint8Array(ds.n);
      for (let i = 0; i < ds.n; i++) {
        if (!mask[i]) continue;
        const t = dateDim[i];
        if (t !== t) continue;
        const bk = bucketKeyLocal(t, o.gran);
        if (bk === anomPeriod) mAnom[i] = 1;
        else mNorm[i] = 1;
      }
      const grpAnom = groupTotals(ds, mAnom, o.dimKey, metric);
      const grpNorm = groupTotals(ds, mNorm, o.dimKey, metric);
      const mapNorm = new Map(grpNorm.map((x) => [x.label, x.value / (s.labels.length - 1)]));
      const drivers = grpAnom
        .map((x) => ({ label: x.label, anom: x.value, norm: mapNorm.get(x.label) || 0 }))
        .map((x) => ({ ...x, delta: x.anom - x.norm }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3);
      if (drivers.length) {
        add(`anom_root_${ai}`, `Anomaly in ${fmtPeriod(anomPeriod)} (value ${money(anom.value)}): top driver "${drivers[0].label}" contributed ${money(drivers[0].anom)} vs avg ${money(drivers[0].norm)}.`);
      }
    }
  }

  // ── HHI / Dependence by dimension ──────────────────────────────────────
  for (const [di, dimKey] of dimKeys.slice(0, 2).entries()) {
    const grp = groupTotals(ds, mask, dimKey, metric).filter((x) => x.value > 0);
    const tot = grp.reduce((s, x) => s + x.value, 0);
    if (!tot || grp.length < 2) continue;
    const hhi = grp.reduce((s, x) => s + (x.value / tot) ** 2, 0);
    const top1 = grp[0].value / tot;
    const sev = hhi >= 0.25 || top1 >= 0.5 ? 'high' : hhi >= 0.15 || top1 >= 0.3 ? 'medium' : 'low';
    add(`hhi_${di}`, `Dependence (HHI) by ${dimTitle(ds, dimKey)}: ${hhi.toFixed(3)} (${sev} concentration); top segment "${grp[0].label}" holds ${fmtPct(top1)}.`);
  }

  // ── Data quality impact ─────────────────────────────────────────────────
  const { dupes, missingCells } = ds.stats;
  const tot = totalsOf(ds, mask, metric);

  // Impact of duplicates
  let dupImpact = 0;
  if (dupes > 0) {
    const noDupMask = new Uint8Array(ds.n);
    for (let i = 0; i < ds.n; i++) if (mask[i] && !ds.dupFlag[i]) noDupMask[i] = 1;
    const noDupTot = totalsOf(ds, noDupMask, metric);
    dupImpact = tot.sum - noDupTot.sum;
    if (Math.abs(dupImpact) > 0) add('dup_impact', `Removing ${fmtInt(dupes)} duplicate rows changes total ${metric} by ${money(dupImpact)} (${fmtSigned(tot.sum ? dupImpact / Math.abs(tot.sum) : 0)}). Indicative only.`);
  }

  // Impact of negatives
  const negCount = vals.filter((v) => v < 0).length;
  const negSum = vals.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  if (negCount > 0) add('negatives', `${fmtInt(negCount)} records have negative ${metric} values totalling ${money(negSum)}; excluding them would change the total by ${money(-negSum)}.`);

  // Blank impact
  const colInfo = ds.cols[metric];
  if (colInfo && colInfo.missing > 0) {
    add('blanks', `${fmtInt(colInfo.missing)} records have blank ${metric} values and are excluded from totals; data completeness: ${fmtPct(1 - colInfo.missing / ds.n)}.`);
  }

  const result = {
    key: 'risk',
    confidence: n >= 100 ? 'high' : n >= 30 ? 'medium' : 'low',
    data: {
      metric,
      n,
      p5, p25, median: med, p75, p95, iqr,
      mean, std, cv,
      skew, skewDir,
      lowerFence, upperFence,
      outlierCount,
      volatilityRanks: volatilityRanks.slice(0, 10),
      dupImpact,
      negCount,
      negSum,
    },
    items: items.slice(0, 12),
  };

  ds._an[cacheKey] = result;
  return result;
}

function bucketKeyLocal(t, g) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const pad = (n) => String(n).padStart(2, '0');
  if (g === 'day') return d.toISOString().slice(0, 10);
  if (g === 'week') return new Date(t - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  if (g === 'month') return `${y}-${pad(m)}`;
  if (g === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  return String(y);
}
