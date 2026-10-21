'use client';

import { useMemo } from 'react';
import { metricInfo } from '../../../lib/mis/engine';
import { fmtMetric, fmtPct, fmtPeriod } from '../../../lib/mis/format';
import { COLOR_THEMES } from '../../../lib/mis/chartSetup';
import { Card, Empty } from './ui';
import ChartCanvas from './ChartCanvas';

export default function Forecast({ ds, ins, view, theme, deep }) {
  const f = deep?.forecast, s = ins.series;
  const pal = (COLOR_THEMES[theme] || COLOR_THEMES.burgundy).swatches;
  const info = metricInfo(ds, view.metric);
  const money = (v) => fmtMetric(v, info);

  const m = useMemo(() => {
    if (!f?.ok || !s) return null;
    const L = s.labels.slice(0, s.endIdx + 1), V = s.values.slice(0, s.endIdx + 1);
    const keep = Math.max(0, L.length - 36);
    const hl = L.slice(keep), hv = V.slice(keep), nH = hl.length;
    const keys = [...hl, ...f.points.map((p) => p.label)];
    const at = (pick) => keys.map((_, i) => (i === nH - 1 ? hv[nH - 1] : i >= nH ? pick(f.points[i - nH]) : null));
    return { labels: keys.map(fmtPeriod), actual: keys.map((_, i) => (i < nH ? hv[i] : null)), fc: at((p) => p.value), lo: at((p) => p.lo), hi: at((p) => p.hi) };
  }, [f, s]);

  if (!f) return null;
  if (!f.ok || !m) return <Empty title="Forecast unavailable">{f.reason || 'No time series is available for this view.'}</Empty>;
  const p0 = f.points[0], total = f.points.reduce((a, p) => a + p.value, 0), bt = f.backtest;

  return (
    <>
      <div className="mis-comps">
        <div className="mis-comp"><div className="mis-comp-l">Next period</div><div className="mis-comp-v mis-num">{money(p0.value)}</div><div className="mis-comp-s">{fmtPeriod(p0.label)}</div></div>
        <div className="mis-comp"><div className="mis-comp-l">80% range</div><div className="mis-comp-v mis-num">{money(p0.lo)} – {money(p0.hi)}</div><div className="mis-comp-s">next period</div></div>
        <div className="mis-comp"><div className="mis-comp-l">Next {f.points.length} periods</div><div className="mis-comp-v mis-num">{money(total)}</div><div className="mis-comp-s">projected total</div></div>
        <div className="mis-comp"><div className="mis-comp-l">Reliability</div><div style={{ margin: '6px 0' }}><span className={'mis-rel ' + f.reliability}>{f.reliability}</span></div><div className="mis-comp-s">{f.method}</div></div>
      </div>

      <Card title="Forecast with confidence band" note="Shaded band is the 80% range. It widens the further out you look.">
        <ChartCanvas
          type="line" theme={theme} height={310} labels={m.labels} fmt={(v) => money(v)} label="Forecast"
          datasets={[
            { label: 'Actual', data: m.actual, kind: 'line', fill: true, color: pal[0] },
            { label: 'Lower (80%)', data: m.lo, kind: 'line', points: false, dashed: true, width: 1, color: pal[1] },
            { label: 'Upper (80%)', data: m.hi, kind: 'line', points: false, dashed: true, width: 1, fillTo: '-1', color: pal[1] },
            { label: 'Forecast', data: m.fc, kind: 'line', dashed: true, color: pal[1] },
          ]}
        />
      </Card>

      <div className="mis-grid2">
        <Card title="Forecast table">
          <div className="mis-tscroll">
            <table className="mis-table">
              <thead><tr><th>Period</th><th className="num">Projected</th><th className="num">Low</th><th className="num">High</th></tr></thead>
              <tbody>{f.points.map((p) => <tr key={p.label}><td>{fmtPeriod(p.label)}</td><td className="num">{money(p.value)}</td><td className="num">{money(p.lo)}</td><td className="num">{money(p.hi)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card title="How far to trust it">
          <p className="mis-summary">
            {bt
              ? `Tested on the last ${bt.k} periods, the model's average error was ${fmtPct(bt.mape)}. Simply repeating the last period would have been off by ${fmtPct(bt.naiveMape)}.`
              : `There is too little history (${f.n} periods) for a backtest, so reliability is rated low.`}
          </p>
          <p className="mis-muted">
            It extends past patterns using {f.seasonal ? 'a damped trend and a repeating seasonal shape' : 'a damped trend'}. It cannot know about price changes, promotions, new customers or one-off events. Treat it as a planning range, not a promise.
            {ins.partial ? ' The latest incomplete period is excluded.' : ''}
          </p>
        </Card>
      </div>
    </>
  );
}
