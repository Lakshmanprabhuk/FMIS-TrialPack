// lib/mis/analyst/products.js
import { getDim, groupTotals, totalsOf, metricInfo, dimTitle, dimCandidates } from '../engine.js';
import { fmtMetric, fmtPct, fmtSigned, fmtInt } from '../format.js';

function maskSig(mask) {
  let h = 0;
  for (let i = 0; i < mask.length; i += 137) h = (h * 31 + mask[i]) >>> 0;
  return h;
}

function bucketKey(t, g) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const pad = (n) => String(n).padStart(2, '0');
  if (g === 'month') return `${y}-${pad(m)}`;
  if (g === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  return String(y);
}

function findProductCol(ds, o, ctx) {
  if (ctx?.schema) {
    for (const [col, sch] of Object.entries(ctx.schema)) {
      if (sch.role === 'dimension' && /product|sku|item|article|produit/i.test(col) && ds.cols[col]?.type === 'cat') return col;
    }
  }
  const re = /product|sku|item|article|produit|category|categor/i;
  return ds.cats.find((c) => re.test(c)) || o.dimKey || ds.cats[0] || null;
}

function findOrderCol(ds, ctx) {
  if (ctx?.schema) {
    for (const [col, sch] of Object.entries(ctx.schema)) {
      if (sch.role === 'id' && /order|invoice|transaction|bill/i.test(col)) return col;
    }
  }
  return ds.cats.find((c) => /order|invoice|transaction|bill/i.test(c)) ||
    ds.texts?.find((c) => /order|invoice|transaction/i.test(c)) || null;
}

