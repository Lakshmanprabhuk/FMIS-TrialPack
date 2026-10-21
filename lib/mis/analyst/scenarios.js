// lib/mis/analyst/scenarios.js
import { groupTotals, totalsOf, metricInfo, dimTitle } from '../engine.js';
import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod } from '../format.js';
import { forecast } from '../forecast.js';

function maskSig(mask) {
  let h = 0;
  for (let i = 0; i < mask.length; i += 137) h = (h * 31 + mask[i]) >>> 0;
  return h;
}

export function scenarios(ds, mask, o, ins, ctx = {}) {
  if (!ins.series || ins.series.endIdx < 5) return null;
  const metric = o.metric;
  const info = metricInfo(ds, metric);
  const money = (v) => fmtMetric(v, info);
  const g = o.gran;

  const cacheKey = `scen_${metric}_${g}_${maskSig(mask)}`;
  ds._an = ds._an || {};
  if (ds._an[cacheKey]) return ds._an[cacheKey];

  const s = ins.series;
  const endIdx = s.analytics.endIdx;
  const fcLabels = s.labels.slice(0, endIdx + 1);
  const fcValues = s.values.slice(0, endIdx + 1);

  const fc = forecast(fcLabels, fcValues, g);
  if (!fc.ok) return null;

  const items = [];
  const add = (id, text) => items.push({ id: `an_scenarios_${id}`, text: String(text).slice(0, 260) });

  // ── Base / Best / Worst for next 3 periods ─────────────────────────────
  const horizon = Math.min(3, fc.points.length);
  const bt = fc.backtest;
  const errorBand = bt ? bt.mape : 0.1; // fallback 10%

  const scenarios_out = fc.points.slice(0, horizon).map((pt, i) => {
    const base = pt.value;
    const best = base * (1 + errorBand);
    const worst = Math.max(0, base * (1 - errorBand));
    return { label: pt.label, base, best, worst, lo: pt.lo, hi: pt.hi };
  });

  for (const [i, sc] of scenarios_out.entries()) {
    const backtestNote = bt ? ` (backtest MAPE ${fmtPct(bt.mape)})` : ' (no backtest available)';
    add(`period_${i}`, `${fmtPeriod(sc.label)}: base ${money(sc.base)}, best-case ${money(sc.best)}, worst-case ${money(sc.worst)}${i === 0 ? backtestNote : ''}. Indicative only.`);
  }

  add('method', `Forecast method: ${fc.method}; reliability ${fc.reliability}; based on ${fc.n} complete ${g}s.`);
  if (fc.seasonal) add('seasonal', `Seasonal adjustment applied; pattern detected in historical data.`);

  // ── Sensitivity of next period to +/-5% and +/-10% in largest segment ──
  const nextBase = scenarios_out[0]?.base;
  if (nextBase && o.dimKey) {
    const grps = groupTotals(ds, mask, o.dimKey, metric).filter((x) => x.value > 0);
    if (grps.length >= 2) {
      const top = grps[0];
      const total = grps.reduce((s, x) => s + x.value, 0);
      const topShare = total ? top.value / total : 0;

      for (const pct of [0.05, 0.10]) {
        const upside = nextBase * topShare * pct;
        const downside = -upside;
        add(`sensitivity_${pct * 100}`, `Sensitivity: a ${fmtPct(pct)} change in "${top.label}" (${fmtPct(topShare)} of total) shifts the next-${g} outlook by ±${money(upside)} (about ${fmtPct(nextBase > 0 ? upside / nextBase : 0)} of the total). Indicative only.`);
      }
    }
  }

  // ── Assumptions note ────────────────────────────────────────────────────
  add('assumptions', `Assumptions: best-case = trend + 1 backtest error band (${fmtPct(errorBand)}); worst-case = trend - 1 band. No external events are modelled. Indicative only.`);

  const result = {
    key: 'scenarios',
    confidence: fc.reliability,
    data: {
      metric,
      gran: g,
      method: fc.method,
      reliability: fc.reliability,
      seasonal: fc.seasonal,
      n: fc.n,
      backtest: fc.backtest,
      scenarios: scenarios_out,
      horizon,
      errorBand,
    },
    items: items.slice(0, 12),
  };

  ds._an[cacheKey] = result;
  return result;
}
