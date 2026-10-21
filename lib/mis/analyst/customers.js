// lib/mis/analyst/customers.js
import { getDim, groupTotals, totalsOf, metricInfo, dimTitle } from '../engine.js';
import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod } from '../format.js';

function maskSig(mask) {
  let h = 0;
  for (let i = 0; i < mask.length; i += 137) h = (h * 31 + mask[i]) >>> 0;
  return h;
}

// A "customer" is a column that identifies a buyer: its name or the user's description says so, it is not a
// type/group/segment column, and it has enough distinct values that customers can repeat. No guessing from
// arbitrary columns: if nothing qualifies the Customers section stays hidden.
function findCustomerCol(ds, o, ctx) {
  const custRe = /customer|klant|client|account|buyer|debiteur|relatie/i;
  const notEntity = /(type|group|class|segment|categor|soort|status|region|channel|tier)/i;
  const pool = [...ds.cats, ...(ds.texts || [])].filter((c) => {
    const col = ds.cols[c];
    return col && col.dict && col.dict.length >= 10 && col.dict.length <= 0.8 * (col.nonNull || ds.n);
  });
  const byCard = (a, b) => ds.cols[b].dict.length - ds.cols[a].dict.length;
  const described = pool.filter((c) => /customer|client|klant|buyer|debtor/i.test(ctx?.schema?.[c]?.desc || '')).sort(byCard);
  if (described.length) return described[0];
  const named = pool.filter((c) => custRe.test(c) && !notEntity.test(c)).sort(byCard);
  return named[0] || null;
}

function bucketKey(t, g) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const pad = (n) => String(n).padStart(2, '0');
  if (g === 'month') return `${y}-${pad(m)}`;
  if (g === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  return String(y);
}

