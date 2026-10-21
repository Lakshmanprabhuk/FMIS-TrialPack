import Papa from 'papaparse';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const SYM_RE = /[€$£¥₹]/;
const BLANK_RE = /^(null|n\/a|na|nan|none|-|—|#n\/a)?$/i;
// A column named like a month / week / quarter whose values are small whole numbers is a period
// number (e.g. Factuur_Month = 9). It is a label, not a measure, so it is never summed.
const PERIOD_NAME_RE = /(^|[^a-z])(month|maand|mnd|mth|period|periode|week|wk|kwartaal|quarter|qtr)([^a-z]|$)/i;
import { setYearless } from './format';

const ID_RE = /(^|[^a-z])(id|no|nr|num|number|code|ref|zip|postal|phone|invoice|sku|barcode)([^a-z]|$)/i;
const MONEY_NAME = /revenue|sales|price|amount|total|cost|value|vat|excl|profit|income|expense|turnover|salary|fee|budget|margin/i;
const MAX_ROWS = 500000;

const clean = (v) => (v == null ? '' : String(v).trim());
const isBlank = (s) => BLANK_RE.test(s);

// ── Parsing helpers ─────────────────────────────────────────────────────────
export function parseNum(v) {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s || s === '-') return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[€$£¥₹\s]/g, '').replace(/%$/, '');
  if (s[0] === '-') {
    neg = true;
    s = s.slice(1);
  } else if (s[0] === '+') s = s.slice(1);
  // European format: 1.234.567,89 | 1.234,5 | 12,5
  if (/^\d{1,3}(\.\d{3}){2,}(,\d+)?$/.test(s) || /^\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else s = s.replace(/,/g, '');
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  const n = Number(s);
  return isNaN(n) ? NaN : neg ? -n : n;
}

function mk(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return NaN;
  return Date.UTC(y, mo - 1, d);
}

export function detectOrder(samples) {
  let dmy = 0, mdy = 0;
  for (const s of samples) {
    const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s);
    if (m) {
      if (+m[1] > 12) dmy++;
      else if (+m[2] > 12) mdy++;
    }
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

export function parseDate(raw, order = 'dmy') {
  const s = String(raw).trim();
  if (!s) return NaN;
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s))) return mk(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s].*)?$/.exec(s))) {
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    return order === 'dmy' ? mk(y, b, a) : mk(y, a, b);
  }
  if ((m = /^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s,]*(\d{2,4})$/.exec(s))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (mo) return mk(y, mo, +m[1]);
  }
  if ((m = /^([A-Za-z]{3,9})[\s\-/,]*(\d{1,2})?,?\s*(\d{4})$/.exec(s))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return mk(+m[3], mo, m[2] ? +m[2] : 1);
  }
  if ((m = /^(\d{4})[-/](\d{1,2})$/.exec(s))) return mk(+m[1], +m[2], 1);
  return NaN;
}

// ── File parsing (chunked: main thread stays responsive, progress is real) ──
export function parseFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let fields = null;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      delimitersToGuess: [',', ';', '\t', '|'],
      chunkSize: 2 * 1024 * 1024,
      transformHeader: (h) => String(h || '').replace(/^\uFEFF/, '').trim(),
      chunk: (res) => {
        if (!fields && res.meta?.fields) fields = res.meta.fields.filter((f) => f && !f.startsWith('__parsed'));
        const d = res.data;
        for (let i = 0; i < d.length; i++) rows.push(d[i]);
        if (onProgress) onProgress({ rows: rows.length, pct: Math.min(1, (res.meta?.cursor || 0) / (file.size || 1)) });
      },
      complete: () => {
        if (!rows.length || !fields?.length) reject(new Error('Could not read any rows. Make sure the file has a header row.'));
        else resolve({ rows, fields });
      },
      error: (e) => reject(new Error(e?.message || 'Could not read the file.')),
    });
  });
}

