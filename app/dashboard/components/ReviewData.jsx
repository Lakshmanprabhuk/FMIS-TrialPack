'use client';

import { useEffect, useMemo, useRef } from 'react';
import { profileColumns, initialSchema, USE_OPTIONS, READ_LABEL } from '../../../lib/mis/plan';
import { fmtInt, fmtCompact } from '../../../lib/mis/format';

const PREVIEW_ROWS = 50;

export default function ReviewData({ fileName, rows, ds, schema, setSchema, onContinue, onCancel, highlight }) {
  const profile = useMemo(() => profileColumns(ds, rows), [ds, rows]);
  const rowRefs = useRef({});
  const sc = schema.cols;
  const set = (orig, patch) => setSchema((s) => ({ ...s, cols: { ...s.cols, [orig]: { ...s.cols[orig], ...patch } } }));
  const top = (patch) => setSchema((s) => ({ ...s, ...patch }));

  useEffect(() => {
    if (highlight && rowRefs.current[highlight]) rowRefs.current[highlight].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  const active = profile.filter((p) => (sc[p.orig]?.use || 'auto') !== 'ignore');
  const issues = ds.quality.filter((q) => q.issues > 0 || q.missingPct > 0.2);
  const dupes = ds.stats.dupes;
  const names = active.map((p) => (sc[p.orig]?.name || p.orig).trim() || p.orig);
  const dupNames = names.filter((n, i) => names.indexOf(n) !== i);

  return (
    <div className="rv">
      <div className="rv-head">
        <div>
          <div className="mis-eyebrow rv-eye">Step 1 of 3 · Review your data</div>
          <h1 className="rv-title">Check how we read <span>{fileName}</span></h1>
          <p className="rv-sub">
            Rename columns, correct how a column is read, and tell us what it means. Nothing is sent to the AI until you continue, and the AI only ever receives
            this corrected version, never your original upload.
          </p>
        </div>
        <div className="rv-stats">
          <div><b className="mis-num">{fmtInt(ds.n)}</b><span>rows</span></div>
          <div><b className="mis-num">{ds.fields.length}</b><span>columns</span></div>
          <div><b className="mis-num">{ds.dates.length ? 'Yes' : 'No'}</b><span>date column</span></div>
          <div><b className="mis-num">{fmtInt(dupes)}</b><span>duplicates</span></div>
        </div>
      </div>

      <section className="mis-card rv-card">
        <div className="mis-card-h"><div><div className="mis-card-t">Data preview</div><div className="mis-card-n">First {Math.min(PREVIEW_ROWS, rows.length)} of {fmtInt(rows.length)} rows, with your column names applied</div></div></div>
        <div className="mis-card-b rv-scroll">
          <table className="mis-table rv-prev">
            <thead>
              <tr>
                {profile.map((p) => {
                  const off = (sc[p.orig]?.use || 'auto') === 'ignore';
                  return <th key={p.orig} className={off ? 'off' : ''} title={off ? 'Ignored' : p.orig}>{sc[p.orig]?.name || p.orig}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                <tr key={i}>
                  {profile.map((p) => (
                    <td key={p.orig} className={(sc[p.orig]?.use || 'auto') === 'ignore' ? 'off' : ''}>{r[p.orig] == null ? '' : String(r[p.orig])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mis-card rv-card">
        <div className="mis-card-h">
          <div><div className="mis-card-t">Columns</div><div className="mis-card-n">Edit the name, how it is used, its unit and a short description. Leave anything you are happy with.</div></div>
          <button className="mis-btn small" onClick={() => setSchema((s) => ({ ...initialSchema(ds), notes: s.notes, question: s.question, target: s.target, dropDupes: s.dropDupes }))}>Reset columns to detected</button>
        </div>
        <div className="mis-card-b rv-scroll">
          <table className="mis-table rv-cols">
            <thead>
              <tr><th>Original</th><th>Display name</th><th>Use as</th><th>Unit / metric</th><th>What it means</th><th>Quality</th></tr>
            </thead>
            <tbody>
              {profile.map((p) => {
                const c = sc[p.orig] || { name: p.orig, use: 'auto', desc: '', unit: '' };
                const off = c.use === 'ignore';
                const dup = !off && dupNames.includes((c.name || p.orig).trim());
                return (
                  <tr key={p.orig} ref={(el) => (rowRefs.current[p.orig] = el)} className={(off ? 'off ' : '') + (highlight === p.orig ? 'hl' : '')}>
                    <td className="rv-orig">
                      <b>{p.orig}</b>
                      <span className="rv-sample" title={p.samples.join(' | ')}>{p.samples.slice(0, 3).join(' · ') || 'no values'}</span>
                    </td>
                    <td><input className={'rv-in' + (dup ? ' bad' : '')} value={c.name} onChange={(e) => set(p.orig, { name: e.target.value })} disabled={off} aria-label={`Display name for ${p.orig}`} />{dup && <div className="rv-err">Two columns share this name</div>}</td>
                    <td>
                      <select className="rv-in" value={c.use} onChange={(e) => set(p.orig, { use: e.target.value })} aria-label={`Use ${p.orig} as`}>
                        {USE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{v === 'auto' ? `Auto-detect (${READ_LABEL[p.readAs]})` : l}</option>)}
                      </select>
                    </td>
                    <td><input className="rv-in sm" placeholder="e.g. €, kg" value={c.unit} onChange={(e) => set(p.orig, { unit: e.target.value })} disabled={off} aria-label={`Unit for ${p.orig}`} /></td>
                    <td><input className="rv-in" placeholder="Optional. What is in this column?" value={c.desc} onChange={(e) => set(p.orig, { desc: e.target.value })} disabled={off} aria-label={`Description of ${p.orig}`} maxLength={200} /></td>
                    <td className="rv-q">
                      <span>{fmtInt(p.nonNull)} filled</span>
                      {p.missing > 0 && <span className="warn">{fmtInt(p.missing)} blank</span>}
                      {p.issues > 0 && <span className="warn">{fmtInt(p.issues)} unreadable</span>}
                      <span>{fmtInt(p.unique)} distinct</span>
                      {p.min != null && isFinite(p.min) && <span>{fmtCompact(p.min)} to {fmtCompact(p.max)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {issues.length > 0 && (
          <div className="rv-issues">
            <b>Things we noticed:</b>
            <ul>
              {issues.slice(0, 6).map((q) => <li key={q.name}><i>{q.name}</i>: {q.handling}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="mis-card rv-card">
        <div className="mis-card-h"><div><div className="mis-card-t">About this file</div><div className="mis-card-n">Optional, but it makes the commentary more accurate</div></div></div>
        <div className="mis-card-b rv-about">
          <label className="rv-lab">What is this file? (business, period, definitions, known issues)
            <textarea className="rv-in" rows={3} maxLength={800} value={schema.notes} onChange={(e) => top({ notes: e.target.value })} placeholder="e.g. Invoice lines for 2025 from our feed business. Each row is one invoice line. Amounts exclude VAT." />
          </label>
          <div className="rv-two">
            <label className="rv-lab">Main question you want answered
              <input className="rv-in" maxLength={300} value={schema.question} onChange={(e) => top({ question: e.target.value })} placeholder="e.g. Which salespeople are falling behind?" />
            </label>
            <label className="rv-lab">Target for the main measure (optional)
              <input className="rv-in" value={schema.target} onChange={(e) => top({ target: e.target.value })} placeholder="e.g. 1.5M" />
            </label>
          </div>
          {dupes > 0 && (
            <label className="rv-check">
              <input type="checkbox" checked={schema.dropDupes} onChange={(e) => top({ dropDupes: e.target.checked })} />
              <span>Leave out the {fmtInt(dupes)} duplicate rows from the analysis</span>
            </label>
          )}
        </div>
      </section>

      <div className="rv-actions">
        <button className="mis-btn ghost" onClick={onCancel}>← Choose another file</button>
        <span className="mis-spacer" />
        <button className="mis-btn big" disabled={dupNames.length > 0 || active.length === 0} onClick={onContinue}>Continue →</button>
      </div>
      {dupNames.length > 0 && <div className="rv-err right">Give each column a unique name to continue.</div>}
    </div>
  );
}
