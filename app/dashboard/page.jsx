'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import { supabase } from '../../lib/supabaseClient';

// Custom lightweight crosshair plugin (replaces chartjs-plugin-crosshair
// which is incompatible with Chart.js 4 and breaks tooltips).
const CrosshairPlugin = {
  id: 'insightlyCrosshair',
  afterDraw(chart) {
    if (!chart._active?.length) return;
    const { ctx, chartArea: { top, bottom } } = chart;
    const x = chart._active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#4A4A4A';
    ctx.lineWidth = 1;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};
Chart.register(CrosshairPlugin);

// ── Chart defaults (same as original prototype) ────────────────────────────
Chart.defaults.color = '#666666';
Chart.defaults.borderColor = '#E7E7E7';
Chart.defaults.font.family = "'Inter',sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.animation.duration = 600;
Chart.defaults.animation.easing = 'easeInOutQuart';
Chart.defaults.plugins.tooltip.backgroundColor = '#1A0A0A';
Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
Chart.defaults.plugins.tooltip.bodyColor = '#D0D0D0';
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.displayColors = true;
Chart.defaults.plugins.tooltip.boxPadding = 4;

const COLOR_THEMES = {
  vivid: { label: 'Vivid', swatches: ['#2D6A9F', '#E07B3A', '#3A9E6A', '#C4A020', '#8B4DAB', '#D94F5C', '#1A9BAA', '#A0522D', '#5B7FA6', '#6DBF8A'] },
  pastel: { label: 'Pastel', swatches: ['#7EB8D4', '#F4A97F', '#85CBA8', '#F0CE6A', '#BBA0D4', '#F0908A', '#7ACFD8', '#D4A07A', '#A0B8D4', '#A8D8B0'] },
  bold: { label: 'Bold', swatches: ['#E63946', '#F4A261', '#2A9D8F', '#E9C46A', '#6A0572', '#264653', '#023E8A', '#D62828', '#F77F00', '#4CC9F0'] },
  ocean: { label: 'Ocean', swatches: ['#03045E', '#0077B6', '#00B4D8', '#48CAE4', '#90E0EF', '#0353A4', '#023E8A', '#0096C7', '#ADE8F4', '#CAF0F8'] },
  forest: { label: 'Forest', swatches: ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7', '#D8F3DC', '#081C15', '#1B4332'] },
  sunset: { label: 'Sunset', swatches: ['#FF6B6B', '#FF8E53', '#FFC154', '#47B8E0', '#FF6B9D', '#C44569', '#F8A5C2', '#F7D794', '#778CA3', '#E77F67'] },
  mono: { label: 'Mono', swatches: ['#1A1A1A', '#4A4A4A', '#737373', '#9E9E9E', '#BDBDBD', '#2E2E2E', '#616161', '#8A8A8A', '#B0B0B0', '#D4D4D4'] },
  burg: { label: 'Burg', swatches: ['#7B1E30', '#9B2E40', '#C05070', '#5A1020', '#D08090', '#3B0A14', '#E8A0B0', '#B03050', '#F0C0CC', '#2D0A10'] },
};
const KPI_ICONS = ['📊', '💰', '📦', '📈', '🏆', '📉', '⚡', '🎯', '✅', '🔢'];
const CHART_THEMES = {};
let activeCharts = [];

// Playful, non-AI-sounding verbs shown while we wait on the backend —
// keeps processing feeling like "natural" crunching rather than "talking to a model".
const PONDER_WORDS = [
  'Pondering', 'Squashing', 'Analyzing', 'Sleuthing', 'Crunching', 'Untangling',
  'Digesting', 'Deciphering', 'Unpacking', 'Distilling', 'Mulling over', 'Sifting through',
  'Connecting the dots', 'Spotting patterns', 'Cross-checking', 'Number-crunching',
  'Fact-finding', 'Puzzling through', 'Making sense of it', 'Joining the dots',
  'Reading between the lines', 'Weighing the numbers', 'Chewing on it', 'Tallying up',
  'Poking around', 'Piecing it together', 'Double-checking', 'Taking stock',
];
function randomPonderWord(exclude) {
  let w = PONDER_WORDS[Math.floor(Math.random() * PONDER_WORDS.length)];
  if (w === exclude && PONDER_WORDS.length > 1) return randomPonderWord(exclude);
  return w;
}

function $id(id) {
  return document.getElementById(id);
}
function destroyCharts() {
  activeCharts.forEach((c) => c.destroy());
  activeCharts = [];
}
function x(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Profiler (unchanged from original prototype) ────────────────────────────
function parseNum(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/[€$£¥₹\s]/g, '');
  if (!s || s === '-') return null;
  const neg = s.startsWith('-');
  s = s.replace(/^-/, '');
  const isDutch = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+(,\d{1,2})$/.test(s);
  if (isDutch) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : neg ? -n : n;
}

function profileData(rows, fields) {
  const numCols = {}, catCols = {}, dateCols = [];
  for (const f of fields) {
    const vals = rows.map((r) => r[f]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
    const nums = vals.map(parseNum).filter((v) => v !== null);
    if (nums.length / Math.max(vals.length, 1) > 0.7) {
      const s = [...nums].sort((a, b) => a - b);
      numCols[f] = { count: nums.length, sum: +nums.reduce((a, b) => a + b, 0).toFixed(2), min: s[0], max: s[s.length - 1], avg: +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) };
    } else {
      const unique = [...new Set(vals.map((v) => String(v).trim()))].filter(Boolean);
      catCols[f] = { uniqueCount: unique.length, topValues: unique.slice(0, 15), totalCount: vals.length };
      if (unique.some((v) => /\d{4}[-\/]\d{1,2}|\d{1,2}[-\/]\d{4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v))) dateCols.push(f);
    }
  }
  const groupings = [];
  const smallCats = Object.keys(catCols).filter((c) => catCols[c].uniqueCount >= 2 && catCols[c].uniqueCount <= 20);
  const numKeys = Object.keys(numCols);
  for (const cat of smallCats.slice(0, 4)) {
    for (const num of numKeys.slice(0, 4)) {
      const bg = {};
      for (const row of rows) {
        const k = String(row[cat] || '').trim() || '(blank)';
        const n = parseNum(row[num]);
        if (n === null) continue;
        bg[k] = (bg[k] || 0) + n;
      }
      const sorted = Object.entries(bg).sort((a, b) => b[1] - a[1]);
      if (sorted.length >= 2) groupings.push({ groupBy: cat, sumOf: num, values: sorted.slice(0, 12).map(([k, v]) => ({ label: k, value: +v.toFixed(2) })) });
    }
  }
  const timeSeries = [];
  if (dateCols.length && numKeys.length) {
    const dc = dateCols[0], nc = numKeys[0], bp = {};
    for (const row of rows) {
      const raw = String(row[dc] || '').trim();
      const m = raw.match(/(\d{4})[-\/](\d{1,2})/) || raw.match(/^(\d{1,2})$/);
      const key = m ? (m[2] ? `${m[1]}-${m[2].padStart(2, '0')}` : m[1].padStart(2, '0')) : null;
      if (!key) continue;
      const n = parseNum(row[nc]);
      if (n === null) continue;
      bp[key] = (bp[key] || 0) + n;
    }
    const sorted = Object.entries(bp).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length >= 2) timeSeries.push({ dateCol: dc, valueCol: nc, periods: sorted.map(([k, v]) => ({ label: k, value: +v.toFixed(2) })) });
  }
  return { numCols, catCols, groupings, timeSeries, sampleRows: rows.slice(0, 10), totalRows: rows.length, fields };
}

function buildPrompt(profile, fields, totalRows, filename) {
  return `You are a senior business intelligence analyst performing a DEEP, MULTI-LAYERED analysis of a dataset. Return ONLY a raw JSON object — no markdown, no explanation, just JSON.

FILE: "${filename}" | ROWS: ${totalRows} | COLUMNS: ${fields.join(', ')}

PRE-COMPUTED DATA:
NUMERIC STATS: ${JSON.stringify(profile.numCols)}
CATEGORICAL STATS: ${JSON.stringify(profile.catCols)}
CROSS-AGGREGATIONS (sum of numeric per category): ${JSON.stringify(profile.groupings)}
TIME SERIES (if date column found): ${JSON.stringify(profile.timeSeries)}
SAMPLE ROWS: ${JSON.stringify(profile.sampleRows)}

You MUST perform ALL of the following analysis layers and surface the results in your charts, KPIs, and insights:

1. DESCRIPTIVE ANALYSIS — What happened?
   - Summarise totals, averages, distributions, counts across all key columns
   - Identify the top and bottom performers in every categorical dimension

2. DIAGNOSTIC ANALYSIS — Why did it happen?
   - Cross-analyse categories against each other (e.g. which salesman drives which product group)
   - Identify outliers, anomalies, or unexpected values in the data
   - Find which segments are over- or under-performing relative to the average

3. TREND ANALYSIS — How is it changing over time?
   - If a time/date column exists, compute month-over-month or period-over-period change
   - Identify the peak period, lowest period, and overall direction (growth/decline/flat)

4. PIVOT ANALYSIS — Multi-dimensional breakdown
   - Slice the primary metric by at least 2 different categorical dimensions
   - Show concentration (e.g. top 20% of salesmen driving 80% of revenue = Pareto effect)

5. COMPARATIVE ANALYSIS — How do segments compare?
   - Rank all categories from best to worst
   - Compute each category's % share of the total
   - Show which segments are above vs below the mean

6. PREDICTIVE SIGNALS — What might happen next?
   - Based on trend direction, extrapolate the likely next period value (label it as "projected")
   - Flag any category that is declining for 2+ consecutive periods as a risk
   - Identify the fastest-growing segment as an opportunity

Return this exact JSON structure:
{"title":"...","description":"...","kpis":[{"label":"","value":"","change":"","trend":"up|down|neutral","icon":"emoji"}],"charts":[{"type":"bar|line|donut|horizontal_bar","title":"","labels":[],"datasets":[{"label":"","data":[]}],"wide":false}],"table":{"title":"","headers":[],"rows":[[]]},"insights":[{"type":"positive|warning|negative|info","metric":"","text":""}]}

STRICT OUTPUT RULES — violating these makes the dashboard useless:

KPIs (4–6 required):
- Each KPI must be a real computed value from the data above
- Cover: total volume metric, average metric, top performer, a ratio or %, and a period-change if time data exists
- Format: use commas (1,234), K/M suffixes, % symbol, currency symbol detected from data
- "change" field: include a specific comparison (e.g. "top segment: 43% share" or "MoM: +12.4%")
- "icon": a single relevant emoji (📦 for units, 💰 for revenue, 📈 for growth, etc.)

CHARTS (minimum 4, up to 6 — this is a hard minimum):
- MANDATORY chart 1: If time series data exists → LINE chart of primary metric over time, wide:true. Must include a second dataset showing the running average or projected next value.
- MANDATORY chart 2: HORIZONTAL_BAR showing top categories ranked by primary metric (show % share in labels if possible).
- MANDATORY chart 3: DONUT showing distribution/composition of the primary metric across top categories (max 8 segments).
- MANDATORY chart 4: BAR chart showing a SECOND numeric metric or a cross-dimension breakdown (e.g. quantity vs revenue by category, or a second salesman metric).
- OPTIONAL chart 5: If 2+ numeric columns exist → BAR comparing two metrics side-by-side across categories (multi-dataset bar).
- OPTIONAL chart 6: If time data → BAR showing period-over-period comparison.
- All "data" arrays must contain numbers ONLY (no strings, no nulls).
- Set wide:true on chart 1 (time trend) or the most information-dense chart.
- Use real values from groupings[] and timeSeries[] — never placeholder values.

TABLE (required):
- Top 8–10 rows ranked by the primary numeric column descending
- Include at minimum: name/label column, primary metric, secondary metric, % share of total
- Compute % share from the aggregation totals above

INSIGHTS (5–7 required, cover all analysis layers):
- insight 1 (positive or info): Descriptive — the headline number and what it means
- insight 2 (info): Diagnostic — which segment drives the most and why it stands out
- insight 3 (positive or warning): Trend — direction, peak, and momentum signal
- insight 4 (info): Pivot — a cross-dimension finding (e.g. "salesman X dominates product Y")
- insight 5 (positive): Comparative — the top performer's % share advantage over #2
- insight 6 (warning or negative): Risk signal — a declining, low-share, or anomalous segment
- insight 7 (positive): Opportunity — fastest growing or highest-potential segment
- Every insight must contain a specific number from the aggregations above. No vague statements.

CURRENCY: Detect from column names (revenue, price, total, amount, vat, excl) or values (€, $, £, ₹). Use consistently.
NEVER invent any number. Every figure must be derivable from the PRE-COMPUTED DATA above.`;
}

function fmtNum(v) {
  if (v === null || v === undefined) return '–';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(n)) return String(v);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getAltTypes(type) {
  const all = [
    { val: 'bar', ico: '▦', label: 'Bar' },
    { val: 'horizontal_bar', ico: '▤', label: 'Horizontal bar' },
    { val: 'line', ico: '〜', label: 'Line' },
    { val: 'donut', ico: '◎', label: 'Donut' },
  ];
  if (type === 'bar' || type === 'horizontal_bar' || type === 'line') return all.filter((t) => ['bar', 'horizontal_bar', 'line'].includes(t.val));
  if (type === 'donut') return all.filter((t) => ['donut', 'bar', 'horizontal_bar'].includes(t.val));
  return all.slice(0, 3);
}

function drawChart(idx, c, typeOverride, ACTIVE_THEME) {
  const existing = activeCharts.find((ch) => ch._insightlyIdx === idx);
  if (existing) {
    existing.destroy();
    activeCharts = activeCharts.filter((ch) => ch._insightlyIdx !== idx);
  }
  const cv = $id('cv-' + idx);
  if (!cv) return;
  const wrap = $id('cwrap-' + idx);
  wrap.innerHTML = '<canvas id="cv-' + idx + '"></canvas>';
  const canvas = $id('cv-' + idx);

  const P = COLOR_THEMES[CHART_THEMES[idx] || ACTIVE_THEME].swatches;
  const type = typeOverride || c.type;
  const isDonut = type === 'donut', isHoriz = type === 'horizontal_bar', isLine = type === 'line';
  const cType = isLine ? 'line' : isDonut ? 'doughnut' : 'bar';

  const datasets = (c.datasets || []).map((ds, di) => ({
    label: ds.label || '',
    data: (ds.data || []).map((v) => (typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0)),
    backgroundColor: isDonut ? P.slice(0, (ds.data || []).length) : isLine ? P[di % P.length] + '20' : P[di % P.length] + 'D0',
    borderColor: isDonut ? '#fff' : P[di % P.length],
    borderWidth: isDonut ? 3 : isLine ? 2.5 : 0,
    borderRadius: isHoriz || (!isLine && !isDonut) ? 6 : 0,
    fill: isLine,
    tension: 0.42,
    pointRadius: isLine ? 4 : 0,
    pointHoverRadius: isLine ? 7 : 0,
    pointBackgroundColor: isLine ? P[di % P.length] : '',
    pointBorderColor: isLine ? '#fff' : '',
    pointBorderWidth: isLine ? 2 : 0,
    hoverBackgroundColor: isDonut ? P.slice(0, (ds.data || []).length).map((cc) => cc + 'EE') : isLine ? P[di % P.length] + '40' : P[di % P.length],
  }));

  const ch = new Chart(canvas, {
    type: cType,
    data: { labels: c.labels || [], datasets },
    options: {
      indexAxis: isHoriz ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: isDonut ? 'nearest' : 'index', intersect: false },
      plugins: {
        legend: { display: isDonut || (c.datasets || []).length > 1, position: isDonut ? 'right' : 'top', labels: { boxWidth: 11, padding: 14, font: { size: 11 }, usePointStyle: isLine, pointStyleWidth: isLine ? 8 : 11 } },
        tooltip: {
          enabled: true,
          mode: isDonut ? 'nearest' : 'index',
          intersect: false,
          callbacks: {
            label: (ctx) => { const v = ctx.raw; if (typeof v !== 'number') return ` ${v}`; return ` ${ctx.dataset.label || ''}: ${fmtNum(v)}`; },
          },
        },
        // Only show crosshair line on line/bar charts, not donut
        insightlyCrosshair: { display: !isDonut },
      },
      scales: isDonut ? {} : {
        x: { grid: { color: '#F0F0EE', drawBorder: false }, ticks: { maxTicksLimit: 12, maxRotation: 35, font: { size: 11 } }, border: { display: false } },
        y: { grid: { color: '#F0F0EE', drawBorder: false }, border: { display: false }, ticks: { font: { size: 11 }, callback: (v) => { if (typeof v !== 'number') return v; if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M'; if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'K'; return v; } } },
      },
      animation: { duration: 600, easing: 'easeInOutQuart' },
      transitions: { active: { animation: { duration: 200 } } },
    },
  });
  ch._insightlyIdx = idx;
  activeCharts.push(ch);
}

export default function Dashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [trial, setTrial] = useState(null); // { eligible, nextAvailableAt }
  const [trialLoading, setTrialLoading] = useState(true);
  const [stage, setStage] = useState('drop'); // drop | processing | error | dash
  const [errMsg, setErrMsg] = useState('');
  const [fileName, setFileName] = useState('');
  const [procSub, setProcSub] = useState('Preparing…');
  const [stepIdx, setStepIdx] = useState(-1);
  const [pendingDash, setPendingDash] = useState(null); // { d, filename, total } queued until #dash is actually visible
  const dashRef = useRef(null);
  const ACTIVE_THEME_REF = useRef('vivid');
  const ponderIntervalRef = useRef(null);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function refreshTrial() {
    setTrialLoading(true);
    const token = await getToken();
    if (!token) return;
    try {
      const r = await fetch('/api/trial-status', { headers: { Authorization: 'Bearer ' + token } });
      const body = await r.json();
      if (r.ok) {
        setTrial({ eligible: body.eligible, nextAvailableAt: body.nextAvailableAt });
        setProfile({ name: body.name, orgName: body.orgName, trialCount: body.trialCount });
      }
    } finally {
      setTrialLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        router.replace('/');
        return;
      }
      setReady(true);
      refreshTrial();
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs after React has actually committed the 'dash' stage (so #dash is
  // display:block and has real layout) before we touch its innerHTML or
  // draw any charts into it.
  useEffect(() => {
    if (stage !== 'dash' || !pendingDash) return;
    const { d, filename, total } = pendingDash;
    try {
      renderDashboard(d, filename, total);
    } catch (e) {
      showError('Render error: ' + e.message);
      return;
    }
    setPendingDash(null);
    refreshTrial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pendingDash]);

  async function handleSignOut() {
    destroyCharts();
    await supabase.auth.signOut();
    router.replace('/');
  }

  function resetToDrop() {
    destroyCharts();
    if (dashRef.current) dashRef.current.innerHTML = '';
    setStage('drop');
    setFileName('');
    setErrMsg('');
  }

  async function handleFile(file) {
    setFileName(file.name);
    setStage('processing');
    setStepIdx(0);
    setProcSub('Preparing…');

    let text;
    try {
      text = await file.text();
    } catch (e) {
      return showError('Could not read file: ' + e.message);
    }

    const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true, dynamicTyping: false, delimitersToGuess: [',', ';', '\t', '|'] });
    if (!parsed.data?.length || !parsed.meta.fields?.length) return showError('Could not parse CSV. Make sure it has a header row.');

    const rows = parsed.data, fields = parsed.meta.fields.filter((f) => f && f.trim()), totalRows = rows.length;

    setStepIdx(1);
    setProcSub(`Profiling ${totalRows.toLocaleString()} rows…`);
    const profileData_ = profileData(rows, fields);

    setStepIdx(2);
    let lastWord = null;
    setProcSub(randomPonderWord() + '…');
    const prompt = buildPrompt(profileData_, fields, totalRows, file.name);

    const token = await getToken();
    if (!token) {
      router.replace('/');
      return;
    }

    setStepIdx(3);
    // Rotate through playful status words for the whole duration of the
    // backend call so it reads as ordinary processing, not "talking to AI".
    ponderIntervalRef.current = setInterval(() => {
      lastWord = randomPonderWord(lastWord);
      setProcSub(lastWord + '…');
    }, 1100);

    let resp;
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ prompt }),
      });
      const body = await r.json();
      if (!r.ok) {
        if (r.status === 429) {
          await refreshTrial();
          return showError('Your weekly free trial has already been used. It resets ' + (body.nextAvailableAt ? new Date(body.nextAvailableAt).toLocaleString() : 'next week') + '.');
        }
        throw new Error(body.error || 'Request failed.');
      }
      let c = (body.text || '').trim();
      const fence = c.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) c = fence[1].trim();
      const b = c.indexOf('{'), lb = c.lastIndexOf('}');
      if (b >= 0 && lb > b) c = c.slice(b, lb + 1);
      resp = JSON.parse(c);
    } catch (e) {
      return showError(e instanceof SyntaxError ? 'That took a wrong turn — try again.\n' + e.message : e.message);
    } finally {
      clearInterval(ponderIntervalRef.current);
    }

    setStepIdx(4);
    setProcSub('Putting it all together…');
    // Queue the dashboard data and flip to the 'dash' stage; the actual
    // innerHTML + chart draw happens in a useEffect once #dash has really
    // been painted visible — drawing charts into a still-hidden (display:none)
    // container gives them 0 width/height and they stay blank until something
    // else (like switching chart type) forces a redraw.
    setPendingDash({ d: resp, filename: file.name, total: totalRows });
    setStage('dash');
  }

  function showError(msg) {
    clearInterval(ponderIntervalRef.current);
    setErrMsg(msg);
    setStage('error');
  }

  function renderDashboard(d, filename, total) {
    destroyCharts();
    const ts = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    let h = `<div class="dash-hdr">
      <div>
        <div class="dash-title">${x(d.title || 'Dashboard')}</div>
        <div class="dash-desc">${x(d.description || '')}</div>
      </div>
      <div class="dash-meta">${x(filename)}<br>${total.toLocaleString()} rows<br>${ts}</div>
    </div>`;

    if (d.kpis?.length) {
      h += '<div class="kpi-row">';
      const accents = COLOR_THEMES.vivid.swatches.slice(0, 5);
      d.kpis.forEach((k, i) => {
        const tc = k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : 'neutral';
        const ti = k.trend === 'up' ? '↑ ' : k.trend === 'down' ? '↓ ' : '';
        const accent = accents[i % accents.length];
        const ico = k.icon || KPI_ICONS[i % KPI_ICONS.length];
        h += `<div class="kpi" style="--kpi-accent:${accent}">
          <div class="kpi-ico">${x(ico)}</div>
          <div class="kpi-lbl">${x(k.label)}</div>
          <div class="kpi-val">${x(k.value)}</div>
          <span class="kpi-chg ${tc}">${ti}${x(k.change || '')}</span>
        </div>`;
      });
      h += '</div>';
    }

    if (d.charts?.length) {
      h += '<div class="chart-grid">';
      d.charts.forEach((c, i) => {
        const altTypes = getAltTypes(c.type);
        const typeBtns = altTypes.map((t) => `<button class="type-btn${t.val === c.type ? ' active' : ''}" onclick="window.__insightlySwitchType(${i},'${t.val}')" title="${t.label}">${t.ico}</button>`).join('');
        const palOpts = Object.entries(COLOR_THEMES).map(([k, t]) => {
          const swatches = t.swatches.slice(0, 5).map((cl) => `<span style="background:${cl}"></span>`).join('');
          return `<button class="pal-opt${k === 'vivid' ? ' active' : ''}" data-theme="${k}" onclick="window.__insightlySwitchPalette(${i},'${k}')" title="${t.label}"><span class="pal-swatches">${swatches}</span><span class="pal-name">${t.label}</span></button>`;
        }).join('');
        h += `<div class="ccard${c.wide ? ' wide' : ''}" id="ccard-${i}">
          <div class="ccard-head">
            <div class="ccard-lbl">${x(c.title)}</div>
            <div class="ccard-controls">
              <div class="pal-picker" id="pal-picker-${i}">
                <button class="pal-btn" onclick="window.__insightlyTogglePalette(${i})" title="Color theme">🎨</button>
                <div class="pal-dropdown" id="pal-dd-${i}">${palOpts}</div>
              </div>
              <div class="type-btns">${typeBtns}</div>
              <button class="toggle-btn" id="tog-${i}" onclick="window.__insightlyToggleTable(${i})">⊞ Table</button>
            </div>
          </div>
          <div class="ccard-body">
            <div class="ccard-wrap" id="cwrap-${i}"><canvas id="cv-${i}"></canvas></div>
            <div class="ccard-tbl" id="ctbl-${i}"></div>
          </div>
        </div>`;
      });
      h += '</div>';
    }

    if (d.insights?.length) {
      h += `<div class="sec-lbl">Key Findings</div><div class="insights-g">`;
      d.insights.forEach((ins) => {
        const ico = ins.type === 'positive' ? '✅' : ins.type === 'warning' ? '⚠️' : ins.type === 'negative' ? '🔻' : 'ℹ️';
        h += `<div class="ins ${x(ins.type || 'info')}"><div class="ins-metric">${ico} ${x(ins.metric)}</div>${x(ins.text)}</div>`;
      });
      h += '</div>';
    }

    if (d.table?.headers?.length && d.table?.rows?.length) {
      h += `<div class="sec-lbl">${x(d.table.title || 'Breakdown')}</div>
      <div class="sum-tbl-card"><div class="sum-tbl-wrap"><table>
        <thead><tr>${d.table.headers.map((c) => `<th>${x(c)}</th>`).join('')}</tr></thead>
        <tbody>${d.table.rows.map((r) => `<tr>${r.map((c) => `<td>${x(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div></div>`;
    }

    if (dashRef.current) dashRef.current.innerHTML = h;
    window._chartData = d.charts || [];

    if (d.charts?.length) {
      // Wait 2 frames so the browser has fully laid out every chart container
      // (width/height > 0) before we draw into them. A single rAF is not enough
      // because innerHTML triggers style recalc but the layout pass for containers
      // further down the page may still be pending. Drawing into a 0×0 canvas
      // produces an invisible chart that only "appears" after a forced resize
      // (like switching chart type).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          d.charts.forEach((c, i) => {
            drawChart(i, c, c.type, ACTIVE_THEME_REF.current);
          });
        });
      });
    }
  }

  // Expose chart-control callbacks used by the innerHTML-rendered dashboard markup
  useEffect(() => {
    window.__insightlySwitchType = (idx, newType) => {
      const card = $id('ccard-' + idx);
      card.querySelectorAll('.type-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('onclick').includes(`'${newType}'`)));
      const c = window._chartData[idx];
      drawChart(idx, c, newType, ACTIVE_THEME_REF.current);
    };
    window.__insightlySwitchPalette = (idx, themeKey) => {
      CHART_THEMES[idx] = themeKey;
      const card = $id('ccard-' + idx);
      card.querySelectorAll('.pal-opt').forEach((b) => b.classList.toggle('active', b.dataset.theme === themeKey));
      const dd = $id('pal-dd-' + idx);
      if (dd) dd.classList.remove('open');
      const c = window._chartData[idx];
      const curType = card.querySelector('.type-btn.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || c.type;
      drawChart(idx, c, curType, ACTIVE_THEME_REF.current);
    };
    window.__insightlyTogglePalette = (idx) => {
      const dd = $id('pal-dd-' + idx);
      if (!dd) return;
      document.querySelectorAll('.pal-dropdown.open').forEach((el) => { if (el.id !== 'pal-dd-' + idx) el.classList.remove('open'); });
      dd.classList.toggle('open');
    };
    window.__insightlyToggleTable = (idx) => {
      const wrap = $id('cwrap-' + idx), tbl = $id('ctbl-' + idx), btn = $id('tog-' + idx);
      const isTable = tbl.style.display === 'block';
      if (isTable) {
        tbl.style.display = 'none';
        wrap.style.display = 'block';
        btn.textContent = '⊞ Table';
        btn.classList.remove('table-mode');
      } else {
        wrap.style.display = 'none';
        tbl.style.display = 'block';
        btn.textContent = '◑ Chart';
        btn.classList.add('table-mode');
        const c = window._chartData[idx];
        let th = `<tr><th>Label</th>${(c.datasets || []).map((ds) => `<th>${x(ds.label || 'Value')}</th>`).join('')}</tr>`;
        let rows = (c.labels || []).map((lbl, li) => `<tr><td>${x(lbl)}</td>${(c.datasets || []).map((ds) => `<td>${fmtNum(ds.data?.[li])}</td>`).join('')}</tr>`).join('');
        tbl.innerHTML = `<table><thead>${th}</thead><tbody>${rows}</tbody></table>`;
      }
    };
    const closeDropdowns = (e) => {
      if (!e.target.closest('.pal-picker')) document.querySelectorAll('.pal-dropdown.open').forEach((el) => el.classList.remove('open'));
    };
    document.addEventListener('click', closeDropdowns);
    return () => document.removeEventListener('click', closeDropdowns);
  }, []);

  function onDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }

  if (!ready) return null;

  const stepLabels = ['Parsing your file', 'Computing aggregations', 'Spotting patterns', 'Crunching the numbers', 'Rendering dashboard'];

  return (
    <div id="app">
      <header className="hdr">
        <div className="hdr-logo">
          <div className="hdr-mark">I</div>
          <div className="hdr-name">Insightly <span>/ {profile?.orgName || '...'}</span></div>
        </div>
        <div className="hdr-divider"></div>
        <div className="hdr-breadcrumb">{stage === 'dash' ? 'Dashboard' : stage === 'processing' ? 'Analysing…' : 'Upload Data'}</div>
        <div className="hdr-right">
          {!trialLoading && trial && (
            <div id="hdr-trial">{trial.eligible ? 'Trial available' : 'Trial used this week'}</div>
          )}
          {fileName && stage !== 'drop' && <div className="hdr-chip" style={{ display: 'block' }}>{fileName}</div>}
          {stage !== 'drop' && (
            <button className="btn-outline" onClick={resetToDrop}>← New file</button>
          )}
          <button className="btn-outline" onClick={handleSignOut}>Sign out</button>
          <div className="hdr-avatar">{(profile?.name || '?')[0]?.toUpperCase()}</div>
        </div>
      </header>

      {stage === 'drop' && (
        trialLoading ? null : trial && !trial.eligible ? (
          <div className="trial-block">
            <div className="trial-block-card">
              <div className="trial-block-ico">⏳</div>
              <div className="trial-block-h">Weekly trial already used</div>
              <div className="trial-block-sub">
                Each account gets one free analysis per week.
                <span className="trial-block-date">
                  Next run available: {trial.nextAvailableAt ? new Date(trial.nextAvailableAt).toLocaleString() : 'soon'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div
            id="dropzone"
            style={{ display: 'block' }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
            onDragLeave={(e) => e.currentTarget.classList.remove('over')}
            onDrop={onDrop}
          >
            <div className="drop-graphic">📊</div>
            <div className="drop-h">Drop your data file here</div>
            <div className="drop-sub">AI reads the full dataset and builds a real dashboard</div>
            <div className="drop-hint">Any structure · Any language · Any size</div>
            <div className="drop-formats">
              <span className="drop-fmt">.CSV</span>
              <span className="drop-fmt">.TSV</span>
              <span className="drop-fmt">Any delimiter</span>
            </div>
            <button className="btn-browse" onClick={() => $id('finput').click()}>📁 Choose file</button>
            <input
              type="file"
              id="finput"
              accept=".csv,.tsv"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>
        )
      )}

      {stage === 'processing' && (
        <div id="processing" style={{ display: 'block' }}>
          <div className="proc-card">
            <div className="proc-anim"><div className="proc-ring"></div><div className="proc-dot"></div></div>
            <div className="proc-h">Analysing your data</div>
            <div className="proc-sub">{procSub}</div>
            <div className="steps">
              {stepLabels.map((label, i) => (
                <div key={i} className={'stp' + (i < stepIdx ? ' done' : i === stepIdx ? ' active' : '')}>
                  <div className="stp-dot"></div>{label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {stage === 'error' && (
        <>
          <div id="errmsg" style={{ display: 'block' }}>{errMsg}</div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button className="btn-browse" onClick={resetToDrop}>↻ Try again</button>
          </div>
        </>
      )}

      <div id="dash" ref={dashRef} style={{ display: stage === 'dash' ? 'block' : 'none' }}></div>
    </div>
  );
}
