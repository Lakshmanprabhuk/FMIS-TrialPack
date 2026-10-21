import { useId } from 'react';

// `color` must be a hex colour (it is used inside SVG gradient stops).
export default function Sparkline({ values, color = '#7B1E30', w = 110, h = 34 }) {
  const gid = 'sg' + useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!values || values.length < 2) return <div style={{ width: w, height: h }} />;
  let v = values;
  if (v.length > 60) {
    const step = Math.ceil(v.length / 60);
    v = v.filter((_, i) => i % step === 0 || i === v.length - 1);
  }
  const min = Math.min(...v), max = Math.max(...v), rng = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * (w - 8) + 4, h - 5 - ((y - min) / rng) * (h - 10)]);
  const last = pts[pts.length - 1];
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `M${pts[0][0]},${h} L${pts.map((p) => p.join(',')).join(' L')} L${last[0]},${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".30" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} className="spark-area" />
      <polyline pathLength="1" className="spark-line" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" points={line} />
      <circle className="spark-dot" cx={last[0]} cy={last[1]} r="2.8" fill="#fff" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}
