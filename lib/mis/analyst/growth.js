// lib/mis/analyst/growth.js
import { getDim, groupTotals, totalsOf, metricInfo, dimTitle, dimCandidates } from '../engine.js';
import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod } from '../format.js';

function maskSig(mask) {
  let h = 0;
  for (let i = 0; i < mask.length; i += 137) h = (h * 31 + mask[i]) >>> 0;
  return h;
}

function restrictToPeriod(ds, mask, periodLabel, gran) {
  const col = ds.cols[ds.primaryDate];
  if (!col) return new Uint8Array(ds.n);
  const out = new Uint8Array(ds.n);
  for (let i = 0; i < ds.n; i++) {
    if (!mask[i]) continue;
    const t = col.data[i];
    if (t !== t) continue;
    if (bucketKey(t, gran) === periodLabel) out[i] = 1;
  }
  return out;
}

function bucketKey(t, g) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const pad = (n) => String(n).padStart(2, '0');
  if (g === 'day') return d.toISOString().slice(0, 10);
  if (g === 'week') return new Date(t - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  if (g === 'month') return `${y}-${pad(m)}`;
  if (g === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  return String(y);
}

export function growth(ds, mask, o, ins, ctx = {}) {
  if (!ins.series || ins.series.endIdx < 1) return null;
  if (!o.dimKey) return null;

  const cacheKey = `growth_${o.metric}_${o.dimKey}_${o.gran}_${maskSig(mask)}`;
  ds._an = ds._an || {};
  if (ds._an[cacheKey]) return ds._an[cacheKey];

  const metric = o.metric;
  const info = metricInfo(ds, metric);
  const money = (v) => fmtMetric(v, info);
  const g = o.gran;
  const s = ins.series;
  const endIdx = s.analytics.endIdx;
  const curLabel = s.labels[endIdx];
  const prevLabel = s.labels[endIdx - 1];
  const items = [];
  const add = (id, text) => items.push({ id: `an_growth_${id}`, text: String(text).slice(0, 260) });

  // ── Restrict masks to current and previous periods ─────────────────────
  const mCur = restrictToPeriod(ds, mask, curLabel, g);
  const mPrev = restrictToPeriod(ds, mask, prevLabel, g);

  const totCur = totalsOf(ds, mCur, metric);
  const totPrev = totalsOf(ds, mPrev, metric);
  const delta = totCur.sum - totPrev.sum;
  const deltaPct = totPrev.sum ? delta / Math.abs(totPrev.sum) : null;

  add('total', `Overall ${metric}: ${money(totPrev.sum)} (${fmtPeriod(prevLabel)}) → ${money(totCur.sum)} (${fmtPeriod(curLabel)}), change ${money(delta)} (${deltaPct != null ? fmtSigned(deltaPct) : 'n/a'}).`);

  // ── Segment contributions ──────────────────────────────────────────────
  const grpCur = groupTotals(ds, mCur, o.dimKey, metric);
  const grpPrev = groupTotals(ds, mPrev, o.dimKey, metric);
  const mapPrev = new Map(grpPrev.map((x) => [x.label, x.value]));
  const mapCur = new Map(grpCur.map((x) => [x.label, x.value]));

  const allLabels = new Set([...mapCur.keys(), ...mapPrev.keys()]);
  const contribs = [];
  for (const lbl of allLabels) {
    const cur = mapCur.get(lbl) || 0;
    const prev = mapPrev.get(lbl) || 0;
    const seg_delta = cur - prev;
    const pctOfChange = delta ? seg_delta / Math.abs(delta) : null;
    contribs.push({ label: lbl, cur, prev, delta: seg_delta, pctOfChange });
  }
  contribs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Top 3 contributors / drags
  const topContribs = contribs.filter((c) => c.delta > 0).slice(0, 3);
  const topDrags = contribs.filter((c) => c.delta < 0).slice(0, 3);
  const dn = dimTitle(ds, o.dimKey);

  for (const [i, c] of topContribs.entries()) {
    add(`contrib_up_${i}`, `${dn} "${c.label}" added ${money(c.delta)}${c.pctOfChange != null ? ` (${fmtPct(Math.abs(c.pctOfChange))} of total change)` : ''}: ${money(c.prev)} → ${money(c.cur)}.`);
  }
  for (const [i, c] of topDrags.entries()) {
    add(`contrib_dn_${i}`, `${dn} "${c.label}" dragged ${money(c.delta)}${c.pctOfChange != null ? ` (${fmtPct(Math.abs(c.pctOfChange))} of total change)` : ''}: ${money(c.prev)} → ${money(c.cur)}.`);
  }

  // ── New / lost / retained segments ────────────────────────────────────
  const newSegs = contribs.filter((c) => c.prev === 0 && c.cur > 0);
  const lostSegs = contribs.filter((c) => c.cur === 0 && c.prev > 0);
  const retained = contribs.filter((c) => c.prev > 0 && c.cur > 0);

  const newVal = newSegs.reduce((a, c) => a + c.cur, 0);
  const lostVal = lostSegs.reduce((a, c) => a + c.prev, 0);
  const retVal = retained.reduce((a, c) => a + c.cur, 0);

  add('new_lost', `New ${dn} values: ${fmtInt(newSegs.length)} (${money(newVal)}); lost: ${fmtInt(lostSegs.length)} (${money(lostVal)}); retained: ${fmtInt(retained.length)} (${money(retVal)}).`);

  // ── Price / Volume / Mix decomposition (if quantity-like column exists) ─
  const qtyCol = ds.numeric.find((n) => /qty|quantity|units|volume|count|pieces|items/i.test(n) && n !== metric);
  const priceCol = ds.numeric.find((n) => /price|rate|tariff|unit.?price/i.test(n) && n !== metric && n !== qtyCol);

  if (qtyCol && totPrev.count > 0 && totCur.count > 0) {
    const qCur = totalsOf(ds, mCur, qtyCol);
    const qPrev = totalsOf(ds, mPrev, qtyCol);
    const avgPriceCur = qCur.sum > 0 ? totCur.sum / qCur.sum : 0;
    const avgPricePrev = qPrev.sum > 0 ? totPrev.sum / qPrev.sum : 0;
    const volEffect = (qCur.sum - qPrev.sum) * avgPricePrev;
    const priceEffect = (avgPriceCur - avgPricePrev) * qPrev.sum;
    const mixEffect = delta - volEffect - priceEffect;
    add('pvm', `Price/Volume/Mix: volume effect ${money(volEffect)}, price effect ${money(priceEffect)}, mix/other ${money(mixEffect)}. Indicative only.`);
  }

  // ── YoY comparison (skip yearless or < 2 cycles) ────────────────────────
  if (!ds.yearless && endIdx >= 12 && g === 'month') {
    const yoyLabel = s.labels[endIdx - 12];
    const mYoy = restrictToPeriod(ds, mask, yoyLabel, g);
    const totYoy = totalsOf(ds, mYoy, metric);
    if (totYoy.sum > 0) {
      const yoyDelta = totCur.sum - totYoy.sum;
      const yoyPct = totYoy.sum ? yoyDelta / Math.abs(totYoy.sum) : null;
      add('yoy', `YoY: ${money(totCur.sum)} (${fmtPeriod(curLabel)}) vs ${money(totYoy.sum)} (${fmtPeriod(yoyLabel)}), change ${money(yoyDelta)}${yoyPct != null ? ` (${fmtSigned(yoyPct)})` : ''}.`);
    }
  }

  const result = {
    key: 'growth',
    confidence: ins.series.endIdx >= 3 ? 'high' : 'medium',
    data: {
      cur: { label: curLabel, total: totCur.sum },
      prev: { label: prevLabel, total: totPrev.sum },
      delta,
      deltaPct,
      contribs: contribs.slice(0, 20),
      newSegs: newSegs.length,
      lostSegs: lostSegs.length,
      retained: retained.length,
      newVal, lostVal, retVal,
      hasQty: !!qtyCol,
    },
    items: items.slice(0, 12),
  };

  ds._an[cacheKey] = result;
  return result;
}
