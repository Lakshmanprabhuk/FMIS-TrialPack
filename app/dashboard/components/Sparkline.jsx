export default function Sparkline({ values, color = '#7B1E30', w = 96, h = 28 }) {
  if (!values || values.length < 2) return <div style={{ width: w, height: h }} />;
  let v = values;
  if (v.length > 60) {
    const step = Math.ceil(v.length / 60);
    v = v.filter((_, i) => i % step === 0 || i === v.length - 1);
  }
  const min = Math.min(...v), max = Math.max(...v), rng = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * (w - 6) + 3, h - 4 - ((y - min) / rng) * (h - 8)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" points={pts.map((p) => p.join(',')).join(' ')} />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}
