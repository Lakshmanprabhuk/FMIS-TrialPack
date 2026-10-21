// lib/mis/analyst/index.js
import { computeInsights, getDim, groupTotals, totalsOf, metricInfo, dimTitle, dimCandidates } from '../engine.js';
import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod } from '../format.js';
import { performance } from './performance.js';
import { growth } from './growth.js';
import { customers } from './customers.js';
import { products } from './products.js';
import { risk } from './risk.js';
import { scenarios } from './scenarios.js';
import { recommend } from './recommend.js';
import { findFocusMatches } from '../focus.js';

function tryRun(fn, ...args) {
  try {
    return fn(...args);
  } catch (e) {
    return null;
  }
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

function restrictMask(ds, mask, dimKey, label) {
  const dim = getDim(ds, dimKey);
  const code = dim.labels.indexOf(label);
  const out = new Uint8Array(ds.n);
  if (code < 0) return out;
  for (let i = 0; i < ds.n; i++) if (mask[i] && dim.codes[i] === code) out[i] = 1;
  return out;
}

function buildFocusDrilldowns(ds, mask, o, ins, focusValue, ctx) {
  const drilldowns = [];
  const info = metricInfo(ds, o.metric);
  const money = (v) => fmtMetric(v, info);

  // Find which dimension has this value
  let focusDimKey = null;
  for (const dk of dimCandidates(ds)) {
    const dim = getDim(ds, dk);
    if (dim.labels.includes(focusValue)) { focusDimKey = dk; break; }
  }
  if (!focusDimKey) return drilldowns;

  const focusMask = restrictMask(ds, mask, focusDimKey, focusValue);
  const focusTot = totalsOf(ds, focusMask, o.metric);
  const allTot = totalsOf(ds, mask, o.metric);

  // Trend drilldown
  if (ds.primaryDate && ins.series) {
    const dateDim = ds.cols[ds.primaryDate].data;
    const mdata = o.metric !== '__count' && ds.cols[o.metric] ? ds.cols[o.metric].data : null;
    const periodTotals = new Map();
    for (let i = 0; i < ds.n; i++) {
      if (!focusMask[i]) continue;
      const t = dateDim[i];
      if (t !== t) continue;
      const bk = bucketKey(t, o.gran);
      const v = mdata ? mdata[i] : 1;
      if (v !== v) continue;
      periodTotals.set(bk, (periodTotals.get(bk) || 0) + v);
    }
    const trendLabels = ins.series.labels.slice(0, ins.series.analytics.endIdx + 1);
    const trendValues = trendLabels.map((l) => periodTotals.get(l) || 0);
    drilldowns.push({
      type: 'trend',
      label: `Trend for "${focusValue}"`,
      labels: trendLabels,
      values: trendValues,
      total: focusTot.sum,
      shareOfTotal: allTot.sum ? focusTot.sum / allTot.sum : 0,
    });
  }

  // Breakdown by other dimensions
  for (const dk of dimCandidates(ds).filter((dk) => dk !== focusDimKey).slice(0, 2)) {
    const grp = groupTotals(ds, focusMask, dk, o.metric).slice(0, 10);
    if (grp.length >= 2) {
      drilldowns.push({
        type: 'breakdown',
        label: `"${focusValue}" breakdown by ${dimTitle(ds, dk)}`,
        dimKey: dk,
        groups: grp,
      });
    }
  }

  // Peer comparison
  const peers = groupTotals(ds, mask, focusDimKey, o.metric)
    .filter((x) => x.value > 0)
    .slice(0, 10);
  if (peers.length >= 2) {
    const focusPeer = peers.find((x) => x.label === focusValue);
    drilldowns.push({
      type: 'peer_comparison',
      label: `"${focusValue}" vs peers on ${dimTitle(ds, focusDimKey)}`,
      dimKey: focusDimKey,
      groups: peers,
      focusLabel: focusValue,
      rank: peers.findIndex((x) => x.label === focusValue) + 1,
    });
    if (focusPeer) {
      const median = peers.length >= 2 ? peers[Math.floor(peers.length / 2)].value : 0;
      if (median > 0) {
        const gap = focusPeer.value - median;
        drilldowns.push({
          type: 'anomaly',
          label: `"${focusValue}" vs median peer`,
          value: focusPeer.value,
          median,
          gap,
          gapPct: gap / Math.abs(median),
        });
      }
    }
  }

  return drilldowns;
}

/**
 * computeAnalyst
 * @param {object} ds - dataset from buildDataset
 * @param {Uint8Array} mask - inclusion mask
 * @param {object} o - { metric, metric2, dimKey, gran }
 * @param {object} ins - result of computeInsights(ds, mask, o)
 * @param {object} ctx - { schema, focus, target }
 * @returns {{ modules, items, focus }}
 */
export function computeAnalyst(ds, mask, o, ins, ctx = {}) {
  ds._an = ds._an || {};

  const perfMod = tryRun(performance, ds, mask, o, ins, ctx);
  const growthMod = tryRun(growth, ds, mask, o, ins, ctx);
  const customersMod = tryRun(customers, ds, mask, o, ins, ctx);
  const productsMod = tryRun(products, ds, mask, o, ins, ctx);
  const riskMod = tryRun(risk, ds, mask, o, ins, ctx);
  const scenariosMod = tryRun(scenarios, ds, mask, o, ins, ctx);

  const allModules = {
    performance: perfMod,
    growth: growthMod,
    customers: customersMod,
    products: productsMod,
    risk: riskMod,
    scenarios: scenariosMod,
  };

  const recMod = tryRun(recommend, allModules, ds, o, ins, ctx);

  const modules = {
    performance: perfMod,
    growth: growthMod,
    customers: customersMod,
    products: productsMod,
    risk: riskMod,
    scenarios: scenariosMod,
    recommendations: recMod,
  };

  // Collect all items
  const allItems = [];
  for (const mod of Object.values(modules)) {
    if (mod?.items) allItems.push(...mod.items);
  }

  // Focus drilldowns
  let focus = { text: null, drilldowns: [] };
  if (ctx.focus && typeof ctx.focus === 'string') {
    focus.text = ctx.focus;
    try {
      // the focus is a sentence; find the category values named in it and drill into each (max 2)
      const vals = findFocusMatches(ds, ctx.focus).map((m) => m.value).slice(0, 2);
      focus.drilldowns = vals.flatMap((v) => buildFocusDrilldowns(ds, mask, o, ins, v, ctx));
    } catch {
      focus.drilldowns = [];
    }
  }

  return { modules, items: allItems, focus };
}