// ── Column builders ─────────────────────────────────────────────────────────
function inferType(sample) {
  if (!sample.length) return { type: 'empty' };
  const order = detectOrder(sample);
  let nOk = 0, dOk = 0, sym = 0;
  for (const s of sample) {
    if (!isNaN(parseNum(s))) {
      nOk++;
      if (SYM_RE.test(s)) sym++;
    }
    if (!isNaN(parseDate(s, order))) dOk++;
  }
  const nr = nOk / sample.length, dr = dOk / sample.length;
  if (dr >= 0.8 && nr < 0.9) return { type: 'date', order };
  if (nr >= 0.9) return { type: 'numeric', symShare: sym / sample.length };
  return { type: 'cat' };
}

function buildNumeric(rows, f, n) {
  const data = new Float64Array(n).fill(NaN);
  let nonNull = 0, issues = 0, allInt = true, min = Infinity, max = -Infinity;
  const uniq = new Set();
  for (let i = 0; i < n; i++) {
    const s = clean(rows[i][f]);
    if (isBlank(s)) continue;
    const v = parseNum(s);
    if (v !== v) {
      issues++;
      continue;
    }
    data[i] = v;
    nonNull++;
    if (allInt && !Number.isInteger(v)) allInt = false;
    if (v < min) min = v;
    if (v > max) max = v;
    if (uniq.size < 200000) uniq.add(v);
  }
  return { name: f, type: 'numeric', data, nonNull, issues, allInt, min, max, unique: uniq.size, missing: n - nonNull - issues };
}

function buildDate(rows, f, n, order) {
  const data = new Float64Array(n).fill(NaN);
  let nonNull = 0, issues = 0, min = Infinity, max = -Infinity;
  const doms = new Set();
  for (let i = 0; i < n; i++) {
    const s = clean(rows[i][f]);
    if (isBlank(s)) continue;
    const v = parseDate(s, order);
    if (v !== v) {
      issues++;
      continue;
    }
    data[i] = v;
    nonNull++;
    if (v < min) min = v;
    if (v > max) max = v;
    if (doms.size < 3) doms.add(new Date(v).getUTCDate());
  }
  return { name: f, type: 'date', data, nonNull, issues, min, max, doms: doms.size, unique: 0, missing: n - nonNull - issues };
}

function buildCat(rows, f, n) {
  const map = new Map();
  const dict = [];
  const codes = new Int32Array(n).fill(-1);
  let nonNull = 0;
  for (let i = 0; i < n; i++) {
    const s = clean(rows[i][f]);
    if (isBlank(s)) continue;
    let c = map.get(s);
    if (c === undefined) {
      c = dict.length;
      dict.push(s);
      map.set(s, c);
    }
    codes[i] = c;
    nonNull++;
  }
  const high = dict.length > 100 && dict.length > 0.5 * nonNull;
  return { name: f, type: high ? 'text' : 'cat', codes, dict, nonNull, issues: 0, unique: dict.length, missing: n - nonNull };
}

// ── Dataset ─────────────────────────────────────────────────────────────────
// schema (optional) = { cols: { [originalName]: { name, use, desc, unit } } } from the review screen.
// use: 'auto' | 'number' | 'category' | 'date' | 'id' | 'ignore'. The file itself is never altered; the
// choices decide how each column is read, what it is called and whether it is used at all.
const MONEY_UNIT = /^(€|\$|£|¥|₹|eur|euro|usd|dollar|gbp|inr)s?$/i;
const UNIT_SYM = { eur: '€', euro: '€', usd: '$', dollar: '$', gbp: '£', inr: '₹' };

