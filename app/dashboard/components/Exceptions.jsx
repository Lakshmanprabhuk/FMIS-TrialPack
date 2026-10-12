'use client';

import { metricInfo, rowContext, dimTitle, SEV_RANK } from '../../../lib/mis/engine';
import { fmtMetric, fmtPct, fmtSigned, fmtPeriod, fmtInt } from '../../../lib/mis/format';
import { Badge, Card, Empty } from './ui';

export default function Exceptions({ ds, ins, view, commentary, onDrill }) {
  const info = metricInfo(ds, view.metric);
  const money = (v) => fmtMetric(v, info);
  const ml = view.metric === '__count' ? 'records' : view.metric;
  const note = (id) => commentary?.risks?.[id];

  const sevCount = { high: 0, medium: 0, low: 0 };
  const bump = (s) => { if (sevCount[s] != null) sevCount[s]++; };
  ins.concentration.forEach((c) => bump(c.severity));
  ins.declines.forEach((d) => bump(d.severity));
  ins.outliers.items.forEach(() => {});
  if (ins.outliers.count) bump(ins.outliers.items[0]?.severity);
  ins.anomalies.forEach((a) => bump(a.severity));

  const nothing = !ins.concentration.length && !ins.declines.length && !ins.outliers.count && !ins.anomalies.length;
  const worst = ['high', 'medium', 'low'].find((s) => sevCount[s] > 0);

  return (
    <>
      <div className="mis-sevstrip">
        {['high', 'medium', 'low'].map((s) => <div key={s} className={'mis-sevbox sev-' + s}><b className="mis-num">{sevCount[s]}</b> {s}</div>)}
        <div className="mis-muted small">{worst ? 'Items are ordered by severity within each table.' : 'No flagged exceptions in the current view.'}</div>
      </div>
      {nothing && <Empty title="No exceptions found">The current view shows no outliers, declining segments or concentration risk.</Empty>}

      {ins.concentration.length > 0 && (
        <Card title="Concentration risk" note="Share of the primary measure held by the largest values (HHI = Herfindahl index, 0–1)">
          <div className="mis-tscroll">
            <table className="mis-table">
              <thead><tr><th>Dimension</th><th>Largest value</th><th className="num">Top 1</th><th className="num">Top 3</th><th className="num">HHI</th><th>Severity</th><th>Comment</th></tr></thead>
              <tbody>
                {ins.concentration.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="clickable" onClick={() => onDrill([{ dimKey: c.dimKey, label: c.topLabel }])}>{c.topLabel}</td>
                    <td className="num">{fmtPct(c.top1)}</td>
                    <td className="num">{fmtPct(c.top3)}</td>
                    <td className="num">{c.hhi.toFixed(2)}</td>
                    <td><Badge sev={c.severity} /></td>
                    <td className="mis-cmt">{note(c.id) || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view.dimKey && ins.hasTime && (
        <Card title={`Declining ${dimTitle(ds, view.dimKey)} values`} note="Two or more consecutive declines in the latest complete periods">
          {ins.declines.length ? (
            <div className="mis-tscroll">
              <table className="mis-table">
                <thead><tr><th>{dimTitle(ds, view.dimKey)}</th><th className="num">Consecutive declines</th><th className="num">From</th><th className="num">To</th><th className="num">Change</th><th>Severity</th><th>Comment</th></tr></thead>
                <tbody>
                  {ins.declines.map((d) => (
                    <tr key={d.id}>
                      <td className="clickable" onClick={() => onDrill([{ dimKey: view.dimKey, label: d.label }])}>{d.label}</td>
                      <td className="num">{d.streak}</td>
                      <td className="num">{money(d.from)}</td>
                      <td className="num">{money(d.to)}</td>
                      <td className="num">{fmtSigned(d.change)}</td>
                      <td><Badge sev={d.severity} /></td>
                      <td className="mis-cmt">{note(d.id) || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="mis-muted">No segment has declined for 2+ consecutive periods{ins.partial ? ' (latest incomplete period excluded)' : ''}.</div>}
        </Card>
      )}

      <Card title={`Outlier records on ${ml}`} note={ins.outliers.n ? `z-score of 3 or more from the mean of ${money(ins.outliers.mean)} (std ${money(ins.outliers.std)}); ${fmtInt(ins.outliers.count)} flagged, top 25 shown` : undefined}>
        {ins.outliers.count ? (
          <>
            {note('outliers') && <p className="mis-cmt block">{note('outliers')}</p>}
            <div className="mis-tscroll">
              <table className="mis-table">
                <thead><tr><th className="num">Record #</th><th>Context</th><th className="num">{ml}</th><th className="num">z-score</th><th>Severity</th></tr></thead>
                <tbody>
                  {ins.outliers.items.map((o) => (
                    <tr key={o.row}>
                      <td className="num">{fmtInt(o.row + 1)}</td>
                      <td>{rowContext(ds, o.row)}</td>
                      <td className="num">{money(o.value)}</td>
                      <td className="num">{o.z.toFixed(2)}</td>
                      <td><Badge sev={o.severity} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <div className="mis-muted">{ins.outliers.n ? 'No record is 3 or more standard deviations from the mean.' : 'Outlier detection needs a numeric measure with at least 10 values.'}</div>}
      </Card>

      {ins.anomalies.length > 0 && (
        <Card title="Unusual periods" note="Period totals 2 or more standard deviations from the average period">
          <div className="mis-tscroll">
            <table className="mis-table">
              <thead><tr><th>Period</th><th className="num">Total</th><th className="num">z-score</th><th>Severity</th><th>Comment</th></tr></thead>
              <tbody>
                {ins.anomalies.map((a) => (
                  <tr key={a.id}>
                    <td className="clickable" onClick={() => onDrill([{ dimKey: `${ds.primaryDate}@${view.gran}`, label: a.label }])}>{fmtPeriod(a.label)}</td>
                    <td className="num">{money(a.value)}</td>
                    <td className="num">{a.z.toFixed(2)}</td>
                    <td><Badge sev={a.severity} /></td>
                    <td className="mis-cmt">{note(a.id) || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
