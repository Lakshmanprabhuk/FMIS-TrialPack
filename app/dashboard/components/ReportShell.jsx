'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { buildMask, computeInsights, filtersActive, maskToIdx, dimCandidates, dimTitle, formatKpiValue, GRANS } from '../../../lib/mis/engine';
import { buildTakeaways } from '../../../lib/mis/facts';
import { fmtInt, isoDate, fmtSpan, GRAN_LABEL } from '../../../lib/mis/format';
import { exportRowsCsv } from '../../../lib/mis/exporters';
import { useTheme } from '../../../lib/mis/useTheme';
import { Delta, Empty, Lead } from './ui';
import CountUp from './CountUp';
import ThemePicker from './ThemePicker';
import ExecutiveSummary from './ExecutiveSummary';
import Trends from './Trends';
import Pivot from './Pivot';
import Ranking from './Ranking';
import Exceptions from './Exceptions';
import DataTable from './DataTable';
import DataQuality from './DataQuality';
import { computeDeep } from '../../../lib/mis/deep';
import Insights from './Insights';
import Forecast from './Forecast';
import Compare from './Compare';
import Ideas from './Ideas';

const SECTIONS = [
  ['summary', 'Executive Summary'],
  ['insights', 'Insights'],
  ['trends', 'Trends'],
  ['forecast', 'Forecast'],
  ['compare', 'Compare'],
  ['pivot', 'Breakdown / Pivot'],
  ['ranking', 'Performance Ranking'],
  ['exceptions', 'Exceptions & Risks'],
  ['ideas', 'Ideas & Scenarios'],
  ['table', 'Data Table'],
  ['quality', 'Data Quality'],
];
const SECTION_TEXT_KEY = { summary: 'summary', insights: 'insights', trends: 'trends', forecast: 'forecast', compare: 'compare', pivot: 'breakdown', ranking: 'ranking', exceptions: 'exceptions', ideas: 'ideas', quality: 'quality' };
const NEEDS_DEEP = ['insights', 'forecast', 'ideas'];
const EMPTY_FILTERS = { from: '', to: '', cats: {}, dropDupes: false };

const prettyName = (f) => f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Data report';

export default function ReportShell({ report, onReupload, onRetryNarrative, narrativeBusy }) {
  const { ds, fileName, narrative, narrativeNote, generatedAt, baseView, facts } = report;
  const [theme] = useTheme();
  const [tab, setTab] = useState('summary');
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
  const needDeep = printAll || NEEDS_DEEP.includes(tab);
  const deep = useMemo(() => (needDeep ? computeDeep(ds, mask, dView, ins) : null), [needDeep, ds, mask, dView, ins]);
  const factText = useMemo(() => {
    const m = new Map((facts || []).map((f) => [f.id, f.text]));
    return (id) => m.get(id);
  }, [facts]);

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
    setTimeout(() => window.print(), 800);
  };
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const exportView = () => exportRowsCsv(ds, maskToIdx(mask), ds.order, `${baseName}-filtered.csv`);
  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const title = narrative?.title || prettyName(fileName);
  const period = ins.period ? fmtSpan(ins.period.min, ins.period.max, ' → ') + (ds.yearless ? ' (month numbers)' : '') : 'No date column';
  const filterSummary =
    [
      filters.from && `From ${filters.from}`,
      filters.to && `To ${filters.to}`,
      ...Object.entries(filters.cats).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`),
      filters.dropDupes && 'Duplicates excluded',
    ]
      .filter(Boolean)
      .join(' · ') || 'None';

  const common = { ds, mask, ins, view: dView, theme, onDrill };
  const renderSection = (id) => {
    switch (id) {
      case 'summary':
        return <ExecutiveSummary {...common} targets={targets} setTargets={setTargets} takeaways={takeaways} commentary={commentary} hiddenNarrative={!!narrative && !commentary} />;
      case 'insights':
        return <Insights {...common} deep={deep} commentary={commentary} />;
      case 'trends':
        return <Trends {...common} />;
      case 'forecast':
        return <Forecast {...common} deep={deep} />;
      case 'compare':
        return <Compare {...common} />;
      case 'ideas':
        return <Ideas {...common} deep={deep} commentary={commentary} factText={factText} />;
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
  const heroKpis = ins.kpis.slice(0, 3);

  return (
    <div className="mis">
      <header className="mis-hero">
        <div className="mis-hero-bg" aria-hidden="true"><span /><span /><span /></div>
        <div className="mis-hero-in">
          <div className="mis-hero-l">
            <div className="mis-eyebrow">Management report</div>
            <h1 className="mis-rtitle">{title}</h1>
            <div className="mis-rmeta">
              <span className="mis-chipm"><b>Source</b> {fileName}</span>
              <span className="mis-chipm"><b>Rows</b> <i className="mis-num">{fmtInt(ins.tot.count)}{filtered ? ` of ${fmtInt(ds.n)}` : ''}</i></span>
              <span className="mis-chipm"><b>Period</b> {period}</span>
              <span className="mis-chipm"><b>Generated</b> {generatedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              {pending && <span className="mis-chipm live">Updating…</span>}
            </div>
            {commentary?.summary && <p className="mis-hero-sum">{commentary.summary}</p>}
          </div>
          <div className="mis-actions">
            <button className="mis-btn solid" onClick={exportView}>Export CSV</button>
            <button className="mis-btn" onClick={doPrint}>Export PDF / Print</button>
            <button className="mis-btn" onClick={onReupload}>Re-upload</button>
          </div>
        </div>
        {heroKpis.length > 0 && (
          <div className="mis-hero-stats">
            {heroKpis.map((k) => (
              <div key={k.id} className="mis-hs">
                <div className="mis-hs-l">{k.label}</div>
                <div className="mis-hs-v mis-num"><CountUp value={k.value} format={(v) => formatKpiValue(ds, k, v)} /></div>
                <Delta v={k.pop} />
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="mis-sticky">
        <nav className="mis-pills" aria-label="Report sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={'mis-pill' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <div className="mis-filterbar">
          {ds.primaryDate && !ds.yearless && (
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
          <div className="mis-f"><span>Theme</span><ThemePicker /></div>
        </div>
      </div>
      <div className="mis-printonly">Filters: {filterSummary}</div>

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
  );
}
