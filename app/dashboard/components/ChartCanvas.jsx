'use client';

import { useEffect, useMemo, useRef } from 'react';
import Chart from 'chart.js/auto';
import { COLOR_THEMES } from '../../../lib/mis/chartSetup';

// Scriptable gradient. Colours are 6-digit hex, so a 2-digit alpha can be appended.
const grad = (color, a0, a1, horizontal) => (c) => {
  const { ctx, chartArea } = c.chart;
  if (!chartArea) return color + a0;
  const g = horizontal
    ? ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
    : ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, color + a0);
  g.addColorStop(1, color + a1);
  return g;
};

// datasets: [{ label, data, kind?: 'bar'|'line', color?, colors?, dashed?, fill?, points?, yAxisID? }]
export default function ChartCanvas({ type = 'bar', labels, datasets, theme = 'burgundy', fmt, onPick, height = 240, label = 'Chart' }) {
  const ref = useRef(null);
  const fmtRef = useRef(fmt);
  const pickRef = useRef(onPick);
  fmtRef.current = fmt;
  pickRef.current = onPick;
  const clickable = !!onPick;
  const sig = useMemo(() => JSON.stringify([type, labels, datasets, theme, clickable]), [type, labels, datasets, theme, clickable]);

  useEffect(() => {
    if (!ref.current) return undefined;
    const P = (COLOR_THEMES[theme] || COLOR_THEMES.burgundy).swatches;
    const donut = type === 'donut';
    const horiz = type === 'horizontal_bar';
    const src = donut ? datasets.slice(0, 1) : datasets;
    const hasY1 = src.some((d) => d.yAxisID === 'y1');

    const ds = src.map((d, i) => {
      const color = d.color || P[i % P.length];
      let kind = d.kind || (type === 'line' ? 'line' : 'bar');
      if (horiz) kind = 'bar';
      const base = { label: d.label || '', data: d.data, yAxisID: d.yAxisID };
      if (donut) {
        return { ...base, backgroundColor: d.data.map((_, j) => P[j % P.length]), borderColor: '#fff', borderWidth: 3, hoverOffset: 8, borderRadius: 6, spacing: 2 };
      }
      if (kind === 'line') {
        return {
          ...base,
          type: 'line',
          borderColor: color,
          backgroundColor: d.fillTo != null ? color + '26' : d.fill ? grad(color, '44', '00') : color + '22',
          borderWidth: d.width || 2.5,
          tension: 0.35,
          fill: d.fillTo != null ? d.fillTo : !!d.fill,
          pointRadius: d.points === false ? 0 : 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#fff',
          pointBorderColor: color,
          pointBorderWidth: 2,
          borderDash: d.dashed ? [6, 5] : undefined,
          spanGaps: false,
        };
      }
      const bg = d.colors || grad(color, horiz ? '88' : 'FF', horiz ? 'FF' : '99', horiz);
      return { ...base, type: 'bar', backgroundColor: bg, hoverBackgroundColor: d.colors || color, borderRadius: 8, borderSkipped: false, maxBarThickness: 38 };
    });

    const cType = donut ? 'doughnut' : ds.some((d) => d.type === 'bar') ? 'bar' : 'line';
    const valueScale = {
      grid: { color: '#F1EDF3' },
      border: { display: false },
      ticks: { font: { size: 11 }, padding: 6, callback: (v) => (fmtRef.current ? fmtRef.current(v) : v) },
    };
    const catScale = {
      grid: { display: false },
      border: { display: false },
      ticks: { maxTicksLimit: horiz ? 30 : 12, maxRotation: horiz ? 0 : 35, font: { size: 11 } },
    };
    const scales = donut ? {} : horiz ? { x: valueScale, y: catScale } : { x: catScale, y: valueScale };
    if (hasY1 && !donut && !horiz) {
      scales.y1 = { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, border: { display: false }, ticks: { callback: (v) => v + '%', font: { size: 11 } } };
    }

    const chart = new Chart(ref.current, {
      type: cType,
      data: { labels, datasets: ds },
      options: {
        indexAxis: horiz ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        cutout: donut ? '66%' : undefined,
        interaction: { mode: donut ? 'nearest' : 'index', intersect: false },
        animation: {
          duration: 900,
          easing: 'easeOutQuart',
          delay: (c) => (c.type === 'data' && c.mode === 'default' ? Math.min(c.dataIndex * 18, 450) : 0),
        },
        plugins: {
          legend: { display: donut || ds.length > 1, position: donut ? 'right' : 'top', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const v = c.raw;
                if (v == null) return '';
                if (c.dataset.yAxisID === 'y1') return ` ${c.dataset.label}: ${Number(v).toFixed(1)}%`;
                const s = fmtRef.current ? fmtRef.current(v) : String(v);
                return donut ? ` ${c.label}: ${s}` : ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${s}`;
              },
            },
          },
        },
        scales,
        onClick: (_e, els) => {
          if (pickRef.current && els.length) pickRef.current(els[0].index, els[0].datasetIndex);
        },
        onHover: (e, els) => {
          const t = e.native?.target;
          if (t) t.style.cursor = pickRef.current && els.length ? 'pointer' : 'default';
        },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return (
    <div className="mis-chart" style={{ height }}>
      <canvas ref={ref} role="img" aria-label={label} />
    </div>
  );
}
