'use client';

import { useMemo, useState } from 'react';
import { metricInfo, dimTitle } from '../../../lib/mis/engine';
import { scenarioModel } from '../../../lib/mis/deep';
import { fmtMetric, fmtSigned, fmtPeriod, fmtPct, parseTarget } from '../../../lib/mis/format';
import { Card, Empty } from './ui';
import ChartCanvas from './ChartCanvas';

function Hyp({ title, note, list, factText, effort }) {
  if (!list?.length) return null;
  return (
    <Card title={title} note={note}>
      {list.map((x, i) => (
        <div key={i} className="mis-idea">
          {x.text}{effort && x.effort && <span className="mis-effort">{x.effort} effort</span>}
          {factText(x.ref) && <small>Based on: {factText(x.ref)}</small>}
        </div>
      ))}
    </Card>
  );
}

export default function Ideas({ ds, ins, view, theme, deep, commentary, factText }) {
  const [g, setG] = useState(0);
  const [topD, setTopD] = useState(0);
  const [h, setH] = useState(3);
  const [tRaw, setTRaw] = useState('');
  const info = metricInfo(ds, view.metric);
  const money = (v) => fmtMetric(v, info);
  const maxH = deep?.forecast?.ok ? deep.forecast.points.length : 6;
  const H = Math.min(h, maxH);
  const target = parseTarget(tRaw);
  const scn = useMemo(
    () => (deep && ins.series ? scenarioModel(ins, view, deep, { growth: g / 100, topDelta: topD / 100, horizon: H, target }) : null),
    [deep, ins, view, g, topD, H, target]
  );
  const op = deep?.opportunity;
  const dn = view.dimKey ? dimTitle(ds, view.dimKey) : '';
  const asList = (arr) => (arr || []).map((x) => ({ ...x, text: x.text }));

  return (
    <>
      {commentary ? (
        <>
          <Hyp title="Ideas to test" note="Hypotheses to try, not guaranteed results" list={commentary.ideas} factText={factText} effort />
          <Hyp title="Possibilities" note="Qualitative what-ifs based on the computed facts" list={asList(commentary.possibilities)} factText={factText} />
          <Hyp title="Questions to check" note="Worth confirming in the source systems" list={asList(commentary.questions)} factText={factText} />
          {!commentary.ideas.length && !commentary.possibilities.length && !commentary.questions.length && <div className="mis-note">The written ideas for this report were not available. The sizing and scenario tools below still work.</div>}
        </>
      ) : (
        <div className="mis-note">Written ideas and questions describe the unfiltered default view. Reset filters and the original grouping to see them. The sizing and scenario tools below follow your current view.</div>
      )}

      {op && (
        <Card title="Opportunity sizing" note={`If every ${dn} value below the median of ${money(op.median)} per record matched it. A computed gap, not a forecast.`}>
          <div className="mis-comps">
            <div className="mis-comp"><div className="mis-comp-l">Potential upside</div><div className="mis-comp-v mis-num">{money(op.upside)}</div><div className="mis-comp-s">{op.total > 0 ? fmtPct(op.upside / op.total) + ' of current total' : ''}</div></div>
            <div className="mis-comp"><div className="mis-comp-l">Below the median</div><div className="mis-comp-v mis-num">{op.below} of {op.segments}</div><div className="mis-comp-s">{dn} values with 5+ records</div></div>
          </div>
          <div className="mis-tscroll">
            <table className="mis-table">
              <thead><tr><th>{dn}</th><th className="num">Per record</th><th className="num">Records</th><th className="num">Gap to median</th></tr></thead>
              <tbody>{op.items.map((x) => <tr key={x.label}><td>{x.label}</td><td className="num">{money(x.avg)}</td><td className="num">{x.count.toLocaleString()}</td><td className="num">{money(x.upside)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Scenario planner" note="Your assumptions, not a prediction. The baseline is the forecast when one is available, otherwise the latest period held flat.">
        {!scn ? <Empty title="Scenario planner unavailable">A date column is needed to project forward.</Empty> : (
          <>
            <div className="mis-sliders">
              <label className="mis-ctl"><span>Growth per period</span><b>{g > 0 ? '+' : ''}{g}%</b><input type="range" min="-20" max="20" step="0.5" value={g} onChange={(e) => setG(+e.target.value)} /></label>
              <label className="mis-ctl"><span>Top segment change</span><b>{topD > 0 ? '+' : ''}{topD}%</b><input type="range" min="-30" max="30" step="1" value={topD} onChange={(e) => setTopD(+e.target.value)} /></label>
              <label className="mis-ctl"><span>Horizon</span><b>{H} period{H === 1 ? '' : 's'}</b><input type="range" min="1" max={maxH} step="1" value={H} onChange={(e) => setH(+e.target.value)} /></label>
              <label className="mis-ctl"><span>Target per period at the end (optional)</span><input className="mis-target" style={{ width: '100%' }} placeholder="e.g. 1.5M" value={tRaw} onChange={(e) => setTRaw(e.target.value)} /></label>
            </div>
            <ChartCanvas type="line" theme={theme} height={250} labels={scn.labels.map(fmtPeriod)} fmt={(v) => money(v)} label="Scenario"
              datasets={[{ label: scn.usesForecast ? 'Baseline (forecast)' : 'Baseline (flat)', data: scn.base, kind: 'line', dashed: true }, { label: 'Your scenario', data: scn.scen, kind: 'line', fill: true }]} />
            <div className="mis-comps" style={{ marginTop: 12 }}>
              <div className="mis-comp"><div className="mis-comp-l">Baseline, cumulative</div><div className="mis-comp-v mis-num">{money(scn.sumBase)}</div></div>
              <div className="mis-comp"><div className="mis-comp-l">Scenario, cumulative</div><div className="mis-comp-v mis-num">{money(scn.sumScen)}</div><div className="mis-comp-s">{(scn.sumScen - scn.sumBase >= 0 ? '+' : '') + money(scn.sumScen - scn.sumBase)} vs baseline</div></div>
              <div className="mis-comp"><div className="mis-comp-l">Historical growth / period</div><div className="mis-comp-v mis-num">{scn.histGrowth == null ? '–' : fmtSigned(scn.histGrowth)}</div><div className="mis-comp-s">compound, whole history</div></div>
              {target ? <div className="mis-comp"><div className="mis-comp-l">Growth needed for target</div><div className="mis-comp-v mis-num">{scn.requiredGrowth == null ? '–' : fmtSigned(scn.requiredGrowth)}</div><div className="mis-comp-s">per period over {H}; gap in scenario {scn.gap == null ? '–' : money(scn.gap)}</div></div> : null}
            </div>
            <div className="mis-muted small">The top-segment change applies that segment's current share ({fmtPct(scn.topShare)}) to every projected period.</div>
          </>
        )}
      </Card>
    </>
  );
}
