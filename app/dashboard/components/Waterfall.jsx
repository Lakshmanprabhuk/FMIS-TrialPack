export default function Waterfall({ rows, lo, hi, money }) {
  const span = hi - lo || 1;
  const pos = (v) => ((v - lo) / span) * 100;
  return (
    <div className="mis-wf">
      {rows.map((r, i) => {
        const a = r.kind === 'total' ? lo : Math.min(r.start, r.end);
        const b = r.kind === 'total' ? r.end : Math.max(r.start, r.end);
        const cls = r.kind === 'total' ? 'tot' : r.delta >= 0 ? 'up' : 'down';
        return (
          <div className="mis-wf-row" key={i}>
            <div className="mis-wf-l" title={r.label}>{r.label}</div>
            <div className="mis-wf-track">
              <span className={'mis-wf-bar ' + cls} style={{ left: pos(a) + '%', width: Math.max(0.8, pos(b) - pos(a)) + '%', animationDelay: i * 60 + 'ms' }} />
            </div>
            <div className={'mis-wf-v mis-num ' + cls}>{r.kind === 'total' ? money(r.end) : (r.delta >= 0 ? '+' : '') + money(r.delta)}</div>
          </div>
        );
      })}
    </div>
  );
}
