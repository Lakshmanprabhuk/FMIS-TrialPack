'use client';

import { useState } from 'react';
import { READ_LABEL, readAs } from '../../../lib/mis/plan';

const CONF_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

export default function ConfirmUnderstanding({ fileName, ds, plan, verify, verifyState, verifyError, onEdit, onStart, onBack, busy }) {
  const [focus, setFocus] = useState('');
  const canDeep = focus.replace(/\s/g, '').length >= 5 && !busy;
  const byName = new Map((verify?.columns || []).map((c) => [c.name, c]));
  const doubts = (verify?.columns || []).filter((c) => c.doubt).length;

  return (
    <div className="rv">
      <div className="rv-head">
        <div>
          <div className="mis-eyebrow rv-eye">Step 2 of 3 · Confirm understanding</div>
          <h1 className="rv-title">Is this how your file should be read?</h1>
          <p className="rv-sub">
            {verifyState === 'loading' && 'The AI is checking each column against your file…'}
            {verifyState === 'ok' && (verify?.summary || 'Check each column below and fix anything that is wrong.')}
            {verifyState === 'error' && 'The AI check is unavailable right now, so this shows how the app read your columns. You can still go ahead.'}
          </p>
          {verifyState === 'error' && verifyError && <p className="rv-sub warn">{verifyError}</p>}
        </div>
        {doubts > 0 && <div className="rv-flag">{doubts} column{doubts === 1 ? '' : 's'} to double-check</div>}
      </div>

      <section className="mis-card rv-card">
        <div className="mis-card-h"><div><div className="mis-card-t">Column understanding</div><div className="mis-card-n">If a row is wrong, press Edit to fix it. We will check again.</div></div></div>
        <div className="mis-card-b rv-scroll">
          {verifyState === 'loading' ? (
            <div className="rv-loading"><span className="mis-spin" /> Checking columns…</div>
          ) : (
            <table className="mis-table rv-cols">
              <thead><tr><th>Column</th><th>Read as</th><th>What it appears to be</th><th>How it is measured</th><th>Confidence</th><th /></tr></thead>
              <tbody>
                {ds.fields.map((f) => {
                  const c = ds.cols[f];
                  const v = byName.get(f);
                  return (
                    <tr key={f} className={v?.doubt ? 'hl' : ''}>
                      <td className="rv-orig"><b>{f}</b>{c.unit && <span className="rv-sample">{c.unit}</span>}</td>
                      <td>{READ_LABEL[readAs(c)]}</td>
                      <td>
                        {v?.means || c.desc || <span className="mis-muted">—</span>}
                        {v?.doubt && <div className="rv-doubt">⚠ {v.doubt}</div>}
                      </td>
                      <td>{v?.measured || <span className="mis-muted">—</span>}</td>
                      <td>{v ? <span className={'rv-conf ' + v.confidence}>{CONF_LABEL[v.confidence]}</span> : <span className="mis-muted">—</span>}</td>
                      <td><button className="mis-btn small ghost" onClick={() => onEdit(ds.srcOf?.[f] || f)}>Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {verifyState === 'ok' && (verify.questions.length > 0 || verify.dataNotes.length > 0) && (
          <div className="rv-issues">
            {verify.dataNotes.length > 0 && (<><b>Notes about your data</b><ul>{verify.dataNotes.map((t, i) => <li key={i}>{t}</li>)}</ul></>)}
            {verify.questions.length > 0 && (<><b>Questions that would sharpen the analysis</b><ul>{verify.questions.map((t, i) => <li key={i}>{t}</li>)}</ul><span className="mis-muted small">Answer these by editing a column description or the file notes.</span></>)}
          </div>
        )}
      </section>

      <section className="mis-card rv-card">
        <div className="mis-card-h"><div><div className="mis-card-t">What the analysis will cover</div><div className="mis-card-n">Measure: {plan.measure}{plan.dimension ? ` · Grouped by: ${plan.dimension}` : ''} · Period: {plan.period}</div></div></div>
        <div className="mis-card-b rv-scroll">
          <table className="mis-table rv-cols">
            <thead><tr><th>Section</th><th>What it will show</th><th>Based on</th><th>Status</th></tr></thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.section} className={r.ok ? '' : 'off'}>
                  <td><b>{r.section}</b></td>
                  <td>{r.shows}</td>
                  <td>{r.uses.join(', ') || '—'}</td>
                  <td>{r.ok ? <span className="rv-conf high">Included</span> : <span className="rv-conf low" title={r.note}>Not available</span>}{!r.ok && <div className="rv-sample">{r.note}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mis-card rv-card rv-go">
        <div className="mis-card-b">
          <div className="rv-go-row">
            <div>
              <div className="mis-card-t">Ready?</div>
              <div className="mis-card-n">Runs the full analysis on the version you confirmed. This uses your weekly free report.</div>
            </div>
            <button className="mis-btn big" disabled={busy} onClick={() => onStart('')}>Start analysis</button>
          </div>
          <div className="rv-focus">
            <label className="rv-lab" htmlFor="rv-focus-box">Want a specific focus? Describe what to dig into (for example: why did one salesperson decline, compare against a target, find reasons for the June spike).</label>
            <div className="rv-focus-row">
              <textarea id="rv-focus-box" className="rv-in" rows={2} maxLength={400} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Type your focus here…" />
              <button className="mis-btn" disabled={!canDeep} onClick={() => onStart(focus.trim())} title={canDeep ? '' : 'Type at least 5 characters to enable'}>Start deeper analysis</button>
            </div>
          </div>
        </div>
      </section>

      <div className="rv-actions">
        <button className="mis-btn ghost" onClick={onBack}>← Back to edit columns</button>
      </div>
    </div>
  );
}
