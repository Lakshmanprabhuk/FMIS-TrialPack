'use client';

import { useState } from 'react';
import { fmtSigned } from '../../../lib/mis/format';

export const TYPE_ICONS = { bar: '▦', horizontal_bar: '▤', line: '〜', donut: '◎' };
export const TYPE_NAMES = { bar: 'Bar', horizontal_bar: 'Horizontal bar', line: 'Line', donut: 'Donut' };

export function Badge({ sev }) {
  return <span className={'mis-badge sev-' + sev}>{sev === 'ok' ? 'OK' : sev}</span>;
}

export function Delta({ v }) {
  if (v == null || !isFinite(v)) return <span className="mis-delta flat">–</span>;
  const cls = v > 0.0005 ? 'up' : v < -0.0005 ? 'down' : 'flat';
  return (
    <span className={'mis-delta ' + cls}>
      {cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■'} {fmtSigned(v)}
    </span>
  );
}

export function Card({ title, note, actions, children, className = '' }) {
  return (
    <div className={'mis-card ' + className}>
      {(title || actions) && (
        <div className="mis-card-h">
          <div>
            <div className="mis-card-t">{title}</div>
            {note && <div className="mis-card-n">{note}</div>}
          </div>
          <div className="mis-card-a">{actions}</div>
        </div>
      )}
      <div className="mis-card-b">{children}</div>
    </div>
  );
}

// Card with a chart-type switcher. `children` is a function of the chosen type.
export function ChartCard({ title, note, types, children, className = '' }) {
  const [t, setT] = useState(types ? types[0] : null);
  return (
    <Card
      title={title}
      note={note}
      className={className}
      actions={
        types && types.length > 1 ? (
          <div className="mis-seg">
            {types.map((x) => (
              <button key={x} className={x === t ? 'active' : ''} title={TYPE_NAMES[x]} onClick={() => setT(x)}>
                {TYPE_ICONS[x]}
              </button>
            ))}
          </div>
        ) : null
      }
    >
      {children(t)}
    </Card>
  );
}

export function Lead({ text, label = 'Commentary' }) {
  if (!text) return null;
  return (
    <p className="mis-lead">
      <span className="mis-lead-tag">{label}</span> {text}
    </p>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="mis-empty">
      <div className="mis-empty-t">{title}</div>
      <div>{children}</div>
    </div>
  );
}
