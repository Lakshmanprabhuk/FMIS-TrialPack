import { defaultView, dimCandidates, dimTitle } from './engine';
import { fmtSpan } from './format';

const DAY = 864e5;

// How the app currently reads a column, in the words shown on the review screen.
export function readAs(col) {
  if (!col) return 'text';
  if (col.kind === 'id') return 'id';
  if (col.type === 'numeric') return 'number';
  if (col.type === 'date') return 'date';
  if (col.type === 'cat') return 'category';
  return 'text';
}
export const READ_LABEL = { number: 'Number', category: 'Category', date: 'Date', id: 'ID (never summed)', text: 'Free text' };
export const USE_OPTIONS = [
  ['auto', 'Auto-detect'],
  ['number', 'Number (measure)'],
  ['category', 'Category (group by)'],
  ['date', 'Date'],
  ['id', 'ID / reference'],
  ['ignore', 'Ignore this column'],
];

const trunc = (s, n) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// One row per original column for the review table.
export function profileColumns(ds, rows) {
  const out = [];
  for (const f of ds.fields) {
    const c = ds.cols[f];
    const samples = [];
    for (let i = 0; i < rows.length && i < 600 && samples.length < 4; i++) {
      const v = trunc(rows[i][ds.srcOf?.[f] || f], 28);
      if (v && !samples.includes(v)) samples.push(v);
    }
    out.push({
      orig: ds.srcOf?.[f] || f,
      name: f,
      readAs: readAs(c),
      nonNull: c.nonNull,
      missing: c.missing,
      issues: c.issues || 0,
      unique: c.type === 'cat' || c.type === 'text' ? c.dict.length : c.unique,
      min: c.type === 'numeric' ? c.min : null,
      max: c.type === 'numeric' ? c.max : null,
      note: ds.quality.find((q) => q.name === f)?.handling || '',
      samples,
    });
  }
  return out;
}

export function initialSchema(ds) {
  const cols = {};
  for (const f of ds.fields) cols[f] = { name: f, use: 'auto', desc: '', unit: '' };
  return { cols, notes: '', question: '', target: '', dropDupes: false };
}

// What the analysis will contain for this file. Computed from the real data, so it never promises
// something the app cannot do.
export function planAnalysis(ds) {
  const v = defaultView(ds);
  const dn = v.dimKey ? dimTitle(ds, v.dimKey) : '';
  const m = v.metric === '__count' ? 'record count' : v.metric;
  const dims = dimCandidates(ds);
  const hasDate = !!ds.primaryDate;
  const spanDays = hasDate && ds.minDate != null ? (ds.maxDate - ds.minDate) / DAY : 0;
  const rows = [];
  const add = (section, shows, uses, ok = true, note = '') => rows.push({ section, shows, uses: uses.filter(Boolean), ok, note });

  add('Executive summary', 'Headline KPIs with change vs the previous period, key takeaways and AI commentary.', [m, v.metric2, dn]);
  add(
    'Insights',
    'What drove the change, which segments are growing or shrinking, patterns and the biggest opportunities.',
    [m, dn],
    !!v.dimKey && v.metric !== '__count' ? true : !!v.dimKey,
    v.dimKey ? '' : 'Needs a category column to compare.'
  );
  add('Trends', `${m} over time with moving average, growth rates and anomalies.`, [m, ds.primaryDate], hasDate, 'Needs a date or month column.');
  add(
    'Forecast',
    'Next-period outlook with a range and a back-test of how reliable it is.',
    [m, ds.primaryDate],
    hasDate && spanDays >= 150,
    hasDate ? 'Needs at least about 6 periods of history.' : 'Needs a date or month column.'
  );
  add('Compare', 'Period vs period and segment vs segment, with a bridge of what changed.', [m, dn, ds.primaryDate], hasDate || dims.length >= 1, 'Needs a date or a category.');
  add('Breakdown / pivot', 'Any measure by any two dimensions, as a heat table.', [m, ...dims.slice(0, 2)], dims.length >= 1, 'Needs a category column.');
  add('Performance ranking', `Ranking of ${dn || 'segments'} with Pareto and ABC classes.`, [m, dn], !!v.dimKey, 'Needs a category column.');
  add('Exceptions & risks', 'Concentration, declining segments, statistical outliers and unusual periods.', [m, dn], true);
  add('Ideas & scenarios', 'Actions to test and a what-if model sized from your own numbers.', [m, dn], !!v.dimKey, 'Needs a category column.');
  add('Data quality & table', 'Blank and unreadable cells, duplicates, and the searchable data table.', ds.fields.slice(0, 3), true);
  return {
    rows,
    measure: m,
    dimension: dn,
    period: ds.minDate != null ? fmtSpan(ds.minDate, ds.maxDate) + (ds.yearless ? ' (month numbers only)' : '') : 'no date column',
  };
}

// The compact, safe description sent to the verification route. No raw data beyond 20 clipped sample rows.
export function buildVerifyPayload(ds, rows, schema) {
  const names = ds.fields;
  const columns = names.map((f) => {
    const c = ds.cols[f];
    const vals = [];
    for (let i = 0; i < rows.length && i < 800 && vals.length < 5; i++) {
      const v = trunc(rows[i][ds.srcOf?.[f] || f], 30);
      if (v && !vals.includes(v)) vals.push(v);
    }
    return {
      name: trunc(f, 60),
      use: c.use || 'auto',
      readAs: readAs(c),
      desc: trunc(c.desc, 200),
      unit: trunc(c.unit, 20),
      nonNull: c.nonNull,
      missing: c.missing,
      unique: c.type === 'cat' || c.type === 'text' ? c.dict.length : c.unique,
      min: c.type === 'numeric' && isFinite(c.min) ? c.min : null,
      max: c.type === 'numeric' && isFinite(c.max) ? c.max : null,
      samples: vals,
    };
  });
  const sample = rows.slice(0, 20).map((r) => names.map((f) => trunc(r[ds.srcOf?.[f] || f], 30)));
  return {
    rowCount: ds.n,
    fileNotes: trunc(schema?.notes, 800),
    question: trunc(schema?.question, 300),
    yearless: !!ds.yearless,
    columns: columns.slice(0, 60),
    sample,
    sampleColumns: names.slice(0, 60).map((f) => trunc(f, 60)),
  };
}

// Roles handed to the analysis modules: measure, dimension, date, id or text, plus the user's descriptions.
export function buildCtxSchema(ds) {
  const out = {};
  for (const f of ds.fields) {
    const c = ds.cols[f];
    const r = readAs(c);
    out[f] = { role: r === 'number' ? 'measure' : r === 'category' ? 'dimension' : r === 'date' ? 'date' : r === 'id' ? 'id' : 'text', desc: c.desc || '', unit: c.unit || '' };
  }
  return out;
}

// What the user typed on the review screen, trimmed for the commentary request.
export function buildUserContext(ds, schema, focus) {
  return {
    notes: schema?.notes || '',
    question: schema?.question || '',
    focus: focus || '',
    columns: ds.fields.map((f) => ({ name: f, desc: ds.cols[f].desc || '', unit: ds.cols[f].unit || '' })).filter((c) => c.desc || c.unit),
  };
}
