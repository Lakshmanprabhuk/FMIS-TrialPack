import Chart from 'chart.js/auto';

export const COLOR_THEMES = {
  vivid: { label: 'Vivid', swatches: ['#2D6A9F', '#E07B3A', '#3A9E6A', '#C4A020', '#8B4DAB', '#D94F5C', '#1A9BAA', '#A0522D', '#5B7FA6', '#6DBF8A'] },
  pastel: { label: 'Pastel', swatches: ['#7EB8D4', '#F4A97F', '#85CBA8', '#F0CE6A', '#BBA0D4', '#F0908A', '#7ACFD8', '#D4A07A', '#A0B8D4', '#A8D8B0'] },
  bold: { label: 'Bold', swatches: ['#E63946', '#F4A261', '#2A9D8F', '#E9C46A', '#6A0572', '#264653', '#023E8A', '#D62828', '#F77F00', '#4CC9F0'] },
  ocean: { label: 'Ocean', swatches: ['#03045E', '#0077B6', '#00B4D8', '#48CAE4', '#90E0EF', '#0353A4', '#023E8A', '#0096C7', '#ADE8F4', '#CAF0F8'] },
  forest: { label: 'Forest', swatches: ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7', '#D8F3DC', '#081C15', '#1B4332'] },
  sunset: { label: 'Sunset', swatches: ['#FF6B6B', '#FF8E53', '#FFC154', '#47B8E0', '#FF6B9D', '#C44569', '#F8A5C2', '#F7D794', '#778CA3', '#E77F67'] },
  mono: { label: 'Mono', swatches: ['#1A1A1A', '#4A4A4A', '#737373', '#9E9E9E', '#BDBDBD', '#2E2E2E', '#616161', '#8A8A8A', '#B0B0B0', '#D4D4D4'] },
  burg: { label: 'Burg', swatches: ['#7B1E30', '#9B2E40', '#C05070', '#5A1020', '#D08090', '#3B0A14', '#E8A0B0', '#B03050', '#F0C0CC', '#2D0A10'] },
};

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
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#4A4A4A';
    ctx.lineWidth = 1;
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};
Chart.register(Crosshair);

Chart.defaults.color = '#666666';
Chart.defaults.borderColor = '#E7E7E7';
Chart.defaults.font.family = "'Inter',sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.animation.duration = 400;
Chart.defaults.plugins.tooltip.backgroundColor = '#1A0A0A';
Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
Chart.defaults.plugins.tooltip.bodyColor = '#D0D0D0';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.boxPadding = 4;
