'use client';

import { Card, Empty, Badge } from './ui';
import ChartCanvas from './ChartCanvas';
import { metricInfo } from '../../../lib/mis/engine';
import {
  fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod, MONTH_NAMES,
} from '../../../lib/mis/format';

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(ds, metric, v) {
  return fmtMetric(v, metricInfo(ds, metric));
}

function ConfidenceBadge({ confidence }) {
  if (confidence === 'high') return null;
  const label = confidence === 'medium' ? 'Medium confidence' : 'Low confidence — indicative only';
  const sev = confidence === 'medium' ? 'sev-medium' : 'sev-high';
  return <span className={`mis-badge ${sev} an-conf-badge`}>{label}</span>;
}

function SoWhat({ text }) {
  if (!text) return null;
  return (
    <p className="an-sowhat">
      <span className="an-sowhat-tag">So what</span>
      {text}
    </p>
  );
}

function ScrollTable({ children }) {
  return <div className="mis-tscroll an-tscroll"><table className="mis-table">{children}</table></div>;
}

function EmptyModule({ reason }) {
  return <Empty title="Not enough data">{reason || 'Add more records or adjust the filters to unlock this section.'}</Empty>;
}

function LowData({ message }) {
  return <div className="mis-note an-note-low">{message}</div>;
}

// Build a simple sparkline dataset for ChartCanvas
function sparkDataset(labels, values, color) {
  return {
    labels,
    datasets: [{ label: '', data: values, kind: 'line', fill: true, color, points: false }],
  };
}

// ── 1. PerformanceView ────────────────────────────────────────────────────────

