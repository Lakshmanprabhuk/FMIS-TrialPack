'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { buildMask, computeInsights, filtersActive, maskToIdx, dimCandidates, dimTitle, GRANS } from '../../../lib/mis/engine';
import { buildTakeaways } from '../../../lib/mis/facts';
import { fmtInt, isoDate, GRAN_LABEL } from '../../../lib/mis/format';
import { COLOR_THEMES } from '../../../lib/mis/chartSetup';
import { exportRowsCsv } from '../../../lib/mis/exporters';
import { Empty, Lead } from './ui';
import ExecutiveSummary from './ExecutiveSummary';
import Trends from './Trends';
import Pivot from './Pivot';
import Ranking from './Ranking';
import Exceptions from './Exceptions';
import DataTable from './DataTable';
import DataQuality from './DataQuality';

const SECTIONS = [
  ['summary', 'Executive Summary'],
  ['trends', 'Trends'],
  ['pivot', 'Breakdown / Pivot'],
  ['ranking', 'Performance Ranking'],
  ['exceptions', 'Exceptions & Risks'],
  ['table', 'Data Table'],
  ['quality', 'Data Quality'],
];
const SECTION_TEXT_KEY = { summary: 'summary', trends: 'trends', pivot: 'breakdown', ranking: 'ranking', exceptions: 'exceptions', quality: 'quality' };
const EMPTY_FILTERS = { from: '', to: '', cats: {}, dropDupes: false };

const prettyName = (f) => f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Data report';