export function buildDataset(rowsIn, fieldsIn, schema = null) {
  let rows = rowsIn;
  let truncated = 0;
  if (rows.length > MAX_ROWS) {
    truncated = rows.length - MAX_ROWS;
    rows = rows.slice(0, MAX_ROWS);
  }
  const sc = (schema && schema.cols) || {};
  const origFields = fieldsIn.filter((f) => f && !f.startsWith('__parsed') && (sc[f]?.use || 'auto') !== 'ignore');
  const srcOf = {};
  const fields = origFields.map((o) => {
    let nm = String(sc[o]?.name ?? o).trim() || o;
    const base = nm;
    for (let k = 2; srcOf[nm]; k++) nm = `${base} (${k})`;
    srcOf[nm] = o;
    return nm;
  });
  const n = rows.length;

  // Duplicate rows (flag only; user can exclude them via a toggle)
  const dupFlag = new Uint8Array(n);
  let dupes = 0;
  let dupSkipped = false;
  if (n <= 300000) {
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      let k = '';
      for (const f of fields) k += (r[srcOf[f]] == null ? '' : String(r[srcOf[f]])) + '\u0001';
      if (seen.has(k)) {
        dupFlag[i] = 1;
        dupes++;
      } else seen.add(k);
    }
  } else dupSkipped = true;

  const cols = {};
  const order = [], numeric = [], dates = [], cats = [], texts = [];
  const tally = {};
  const notes = {};

  let monthSrc = null;
  for (const f of fields) {
    const og = srcOf[f];
    const sch = sc[og] || {};
    const use = sch.use || 'auto';
    const stepN = Math.max(1, Math.floor(n / 3000));
    const sample = [];
    for (let i = 0; i < n && sample.length < 3000; i += stepN) {
      const v = rows[i][og];
      if (v != null) {
        const s = String(v).trim();
        if (s && !isBlank(s)) sample.push(s);
      }
    }
    let info = inferType(sample);
    if (use === 'number') info = { type: 'numeric', symShare: sample.filter((x) => SYM_RE.test(x)).length / Math.max(1, sample.length) };
    else if (use === 'date') info = { type: 'date', order: detectOrder(sample) };
    else if (use === 'category' || use === 'id') info = { type: 'cat' };
    let col;
    if (info.type === 'numeric') {
      col = buildNumeric(rows, og, n);
      col.symShare = info.symShare;
      for (const s of sample) {
        const m = SYM_RE.exec(s);
        if (m) tally[m[0]] = (tally[m[0]] || 0) + 1;
      }
      // Identifier: ID-like name, whole numbers, and either mostly distinct values or large reference-style numbers.
      // (An order number repeats once per order line, so uniqueness alone is not a reliable test.)
      const idLike = use === 'auto' && ID_RE.test(f) && col.allInt && col.nonNull > 10 && (col.unique > 0.5 * col.nonNull || col.min >= 10000);
      const yearLike = use === 'auto' && /^(year|yr|fy)$/i.test(f.trim());
      const periodNum = use === 'auto' && PERIOD_NAME_RE.test(f) && col.allInt && col.nonNull > 0 && col.min >= 0 && col.max <= 53 && col.unique <= 53;
      // Month numbers (1-12) covering 3+ distinct months can stand in for a date axis if the file has no real date.
      if (periodNum && /(month|maand|mnd|mth)/i.test(f) && col.min >= 1 && col.max <= 12 && col.unique >= 3 && !monthSrc) monthSrc = { f, num: col };
      if (idLike || yearLike || periodNum) {
        col = buildCat(rows, og, n);
        col.kind = idLike ? 'id' : periodNum ? 'period' : 'year';
        if (idLike) col.type = 'text'; // identifiers are never a grouping or filter
        notes[f] = idLike ? 'Looks like an identifier, so it is treated as text and never summed.' : periodNum ? 'Period number (month, week or quarter), treated as a category and never summed.' : 'Year column, treated as a category.';
      }
    } else if (info.type === 'date') col = buildDate(rows, og, n, info.order);
    else {
      col = buildCat(rows, og, n);
      if (use === 'id') {
        col.type = 'text';
        col.kind = 'id';
        notes[f] = 'Marked as an identifier, so it is never grouped, filtered or summed.';
      }
    }

    col.name = f;
    col.orig = og;
    col.use = use;
    col.desc = String(sch.desc || '').slice(0, 300);
    col.unit = String(sch.unit || '').slice(0, 30);
    if (use !== 'auto') notes[f] = notes[f] || `Set to "${use}" on the review screen.`;
    cols[f] = col;
    order.push(f);
    if (col.type === 'numeric') numeric.push(f);
    else if (col.type === 'date') dates.push(f);
    else if (col.type === 'cat') cats.push(f);
    else texts.push(f);
  }

  // Currency
  let currency = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  if (!currency) {
    const names = fields.join(' ');
    if (/₹|\binr\b|rupee/i.test(names)) currency = '₹';
    else if (/\beur\b|euro/i.test(names)) currency = '€';
    else if (/\busd\b|dollar/i.test(names)) currency = '$';
    else if (/\bgbp\b/i.test(names)) currency = '£';
  }
  for (const f of numeric) {
    const u = cols[f].unit.trim();
    if (MONEY_UNIT.test(u) && !currency) currency = UNIT_SYM[u.toLowerCase()] || u;
  }
  for (const f of numeric) {
    const c = cols[f];
    const u = c.unit.trim();
    c.money = MONEY_UNIT.test(u) || (!u && ((c.symShare || 0) >= 0.3 || (!!currency && MONEY_NAME.test(f))));
  }

  // No real date column but a month-number column: build a hidden month axis (month-end timestamps on a
  // placeholder year). Labels are shown by month name only; no year is ever displayed or invented.
  let yearless = false;
  if (!dates.length && monthSrc) {
    const name = `${monthSrc.f} (period)`;
    const src = monthSrc.num.data;
    const data = new Float64Array(n).fill(NaN);
    let nn = 0, mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = src[i];
      if (v === v && v >= 1 && v <= 12) {
        const t = Date.UTC(2000, v, 0);
        data[i] = t;
        nn++;
        if (t < mn) mn = t;
        if (t > mx) mx = t;
      }
    }
    cols[name] = { name, type: 'date', data, nonNull: nn, issues: 0, min: mn, max: mx, doms: 1, unique: 0, missing: n - nn };
    dates.push(name);
    yearless = true;
  }
  setYearless(yearless);

  const primaryDate = dates[0] || null;
  const dc = primaryDate ? cols[primaryDate] : null;
  const filterCols = cats
    .filter((c) => cols[c].dict.length >= 2 && cols[c].dict.length <= 60)
    .sort((a, b) => cols[a].dict.length - cols[b].dict.length)
    .slice(0, 4);

  // Data-quality register
  let missingCells = 0, issueCells = 0;
  const quality = order.map((f) => {
    const c = cols[f];
    missingCells += c.missing;
    issueCells += c.issues;
    let handling = 'No issues.';
    const bits = [];
    if (c.issues) bits.push(`${c.issues.toLocaleString()} value(s) could not be read as ${c.type === 'date' ? 'dates' : 'numbers'} and were treated as blank.`);
    if (c.missing && c.type === 'numeric') bits.push('Blanks are skipped in totals and averages.');
    if (c.missing && c.type === 'date') bits.push('Rows without a valid date are left out of trend charts and date filters.');
    if (c.missing && (c.type === 'cat' || c.type === 'text')) bits.push('Blanks appear as "(blank)" in breakdowns.');
    if (c.type === 'text') bits.push('High-cardinality text: searchable, not used for grouping.');
    if (notes[f]) bits.push(notes[f]);
    if (c.nonNull === 0) bits.push('Column is empty and is ignored.');
    if (bits.length) handling = bits.join(' ');
    return { name: f, type: c.type, missing: c.missing, missingPct: n ? c.missing / n : 0, unique: c.type === 'cat' || c.type === 'text' ? c.dict.length : c.unique, issues: c.issues, handling };
  });

  return {
    n, fields, cols, order, numeric, dates, cats, texts, filterCols,
    dupFlag, currency, primaryDate, yearless, srcOf,
    minDate: dc ? dc.min : null,
    maxDate: dc ? dc.max : null,
    dateHasDays: dc ? dc.doms > 1 : false,
    quality,
    stats: { dupes, dupSkipped, truncated, missingCells, issueCells },
  };
}
