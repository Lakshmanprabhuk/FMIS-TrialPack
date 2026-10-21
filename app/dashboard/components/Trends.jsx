'use client';

import { useMemo } from 'react';
import { addPeriod, metricInfo } from '../../../lib/mis/engine';
import { fmtMetric, fmtPeriod, fmtSigned, POP_LABEL, GRAN_LABEL } from '../../../lib/mis/format';
import { Card, ChartCard, Delta, Empty } from './ui';
import ChartCanvas from './ChartCanvas';

export default function Trends({ ds, ins, view, theme, onDrill }) {
  const s = ins.series;
  const g = view.gran;
  const info = metricInfo(ds, view.metric);
  const money = (v) => fmtMetric(v, info);

  const model = useMemo(() => {
    if (!s) return null;
    const { labels, values, analytics: a, endIdx } = s;
    const P = labels.length;
    const proj = a.projection;
    const extra = [];
    if (proj) for (let k = 1; k <= proj.values.length; k++) if (endIdx + k > P - 1) extra.push(addPeriod(labels[P - 1], g, endIdx + k - (P - 1)));
    const keys = [...labels, ...extra];
    const actual = keys.map((_, i) => (i < P ? values[i] : null));
    const ma = keys.map((_, i) => (i < P ? a.ma[i] : null));
    const pj = keys.map(() => null);
    if (proj) {
      pj[endIdx] = values[endIdx];
      proj.values.forEach((v, k) => { pj[endIdx + 1 + k] = v; });
    }
    const pop = a.pop.map((v) => (v == null ? null : +(v * 100).toFixed(2)));
    const yoy = a.yoy.map((v) => (v == null ? null : +(v * 100).toFixed(2)));
    return { keys, labelsFmt: keys.map(fmtPeriod), actual, ma, pj, pop, yoy, hasProj: !!proj, hasYoY: yoy.some((v) => v != null), popColors: pop.map((v) => (v != null && v < 0 ? '#B3261E' : '#2E7D32')) };
  }, [s, g]);

  if (!s || !model) return <Empty title="Trend analysis unavailable">No usable date column was found in this data (or no dated rows match the filters). Breakdown and ranking sections still work.</Empty>;

  const { analytics: a } = s;
  const P = s.labels.length;
  const rows = [];
  for (let i = P - 1; i >= Math.max(0, P - 12); i--) rows.push(i);

  return (
    <>
      <div className="mis-comps">
        {a.comps.map((c) => (
          <div key={c.key} className="mis-comp">
            <div className="mis-comp-l">{c.label}</div>
            <div className="mis-comp-v mis-num">{money(c.cur)}</div>
            <div className="mis-comp-s">vs <span className="mis-num">{money(c.prev)}</span> {c.prevLabel ? `(${fmtPeriod(c.prevLabel)})` : ''}</div>
            <Delta v={c.change} />
          </div>
        ))}
        {!a.comps.length && <div className="mis-note">At least two periods are needed for comparisons.</div>}
      </div>

      <ChartCard title={`${view.metric === '__count' ? 'Records' : view.metric} by ${GRAN_LABEL[g].toLowerCase()}`} note="Moving average is a trailing 3-period mean" types={['line', 'bar']}>
        {(t) => (
          <ChartCanvas
            type={t}
            theme={theme}
            height={290}
            labels={model.labelsFmt}
            fmt={(v) => money(v)}
            label="Time series"
            onPick={(i) => { if (i < P) onDrill([{ dimKey: `${ds.primaryDate}@${g}`, label: s.labels[i] }]); }}
            datasets={[
              { label: 'Actual', data: model.actual, kind: t === 'bar' ? 'bar' : 'line', fill: t === 'line' },
              { label: '3-period moving avg', data: model.ma, kind: 'line', points: false },
              model.hasProj && { label: 'Projected (linear trend)', data: model.pj, kind: 'line', dashed: true },
            ].filter(Boolean)}
          />
        )}
      </ChartCard>
      <div className="mis-note">
        {model.hasProj
          ? `Projection is an indicative straight-line extrapolation of the last ${a.projection.basis} complete periods, not a forecast.`
          : 'Fewer than 4 complete periods, so no projection is shown.'}
        {ins.partial ? ' The latest period is incomplete and excluded from comparisons and the projection basis.' : ''}
      </div>

      <div className="mis-grid2">
        <Card title={`${POP_LABEL[g]}${model.hasYoY ? ' and YoY' : ''} change (%)`}>
          <ChartCanvas
            type="bar"
            theme={theme}
            height={220}
            labels={model.labelsFmt.slice(0, P)}
            fmt={(v) => Number(v).toFixed(1) + '%'}
            label="Period change"
            datasets={[
              { label: `${POP_LABEL[g]} %`, data: model.pop, kind: 'bar', colors: model.popColors },
              model.hasYoY && { label: 'YoY %', data: model.yoy, kind: 'line' },
            ].filter(Boolean)}
          />
        </Card>
        <Card title="Latest periods">
          <div className="mis-tscroll">
            <table className="mis-table">
              <thead><tr><th>Period</th><th className="num">Value</th><th className="num">{POP_LABEL[g]}</th>{a.lag && <th className="num">YoY</th>}<th className="num">MA(3)</th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i}>
                    <td>{fmtPeriod(s.labels[i])}{ins.partial && i === P - 1 ? ' *' : ''}</td>
                    <td className="num">{money(s.values[i])}</td>
                    <td className="num">{fmtSigned(a.pop[i])}</td>
                    {a.lag && <td className="num">{fmtSigned(a.yoy[i])}</td>}
                    <td className="num">{a.ma[i] == null ? '–' : money(a.ma[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ins.partial && <div className="mis-muted small">* incomplete period</div>}
        </Card>
      </div>
    </>
  );
}
