// lib/mis/analyst/recommend.js
import { metricInfo, dimTitle } from '../engine.js';
import { fmtMetric, fmtPct, fmtInt } from '../format.js';

let _recId = 0;
const uid = () => `an_rec_${++_recId}`;

export function recommend(allModules, ds, o, ins, ctx = {}) {
  const metric = o.metric;
  const info = metricInfo(ds, metric);
  const money = (v) => fmtMetric(v, info);
  const recs = [];
  const items = [];

  const add = (id, text) => items.push({ id, text: String(text).slice(0, 260) });

  const {
    performance: perf,
    growth: grw,
    customers: cust,
    products: prod,
    risk: rsk,
    scenarios: scen,
  } = allModules;

  // ── From performance ────────────────────────────────────────────────────
  if (perf?.data) {
    const pd = perf.data;
    if (pd.streaks?.decline >= 2) {
      const id = uid();
      const r = {
        id, title: `Reverse ${pd.streaks.decline}-${pd.gran} decline in ${metric}`,
        why: `${metric} has declined for ${pd.streaks.decline} consecutive ${pd.gran}s; latest value ${money(pd.values[pd.values.length - 1])}.`,
        impact: 'high', effort: 'medium', owner_hint: 'Sales / Operations',
        sizeText: pd.worst ? `Worst period was ${money(pd.worst.value)}` : 'not sizeable from this data',
      };
      recs.push(r);
      add(id, `Reverse ${pd.streaks.decline}-${pd.gran} decline: ${metric} fell consecutively. Latest: ${money(pd.values[pd.values.length - 1])}.`);
    }

    if (pd.best && pd.worst && pd.best.value > 0 && pd.worst.value >= 0) {
      const gap = pd.best.value - pd.worst.value;
      if (gap > 0) {
        const id = uid();
        recs.push({
          id, title: `Replicate best-${pd.gran} conditions`,
          why: `Best ${pd.gran} (${money(pd.best.value)}) exceeded worst (${money(pd.worst.value)}) by ${money(gap)}; closing half that gap is worth ${money(gap / 2)}.`,
          impact: 'medium', effort: 'medium', owner_hint: 'Strategy / Operations',
          sizeText: `Closing half of best-vs-worst gap ≈ ${money(gap / 2)}`,
        });
        add(id, `Best ${pd.gran} ${money(pd.best.value)} vs worst ${money(pd.worst.value)}; closing half the gap worth ${money(gap / 2)}.`);
      }
    }
  }

  // ── From growth ─────────────────────────────────────────────────────────
  if (grw?.data) {
    const gd = grw.data;
    const dn = o.dimKey ? dimTitle(ds, o.dimKey) : 'segment';
    if (gd.lostSegs > 0 && gd.lostVal > 0) {
      const id = uid();
      recs.push({
        id, title: `Re-engage ${gd.lostSegs} lost ${dn} values`,
        why: `${gd.lostSegs} ${dn} values dropped to zero, losing ${money(gd.lostVal)}.`,
        impact: gd.lostVal > gd.retVal * 0.1 ? 'high' : 'medium',
        effort: 'medium', owner_hint: 'Sales / Account Management',
        sizeText: `Recovering 50% of lost ${dn} revenue ≈ ${money(gd.lostVal / 2)}`,
      });
      add(id, `${gd.lostSegs} ${dn} values lost totalling ${money(gd.lostVal)}; recovering 50% ≈ ${money(gd.lostVal / 2)}.`);
    }

    if (gd.deltaPct != null && gd.deltaPct < -0.05) {
      const id = uid();
      recs.push({
        id, title: `Address overall ${metric} decline`,
        why: `${metric} fell ${fmtPct(Math.abs(gd.deltaPct))} period-over-period (${money(gd.prev.total)} → ${money(gd.cur.total)}).`,
        impact: 'high', effort: 'medium', owner_hint: 'Leadership',
        sizeText: `Reversing decline worth ${money(Math.abs(gd.delta))} per period`,
      });
      add(id, `${metric} down ${fmtPct(Math.abs(gd.deltaPct))} (${money(gd.prev.total)} → ${money(gd.cur.total)}); recovery worth ${money(Math.abs(gd.delta))}/period.`);
    }
  }

  // ── From customers ──────────────────────────────────────────────────────
  if (cust?.data) {
    const cd = cust.data;
    if (cd.atRisk > 0 && cd.totalVal > 0) {
      const atRiskVal = cd.atRisk * (cd.totalVal / Math.max(1, cd.activeCount));
      const id = uid();
      recs.push({
        id, title: `Retain ${cd.atRisk} at-risk high-value customers`,
        why: `${cd.atRisk} customers show high monetary value but low recency; estimated at-risk revenue ${money(atRiskVal)}.`,
        impact: 'high', effort: 'low', owner_hint: 'Customer Success',
        sizeText: `Retaining 50% of at-risk value ≈ ${money(atRiskVal / 2)}. Indicative only`,
      });
      add(id, `${cd.atRisk} at-risk high-value customers; estimated at-risk revenue ${money(atRiskVal)}; retaining 50% ≈ ${money(atRiskVal / 2)}.`);
    }

    if (cd.top5Share > 0.6) {
      const id = uid();
      recs.push({
        id, title: `Reduce customer concentration risk`,
        why: `Top 5 customers hold ${fmtPct(cd.top5Share)} of ${metric}. A single churn event has outsized impact.`,
        impact: 'high', effort: 'high', owner_hint: 'Sales / Customer Success',
        sizeText: 'not sizeable from this data',
      });
      add(id, `Top 5 customers hold ${fmtPct(cd.top5Share)} of ${metric}; diversification reduces churn risk.`);
    }
  }

  // ── From products ───────────────────────────────────────────────────────
  if (prod?.data) {
    const pd = prod.data;
    if (pd.basketPairs?.length > 0) {
      const bp = pd.basketPairs[0];
      const id = uid();
      recs.push({
        id, title: `Cross-sell "${bp.a}" with "${bp.b}"`,
        why: `These products co-occur in ${fmtPct(bp.support)} of orders with lift ${bp.lift.toFixed(2)}×.`,
        impact: 'medium', effort: 'low', owner_hint: 'Marketing / Sales',
        sizeText: 'not sizeable from this data',
      });
      add(id, `Cross-sell pair "${bp.a}"+"${bp.b}": ${fmtPct(bp.support)} of orders, lift ${bp.lift.toFixed(2)}×.`);
    }

    if (pd.portfolio?.length) {
      const laggards = pd.portfolio.filter((x) => x.growth != null && x.growth < -0.1).slice(0, 2);
      if (laggards.length) {
        const id = uid();
        recs.push({
          id, title: `Review declining products: ${laggards.map((x) => x.label).join(', ')}`,
          why: `These products show >10% decline; consider rationalisation or reinvestment.`,
          impact: 'medium', effort: 'medium', owner_hint: 'Product / Marketing',
          sizeText: 'not sizeable from this data',
        });
        add(id, `Declining products: ${laggards.map((x) => `${x.label} (${fmtSigned(x.growth)})`).join(', ')}. Review or rationalise.`);
      }
    }
  }

  // ── From risk ───────────────────────────────────────────────────────────
  if (rsk?.data) {
    const rd = rsk.data;
    if (rd.negCount > 0) {
      const id = uid();
      recs.push({
        id, title: `Investigate ${fmtInt(rd.negCount)} negative ${metric} records`,
        why: `${fmtInt(rd.negCount)} records have negative ${metric} totalling ${money(rd.negSum)}; may indicate returns, errors or reversals.`,
        impact: 'medium', effort: 'low', owner_hint: 'Finance / Data',
        sizeText: `Resolving negatives could adjust total by ${money(-rd.negSum)}`,
      });
      add(id, `${fmtInt(rd.negCount)} negative ${metric} records totalling ${money(rd.negSum)}; resolving adjusts total by ${money(-rd.negSum)}.`);
    }
    if (rd.dupImpact && Math.abs(rd.dupImpact) > 0) {
      const id = uid();
      recs.push({
        id, title: `De-duplicate source data`,
        why: `Duplicate rows inflate ${metric} by ${money(rd.dupImpact)}. Indicative only.`,
        impact: 'medium', effort: 'low', owner_hint: 'Data / Finance',
        sizeText: `Dedup adjustment ≈ ${money(rd.dupImpact)}. Indicative only`,
      });
      add(id, `Duplicate rows inflate ${metric} by approximately ${money(rd.dupImpact)}. Indicative only.`);
    }
    if (rd.outlierCount > 0) {
      const id = uid();
      recs.push({
        id, title: `Review ${fmtInt(rd.outlierCount)} IQR outliers in ${metric}`,
        why: `${fmtInt(rd.outlierCount)} (${fmtPct(rd.outlierCount / rd.n)}) records are outside IQR fences; validate before reporting.`,
        impact: 'low', effort: 'low', owner_hint: 'Data / Finance',
        sizeText: 'not sizeable from this data',
      });
      add(id, `${fmtInt(rd.outlierCount)} records (${fmtPct(rd.outlierCount / rd.n)}) outside IQR fences; validate data quality.`);
    }
  }

  // ── From scenarios ──────────────────────────────────────────────────────
  if (scen?.data?.scenarios?.length) {
    const sc = scen.data.scenarios[0];
    if (sc.best - sc.worst > 0) {
      const id = uid();
      const spread = sc.best - sc.worst;
      recs.push({
        id, title: `Plan for next-${scen.data.gran} scenario spread of ${money(spread)}`,
        why: `Best-case vs worst-case next ${scen.data.gran}: ${money(sc.best)} vs ${money(sc.worst)} (spread ${money(spread)}). Indicative only.`,
        impact: 'medium', effort: 'low', owner_hint: 'Finance / Strategy',
        sizeText: `Scenario spread ${money(spread)}. Indicative only`,
      });
      add(id, `Next ${scen.data.gran} scenario: best ${money(sc.best)}, worst ${money(sc.worst)}, spread ${money(spread)}. Indicative only.`);
    }
  }

  // Sort: impact desc, effort asc
  const impactRank = { high: 3, medium: 2, low: 1 };
  const effortRank = { low: 1, medium: 2, high: 3 };
  recs.sort((a, b) => {
    const imp = (impactRank[b.impact] || 0) - (impactRank[a.impact] || 0);
    if (imp !== 0) return imp;
    return (effortRank[a.effort] || 0) - (effortRank[b.effort] || 0);
  });

  return {
    key: 'recommendations',
    confidence: recs.length >= 3 ? 'high' : recs.length >= 1 ? 'medium' : 'low',
    data: { recommendations: recs },
    items: items.slice(0, 12),
  };
}

// helper exposed for item text
function fmtSigned(p, dec = 1) {
  if (p == null || !isFinite(p)) return '–';
  return (p > 0 ? '+' : '') + (p * 100).toFixed(dec) + '%';
}