export function customers(ds, mask, o, ins, ctx = {}) {
  if (!ds.primaryDate) return null;
  const custCol = findCustomerCol(ds, o, ctx);
  if (!custCol || !ds.cols[custCol]) return null;

  const cacheKey = `cust_${o.metric}_${custCol}_${o.gran}_${maskSig(mask)}`;
  ds._an = ds._an || {};
  if (ds._an[cacheKey]) return ds._an[cacheKey];

  const metric = o.metric;
  const info = metricInfo(ds, metric);
  const money = (v) => fmtMetric(v, info);
  const g = o.gran;
  const items = [];
  const add = (id, text) => items.push({ id: `an_customers_${id}`, text: String(text).slice(0, 260) });

  const custDim = ds.cols[custCol];
  const dateDim = ds.cols[ds.primaryDate].data;
  const mdata = metric !== '__count' && ds.cols[metric] ? ds.cols[metric].data : null;

  // Single pass: build per-customer stats
  const K = custDim.dict ? custDim.dict.length : 0;
  if (K === 0) return null;

  const custSum = new Float64Array(K);
  const custCount = new Float64Array(K);
  const custFirstDate = new Float64Array(K).fill(Infinity);
  const custLastDate = new Float64Array(K).fill(-Infinity);

  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const c = custDim.codes[i];
    if (c < 0) continue;
    const t = dateDim[i];
    if (t !== t) continue;
    const v = mdata ? mdata[i] : 1;
    if (v !== v) continue;
    custSum[c] += v;
    custCount[c]++;
    if (t < custFirstDate[c]) custFirstDate[c] = t;
    if (t > custLastDate[c]) custLastDate[c] = t;
  }

  // Active customers
  const maxDate = ds.maxDate;
  const DAY = 864e5;
  // Lapsed = last activity > 2 periods ago (rough heuristic)
  const periodMs = { day: DAY, week: 7 * DAY, month: 30 * DAY, quarter: 90 * DAY, year: 365 * DAY }[g] || 30 * DAY;
  const lapsedThreshold = maxDate - 2 * periodMs;

  let newCount = 0, repeatCount = 0, lapsedCount = 0, activeCount = 0;
  const minDataDate = ds.minDate;
  const newThreshold = minDataDate + periodMs; // "new" = first seen in first period

  for (let c = 0; c < K; c++) {
    if (custCount[c] === 0) continue;
    activeCount++;
    if (custFirstDate[c] > newThreshold) newCount++;
    if (custCount[c] >= 2) repeatCount++;
    if (custLastDate[c] < lapsedThreshold) lapsedCount++;
  }

  add('base', `${fmtInt(activeCount)} unique customers analysed; new: ${fmtInt(newCount)}, repeat (≥2 purchases): ${fmtInt(repeatCount)}, lapsed (no recent activity): ${fmtInt(lapsedCount)}.`);

  // ── RFM quintiles ───────────────────────────────────────────────────────
  const activeCusts = [];
  for (let c = 0; c < K; c++) {
    if (custCount[c] === 0) continue;
    activeCusts.push({ code: c, label: custDim.dict[c], sum: custSum[c], freq: custCount[c], lastDate: custLastDate[c] });
  }
  // Sort for quintiling
  const quintile = (arr, val) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = sorted.findIndex((v) => v >= val);
    return Math.min(5, Math.floor((pos / sorted.length) * 5) + 1);
  };
  const allSums = activeCusts.map((c) => c.sum);
  const allFreqs = activeCusts.map((c) => c.freq);
  const allRecency = activeCusts.map((c) => maxDate - c.lastDate);

  // Score 1-5: higher monetary/freq = better; lower recency gap = better (recency reversed)
  const rfmScored = activeCusts.map((c) => {
    const R = 6 - quintile(allRecency, maxDate - c.lastDate); // invert: lower gap = higher score
    const F = quintile(allFreqs, c.freq);
    const M = quintile(allSums, c.sum);
    return { ...c, R, F, M, rfm: R + F + M };
  });
  rfmScored.sort((a, b) => b.rfm - a.rfm);

  const champions = rfmScored.filter((c) => c.R >= 4 && c.F >= 4 && c.M >= 4);
  const atRisk = rfmScored.filter((c) => c.R <= 2 && c.M >= 4);
  add('rfm_champ', `RFM champions (high recency, frequency and monetary value): ${fmtInt(champions.length)} customers (${fmtPct(champions.length / activeCount)}).`);
  if (atRisk.length) add('rfm_atrisk', `At-risk high-value customers (low recency, high monetary): ${fmtInt(atRisk.length)} (${fmtPct(atRisk.length / activeCount)}). Indicative only.`);

  // ── Concentration: top customers ────────────────────────────────────────
  rfmScored.sort((a, b) => b.sum - a.sum);
  const totalVal = rfmScored.reduce((s, c) => s + c.sum, 0);
  const top1Val = rfmScored[0]?.sum || 0;
  const top5Val = rfmScored.slice(0, 5).reduce((s, c) => s + c.sum, 0);
  const top10Val = rfmScored.slice(0, 10).reduce((s, c) => s + c.sum, 0);
  add('concentration', `Top customer "${rfmScored[0]?.label}" holds ${fmtPct(totalVal ? top1Val / totalVal : 0)} of ${metric}; top 5: ${fmtPct(totalVal ? top5Val / totalVal : 0)}; top 10: ${fmtPct(totalVal ? top10Val / totalVal : 0)}.`);

  // ── Average order value ─────────────────────────────────────────────────
  const aov = activeCount > 0 ? totalVal / rfmScored.reduce((s, c) => s + c.freq, 0) : 0;
  add('aov', `Average transaction value across all customers: ${money(aov)} (${money(totalVal)} total over ${fmtInt(rfmScored.reduce((s, c) => s + c.freq, 0))} transactions).`);

  // ── Simple cohort retention (first-purchase month, limit 12 cohorts) ────
  if (!ds.yearless && g === 'month') {
    const cohortMap = new Map(); // cohortPeriod -> { custCode -> Set<period> }
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i]) continue;
      const c = custDim.codes[i];
      if (c < 0) continue;
      const t = dateDim[i];
      if (t !== t) continue;
      const period = bucketKey(t, 'month');
      const firstPeriod = bucketKey(custFirstDate[c], 'month');
      if (!cohortMap.has(firstPeriod)) cohortMap.set(firstPeriod, new Map());
      const cohort = cohortMap.get(firstPeriod);
      if (!cohort.has(c)) cohort.set(c, new Set());
      cohort.get(c).add(period);
    }
    const cohortKeys = [...cohortMap.keys()].sort().slice(-12);
    const retentionRates = [];
    for (const ck of cohortKeys) {
      const cohort = cohortMap.get(ck);
      const size = cohort.size;
      if (size < 2) continue;
      // Month 1 retention (returned in 2nd month of cohort)
      const [cy, cm] = ck.split('-').map(Number);
      const nextPeriod = `${cy}-${String(cm + 1 > 12 ? cm - 11 : cm + 1).padStart(2, '0')}`;
      let retained = 0;
      for (const [, periods] of cohort) {
        if (periods.has(nextPeriod)) retained++;
      }
      retentionRates.push({ cohort: ck, size, retained, rate: retained / size });
    }
    if (retentionRates.length >= 2) {
      const avgRetention = retentionRates.reduce((s, r) => s + r.rate, 0) / retentionRates.length;
      const best = retentionRates.reduce((a, b) => (b.rate > a.rate ? b : a));
      add('cohort', `Cohort month-1 retention (avg over ${retentionRates.length} cohorts): ${fmtPct(avgRetention)}. Best cohort: ${fmtPeriod(best.cohort)} at ${fmtPct(best.rate)} (${fmtInt(best.retained)} of ${fmtInt(best.size)}). Indicative only.`);
    }
  }

  const result = {
    key: 'customers',
    confidence: activeCount >= 30 ? 'high' : activeCount >= 10 ? 'medium' : 'low',
    data: {
      customerCol: custCol,
      activeCount,
      newCount,
      repeatCount,
      lapsedCount,
      totalVal,
      aov,
      top5Share: totalVal ? top5Val / totalVal : 0,
      champions: champions.length,
      atRisk: atRisk.length,
      topCustomers: rfmScored.slice(0, 10).map((c) => ({ label: c.label, value: c.sum, freq: c.freq, R: c.R, F: c.F, M: c.M })),
    },
    items: items.slice(0, 12),
  };

  ds._an[cacheKey] = result;
  return result;
}