export function PerformanceView({ ds, mask, ins, view, theme, analyst, narrative, onDrill }) {
  const mod = analyst?.modules?.performance;
  if (!mod?.data) return <EmptyModule reason="A date column and at least 2 complete periods are needed." />;

  const { data, confidence } = mod;
  const { gran, metric, labels, values, comps, rolling, best, worst, streaks, seasonal, projection } = data;
  const fmt = (v) => money(ds, metric, v);

  // So-what: pick the most salient fact
  let soWhat = null;
  if (streaks.decline >= 2) soWhat = `${metric} has fallen for ${streaks.decline} consecutive ${gran}s — the current trend requires attention.`;
  else if (streaks.growth >= 3) soWhat = `${metric} has grown for ${streaks.growth} straight ${gran}s, the longest recent run.`;
  else if (comps[0]) soWhat = `Latest ${gran} ${comps[0].label}: ${fmt(comps[0].cur)} vs ${fmt(comps[0].prev)} (${fmtSigned(comps[0].change)}).`;

  const latestVal = values[values.length - 1];
  const periodLabels = labels.map((l) => (ds.yearless ? MONTH_NAMES[parseInt(l.split('-')[1], 10) - 1] : fmtPeriod(l)));

  return (
    <div className="an-section">
      <ConfidenceBadge confidence={confidence} />
      <SoWhat text={soWhat} />

      {/* Main trend chart */}
      <div className="mis-card an-card">
        <div className="mis-card-h">
          <div>
            <div className="mis-card-t">{metric} over time</div>
            <div className="mis-card-n">Complete {gran}s only{ds.yearless ? ' · month numbers' : ''}</div>
          </div>
        </div>
        <div className="mis-card-b">
          {labels.length < 2
            ? <LowData message="Need at least 2 complete periods for a trend chart." />
            : <ChartCanvas
                type="line" theme={theme} height={220}
                labels={periodLabels}
                datasets={[{
                  label: metric, data: values, kind: 'line',
                  fill: true, points: values.length <= 24,
                }]}
                fmt={fmt}
              />
          }
        </div>
      </div>

      {/* Period comparisons */}
      {comps.length > 0 && (
        <div className="mis-grid2">
          {comps.map((c) => (
            <div key={c.key} className="mis-card an-card an-stat-card">
              <div className="mis-card-b">
                <div className="an-stat-label">{c.label}</div>
                <div className="an-stat-value">{fmt(c.cur)}</div>
                <div className="an-stat-vs">vs {fmt(c.prev)}</div>
                <span className={`an-delta ${c.change > 0 ? 'up' : c.change < 0 ? 'down' : 'flat'}`}>
                  {c.change > 0 ? '▲' : c.change < 0 ? '▼' : '■'} {fmtSigned(c.change)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rolling averages + run-rate */}
      {(rolling.r3 != null || rolling.r6 != null || rolling.r12 != null) && (
        <div className="mis-card an-card">
          <div className="mis-card-h"><div className="mis-card-t">Rolling averages per {gran}</div></div>
          <div className="mis-card-b an-roll-grid">
            {rolling.r3 != null && (
              <div className="an-roll-item">
                <span className="an-roll-label">3-{gran}</span>
                <span className="an-roll-val">{fmt(rolling.r3)}</span>
              </div>
            )}
            {rolling.r6 != null && (
              <div className="an-roll-item">
                <span className="an-roll-label">6-{gran}</span>
                <span className="an-roll-val">{fmt(rolling.r6)}</span>
              </div>
            )}
            {rolling.r12 != null && (
              <div className="an-roll-item">
                <span className="an-roll-label">12-{gran}</span>
                <span className="an-roll-val">{fmt(rolling.r12)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Best / Worst + streak */}
      <div className="mis-grid2">
        <div className="mis-card an-card">
          <div className="mis-card-b">
            <div className="an-bw-row">
              <span className="an-bw-icon an-bw-best">▲</span>
              <div>
                <div className="an-bw-label">Best {gran}</div>
                <div className="an-bw-period">{ds.yearless ? MONTH_NAMES[parseInt((best.label || '').split('-')[1], 10) - 1] : fmtPeriod(best.label)}</div>
                <div className="an-bw-val">{fmt(best.value)}</div>
              </div>
            </div>
            <div className="an-bw-row" style={{ marginTop: '10px' }}>
              <span className="an-bw-icon an-bw-worst">▼</span>
              <div>
                <div className="an-bw-label">Worst {gran}</div>
                <div className="an-bw-period">{ds.yearless ? MONTH_NAMES[parseInt((worst.label || '').split('-')[1], 10) - 1] : fmtPeriod(worst.label)}</div>
                <div className="an-bw-val">{fmt(worst.value)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mis-card an-card">
          <div className="mis-card-b">
            {streaks.growth >= 2 && (
              <div className="an-streak an-streak-up">
                <span className="an-streak-n">{streaks.growth}</span>
                <span className="an-streak-label">consecutive {gran}s of growth</span>
              </div>
            )}
            {streaks.decline >= 2 && (
              <div className="an-streak an-streak-dn">
                <span className="an-streak-n">{streaks.decline}</span>
                <span className="an-streak-label">consecutive {gran}s of decline</span>
              </div>
            )}
            {streaks.growth < 2 && streaks.decline < 2 && (
              <div className="mis-muted an-no-streak">No notable growth or decline streak.</div>
            )}
            {projection && (
              <div className="an-projection">
                <span className="an-proj-label">Next {gran} (linear, indicative)</span>
                <span className="an-proj-val">{fmt(projection.next)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seasonality */}
      {seasonal && !ds.yearless && (
        <div className="mis-card an-card">
          <div className="mis-card-h">
            <div className="mis-card-t">Seasonal pattern by month</div>
            <div className="mis-card-n">Index 1.00 = average month</div>
          </div>
          <div className="mis-card-b">
            <div className="an-seasonal-row">
              <div className="an-seasonal-item an-seasonal-peak">
                <span className="an-seas-icon">↑</span>
                <span className="an-seas-name">{seasonal.peak}</span>
                <span className="an-seas-idx">{seasonal.peakIdx.toFixed(2)}×</span>
              </div>
              <div className="an-seasonal-item an-seasonal-trough">
                <span className="an-seas-icon">↓</span>
                <span className="an-seas-name">{seasonal.low}</span>
                <span className="an-seas-idx">{seasonal.lowIdx.toFixed(2)}×</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {confidence === 'low' && (
        <LowData message="Seasonal analysis needs ≥ 24 monthly periods. Current results are indicative only." />
      )}
    </div>
  );
}

// ── 2. GrowthView ─────────────────────────────────────────────────────────────

export function GrowthView({ ds, mask, ins, view, theme, analyst, narrative, onDrill }) {
  const mod = analyst?.modules?.growth;
  if (!mod?.data) return <EmptyModule reason="A date column, a grouping dimension and ≥ 2 periods are needed." />;

  const { data, confidence } = mod;
  const { cur, prev, delta, deltaPct, contribs, newSegs, lostSegs, retained, newVal, lostVal, retVal, hasQty } = data;
  const metric = view.metric;
  const fmt = (v) => money(ds, metric, v);

  const soWhat = deltaPct != null
    ? `${metric} ${deltaPct >= 0 ? 'grew' : 'fell'} ${fmtPct(Math.abs(deltaPct))} to ${fmt(cur.total)} (vs ${fmt(prev.total)} prior ${view.gran}).`
    : `${metric} changed by ${fmt(delta)} period-over-period.`;

  const topGains = contribs.filter((c) => c.delta > 0).slice(0, 5);
  const topDrags = contribs.filter((c) => c.delta < 0).slice(0, 5);
  const totalMove = contribs.reduce((s, c) => s + Math.abs(c.delta), 0);

  return (
    <div className="an-section">
      <ConfidenceBadge confidence={confidence} />
      <SoWhat text={soWhat} />

      {/* Period summary cards */}
      <div className="an-growth-header">
        <div className="mis-card an-card an-growth-kpi">
          <div className="mis-card-b">
            <div className="an-gkpi-label">{ds.yearless ? fmtPeriod(prev.label) : fmtPeriod(prev.label)} (previous)</div>
            <div className="an-gkpi-val">{fmt(prev.total)}</div>
          </div>
        </div>
        <div className="an-growth-arrow">
          <span className={delta >= 0 ? 'an-arr-up' : 'an-arr-dn'}>{delta >= 0 ? '→' : '→'}</span>
          <span className={`an-arr-pct ${delta >= 0 ? 'up' : 'down'}`}>{fmtSigned(deltaPct ?? 0)}</span>
        </div>
        <div className="mis-card an-card an-growth-kpi">
          <div className="mis-card-b">
            <div className="an-gkpi-label">{fmtPeriod(cur.label)} (latest)</div>
            <div className="an-gkpi-val">{fmt(cur.total)}</div>
          </div>
        </div>
      </div>

      {/* Contribution waterfall table */}
      {contribs.length > 0 && (
        <div className="mis-card an-card">
          <div className="mis-card-h">
            <div className="mis-card-t">Segment contribution to change</div>
            <div className="mis-card-n">Largest movers, {fmtPeriod(prev.label)} → {fmtPeriod(cur.label)}</div>
          </div>
          <div className="mis-card-b">
            <ScrollTable>
              <thead>
                <tr>
                  <th>Segment</th>
                  <th className="num">Previous</th>
                  <th className="num">Latest</th>
                  <th className="num">Change</th>
                  <th className="num">% of move</th>
                </tr>
              </thead>
              <tbody>
                {contribs.slice(0, 10).map((c) => (
                  <tr key={c.label}>
                    <td
                      className={onDrill ? 'clickable' : ''}
                      onClick={() => onDrill?.([{ dimKey: view.dimKey, label: c.label }])}
                    >{c.label}</td>
                    <td className="num">{fmt(c.prev)}</td>
                    <td className="num">{fmt(c.cur)}</td>
                    <td className={`num ${c.delta >= 0 ? 'an-up' : 'an-dn'}`}>
                      {c.delta >= 0 ? '+' : ''}{fmt(c.delta)}
                    </td>
                    <td className="num">{c.pctOfChange != null ? fmtPct(Math.abs(c.pctOfChange)) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          </div>
        </div>
      )}

      {/* New / lost / retained */}
      <div className="mis-card an-card">
        <div className="mis-card-h"><div className="mis-card-t">Segment dynamics</div></div>
        <div className="mis-card-b an-nlr-grid">
          <div className="an-nlr-item an-nlr-new">
            <div className="an-nlr-n">{fmtInt(newSegs)}</div>
            <div className="an-nlr-label">New segments</div>
            <div className="an-nlr-val">{fmt(newVal)}</div>
          </div>
          <div className="an-nlr-item an-nlr-ret">
            <div className="an-nlr-n">{fmtInt(retained)}</div>
            <div className="an-nlr-label">Retained</div>
            <div className="an-nlr-val">{fmt(retVal)}</div>
          </div>
          <div className="an-nlr-item an-nlr-lost">
            <div className="an-nlr-n">{fmtInt(lostSegs)}</div>
            <div className="an-nlr-label">Lost segments</div>
            <div className="an-nlr-val">{fmt(lostVal)}</div>
          </div>
        </div>
      </div>

      {hasQty && (
        <div className="mis-note an-note-low">
          Price / volume / mix decomposition is included in the data items sent to the narrative. See the items panel for detail.
        </div>
      )}
    </div>
  );
}

// ── 3. CustomersView ──────────────────────────────────────────────────────────

export function CustomersView({ ds, mask, ins, view, theme, analyst, narrative, onDrill }) {
  const mod = analyst?.modules?.customers;
  if (!mod?.data) return <EmptyModule reason="A customer-like dimension and a date column are required." />;

  const { data, confidence } = mod;
  const {
    customerCol, activeCount, newCount, repeatCount, lapsedCount,
    totalVal, aov, top5Share, champions, atRisk, topCustomers,
  } = data;
  const metric = view.metric;
  const fmt = (v) => money(ds, metric, v);

  const soWhat = atRisk > 0
    ? `${fmtInt(atRisk)} high-value customers show low recency — they are at risk of churning.`
    : champions > 0
      ? `${fmtInt(champions)} champion customers (high R, F and M) drive the most reliable revenue.`
      : `${fmtInt(activeCount)} unique customers analysed; ${fmtInt(repeatCount)} made 2 or more purchases.`;

  return (
    <div className="an-section">
      <ConfidenceBadge confidence={confidence} />
      <SoWhat text={soWhat} />

      {/* Summary KPIs */}
      <div className="an-cust-kpis">
        {[
          { label: 'Active customers', val: fmtInt(activeCount) },
          { label: 'New', val: fmtInt(newCount) },
          { label: 'Repeat (≥2)', val: fmtInt(repeatCount) },
          { label: 'Lapsed', val: fmtInt(lapsedCount) },
          { label: 'Avg transaction', val: fmt(aov) },
          { label: 'Top-5 share', val: fmtPct(top5Share) },
        ].map((k) => (
          <div key={k.label} className="mis-card an-card an-cust-kpi">
            <div className="mis-card-b">
              <div className="an-ckpi-val">{k.val}</div>
              <div className="an-ckpi-label">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* RFM segment summary */}
      <div className="mis-card an-card">
        <div className="mis-card-h"><div className="mis-card-t">RFM segment summary</div><div className="mis-card-n">Quintile-based scoring; indicative only</div></div>
        <div className="mis-card-b an-rfm-row">
          <div className="an-rfm-box an-rfm-champ">
            <div className="an-rfm-n">{fmtInt(champions)}</div>
            <div className="an-rfm-label">Champions<br /><span className="an-rfm-sub">High R · F · M</span></div>
          </div>
          <div className="an-rfm-box an-rfm-risk">
            <div className="an-rfm-n">{fmtInt(atRisk)}</div>
            <div className="an-rfm-label">At risk<br /><span className="an-rfm-sub">Low R, High M</span></div>
          </div>
        </div>
      </div>

      {/* Top customers table */}
      {topCustomers?.length > 0 && (
        <div className="mis-card an-card">
          <div className="mis-card-h">
            <div className="mis-card-t">Top customers by {metric}</div>
            <div className="mis-card-n">RFM scores: 1 (lowest) – 5 (highest)</div>
          </div>
          <div className="mis-card-b">
            <ScrollTable>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">{metric}</th>
                  <th className="num">Transactions</th>
                  <th className="num">R</th>
                  <th className="num">F</th>
                  <th className="num">M</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c) => (
                  <tr key={c.label}>
                    <td
                      className={onDrill ? 'clickable' : ''}
                      onClick={() => onDrill?.([{ dimKey: customerCol, label: c.label }])}
                    >{c.label}</td>
                    <td className="num">{fmt(c.value)}</td>
                    <td className="num">{fmtInt(c.freq)}</td>
                    <td className="num an-rfm-score">{c.R}</td>
                    <td className="num an-rfm-score">{c.F}</td>
                    <td className="num an-rfm-score">{c.M}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          </div>
        </div>
      )}

      {confidence === 'low' && (
        <LowData message="Fewer than 10 active customers — RFM scores and cohort retention are indicative only." />
      )}
    </div>
  );
}

// ── 4. ProductsView ───────────────────────────────────────────────────────────

export function ProductsView({ ds, mask, ins, view, theme, analyst, narrative, onDrill }) {
  const mod = analyst?.modules?.products;
  if (!mod?.data) return <EmptyModule reason="A product-like dimension is required." />;

  const { data, confidence } = mod;
  const {
    productCol, totalProducts, totalValue,
    portfolio, basketPairs, correlations,
    hasPrice, hasDiscount, hasOrders,
  } = data;
  const metric = view.metric;
  const fmt = (v) => money(ds, metric, v);

  const stars = portfolio.filter((x) => x.growth != null && x.growth > 0 && x.share > 1 / Math.max(1, portfolio.length));
  const soWhat = stars.length > 0
    ? `${stars.length} product${stars.length > 1 ? 's are' : ' is'} growing above average and hold above-average share — prioritise them.`
    : `${fmtInt(totalProducts)} products analysed; top 3 hold ${fmtPct(portfolio.slice(0, 3).reduce((s, x) => s + x.share, 0))} of ${metric}.`;

  return (
    <div className="an-section">
      <ConfidenceBadge confidence={confidence} />
      <SoWhat text={soWhat} />

      {/* Portfolio matrix table */}
      {portfolio.length > 0 && (
        <div className="mis-card an-card">
          <div className="mis-card-h">
            <div className="mis-card-t">Portfolio: growth vs share</div>
            <div className="mis-card-n">{fmtInt(totalProducts)} products · {metric} total {fmt(totalValue)}</div>
          </div>
          <div className="mis-card-b">
            <ScrollTable>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Value</th>
                  <th className="num">Share</th>
                  <th className="num">Period growth</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.slice(0, 15).map((p) => {
                  const isStar = p.growth != null && p.growth > 0 && p.share > 1 / Math.max(1, portfolio.length);
                  const isLag = p.growth != null && p.growth < 0;
                  return (
                    <tr key={p.label}>
                      <td
                        className={onDrill ? 'clickable' : ''}
                        onClick={() => onDrill?.([{ dimKey: productCol, label: p.label }])}
                      >{p.label}</td>
                      <td className="num">{fmt(p.value)}</td>
                      <td className="num">{fmtPct(p.share)}</td>
                      <td className={`num ${p.growth == null ? '' : p.growth >= 0 ? 'an-up' : 'an-dn'}`}>
                        {p.growth != null ? fmtSigned(p.growth) : '–'}
                      </td>
                      <td>
                        {isStar && <span className="an-port-badge an-port-star">Star</span>}
                        {isLag && !isStar && <span className="an-port-badge an-port-lag">Watch</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollTable>
          </div>
        </div>
      )}

      {/* Cross-sell pairs */}
      {hasOrders && basketPairs?.length > 0 && (
        <div className="mis-card an-card">
          <div className="mis-card-h">
            <div className="mis-card-t">Top cross-sell pairs</div>
            <div className="mis-card-n">Support ≥ 1% of orders; lift {'>'} 1 means co-purchase exceeds chance</div>
          </div>
          <div className="mis-card-b">
            <ScrollTable>
              <thead>
                <tr>
                  <th>Product A</th>
                  <th>Product B</th>
                  <th className="num">Support</th>
                  <th className="num">Lift</th>
                  <th className="num">Co-orders</th>
                </tr>
              </thead>
              <tbody>
                {basketPairs.slice(0, 10).map((p, i) => (
                  <tr key={i}>
                    <td>{p.a}</td>
                    <td>{p.b}</td>
                    <td className="num">{fmtPct(p.support)}</td>
                    <td className={`num ${p.lift >= 1.5 ? 'an-up' : ''}`}>{p.lift.toFixed(2)}×</td>
                    <td className="num">{fmtInt(p.count)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          </div>
        </div>
      )}

      {/* Correlations */}
      {correlations?.length > 0 && (
        <div className="mis-card an-card">
          <div className="mis-card-h">
            <div className="mis-card-t">Measure correlations</div>
            <div className="mis-card-n">Pearson r · n ≥ 30 records · correlation ≠ causation</div>
          </div>
          <div className="mis-card-b">
            {correlations.map((c, i) => (
              <div key={i} className="an-corr-row">
                <span className="an-corr-pair">{c.a} · {c.b}</span>
                <div className="an-corr-bar-wrap">
                  <div
                    className={`an-corr-bar ${c.r >= 0 ? 'an-corr-pos' : 'an-corr-neg'}`}
                    style={{ width: Math.abs(c.r) * 100 + '%' }}
                  />
                </div>
                <span className="an-corr-r">{c.r.toFixed(2)}</span>
                <span className="an-corr-n muted small">n={fmtInt(c.n)}</span>
              </div>
            ))}
            <div className="mis-note" style={{ marginTop: '8px' }}>Correlation is not proof of causation. Use these pairs to decide what to investigate.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5. RiskView ───────────────────────────────────────────────────────────────

export function RiskView({ ds, mask, ins, view, theme, analyst, narrative, onDrill }) {
  const mod = analyst?.modules?.risk;
  if (!mod?.data) return <EmptyModule reason="A numeric measure with at least 5 records is required." />;

  const { data, confidence } = mod;
  const {
    metric, n,
    p5, p25, median, p75, p95, iqr,
    mean, std, cv, skew, skewDir,
    lowerFence, upperFence, outlierCount,
    volatilityRanks, dupImpact, negCount, negSum,
  } = data;
  const fmt = (v) => money(ds, metric, v);

  const soWhat = outlierCount > 0
    ? `${fmtInt(outlierCount)} records (${fmtPct(outlierCount / n)}) are outside IQR fences — validate before reporting.`
    : cv != null && cv > 1
      ? `High dispersion in ${metric} (CV ${fmtPct(cv)}) — segment-level volatility warrants attention.`
      : `Distribution of ${metric} across ${fmtInt(n)} records is ${skewDir}.`;

  return (
    <div className="an-section">
      <ConfidenceBadge confidence={confidence} />
      <SoWhat text={soWhat} />

      {/* Distribution summary */}
      <div className="mis-card an-card">
        <div className="mis-card-h">
          <div className="mis-card-t">{metric} distribution</div>
          <div className="mis-card-n">{fmtInt(n)} records · {skewDir}</div>
        </div>
        <div className="mis-card-b">
          <div className="an-dist-strip">
            {[
              { label: 'p5', val: fmt(p5) },
              { label: 'p25', val: fmt(p25) },
              { label: 'Median', val: fmt(median) },
              { label: 'p75', val: fmt(p75) },
              { label: 'p95', val: fmt(p95) },
            ].map((d) => (
              <div key={d.label} className="an-dist-item">
                <div className="an-dist-label">{d.label}</div>
                <div className="an-dist-val">{d.val}</div>
              </div>
            ))}
          </div>
          <div className="an-dist-meta">
            <span>IQR {fmt(iqr)}</span>
            <span>·</span>
            <span>Fences [{fmt(lowerFence)}, {fmt(upperFence)}]</span>
            {cv != null && <><span>·</span><span>CV {fmtPct(cv)}</span></>}
          </div>
        </div>
      </div>

      {/* Outliers */}
      {outlierCount > 0 && (
        <div className="mis-card an-card an-risk-card">
          <div className="mis-card-b">
            <div className="an-risk-row">
              <span className="an-risk-icon">⚠</span>
              <div>
                <div className="an-risk-title">{fmtInt(outlierCount)} IQR outliers detected</div>
                <div className="an-risk-body">{fmtPct(outlierCount / n)} of records fall outside [{fmt(lowerFence)}, {fmt(upperFence)}]. Review before presenting totals.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Volatility ranking */}
      {volatilityRanks?.length > 0 && (
        <div className="mis-card an-card">
          <div className="mis-card-h">
            <div className="mis-card-t">Segment volatility ranking</div>
            <div className="mis-card-n">Coefficient of variation (CV = std ÷ mean)</div>
          </div>
          <div className="mis-card-b">
            <ScrollTable>
              <thead>
                <tr>
                  <th>Segment</th>
                  <th>Dimension</th>
                  <th className="num">Mean</th>
                  <th className="num">CV</th>
                </tr>
              </thead>
              <tbody>
                {volatilityRanks.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>{r.label}</td>
                    <td className="muted">{r.dim}</td>
                    <td className="num">{fmt(r.mean)}</td>
                    <td className={`num ${r.cv > 1 ? 'an-dn' : r.cv > 0.5 ? 'an-warn' : ''}`}>{fmtPct(r.cv)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          </div>
        </div>
      )}

      {/* Data quality impact */}
      {(negCount > 0 || (dupImpact && Math.abs(dupImpact) > 0)) && (
        <div className="mis-card an-card">
          <div className="mis-card-h"><div className="mis-card-t">Data quality impact</div></div>
          <div className="mis-card-b an-dq-list">
            {dupImpact != null && Math.abs(dupImpact) > 0 && (
              <div className="an-dq-row">
                <span className="an-dq-icon">⧉</span>
                <span>Duplicate rows inflate {metric} by approximately <strong>{fmt(dupImpact)}</strong>. Indicative only.</span>
              </div>
            )}
            {negCount > 0 && (
              <div className="an-dq-row">
                <span className="an-dq-icon">−</span>
                <span><strong>{fmtInt(negCount)}</strong> negative values totalling <strong>{fmt(negSum)}</strong> — may indicate returns or reversals.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 6. ScenariosView ──────────────────────────────────────────────────────────

export function ScenariosView({ ds, mask, ins, view, theme, analyst, narrative, onDrill }) {
  const mod = analyst?.modules?.scenarios;
  if (!mod?.data) return <EmptyModule reason="At least 6 complete periods are needed to model a forecast." />;

  const { data, confidence } = mod;
  const {
    metric, gran, method, reliability, seasonal, n, backtest,
    scenarios: scens, horizon, errorBand,
  } = data;
  const fmt = (v) => money(ds, metric, v);

  const next = scens[0];
  const soWhat = next
    ? `Next ${gran} base case: ${fmt(next.base)} (best ${fmt(next.best)}, worst ${fmt(next.worst)}). ${reliability === 'low' ? 'Indicative only — low reliability.' : ''}`
    : 'Scenario model built; see table below.';

  const periodLabel = (l) => ds.yearless
    ? (MONTH_NAMES[parseInt((l || '').split('-')[1], 10) - 1] || l)
    : fmtPeriod(l);

  return (
    <div className="an-section">
      <ConfidenceBadge confidence={confidence} />
      <SoWhat text={soWhat} />

      {/* Reliability chip */}
      <div className="an-fc-meta">
        <span className={`mis-rel ${reliability}`}>{reliability} reliability</span>
        <span className="an-fc-method">{method}{seasonal ? ' · seasonal' : ''}</span>
        <span className="an-fc-basis">Based on {fmtInt(n)} {gran}s</span>
        {backtest && (
          <span className="an-fc-bt">
            Backtest MAPE {fmtPct(backtest.mape)} vs naive {fmtPct(backtest.naiveMape)}
          </span>
        )}
      </div>

      {/* Scenario table */}
      <div className="mis-card an-card">
        <div className="mis-card-h">
          <div className="mis-card-t">Base / Best / Worst scenarios</div>
          <div className="mis-card-n">
            Best = trend + {fmtPct(errorBand)} error band · Worst = trend − {fmtPct(errorBand)} · Indicative only
          </div>
        </div>
        <div className="mis-card-b">
          <ScrollTable>
            <thead>
              <tr>
                <th>Period</th>
                <th className="num">Base</th>
                <th className="num an-col-best">Best</th>
                <th className="num an-col-worst">Worst</th>
                <th className="num">80% lo</th>
                <th className="num">80% hi</th>
              </tr>
            </thead>
            <tbody>
              {scens.map((sc, i) => (
                <tr key={i}>
                  <td>{periodLabel(sc.label)}</td>
                  <td className="num">{fmt(sc.base)}</td>
                  <td className="num an-col-best">{fmt(sc.best)}</td>
                  <td className="num an-col-worst">{fmt(sc.worst)}</td>
                  <td className="num muted">{fmt(sc.lo)}</td>
                  <td className="num muted">{fmt(sc.hi)}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </div>
      </div>

      {/* Scenario chart */}
      {scens.length > 0 && (
        <div className="mis-card an-card">
          <div className="mis-card-h">
            <div className="mis-card-t">Scenario range</div>
          </div>
          <div className="mis-card-b">
            <ChartCanvas
              type="line"
              theme={theme}
              height={200}
              labels={scens.map((s) => periodLabel(s.label))}
              datasets={[
                { label: 'Base', data: scens.map((s) => s.base), kind: 'line' },
                { label: 'Best', data: scens.map((s) => s.best), kind: 'line', dashed: true },
                { label: 'Worst', data: scens.map((s) => s.worst), kind: 'line', dashed: true },
              ]}
              fmt={fmt}
            />
          </div>
        </div>
      )}

      <div className="mis-note">All projections are model outputs, not predictions. No external events are factored in.</div>
    </div>
  );
}

// ── 7. RecommendationsView ────────────────────────────────────────────────────

const IMPACT_COLOR = { high: 'an-rec-high', medium: 'an-rec-med', low: 'an-rec-low' };
const EFFORT_LABEL = { low: 'Low effort', medium: 'Medium effort', high: 'High effort' };
const IMPACT_LABEL = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' };

export function RecommendationsView({ ds, mask, ins, view, theme, analyst, narrative, onDrill }) {
  const mod = analyst?.modules?.recommendations;
  if (!mod?.data?.recommendations?.length) return <EmptyModule reason="No actionable recommendations could be derived from the current data." />;

  const { data, confidence } = mod;
  const { recommendations } = data;

  const topRec = recommendations[0];
  const soWhat = topRec
    ? `Top action: ${topRec.title} (${IMPACT_LABEL[topRec.impact]}, ${EFFORT_LABEL[topRec.effort]}).`
    : null;

  return (
    <div className="an-section">
      <ConfidenceBadge confidence={confidence} />
      <SoWhat text={soWhat} />

      <div className="an-rec-list">
        {recommendations.map((r, i) => (
          <div key={r.id} className={`mis-card an-card an-rec-card ${IMPACT_COLOR[r.impact]}`}>
            <div className="mis-card-b">
              <div className="an-rec-header">
                <div className="an-rec-badges">
                  <span className={`an-rec-imp-badge an-rec-imp-${r.impact}`}>{IMPACT_LABEL[r.impact]}</span>
                  <span className="an-rec-eff-badge">{EFFORT_LABEL[r.effort]}</span>
                </div>
                {r.owner_hint && <span className="an-rec-owner">{r.owner_hint}</span>}
              </div>
              <div className="an-rec-title">{r.title}</div>
              <div className="an-rec-why">{r.why}</div>
              {r.sizeText && r.sizeText !== 'not sizeable from this data' && (
                <div className="an-rec-size">
                  <span className="an-rec-size-label">Opportunity sizing</span>
                  {r.sizeText}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {recommendations.length === 0 && (
        <LowData message="Insufficient data to generate prioritised recommendations. Add more dimensions or periods." />
      )}
    </div>
  );
}
