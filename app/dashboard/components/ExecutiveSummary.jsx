'use client';

import { useState } from 'react';
import { formatKpiValue } from '../../../lib/mis/engine';
import { POP_LABEL, fmtSigned, parseTarget } from '../../../lib/mis/format';
import { COLOR_THEMES } from '../../../lib/mis/chartSetup';
import { Card, Delta, Empty } from './ui';
import Sparkline from './Sparkline';
import CountUp from './CountUp';

function Kpi({ k, i, ds, gran, color, raw, setRaw }) {
  const [edit, setEdit] = useState(false);
  const tNum = parseTarget(raw);
  const tgt = tNum == null ? null : k.kind === 'pct' ? tNum / 100 : tNum;
  const varT = tgt ? (k.value - tgt) / Math.abs(tgt) : null;
  const shown = varT != null ? varT : k.varAvg;
  return (
    <div className="mis-kpi" style={{ '--kpi-accent': color, '--i': i }}>
      <div className="mis-kpi-l">{k.label}</div>
      <div className="mis-kpi-v mis-num">
        <CountUp value={k.value} format={(v) => formatKpiValue(ds, k, v)} />
      </div>
      {k.sub && <div className="mis-kpi-s" title={k.sub}>{k.sub}</div>}
      <div className="mis-kpi-r">
        <span className="mis-kpi-pop" title="Latest complete period vs the one before">
          {k.pop != null ? <><em>{POP_LABEL[gran]}</em> <Delta v={k.pop} /></> : <em>No period data</em>}
        </span>
        <Sparkline values={k.series} color={color} />
      </div>
      <div className="mis-kpi-var">
        {shown != null ? (
          <span className={'mis-var ' + (shown > 0.0005 ? 'up' : shown < -0.0005 ? 'down' : 'flat')}>
            {fmtSigned(shown)} {varT != null ? 'vs target' : 'vs avg period'}
          </span>
        ) : (
          <span className="mis-var flat">{k.series ? 'on average' : 'no variance baseline'}</span>
        )}
        {edit ? (
          <input autoFocus className="mis-target" placeholder="e.g. 1.5M" value={raw || ''} onChange={(e) => setRaw(e.target.value)} onBlur={() => setEdit(false)} onKeyDown={(e) => e.key === 'Enter' && setEdit(false)} />
        ) : (
          <button className="mis-link small" onClick={() => setEdit(true)}>{tgt != null ? 'edit target' : 'set target'}</button>
        )}
      </div>
    </div>
  );
}

export default function ExecutiveSummary({ ds, ins, view, theme, targets, setTargets, takeaways, commentary, hiddenNarrative }) {
  const pal = (COLOR_THEMES[theme] || COLOR_THEMES.burgundy).swatches;
  if (!ins.kpis.length) return <Empty title="Nothing to summarise">No usable columns were detected.</Empty>;
  return (
    <>
      {ins.partial && ins.series && (
        <div className="mis-note">The latest period is incomplete; period changes and variances use the last complete period.</div>
      )}
      <div className="mis-kpis">
        {ins.kpis.map((k, i) => (
          <Kpi key={k.id} i={i} k={k} ds={ds} gran={view.gran} color={pal[i % pal.length]} raw={targets[k.id]} setRaw={(v) => setTargets((t) => ({ ...t, [k.id]: v }))} />
        ))}
      </div>
      {!ins.hasTime && <div className="mis-note">No date column was detected, so period changes, sparklines and variance against average are not available.</div>}
      <Card title="Management takeaways" note={commentary ? 'Commentary written from the computed figures' : hiddenNarrative ? 'Computed from the current view' : 'Computed from the figures'}>
        {commentary?.summary && <p className="mis-summary">{commentary.summary}</p>}
        {takeaways.length ? (
          <ol className="mis-takeaways">{takeaways.map((t, i) => <li key={i}>{t}</li>)}</ol>
        ) : (
          <div className="mis-muted">Not enough data for takeaways.</div>
        )}
        {hiddenNarrative && <div className="mis-muted small">Written commentary describes the unfiltered default view. Reset filters and the original grouping to see it.</div>}
        {commentary?.opportunities?.length > 0 && (
          <div className="mis-opps">
            <div className="mis-opps-h">Opportunities</div>
            <ol className="mis-takeaways">{commentary.opportunities.map((o, i) => <li key={i}>{o.text}</li>)}</ol>
          </div>
        )}
      </Card>
    </>
  );
}
