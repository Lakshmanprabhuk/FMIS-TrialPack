import { isoDate } from './format';

export function cellText(c, i) {
  if (c.type === 'numeric') {
    const v = c.data[i];
    return v === v ? String(v) : '';
  }
  if (c.type === 'date') {
    const v = c.data[i];
    return v === v ? isoDate(v) : '';
  }
  const code = c.codes[i];
  return code >= 0 ? c.dict[code] : '';
}

function esc(s, isText) {
  s = String(s);
  // spreadsheet formula-injection guard for text cells
  if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function download(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\uFEFF' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportRowsCsv(ds, rowIdx, colNames, filename) {
  const cols = colNames.map((n) => ds.cols[n]);
  const lines = [colNames.map((n) => esc(n, true)).join(',')];
  for (let k = 0; k < rowIdx.length; k++) {
    const i = rowIdx[k];
    lines.push(cols.map((c) => esc(cellText(c, i), c.type === 'cat' || c.type === 'text')).join(','));
  }
  download(filename, lines.join('\r\n'));
}
