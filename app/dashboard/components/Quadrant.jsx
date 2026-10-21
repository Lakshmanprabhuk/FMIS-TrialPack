import { fmtPct, fmtSigned } from '../../../lib/mis/format';

const CLS = { star: ['Stars', 'var(--up)'], cow: ['Cash cows', 'var(--burg)'], question: ['Question marks', 'var(--sev-med)'], laggard: ['Laggards', 'var(--down)'] };

export default function Quadrant({ q, onPick }) {
  const W = 680, H = 360, L = 52, R = 16, T = 16, B = 40;
  const cl = (v) => Math.max(-1, Math.min(2, v));
  const maxX = Math.max(...q.items.map((i) => i.share), q.xRef * 1.6, 0.05) * 1.12;
  const gs = q.items.map((i) => cl(i.growth)).concat([cl(q.refGrowth), 0]);
  let minY = Math.min(...gs), maxY = Math.max(...gs);
  const pad = (maxY - minY) * 0.12 || 0.1;
  minY -= pad;
  maxY += pad;
  const X = (v) => L + (v / maxX) * (W - L - R);
  const Y = (v) => T + ((maxY - v) / (maxY - minY)) * (H - T - B);
  const xr = X(q.xRef), yr = Y(cl(q.refGrowth));
  const maxShare = Math.max(...q.items.map((i) => i.share));
  const xt = [0, 1, 2, 3].map((k) => (maxX * k) / 3), yt = [0, 1, 2, 3].map((k) => minY + ((maxY - minY) * k) / 3);
  const rect = (x, y, w, h, c) => <rect x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)} style={{ fill: c, fillOpacity: 0.07 }} />;
  return (
    <svg className="mis-q" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Segment quadrant: share against growth">
      {rect(L, T, xr - L, yr - T, CLS.question[1])}
      {rect(xr, T, W - R - xr, yr - T, CLS.star[1])}
      {rect(L, yr, xr - L, H - B - yr, CLS.laggard[1])}
      {rect(xr, yr, W - R - xr, H - B - yr, CLS.cow[1])}
      {xt.map((v, i) => <text key={'x' + i} x={X(v)} y={H - B + 16} textAnchor="middle">{fmtPct(v, 0)}</text>)}
      {yt.map((v, i) => <text key={'y' + i} x={L - 6} y={Y(v) + 3} textAnchor="end">{fmtSigned(v, 0)}</text>)}
      <line x1={xr} x2={xr} y1={T} y2={H - B} stroke="currentColor" strokeOpacity=".3" strokeDasharray="4 4" />
      <line x1={L} x2={W - R} y1={yr} y2={yr} stroke="currentColor" strokeOpacity=".3" strokeDasharray="4 4" />
      <text x={W / 2} y={H - 4} textAnchor="middle">Share of total (average share marked)</text>
      <text transform={`rotate(-90 12 ${H / 2})`} x="12" y={H / 2} textAnchor="middle">Growth, latest window vs prior window</text>
      <text className="qlab" x={L + 8} y={T + 14} style={{ fill: CLS.question[1] }}>{CLS.question[0]}</text>
      <text className="qlab" x={W - R - 8} y={T + 14} textAnchor="end" style={{ fill: CLS.star[1] }}>{CLS.star[0]}</text>
      <text className="qlab" x={L + 8} y={H - B - 8} style={{ fill: CLS.laggard[1] }}>{CLS.laggard[0]}</text>
      <text className="qlab" x={W - R - 8} y={H - B - 8} textAnchor="end" style={{ fill: CLS.cow[1] }}>{CLS.cow[0]}</text>
      {q.items.map((i, k) => {
        const cx = X(i.share), cy = Y(cl(i.growth)), r = 5 + 9 * Math.sqrt(i.share / maxShare);
        return (
          <g key={i.label}>
            <circle className="dot" cx={cx} cy={cy} r={r} style={{ fill: CLS[i.cls][1], animationDelay: k * 35 + 'ms' }} onClick={() => onPick && onPick(i.label)}>
              <title>{`${i.label}: ${fmtPct(i.share)} share, ${fmtSigned(i.growth)} growth (${CLS[i.cls][0]})`}</title>
            </circle>
            {k < 8 && <text x={cx + r + 3} y={cy + 3}>{i.label.length > 16 ? i.label.slice(0, 15) + '…' : i.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}
