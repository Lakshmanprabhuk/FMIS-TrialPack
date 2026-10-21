'use client';

export default function FocusView({ focus, narrative, factText }) {
  if (!focus?.text) return null;
  const facts = (focus.items || []).filter((f) => f.id !== 'focus_none');
  return (
    <div>
      <div className="mis-card">
        <div className="mis-card-h"><div><div className="mis-card-t">You asked</div></div></div>
        <div className="mis-card-b"><p className="fv-q">“{focus.text}”</p></div>
      </div>
      <div className="mis-card">
        <div className="mis-card-h"><div><div className="mis-card-t">What the data says</div><div className="mis-card-n">Figures are computed from your file; the wording is AI-written and checked against them</div></div></div>
        <div className="mis-card-b">
          {narrative?.focus ? <p className="fv-a">{narrative.focus}</p> : <p className="mis-muted">The written answer is not available (commentary was skipped or could not be generated). The measured facts are listed below.</p>}
          {focus.matches?.length > 0 && <p className="mis-muted small">Matched in your file: {focus.matches.map((m) => `${m.value} (${m.col})`).join(', ')}</p>}
          {focus.matches?.length === 0 && <p className="mis-note">No specific value from your category columns was found in the focus text, so this answer relies on the general analysis. Naming a salesperson, product or customer exactly as it appears in the file gives a deeper drill-down.</p>}
        </div>
      </div>
      {facts.length > 0 && (
        <div className="mis-card">
          <div className="mis-card-h"><div><div className="mis-card-t">Measured facts for your focus</div></div></div>
          <div className="mis-card-b"><ul className="fv-list">{facts.map((f) => <li key={f.id}>{factText ? factText(f.id) || f.text : f.text}</li>)}</ul></div>
        </div>
      )}
    </div>
  );
}
