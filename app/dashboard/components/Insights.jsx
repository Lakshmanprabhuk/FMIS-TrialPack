'use client';

import { useState } from 'react';
import { metricInfo } from '../../../lib/mis/engine';
import { fmtMetric, fmtSigned, fmtPeriod, fmtInt } from '../../../lib/mis/format';
import { Card, Empty } from './ui';
import ChartCanvas from './ChartCanvas';
import Waterfall from './Waterfall';
import Quadrant from './Quadrant';

const KINDS = { driver: 'Why it moved', forecast: 'Outlook', pattern: 'Patterns', segment: 'Segments', opportunity: 'Opportunity', risk: 'Risk' };

function Season({ title, block, theme, note }) {
  const labels = block.items.map((x) => x.name.slice(0, 3));
  return (
    <Card title={title} note={note}>
      <ChartCanvas
        type="bar" theme={theme} height={210} labels={labels} fmt={(v) => Number(v).toFixed(2) + '×'} label={title}
        datasets={[
          { label: 'Index', data: block.items.map((x) => +x.idx.toFixed(3)), kind: 'bar' },
          { label: 'Average', data: block.items.map(() => 1), kind: 'line', dashed: true, points: false, color: '#9E9E9E' },
        ]}
      />
    </Card>
  );
}

export default function Insights({ ds, ins, view, theme, deep, commentary, onDrill }) {
  const [kind, setKind] = useState('all');
  const [di, setDi] = useState(0);
  if (!deep) return null;
  const info = metricInfo(ds, view.metric);
  const money = (v) => fmtMetric(v, info);
  const kinds = [...new Set(deep.items.map((x) => x.kind))];
  const items = deep.items.filter((x) => kind === 'all' || x.kind === kind);
  const dr = deep.drivers[Math.min(di, deep.drivers.length - 1)];
  const { month, weekday, correlations } = deep.patterns;
  const contrib = (list, cls) => (
    <ul className="mis-contrib">
      {list.map((r) => (
        <li key={r.label}>
          <span className="l" title={r.label}>{r.label}</span>
          <span className={'v mis-num ' + cls}>{(r.delta >= 0 ? '+' : '') + money(r.delta)}{r.pts != null ? ` · ${(r.pts > 0 ? '+' : '') + (r.pts * 100).toFixed(1)} pts` : ''}</span>
        </li>
      ))}
      {!list.length && <li><span className="mis-muted">None</span></li>}
    </ul>
  );

  return (
    <>
      {deep.items.length === 0 ? (
        <Empty title="No insights for this view">Try a different measure, grouping or period.</Empty>
      ) : (
        <>
          <div className="mis-chips">
            <button className={'mis-fchip' + (kind === 'all' ? ' active' : '')} onClick={() => setKind('all')}>All<i>{deep.items.length}</i></button>
            {kinds.map((k) => <button key={k} className={'mis-fchip' + (kind === k ? ' active' : '')} onClick={() => setKind(k)}>{KINDS[k]}</button>)}
          </div>
          <div className="mis-icards">
            {items.map((x, i) => (
              <div key={x.id} className={'mis-icard tone-' + x.tone} style={{ '--i': i }}>
                <div className="mis-icard-k">{KINDS[x.kind]}</div>
                <div className="mis-icard-t">{x.title}</div>
                <p>{x.text}</p>
                {commentary?.reasons?.[x.id] && <div className="mis-hyp"><b>Possible reason (hypothesis)</b>{commentary.reasons[x.id]}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {dr && (
        <Card
          title="What drove the latest change"
          note={`${fmtPeriod(dr.prev)} → ${fmtPeriod(dr.cur)} · ${fmtSigned(dr.pct)}. Axis does not start at zero so small moves stay visible.`}
          actions={deep.drivers.length > 1 && (
            <select className="mis-sel" value={di} onChange={(e) => setDi(+e.target.value)}>
              {deep.drivers.map((x, i) => <option key={x.dimKey} value={i}>By {x.name}</option>)}
            </select>
          )}
        >
          <Waterfall rows={dr.waterfall.rows} lo={dr.waterfall.lo} hi={dr.waterfall.hi} money={money} />
          <div className="mis-grid2">
            <div><div className="mis-h3">Top contributors</div>{contrib(dr.up, 'up')}</div>
            <div><div className="mis-h3">Top drags</div>{contrib(dr.down, 'down')}</div>
          </div>
        </Card>
      )}

      <Card title="Segment quadrant" note="Share of total against growth. Click a dot to see its records.">
        {deep.quadrant.ok ? <Quadrant q={deep.quadrant} onPick={(label) => onDrill([{ dimKey: view.dimKey, label }])} /> : <Empty title="Quadrant unavailable">{deep.quadrant.reason}</Empty>}
      </Card>

      {(month || weekday) && (
        <div className="mis-grid2">
          {month && <Season title="Seasonality by month" theme={theme} block={month} note={month.years < 2 ? 'Under 2 years of data, so tentative.' : 'Average month vs overall average (1.00×)'} />}
          {weekday && <Season title="Weekday rhythm" theme={theme} block={weekday} note="Average day vs overall average (1.00×)" />}
        </div>
      )}

      {correlations.length > 0 && (
        <Card title="Columns that move together" note="Correlation is not proof of cause. Use it to decide what to investigate.">
          {correlations.map((c) => (
            <div key={c.a + c.b} className="mis-corr-row">
              <span>{c.a} · {c.b} <span className="mis-muted small">({fmtInt(c.n)} records)</span></span>
              <div className="mis-corr-bar"><span className={c.r > 0 ? 'pos' : 'neg'} style={{ width: Math.abs(c.r) * 100 + '%' }} /></div>
              <b className="mis-num">{c.r.toFixed(2)}</b>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
