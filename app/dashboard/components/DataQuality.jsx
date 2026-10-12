'use client';

import { fmtInt, fmtPct } from '../../../lib/mis/format';
import { Card } from './ui';

const TYPE_NAME = { numeric: 'Number', date: 'Date', cat: 'Category', text: 'Text' };

export default function DataQuality({ ds, filters, setFilters }) {
  const st = ds.stats;
  const cards = [
    ['Rows analysed', fmtInt(ds.n), st.truncated ? `${fmtInt(st.truncated)} rows beyond the 500,000-row limit were ignored` : ''],
    ['Columns', fmtInt(ds.fields.length), `${ds.numeric.length} numeric · ${ds.dates.length} date · ${ds.cats.length + ds.texts.length} text/category`],
    ['Duplicate rows', st.dupSkipped ? 'not checked' : fmtInt(st.dupes), st.dupSkipped ? 'File exceeds 300,000 rows' : 'Exact copies of an earlier row'],
    ['Blank cells', fmtInt(st.missingCells), 'Skipped in totals, shown as (blank) in groups'],
    ['Unreadable values', fmtInt(st.issueCells), 'Wrong type for the column; treated as blank'],
  ];
  return (
    <>
      <div className="mis-qcards">
        {cards.map(([l, v, s]) => (
          <div key={l} className="mis-qcard">
            <div className="mis-kpi-l">{l}</div>
            <div className="mis-kpi-v mis-num">{v}</div>
            {s && <div className="mis-muted small">{s}</div>}
          </div>
        ))}
      </div>

      {!st.dupSkipped && st.dupes > 0 && (
        <div className="mis-note">
          <label>
            <input type="checkbox" checked={filters.dropDupes} onChange={(e) => setFilters((f) => ({ ...f, dropDupes: e.target.checked }))} />{' '}
            Exclude the {fmtInt(st.dupes)} duplicate rows from every figure in this report (the first occurrence is kept).
          </label>
        </div>
      )}

      <Card title="Column register" note="How each column was interpreted and how problems were handled">
        <div className="mis-tscroll tall">
          <table className="mis-table">
            <thead>
              <tr><th>Column</th><th>Type</th><th className="num">Blank</th><th className="num">Blank %</th><th className="num">Unique</th><th className="num">Unreadable</th><th>Handling</th></tr>
            </thead>
            <tbody>
              {ds.quality.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{TYPE_NAME[c.type] || c.type}</td>
                  <td className="num">{fmtInt(c.missing)}</td>
                  <td className={'num' + (c.missingPct > 0.2 ? ' mis-bad' : '')}>{fmtPct(c.missingPct)}</td>
                  <td className="num">{c.type === 'date' ? '–' : fmtInt(c.unique)}</td>
                  <td className={'num' + (c.issues ? ' mis-bad' : '')}>{fmtInt(c.issues)}</td>
                  <td className="mis-cmt">{c.handling}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
