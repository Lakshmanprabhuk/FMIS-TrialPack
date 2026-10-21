'use client';

import { useMemo, useState } from 'react';
import { metricInfo } from '../../../lib/mis/engine';
import { comparePeriods, compareSegments } from '../../../lib/mis/deep';
import { fmtMetric, fmtInt, fmtPeriod, fmtSigned } from '../../../lib/mis/format';
import { Card, Delta, Empty } from './ui';
import ChartCanvas from './ChartCanvas';
import Waterfall from './Waterfall';

const Tiles = ({ aL, bL, a, b, d, pct }) => (
  <div className="mis-comps">
    <div className="mis-comp"><div className="mis-comp-l">{aL}</div><div className="mis-comp-v mis-num">{a}</div></div>
    <div className="mis-comp"><div className="mis-comp-l">{bL}</div><div className="mis-comp-v mis-num">{b}</div></div>
    <div className="mis-comp"><div className="mis-comp-l">Change</div><div className="mis-comp-v mis-num">{d}</div><Delta v={pct} /></div>
  </div>
);

export default function Compare({ ds, mask, ins, view, theme }) {
  const s = ins.series;
  const hasT = !!s, hasD = !!view.dimKey;
  const [mode, setMode] = useState(hasT ? 'periods' : 'segments');
  const [pa, setPa] = useState('');
  const [pb, setPb] = useState('');
  const [sa, setSa] = useState('');
  const [sb, setSb] = useState('');
  const info = metricInfo(ds, view.metric);
  const money = (v) => fmtMetric(v, info);

  const pOpts = s ? s.labels.slice(-120).reverse() : [];
  const sOpts = ins.groups.map((g) => g.label);
  const pick = (v, opts, dflt) => (opts.includes(v) ? v : dflt);
  const A = pick(pa, pOpts, s && pOpts.includes(s.labels[s.endIdx]) ? s.labels[s.endIdx] : pOpts[0]);
  const B = pick(pb, pOpts, s && s.endIdx > 0 && pOpts.includes(s.labels[s.endIdx - 1]) ? s.labels[s.endIdx - 1] : pOpts[1]);
  const SA = pick(sa, sOpts, sOpts[0]);
  const SB = pick(sb, sOpts, sOpts[1]);

  const pr = useMemo(() => (mode === 'periods' && hasT && A && B && A !== B ? comparePeriods(ds, mask, view, view.dimKey, A, B) : null), [mode, hasT, ds, mask, view, A, B]);
  const sr = useMemo(() => (mode === 'segments' && hasD && SA && SB && SA !== SB ? compareSegments(ds, mask, view, SA, SB) : null), [mode, hasD, ds, mask, view, SA, SB]);

  const yearAgo = s && ins.series.analytics.lag && s.endIdx >= s.analytics.lag ? s.labels[s.endIdx - s.analytics.lag] : null;
  const sel = (label, value, set, opts, fmt) => (
    <label className="mis-f"><span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{fmt ? fmt(o) : o}</option>)}</select>
    </label>
  );
  const val = (r, v) => (r.kind === 'count' ? fmtInt(v) : money(v));

  if (!hasT && !hasD) return <Empty title="Nothing to compare">This file has no date column and no category to compare.</Empty>;

  return (
    <>
      <Card>
        <div className="mis-filterbar flat">
          <div className="mis-seg">
            <button className={mode === 'periods' ? 'active' : ''} disabled={!hasT} onClick={() => setMode('periods')}>Periods</button>
            <button className={mode === 'segments' ? 'active' : ''} disabled={!hasD} onClick={() => setMode('segments')}>Segments</button>
          </div>
          {mode === 'periods' ? (
            <>
              {sel('Period', A, setPa, pOpts, fmtPeriod)}
              {sel('Compared with', B, setPb, pOpts, fmtPeriod)}
              <button className="mis-link" onClick={() => { setPa(s.labels[s.endIdx]); setPb(s.labels[s.endIdx - 1] || ''); }}>Latest vs previous</button>
              {yearAgo && <button className="mis-link" onClick={() => { setPa(s.labels[s.endIdx]); setPb(yearAgo); }}>Latest vs year ago</button>}
            </>
          ) : (
            <>{sel('Segment', SA, setSa, sOpts)}{sel('Compared with', SB, setSb, sOpts)}</>
          )}
        </div>
      </Card>

      {mode === 'periods' && (pr ? (
        <>
          <Tiles aL={fmtPeriod(pr.aLabel)} bL={fmtPeriod(pr.bLabel)} a={money(pr.totalA)} b={money(pr.totalB)} d={(pr.delta >= 0 ? '+' : '') + money(pr.delta)} pct={pr.pct} />
          {pr.waterfall && <Card title="Where the difference comes from" note="Largest segment changes. Axis does not start at zero."><Waterfall rows={pr.waterfall.rows} lo={pr.waterfall.lo} hi={pr.waterfall.hi} money={money} /></Card>}
          {pr.rows.length > 0 && (
            <Card title="Segment detail">
              <div className="mis-tscroll">
                <table className="mis-table">
                  <thead><tr><th>{view.dimKey}</th><th className="num">{fmtPeriod(pr.bLabel)}</th><th className="num">{fmtPeriod(pr.aLabel)}</th><th className="num">Change</th><th className="num">%</th></tr></thead>
                  <tbody>{pr.rows.slice(0, 25).map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{money(r.b)}</td><td className="num">{money(r.a)}</td><td className="num">{(r.delta >= 0 ? '+' : '') + money(r.delta)}</td><td className="num">{fmtSigned(r.pct)}</td></tr>)}</tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : <Empty title="Pick two different periods">Choose a period and something to compare it with.</Empty>)}

      {mode === 'segments' && (sr ? (
        <>
          <Tiles aL={sr.A.label} bL={sr.B.label} a={money(sr.A.total)} b={money(sr.B.total)} d={(sr.A.total - sr.B.total >= 0 ? '+' : '') + money(sr.A.total - sr.B.total)} pct={sr.B.total ? (sr.A.total - sr.B.total) / Math.abs(sr.B.total) : null} />
          {sr.labels.length > 1 && (
            <Card title="Over time">
              <ChartCanvas type="line" theme={theme} height={270} labels={sr.labels.map(fmtPeriod)} fmt={(v) => money(v)} label="Segment comparison"
                datasets={[{ label: sr.A.label, data: sr.sa, kind: 'line' }, { label: sr.B.label, data: sr.sb, kind: 'line' }]} />
            </Card>
          )}
          <Card title="Side by side">
            <table className="mis-table">
              <thead><tr><th>Measure</th><th className="num">{sr.A.label}</th><th className="num">{sr.B.label}</th><th className="num">Difference</th><th className="num">%</th></tr></thead>
              <tbody>{sr.rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{val(r, r.a)}</td><td className="num">{val(r, r.b)}</td><td className="num">{(r.delta >= 0 ? '+' : '') + val(r, r.delta)}</td><td className="num">{fmtSigned(r.pct)}</td></tr>)}</tbody>
            </table>
          </Card>
        </>
      ) : <Empty title="Pick two different segments">At least two values are needed in the grouping column.</Empty>)}
    </>
  );
}
