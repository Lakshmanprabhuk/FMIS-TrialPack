import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod, isoDate, POP_LABEL } from './format';
import { metricInfo, metricLabel, dimTitle, formatKpiValue } from './engine';

export function buildMeta(ds, ins, o, fileName) {
  return {
    fileName,
    metric: metricLabel(o.metric),
    groupBy: o.dimKey ? dimTitle(ds, o.dimKey) : '',
    granularity: o.gran,
    currency: ds.currency,
    period: ins.period ? `${isoDate(ins.period.min)} to ${isoDate(ins.period.max)}` : '',
  };
}

export function buildFacts(ds, ins, o) {
  const f = [];
  const add = (id, text) => {
    if (text) f.push({ id, text: String(text).slice(0, 280) });
  };
  const info = metricInfo(ds, o.metric);
  const money = (v) => fmtMetric(v, info);
  const ml = o.metric === '__count' ? 'record count' : o.metric;
  const g = o.gran;
  const dn = o.dimKey ? dimTitle(ds, o.dimKey) : '';

  add('scope', `${fmtInt(ins.tot.count)} records analysed${ins.period ? ` covering ${isoDate(ins.period.min)} to ${isoDate(ins.period.max)}` : ' (no date column)'}; primary measure: ${ml}.`);

  ins.kpis.forEach((k) => {
    let t = `${k.label}: ${formatKpiValue(ds, k)}`;
    if (k.sub) t += ` (${k.sub})`;
    if (k.pop != null) t += `; ${POP_LABEL[g]} change ${fmtSigned(k.pop)}`;
    if (k.varAvg != null) t += `; ${fmtSigned(k.varAvg)} vs average period`;
    add('kpi_' + k.id, t);
  });

  const s = ins.series;
  if (s) {
    s.analytics.comps.forEach((c) => add('trend_' + c.key, `${c.label}: ${money(c.cur)} vs ${money(c.prev)} (${fmtSigned(c.change)})`));
    const vals = s.values.slice(0, s.endIdx + 1);
    if (vals.length >= 3) {
      const hi = vals.indexOf(Math.max(...vals)), lo = vals.indexOf(Math.min(...vals));
      add('trend_peak', `Peak period ${fmtPeriod(s.labels[hi])} at ${money(vals[hi])}; lowest period ${fmtPeriod(s.labels[lo])} at ${money(vals[lo])}.`);
    }
    const p = s.analytics.projection;
    if (p) {
      const dir = Math.abs(p.slope) < 1e-9 ? 'flat' : p.slope > 0 ? 'rising' : 'falling';
      add('trend_direction', `Linear trend over the last ${p.basis} periods is ${dir}.`);
      add('trend_projection', `Indicative linear projection for the next period: ${money(p.values[0])}.`);
    }
    if (ins.partial) add('trend_partial', `The latest period (${fmtPeriod(s.labels[s.labels.length - 1])}) is incomplete and is excluded from comparisons.`);
  }

  const p = ins.pareto;
  if (p && p.items.length) {
    const top = p.items[0], bot = p.items[p.items.length - 1];
    const top3 = p.items.slice(0, 3).reduce((a, x) => a + x.share, 0);
    add('rank_top', `Top ${dn}: ${top.label} with ${money(top.value)} (${fmtPct(top.share)} of total); the top 3 together hold ${fmtPct(top3)}.`);
    add('rank_bottom', `Smallest ${dn} with positive value: ${bot.label} at ${money(bot.value)} (${fmtPct(bot.share)}).`);
    add('pareto', `${p.n80} of ${p.items.length} ${dn} values (${fmtPct(p.pct80)}) account for 80% of ${ml}.`);
    const sm = p.summary;
    add('abc', `ABC classes: A has ${sm.A.n} items (${fmtPct(sm.A.v)} of value), B has ${sm.B.n} (${fmtPct(sm.B.v)}), C has ${sm.C.n} (${fmtPct(sm.C.v)}).`);
  }

  ins.concentration.slice(0, 4).forEach((c, i) =>
    add('conc_' + i, `Concentration by ${c.name}: "${c.topLabel}" holds ${fmtPct(c.top1)}, top 3 hold ${fmtPct(c.top3)}; severity ${c.severity}.`)
  );
  ins.declines.slice(0, 5).forEach((d, i) =>
    add('decl_' + i, `${d.label} (${dn}) declined for ${d.streak} consecutive periods, ${fmtSigned(d.change)} overall (${money(d.from)} to ${money(d.to)}); severity ${d.severity}.`)
  );
  const o2 = ins.outliers;
  if (o2.count) add('outliers', `${fmtInt(o2.count)} of ${fmtInt(o2.n)} records are statistical outliers on ${ml} (|z| of 3 or more); the most extreme is ${money(o2.items[0].value)}.`);
  else if (o2.n) add('outliers', `No statistical outliers (|z| of 3 or more) were found on ${ml}.`);
  ins.anomalies.slice(0, 3).forEach((a, i) =>
    add('anom_' + i, `${fmtPeriod(a.label)} total of ${money(a.value)} deviates strongly from the period average; severity ${a.severity}.`)
  );
  const st = ds.stats;
  add('quality', `Data quality: ${fmtInt(st.dupes)} duplicate rows, ${fmtInt(st.missingCells)} blank cells and ${fmtInt(st.issueCells)} unreadable values across ${ds.fields.length} columns.`);
  return f;
}

export function buildTakeaways(ds, ins, o) {
  const t = [];
  const info = metricInfo(ds, o.metric);
  const money = (v) => fmtMetric(v, info);
  const ml = o.metric === '__count' ? 'records' : o.metric;
  const dn = o.dimKey ? dimTitle(ds, o.dimKey) : '';
  const head = ins.kpis.find((k) => k.id === 'total') || ins.kpis.find((k) => k.id === 'records');
  if (head) {
    t.push(`${head.label} stands at ${formatKpiValue(ds, head)} across ${fmtInt(ins.tot.count)} records${head.pop != null ? `; the latest ${POP_LABEL[o.gran]} change is ${fmtSigned(head.pop)}` : ''}.`);
  }
  const p = ins.pareto;
  if (p && p.items.length) {
    t.push(`${p.items[0].label} leads ${dn} with ${fmtPct(p.items[0].share)} of ${ml}; ${p.n80} of ${p.items.length} values account for 80% of the total.`);
  }
  const hi = ins.concentration.find((c) => c.severity === 'high') || ins.concentration.find((c) => c.severity === 'medium');
  if (hi) t.push(`Concentration risk (${hi.severity}) in ${hi.name}: "${hi.topLabel}" alone holds ${fmtPct(hi.top1)}.`);
  const proj = ins.series?.analytics.projection;
  if (proj) t.push(`On the current linear trend the next period is projected at ${money(proj.values[0])} (indicative only).`);
  const d = ins.declines[0];
  if (d) t.push(`${d.label} has declined for ${d.streak} consecutive periods (${fmtSigned(d.change)}) and is worth reviewing.`);
  if (ins.outliers.count) t.push(`${fmtInt(ins.outliers.count)} outlying records on ${ml} were flagged for review.`);
  return t.slice(0, 5);
}