export function products(ds, mask, o, ins, ctx = {}) {
  const prodCol = findProductCol(ds, o, ctx);
  if (!prodCol || !ds.cols[prodCol]) return null;

  const cacheKey = `prod_${o.metric}_${prodCol}_${o.gran}_${maskSig(mask)}`;
  ds._an = ds._an || {};
  if (ds._an[cacheKey]) return ds._an[cacheKey];

  const metric = o.metric;
  const info = metricInfo(ds, metric);
  const money = (v) => fmtMetric(v, info);
  const g = o.gran;
  const items = [];
  const add = (id, text) => items.push({ id: `an_products_${id}`, text: String(text).slice(0, 260) });

  const prodDim = ds.cols[prodCol];
  const K = prodDim.type === 'cat' ? prodDim.dict.length : 0;
  if (K === 0) return null;

  const mdata = metric !== '__count' && ds.cols[metric] ? ds.cols[metric].data : null;
  const dateDim = ds.primaryDate ? ds.cols[ds.primaryDate].data : null;

  // ── Portfolio matrix: growth vs share ──────────────────────────────────
  let portfolioItems = [];
  if (dateDim && ins.series && ins.series.endIdx >= 1) {
    const s = ins.series;
    const endLabel = s.labels[s.analytics.endIdx];
    const prevLabel = s.labels[s.analytics.endIdx - 1];

    // Group totals per product for current and previous period
    const mCur = new Uint8Array(ds.n);
    const mPrev = new Uint8Array(ds.n);
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i]) continue;
      const t = dateDim[i];
      if (t !== t) continue;
      const bk = bucketKey(t, g);
      if (bk === endLabel) mCur[i] = 1;
      else if (bk === prevLabel) mPrev[i] = 1;
    }

    const grpCur = groupTotals(ds, mCur, prodCol, metric);
    const grpPrev = groupTotals(ds, mPrev, prodCol, metric);
    const mapPrev = new Map(grpPrev.map((x) => [x.label, x.value]));
    const totalCur = grpCur.reduce((s, x) => s + Math.max(0, x.value), 0);

    portfolioItems = grpCur.map((x) => {
      const prev = mapPrev.get(x.label) || 0;
      const share = totalCur ? x.value / totalCur : 0;
      const growth = prev > 0 ? (x.value - prev) / Math.abs(prev) : null;
      return { label: x.label, value: x.value, share, growth };
    }).filter((x) => x.value > 0);

    portfolioItems.sort((a, b) => b.value - a.value);

    const stars = portfolioItems.filter((x) => x.growth != null && x.growth > 0 && x.share > 1 / portfolioItems.length);
    const laggards = portfolioItems.filter((x) => x.growth != null && x.growth < 0 && x.share <= 1 / portfolioItems.length);

    if (stars.length) add('stars', `Portfolio stars (above-average share and growth): ${stars.slice(0, 3).map((x) => `${x.label} (${fmtPct(x.share)} share, ${fmtSigned(x.growth)})`).join('; ')}.`);
    if (laggards.length) add('laggards', `Portfolio laggards (below-average share and declining): ${laggards.slice(0, 3).map((x) => x.label).join(', ')}.`);
  }

  // ── All-period group totals for mix / share ─────────────────────────────
  const allGroups = groupTotals(ds, mask, prodCol, metric);
  const totalAll = allGroups.reduce((s, x) => s + Math.max(0, x.value), 0);

  if (allGroups.length >= 2) {
    const top = allGroups[0];
    const bot = allGroups[allGroups.length - 1];
    add('top', `Top product by ${metric}: "${top.label}" with ${money(top.value)} (${fmtPct(totalAll ? top.value / totalAll : 0)} of total).`);
    const top3share = allGroups.slice(0, 3).reduce((s, x) => s + Math.max(0, x.value), 0);
    add('top3', `Top 3 products hold ${fmtPct(totalAll ? top3share / totalAll : 0)} of total ${metric} (${fmtInt(allGroups.length)} products total).`);
  }

  // ── Average price / discount depth ─────────────────────────────────────
  const priceCol = ds.numeric.find((n) => /price|unit.?price|rate|tariff/i.test(n) && n !== metric);
  const discCol = ds.numeric.find((n) => /discount|disc|rebate|markdown/i.test(n));

  if (priceCol) {
    const prodPrices = groupTotals(ds, mask, prodCol, priceCol, 'avg');
    const sortedPrices = prodPrices.filter((x) => x.count >= 2).sort((a, b) => b.value - a.value);
    if (sortedPrices.length >= 2) {
      add('price', `Average unit price by product: highest "${sortedPrices[0].label}" (${fmtMetric(sortedPrices[0].value, info)}), lowest "${sortedPrices[sortedPrices.length - 1].label}" (${fmtMetric(sortedPrices[sortedPrices.length - 1].value, info)}).`);
    }
  }
  if (discCol) {
    const discAvg = totalsOf(ds, mask, discCol);
    add('discount', `Average discount depth: ${fmtMetric(discAvg.avg, metricInfo(ds, discCol))} per record across ${fmtInt(discAvg.count)} records.`);
  }

  // ── Basket pairs / cross-sell lift ──────────────────────────────────────
  const orderCol = findOrderCol(ds, ctx);
  let basketPairs = [];
  if (orderCol && ds.cols[orderCol] && ds.cols[orderCol].type === 'cat') {
    const orderDim = ds.cols[orderCol];
    // Build order -> product sets
    const O = orderDim.dict.length;
    const orderSets = new Array(O);
    // Count total orders
    let totalOrders = 0;
    const orderSeen = new Uint8Array(O);
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i]) continue;
      const oc = orderDim.codes[i];
      if (oc < 0) continue;
      if (!orderSets[oc]) { orderSets[oc] = new Set(); }
      const pc = prodDim.codes[i];
      if (pc >= 0) orderSets[oc].add(pc);
      if (!orderSeen[oc]) { orderSeen[oc] = 1; totalOrders++; }
    }
    if (totalOrders >= 20) {
      // Count co-occurrences (cap at top 10 pairs, require support >= 1%)
      const pairCounts = new Map();
      const singleCounts = new Float64Array(K);
      for (let o = 0; o < O; o++) {
        const s = orderSets[o];
        if (!s || s.size < 2) continue;
        const prods = [...s];
        for (let a = 0; a < prods.length; a++) {
          singleCounts[prods[a]]++;
          for (let b = a + 1; b < prods.length; b++) {
            const key = prods[a] < prods[b] ? `${prods[a]}_${prods[b]}` : `${prods[b]}_${prods[a]}`;
            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
          }
        }
      }
      const minSupport = Math.ceil(0.01 * totalOrders);
      basketPairs = [...pairCounts.entries()]
        .filter(([, cnt]) => cnt >= minSupport)
        .map(([key, cnt]) => {
          const [a, b] = key.split('_').map(Number);
          const support = cnt / totalOrders;
          const liftA = singleCounts[a] / totalOrders;
          const liftB = singleCounts[b] / totalOrders;
          const lift = liftA * liftB > 0 ? support / (liftA * liftB) : 0;
          return { a: prodDim.dict[a], b: prodDim.dict[b], support, lift, count: cnt };
        })
        .sort((a, b) => b.lift - a.lift)
        .slice(0, 10);

      if (basketPairs.length) {
        const bp = basketPairs[0];
        add('basket', `Top cross-sell pair: "${bp.a}" + "${bp.b}" (${fmtPct(bp.support)} of orders, lift ${bp.lift.toFixed(2)}×). Pairs with support ≥ 1% of ${fmtInt(totalOrders)} orders shown.`);
      }
    }
  }

  // ── Pairwise correlation between numeric measures ───────────────────────
  const numCols = ds.numeric.slice(0, 8);
  const correlations = [];
  for (let a = 0; a < numCols.length; a++) {
    for (let b = a + 1; b < numCols.length; b++) {
      const X = ds.cols[numCols[a]].data, Y = ds.cols[numCols[b]].data;
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < ds.n; i++) {
        if (!mask[i]) continue;
        const x = X[i], y = Y[i];
        if (x !== x || y !== y) continue;
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      }
      if (n < 30) continue;
      const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
      if (!(den > 0)) continue;
      const r = (n * sxy - sx * sy) / den;
      correlations.push({ a: numCols[a], b: numCols[b], r, n });
    }
  }
  correlations.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  const top5corr = correlations.slice(0, 5);
  for (const [i, c] of top5corr.entries()) {
    add(`corr_${i}`, `${c.a} and ${c.b} move ${c.r > 0 ? 'together' : 'inversely'} (r = ${c.r.toFixed(2)}, n = ${fmtInt(c.n)} records). Correlation is not causation.`);
  }

  // ── Product mix shift ───────────────────────────────────────────────────
  if (portfolioItems.length >= 3) {
    const growingMix = portfolioItems.filter((x) => x.growth != null && x.growth > 0.1).slice(0, 3);
    if (growingMix.length) add('mix_shift', `Products gaining mix share: ${growingMix.map((x) => `${x.label} (+${fmtPct(x.growth)} growth)`).join('; ')}.`);
  }

  const result = {
    key: 'products',
    confidence: allGroups.length >= 5 ? 'high' : allGroups.length >= 3 ? 'medium' : 'low',
    data: {
      productCol: prodCol,
      totalProducts: allGroups.length,
      totalValue: totalAll,
      portfolio: portfolioItems.slice(0, 20),
      basketPairs,
      correlations: top5corr,
      hasPrice: !!priceCol,
      hasDiscount: !!discCol,
      hasOrders: !!orderCol,
    },
    items: items.slice(0, 12),
  };

  ds._an[cacheKey] = result;
  return result;
}
