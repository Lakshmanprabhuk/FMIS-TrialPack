'use client';

import { useMemo, useState } from 'react';
import { pivot, pivotDims, dimTitle, metricInfo } from '../../../lib/mis/engine';
import { fmtMetric, fmtPeriod, fmtInt } from '../../../lib/mis/format';
import { Card, Empty } from './ui';

const AGGS = [['sum', 'Sum'], ['avg', 'Average'], ['count', 'Count'], ['min', 'Min'], ['max', 'Max']];

export default function Pivot({ ds, mask, view, onDrill }) {
  const dims = useMemo(() => pivotDims(ds), [ds]);
  const [rowKey, setRowKey] = useState(view.dimKey || dims[0] || '');
  const [colKey, setColKey] = useState(() => (ds.primaryDate ? `${ds.primaryDate}@month` : ''));
  const [metric, setMetric] = useState(view.metric);
  const [agg, setAgg] = useState('sum');
  const effAgg = metric === '__count' ? 'count' : agg;

  const p = useMemo(() => (rowKey ? pivot(ds, mask, { rowKey, colKey, metric, agg: effAgg }) : null), [ds, mask, rowKey, colKey, metric, effAgg]);
  if (!dims.length) return <Empty title="Pivot unavailable">No categorical or date columns were found to pivot on.</Empty>;

  const info = metricInfo(ds, metric);
  const isCount = effAgg === 'count';
  const f = (v, full) => (v == null ? '–' : isCount ? fmtInt(v) : fmtMetric(v, info, full));
  const lab = (key, l) => (key.includes('@') ? fmtPeriod(l) || l : l);
  const range = p ? p.hi - p.lo || 1 : 1;
  const heat = (v) => {
    if (v == null) return {};
    const t = (v - p.lo) / range;
    return { background: `rgba(123,30,48,${(0.05 + 0.55 * t).toFixed(3)})`, color: t > 0.62 ? '#fff' : undefined };
  };

  return (
    <>
      <Card className="mis-pivotctl">
        <div className="mis-filterbar flat">
          <label className="mis-f"><span>Rows</span><select value={rowKey} onChange={(e) => setRowKey(e.target.value)}>{dims.map((d) => <option key={d} value={d}>{dimTitle(ds, d)}</option>)}</select></label>
          <label className="mis-f"><span>Columns</span><select value={colKey} onChange={(e) => setColKey(e.target.value)}><option value="">(none)</option>{dims.map((d) => <option key={d} value={d}>{dimTitle(ds, d)}</option>)}</select></label>
          <label className="mis-f"><span>Measure</span><select value={metric} onChange={(e) => setMetric(e.target.value)}>{ds.numeric.map((n) => <option key={n} value={n}>{n}</option>)}<option value="__count">Records (count)</option></select></label>
          <label className="mis-f"><span>Aggregation</span><select value={effAgg} disabled={metric === '__count'} onChange={(e) => setAgg(e.target.value)}>{AGGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
      </Card>
      {p && p.rows.length ? (
        <Card title={`${AGGS.find((a) => a[0] === effAgg)[1]} of ${metric === '__count' ? 'records' : metric}`} note="Click a cell, row or column heading to drill into the underlying records">
          <div className="mis-tscroll wide">
            <table className="mis-table pivot">
              <thead>
                <tr>
                  <th>{dimTitle(ds, rowKey)}</th>
                  {p.cols.map((c) => (
                    <th key={c.code} className="num clickable" onClick={() => p.hasCols && onDrill([{ dimKey: colKey, label: c.label }])}>{lab(colKey || '', c.label)}</th>
                  ))}
                  {p.hasCols && <th className="num total">Total</th>}
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.code}>
                    <td className="clickable" onClick={() => onDrill([{ dimKey: rowKey, label: r.label }])}>{lab(rowKey, r.label)}</td>
                    {r.cells.map((v, i) => (
                      <td key={i} className="num heat" style={heat(v)} title={f(v, true)}
                        onClick={() => v != null && onDrill(p.hasCols ? [{ dimKey: rowKey, label: r.label }, { dimKey: colKey, label: p.cols[i].label }] : [{ dimKey: rowKey, label: r.label }])}>
                        {f(v)}
                      </td>
                    ))}
                    {p.hasCols && <td className="num total">{f(r.total)}</td>}
                  </tr>
                ))}
              </tbody>
              {p.hasCols && (
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {p.cols.map((c) => <td key={c.code} className="num">{f(c.total)}</td>)}
                    <td className="num total">{f(p.grand)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {(p.truncRows > 0 || p.truncCols > 0) && (
            <div className="mis-muted small">
              Showing {p.truncRows ? `${p.rows.length} of ${fmtInt(p.truncRows)} rows` : 'all rows'}
              {p.hasCols ? ` and ${p.truncCols ? `${p.cols.length} of ${fmtInt(p.truncCols)} columns` : 'all columns'}` : ''}; totals include every record. Use filters to focus the view.
            </div>
          )}
        </Card>
      ) : (
        <Empty title="No data for this pivot">Try a different row, column or measure.</Empty>
      )}
    </>
  );
}
