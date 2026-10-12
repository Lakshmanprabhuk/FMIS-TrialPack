const ICON = { pending: '○', done: '✓', warn: '!' };

export default function ProcessingView({ stages, fileName }) {
  return (
    <div className="mis-proc">
      {/* Skeleton of the final report layout */}
      <div className="mis-skel" aria-hidden="true">
        <div className="mis-skel-bar tall" style={{ width: '38%' }} />
        <div className="mis-skel-bar" style={{ width: '62%' }} />
        <div className="mis-skel-row">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="mis-skel-bar" style={{ height: 30 }} />
          ))}
        </div>
        <div className="mis-skel-grid4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="mis-skel-card" />
          ))}
        </div>
        <div className="mis-skel-grid2">
          <div className="mis-skel-card tall" />
          <div className="mis-skel-card tall" />
        </div>
        <div className="mis-skel-card" style={{ height: 150 }} />
      </div>

      <div className="mis-proc-card" role="status" aria-live="polite">
        <div className="mis-proc-title">Building your report</div>
        <div className="mis-proc-file">{fileName}</div>
        <ol className="mis-pipe">
          {stages.map((s) => (
            <li key={s.id} className={'mis-pipe-step ' + s.status}>
              <span className="mis-pipe-ico">{s.status === 'running' ? <span className="mis-spin" /> : ICON[s.status]}</span>
              <div>
                <div className="mis-pipe-lbl">{s.label}</div>
                <div className="mis-pipe-det">{s.detail || (s.status === 'pending' ? 'Waiting' : '')}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
