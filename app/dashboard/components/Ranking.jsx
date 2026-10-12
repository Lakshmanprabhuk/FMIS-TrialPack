'use client';

import { useMemo, useState } from 'react';
import { dimTitle, metricInfo } from '../../../lib/mis/engine';
import { fmtMetric, fmtPct, fmtInt } from '../../../lib/mis/format';
import { Card, ChartCard, Empty } from './ui';
import ChartCanvas from './ChartCanvas';

const ABC_NOTE = { A: 'Items that make up the first 80% of value', B: 'Next 15% of value', C: 'Final 5% of value (long tail)' };

function ShareList({ items, money, color }) {
  return (
    <div className="mis-sl">
      {items.map((it) => (
        <div key={it.code} className="mis-sl-row">
          <div className="mis-sl-name" title={it.label}>{it.label}</div>
          <div className="mis-sl-bar"><span style={{ width: Math.min(100, Math.max(0, it.share * 100)) + '%', background: color }} /></div>
          <div className="mis-sl-val mis-num">{money(it.value)}</div>
          <div className="mis-sl-pct mis-num">{fmtPct(it.share)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Ranking({ ds, ins, view, theme, onDrill, commentary }) {
  const [n, setN] = useState(10);
  const p = ins.pareto;
  const info = metricInfo(ds, view.metric);
  const money = (v) => fmtMetric(v, info);
  const dn = dimTitle(ds, view.dimKey);

  const pareto = useMemo(() => {
    if (!p) return null;
    const top = p.items.slice(0, 25);
    return {
      top,
      labels: top.map((i) => i.label),
      bars: top.map((i) => i.value),
      cum: top.map((i) => +(i.cum * 100).toFixed(2)),
      ref: top.map(() => 80),
    };
  }, [p]);

  const shareData = useMemo(() => {
    if (!p) return null;
    const top = p.items.slice(0, 10);
    const rest = p.items.slice(10).reduce((a, x) => a + x.value, 0);
    const labels = top.map((x) => x.label);
    const data = top.map((x) => x.value);
    if (rest > 0) { labels.push('Other'); data.push(rest); }
    return { labels, data };
  }, [p]);

  if (!view.dimKey) return <Empty title="Ranking unavailable">No categorical column was found to rank.</Empty>;
  if (!p || !p.items.length) return <Empty title="Nothing to rank">No positive values for {view.metric === '__count' ? 'records' : view.metric} by {dn} in the current view.</Empty>;

  const bottom = p.items.slice(-n).reverse();
  const drillTo = (label) => onDrill([{ dimKey: view.dimKey, label }]);

  return (
    <>
      <Card title={`Pareto: ${view.metric === '__count' ? 'records' : view.metric} by ${dn}`} note={`${p.n80} of ${fmtInt(p.items.length)} values (${fmtPct(p.pct80, 0)}) make up 80% of the total. Showing top ${pareto.top.length}. Click a bar to drill in.`}>
        <ChartCanvas
          type="bar"
          theme={theme}
          height={290}
          labels={pareto.labels}
          fmt={(v) => money(v)}
          label="Pareto chart"
          onPick={(i) => drillTo(pareto.labels[i])}
          datasets={[
            { label: view.metric === '__count' ? 'Records' : view.metric, data: pareto.bars, kind: 'bar' },
            { label: 'Cumulative %', data: pareto.cum, kind: 'line', yAxisID: 'y1' },
            { label: '80% line', data: pareto.ref, kind: 'line', yAxisID: 'y1', dashed: true, points: false, color: '#9E9E9E' },
          ]}
        />
        {p.excluded > 0 && <div className="mis-muted small">{p.excluded} value(s) with zero or negative totals are excluded from the Pareto analysis.</div>}
      </Card>

      <div className="mis-abc">
        {['A', 'B', 'C'].map((c) => (
          <div key={c} className={'mis-abc-card cls-' + c}>
            <div className="mis-abc-h"><span className="mis-abc-tag">{c}</span> {fmtInt(p.summary[c].n)} items</div>
            <div className="mis-abc-v mis-num">{fmtPct(p.summary[c].v)} <small>of value</small></div>
            <div className="mis-muted small">{ABC_NOTE[c]}</div>
          </div>
        ))}
      </div>

      <div className="mis-grid2">
        <Card title={`Top ${n}`} actions={<select className="mis-sel" value={n} onChange={(e) => setN(+e.target.value)}>{[5, 10, 15].map((x) => <option key={x} value={x}>{x}</option>)}</select>}>
          <ShareList items={p.items.slice(0, n)} money={money} color="#2E7D32" />
        </Card>
        <Card title={`Bottom ${n}`} note="Smallest positive totals">
          <ShareList items={bottom} money={money} color="#7B1E30" />
        </Card>
      </div>

      <div className="mis-grid2">
        <ChartCard title="Share of total" note="Top 10 plus 'Other'" types={['horizontal_bar', 'bar', 'donut']}>
          {(t) => <ChartCanvas type={t} theme={theme} height={290} labels={shareData.labels} fmt={(v) => money(v)} label="Share of total" datasets={[{ label: view.metric === '__count' ? 'Records' : view.metric, data: shareData.data }]} onPick={(i) => shareData.labels[i] !== 'Other' && drillTo(shareData.labels[i])} />}
        </ChartCard>
        <Card title="ABC classification" note="Cumulative share before an item decides its class">
          <div className="mis-tscroll">
            <table className="mis-table">
              <thead><tr><th>{dn}</th><th className="num">Value</th><th className="num">Share</th><th className="num">Cumulative</th><th>Class</th></tr></thead>
              <tbody>
                {p.items.slice(0, 40).map((it) => (
                  <tr key={it.code}>
                    <td className="clickable" onClick={() => drillTo(it.label)}>{it.label}</td>
                    <td className="num">{money(it.value)}</td>
                    <td className="num">{fmtPct(it.share)}</td>
                    <td className="num">{fmtPct(it.cum)}</td>
                    <td><span className={'mis-abc-tag cls-' + it.cls}>{it.cls}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {commentary?.opportunities?.length > 0 && null}
    </>
  );
}
