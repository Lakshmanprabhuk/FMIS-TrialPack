'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { getDim } from '../../../lib/mis/engine';
import { cellText, exportRowsCsv } from '../../../lib/mis/exporters';
import { fmtMetric, fmtInt, isoDate } from '../../../lib/mis/format';
import { Card, Empty } from './ui';

export default function DataTable({ ds, mask, drill, setDrill, baseName }) {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [sort, setSort] = useState(null); // { col, dir }
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [hidden, setHidden] = useState(() => new Set());
  const [menu, setMenu] = useState(false);
  const vis = ds.order.filter((n) => !hidden.has(n));

  const idx = useMemo(() => {
    // 1. apply drill-down conditions on top of the global filter mask
    let m = mask;
    if (drill.length) {
      m = Uint8Array.from(mask);
      for (const c of drill) {
        const dim = getDim(ds, c.dimKey);
        const code = dim.labels.indexOf(c.label);
        for (let i = 0; i < ds.n; i++) if (m[i] && dim.codes[i] !== code) m[i] = 0;
      }
    }
    // 2. search (dictionary columns are matched once per distinct value, not per row)
    const needle = dq.trim().toLowerCase();
    let hits = null, others = null;
    if (needle) {
      hits = ds.order.filter((n) => ds.cols[n].dict).map((n) => {
        const c = ds.cols[n];
        const h = new Uint8Array(c.dict.length);
        c.dict.forEach((s, j) => {
          if (s.toLowerCase().includes(needle)) h[j] = 1;
        });
        return { c, h };
      });
      others = ds.order.filter((n) => !ds.cols[n].dict).map((n) => ds.cols[n]);
    }
    const list = [];
    for (let i = 0; i < ds.n; i++) {
      if (!m[i]) continue;
      if (needle) {
        let ok = false;
        for (const { c, h } of hits) {
          const code = c.codes[i];
          if (code >= 0 && h[code]) { ok = true; break; }
        }
        if (!ok) {
          for (const c of others) {
            const v = c.data[i];
            if (v === v && (c.type === 'date' ? isoDate(v) : String(v)).includes(needle)) { ok = true; break; }
          }
        }
        if (!ok) continue;
      }
      list.push(i);
    }
    // 3. sort (blanks always last)
    if (sort) {
      const c = ds.cols[sort.col];
      let keys;
      if (c.dict) {
        const rank = new Float64Array(c.dict.length);
        c.dict
          .map((s, j) => [s, j])
          .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
          .forEach(([, j], r) => { rank[j] = r; });
        keys = (i) => (c.codes[i] < 0 ? NaN : rank[c.codes[i]]);
      } else keys = (i) => c.data[i];
      const dir = sort.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        const ka = keys(a), kb = keys(b);
        if (ka !== ka) return kb !== kb ? 0 : 1;
        if (kb !== kb) return -1;
        return dir * (ka - kb);
      });
    }
    return list;
  }, [ds, mask, drill, dq, sort]);

  const pages = Math.max(1, Math.ceil(idx.length / size));
  const pg = Math.min(page, pages - 1);
  const slice = idx.slice(pg * size, pg * size + size);

  const toggleSort = (col) => setSort((s) => (!s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null));
  const toggleCol = (n) =>
    setHidden((h) => {
      const x = new Set(h);
      if (x.has(n)) x.delete(n);
      else x.add(n);
      return x;
    });
  const show = (c, i) => {
    if (c.type === 'numeric') {
      const v = c.data[i];
      return v === v ? fmtMetric(v, { money: c.money, cur: ds.currency }, true) : '';
    }
    return cellText(c, i);
  };

  return (
    <Card>
      <div className="mis-toolbar">
        <input className="mis-search" placeholder="Search all columns…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        {drill.map((c, i) => (
          <span key={i} className="mis-chip">
            {c.text}
            <button aria-label="Remove drill-down" onClick={() => setDrill(drill.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        <span className="mis-spacer" />
        <div className="mis-colwrap">
          <button className="mis-btn small" onClick={() => setMenu((v) => !v)}>Columns ▾</button>
          {menu && (
            <div className="mis-colmenu">
              {ds.order.map((n) => (
                <label key={n}><input type="checkbox" checked={!hidden.has(n)} onChange={() => toggleCol(n)} /> {n}</label>
              ))}
            </div>
          )}
        </div>
        <button className="mis-btn small" onClick={() => exportRowsCsv(ds, idx, vis, `${baseName}-view.csv`)}>Export view (CSV)</button>
      </div>

      {idx.length === 0 ? (
        <Empty title="No matching records">Adjust the search, drill-down or filters.</Empty>
      ) : (
        <div className="mis-tscroll tall">
          <table className="mis-table dt">
            <thead>
              <tr>
                <th className="num">#</th>
                {vis.map((n) => {
                  const c = ds.cols[n];
                  return (
                    <th key={n} className={'clickable' + (c.type === 'numeric' || c.type === 'date' ? ' num' : '')} onClick={() => toggleSort(n)}>
                      {n} {sort?.col === n ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slice.map((i) => (
                <tr key={i}>
                  <td className="num muted">{fmtInt(i + 1)}</td>
                  {vis.map((n) => {
                    const c = ds.cols[n];
                    return <td key={n} className={c.type === 'numeric' || c.type === 'date' ? 'num' : ''}>{show(c, i)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mis-pager">
        <span className="mis-muted small">
          {fmtInt(idx.length)} record{idx.length === 1 ? '' : 's'}
          {idx.length ? ` · showing ${fmtInt(pg * size + 1)}–${fmtInt(Math.min(idx.length, (pg + 1) * size))}` : ''}
        </span>
        <span className="mis-spacer" />
        <select className="mis-sel" value={size} onChange={(e) => { setSize(+e.target.value); setPage(0); }}>
          {[25, 50, 100].map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
        <button className="mis-btn small" disabled={pg === 0} onClick={() => setPage(0)}>«</button>
        <button className="mis-btn small" disabled={pg === 0} onClick={() => setPage(pg - 1)}>‹</button>
        <span className="mis-num small">Page {pg + 1} / {pages}</span>
        <button className="mis-btn small" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>›</button>
        <button className="mis-btn small" disabled={pg >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
      </div>
    </Card>
  );
}
