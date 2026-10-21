import Chart from 'chart.js/auto';
import { THEMES } from './themes';

// Kept under the old name so existing imports keep working.
export const COLOR_THEMES = THEMES;

const Crosshair = {
  id: 'misCrosshair',
  afterDraw(chart) {
    if (chart.config.type === 'doughnut' || chart.options.indexAxis === 'y') return;
    const act = chart.getActiveElements();
    if (!act.length) return;
    const { ctx, chartArea } = chart;
    const x = act[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(40,30,45,.35)';
    ctx.lineWidth = 1;
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};
Chart.register(Crosshair);

Chart.defaults.color = '#6B6572';
Chart.defaults.borderColor = '#EEEAF0';
Chart.defaults.font.family = "'Inter',sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.animation.duration = 900;
Chart.defaults.animation.easing = 'easeOutQuart';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(20,12,24,.94)';
Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
Chart.defaults.plugins.tooltip.bodyColor = '#E4DFE8';
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 12;
Chart.defaults.plugins.tooltip.boxPadding = 5;
Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