export default function ReportShell({ report, onReupload, onRetryNarrative, narrativeBusy }) {
  const { ds, fileName, narrative, narrativeNote, generatedAt, baseView } = report;
  const [tab, setTab] = useState('summary');
  const [theme, setTheme] = useState('vivid');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [view, setView] = useState(baseView);
  const [targets, setTargets] = useState({});
  const [drill, setDrill] = useState([]);
  const [printAll, setPrintAll] = useState(false);

  const dFilters = useDeferredValue(filters);
  const dView = useDeferredValue(view);
  const pending = filters !== dFilters || view !== dView;
  const mask = useMemo(() => buildMask(ds, dFilters), [ds, dFilters]);
  const ins = useMemo(() => computeInsights(ds, mask, dView), [ds, mask, dView]);

  const filtered = filtersActive(filters);
  const sameView = view.metric === baseView.metric && view.dimKey === baseView.dimKey && view.gran === baseView.gran;
  const commentary = narrative && !filtered && sameView ? narrative : null;
  const takeaways = useMemo(
    () => (commentary?.takeaways?.length ? commentary.takeaways.map((t) => t.text) : buildTakeaways(ds, ins, dView)),
    [commentary, ds, ins, dView]
  );

  const sortedDicts = useMemo(
    () => Object.fromEntries(ds.filterCols.map((c) => [c, ds.cols[c].dict.slice().sort((a, b) => a.localeCompare(b))])),
    [ds]
  );
  const dims = useMemo(() => dimCandidates(ds), [ds]);

  useEffect(() => {
    const after = () => setPrintAll(false);
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);

  const onDrill = (conds) => {
    setDrill(conds.map((c) => ({ ...c, text: `${dimTitle(ds, c.dimKey)}: ${c.label}` })));
    setTab('table');
  };
  const doPrint = () => {
    setPrintAll(true);
    setTimeout(() => window.print(), 800); // let every section mount and charts size themselves
  };
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const exportView = () => exportRowsCsv(ds, maskToIdx(mask), ds.order, `${baseName}-filtered.csv`);
  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const title = narrative?.title || prettyName(fileName);
  const period = ins.period ? `${isoDate(ins.period.min)} → ${isoDate(ins.period.max)}` : 'No date column';
  const filterSummary = [
    filters.from && `From ${filters.from}`,
    filters.to && `To ${filters.to}`,
    ...Object.entries(filters.cats).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`),
    filters.dropDupes && 'Duplicates excluded',
  ].filter(Boolean).join(' · ') || 'None';

  const common = { ds, mask, ins, view: dView, theme, onDrill };
  const renderSection = (id) => {
    switch (id) {
      case 'summary':
        return <ExecutiveSummary {...common} targets={targets} setTargets={setTargets} takeaways={takeaways} commentary={commentary} hiddenNarrative={!!narrative && !commentary} />;
      case 'trends':
        return <Trends {...common} />;
      case 'pivot':
        return <Pivot {...common} />;
      case 'ranking':
        return <Ranking {...common} commentary={commentary} />;
      case 'exceptions':
        return <Exceptions {...common} commentary={commentary} />;
      case 'table':
        return <DataTable ds={ds} mask={mask} drill={drill} setDrill={setDrill} baseName={baseName} />;
      default:
        return <DataQuality ds={ds} filters={filters} setFilters={setFilters} />;
    }
  };

  const visible = printAll ? SECTIONS : SECTIONS.filter((s) => s[0] === tab);
  const noRows = ins.tot.count === 0;

  return (
    <div className="mis">
      <div className="mis-sticky">
        <div className="mis-rhead">
          <div>
            <h1 className="mis-rtitle">{title}</h1>
            <div className="mis-rmeta">
              <span><b>Source</b> {fileName}</span>
              <span><b>Rows</b> <i className="mis-num">{fmtInt(ins.tot.count)}{filtered ? ` of ${fmtInt(ds.n)}` : ''}</i></span>
              <span><b>Period</b> {period}</span>
              <span><b>Generated</b> {generatedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              {pending && <span className="mis-updating">Updating…</span>}
            </div>
          </div>
          <div className="mis-actions">
            <button className="mis-btn" onClick={exportView}>Export CSV</button>
            <button className="mis-btn" onClick={doPrint}>Export PDF / Print</button>
            <button className="mis-btn ghost" onClick={onReupload}>Re-upload</button>
          </div>
        </div>

        <div className="mis-filterbar">
          {ds.primaryDate && (
            <>
              <label className="mis-f"><span>From</span>
                <input type="date" min={isoDate(ds.minDate)} max={isoDate(ds.maxDate)} value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
              </label>
              <label className="mis-f"><span>To</span>
                <input type="date" min={isoDate(ds.minDate)} max={isoDate(ds.maxDate)} value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
              </label>
            </>
          )}
          {ds.filterCols.map((c) => (
            <label className="mis-f" key={c}><span>{c}</span>
              <select value={filters.cats[c] || ''} onChange={(e) => setFilters((f) => ({ ...f, cats: { ...f.cats, [c]: e.target.value } }))}>
                <option value="">All</option>
                {sortedDicts[c].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          {filtered && <button className="mis-link" onClick={resetFilters}>Reset filters</button>}
          <span className="mis-spacer" />
          <label className="mis-f"><span>Measure</span>
            <select value={view.metric} onChange={(e) => setView((v) => ({ ...v, metric: e.target.value, metric2: ds.numeric.find((n) => n !== e.target.value) || null }))}>
              {ds.numeric.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__count">Records (count)</option>
            </select>
          </label>
          {dims.length > 0 && (
            <label className="mis-f"><span>Group by</span>
              <select value={view.dimKey || ''} onChange={(e) => setView((v) => ({ ...v, dimKey: e.target.value }))}>
                {dims.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
          {ds.primaryDate && (
            <label className="mis-f"><span>Period</span>
              <select value={view.gran} onChange={(e) => setView((v) => ({ ...v, gran: e.target.value }))}>
                {GRANS.map((g) => <option key={g} value={g}>{GRAN_LABEL[g]}</option>)}
              </select>
            </label>
          )}
          <label className="mis-f"><span>Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {Object.entries(COLOR_THEMES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mis-printonly">Filters: {filterSummary}</div>
      </div>

      {narrativeNote && (
        <div className="mis-banner">
          <span>{narrativeNote}</span>
          {!narrative && !/weekly free trial/i.test(narrativeNote) && (
            <button className="mis-btn small" disabled={narrativeBusy} onClick={onRetryNarrative}>
              {narrativeBusy ? 'Retrying…' : 'Retry commentary'}
            </button>
          )}
        </div>
      )}

      <div className="mis-wrap">
        <nav className="mis-nav" aria-label="Report sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <main className={'mis-main' + (pending ? ' pending' : '')}>
          {visible.map(([id, label]) => (
            <section key={id} className="mis-section" id={'sec-' + id}>
              <h2 className="mis-h2">{label}</h2>
              <Lead text={commentary?.sections?.[SECTION_TEXT_KEY[id]]} />
              {noRows && id !== 'quality' && id !== 'table' ? (
                <Empty title="No records match the current filters">
                  <button className="mis-btn" onClick={resetFilters}>Reset filters</button>
                </Empty>
              ) : (
                renderSection(id)
              )}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
