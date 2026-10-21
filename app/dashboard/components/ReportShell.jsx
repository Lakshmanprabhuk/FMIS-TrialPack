'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { buildMask, computeInsights, filtersActive, maskToIdx, dimCandidates, dimTitle, formatKpiValue, GRANS } from '../../../lib/mis/engine';
import { buildTakeaways } from '../../../lib/mis/facts';
import { fmtInt, isoDate, fmtSpan, GRAN_LABEL } from '../../../lib/mis/format';
import { exportRowsCsv } from '../../../lib/mis/exporters';
import { useTheme } from '../../../lib/mis/useTheme';
import { Delta, Empty, Lead } from './ui';
import CountUp from './CountUp';
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
import FocusView from './FocusView';
import { ANALYST_SECTIONS } from '../analystSections';
import { computeAnalyst } from '../../../lib/mis/analyst';
import { buildCtxSchema } from '../../../lib/mis/plan';

// Sidebar: built-in sections plus any plug-in analysis sections, grouped. Order of groups is fixed here.
const GROUP_ORDER = ['Overview', 'Performance', 'Customers', 'Products', 'Segments', 'Risk & Outlook', 'Actions', 'Data'];
const BUILTIN = [
  ['focus', 'Your focus', 'Overview'],
  ['summary', 'Executive Summary', 'Overview'],
  ['insights', 'Insights', 'Overview'],
  ['trends', 'Trends', 'Performance'],
  ['forecast', 'Forecast', 'Performance'],
  ['compare', 'Compare', 'Performance'],
  ['pivot', 'Breakdown / Pivot', 'Segments'],
  ['ranking', 'Performance Ranking', 'Segments'],
  ['exceptions', 'Exceptions & Risks', 'Risk & Outlook'],
  ['ideas', 'Ideas & Scenarios', 'Actions'],
  ['table', 'Data Table', 'Data'],
  ['quality', 'Data Quality', 'Data'],
];
const ICONS = { focus: '◎', summary: '▦', insights: '✦', trends: '↗', forecast: '◔', compare: '⇄', pivot: '▤', ranking: '☰', exceptions: '⚠', ideas: '✧', table: '▥', quality: '✓' };
const SECTION_TEXT_KEY = { summary: 'summary', insights: 'insights', trends: 'trends', forecast: 'forecast', compare: 'compare', pivot: 'breakdown', ranking: 'ranking', exceptions: 'exceptions', ideas: 'ideas', quality: 'quality' };
const NEEDS_DEEP = ['insights', 'forecast', 'ideas'];
const EMPTY_FILTERS = { from: '', to: '', cats: {}, dropDupes: false };

const prettyName = (f) => f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Data report';

export default function ReportShell({ report, onReupload, onRetryNarrative, narrativeBusy, navOpen, setNavOpen }) {
  const { ds, fileName, narrative, narrativeNote, generatedAt, baseView, facts } = report;
  const [theme] = useTheme();
  const hasFocus = !!report.focus?.text;
  const [tab, setTab] = useState(hasFocus ? 'focus' : 'summary');
  const [collapsed, setCollapsed] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, dropDupes: !!report.initialDropDupes }));
  const [view, setView] = useState(baseView);
  const [targets, setTargets] = useState(() => (report.initialTarget ? { total: report.initialTarget } : {}));
  const [drill, setDrill] = useState([]);
  const [printAll, setPrintAll] = useState(false);

  const dFilters = useDeferredValue(filters);
  const dView = useDeferredValue(view);
  const pending = filters !== dFilters || view !== dView;
  const mask = useMemo(() => buildMask(ds, dFilters), [ds, dFilters]);
  const ins = useMemo(() => computeInsights(ds, mask, dView), [ds, mask, dView]);
  const needDeep = printAll || NEEDS_DEEP.includes(tab);
  const deep = useMemo(() => (needDeep ? computeDeep(ds, mask, dView, ins) : null), [needDeep, ds, mask, dView, ins]);
  const ctx = useMemo(() => ({ schema: buildCtxSchema(ds), focus: report.focus?.text || '' }), [ds, report.focus]);
  // Only worth computing when something can display it (plug-in sections exist).
  const analyst = useMemo(() => (ANALYST_SECTIONS.length ? computeAnalyst(ds, mask, dView, ins, ctx) : { modules: {}, items: [], focus: null }), [ds, mask, dView, ins, ctx]);
  const factText = useMemo(() => {
    const m = new Map((facts || []).map((f) => [f.id, f.text]));
    return (id) => m.get(id);
  }, [facts]);

  const sections = useMemo(() => {
    const list = BUILTIN.filter(([id]) => id !== 'focus' || hasFocus).map(([id, label, group]) => ({ id, label, group }));
    ANALYST_SECTIONS.forEach((a) => {
      let ok = false;
      try { ok = !!a.needs(analyst); } catch { ok = false; }
      if (ok) list.push({ id: a.id, label: a.label, group: a.group, analyst: a });
    });
    return list;
  }, [analyst, hasFocus]);
  const groups = GROUP_ORDER.map((g) => [g, sections.filter((x) => x.group === g)]).filter(([, l]) => l.length);
  const known = new Set(groups.flatMap(([, l]) => l.map((x) => x.id)));
  const extra = sections.filter((x) => !known.has(x.id));
  if (extra.length) groups.splice(groups.length - 1, 0, ['More', extra]);
  const flat = groups.flatMap(([, l]) => l);
  const active = flat.find((x) => x.id === tab) || flat[0];
  const pick = (id) => { setTab(id); setNavOpen?.(false); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const onNavKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = [...e.currentTarget.querySelectorAll('button.mis-nav-i')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus();
  };

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
    const an = ANALYST_SECTIONS.find((a) => a.id === id);
    if (an) {
      const C = an.Component;
      return <C {...common} analyst={analyst} narrative={commentary} />;
    }
    switch (id) {
      case 'focus':
        return <FocusView focus={report.focus} narrative={narrative} factText={factText} />;
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

  const visible = printAll ? flat.map((x) => [x.id, x.label]) : active ? [[active.id, active.label]] : [];
  const noRows = ins.tot.count === 0;
  const heroKpis = ins.kpis.slice(0, 3);

  return (
    <div className={'mis mis-app' + (collapsed ? ' collapsed' : '')}>
      <aside className={'mis-side' + (navOpen ? ' open' : '')} aria-label="Report navigation">
        <div className="mis-side-top">
          <span className="mis-side-ttl">Report</span>
          <button className="mis-side-col" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '»' : '«'}</button>
        </div>
        <nav className="mis-nav" onKeyDown={onNavKey}>
          {groups.map(([g, list]) => (
            <div className="mis-nav-g" key={g}>
              <div className="mis-nav-gh">{g}</div>
              {list.map((x) => (
                <button key={x.id} className={'mis-nav-i' + (active?.id === x.id ? ' active' : '')} aria-current={active?.id === x.id ? 'page' : undefined} onClick={() => pick(x.id)} title={x.label}>
                  <span className="mis-nav-ic" aria-hidden="true">{ICONS[x.id] || '•'}</span>
                  <span className="mis-nav-tx">{x.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="mis-side-foot"><div className="mis-side-file" title={fileName}>{fileName}</div><div>{fmtInt(ds.n)} rows</div></div>
      </aside>
      {navOpen && <div className="mis-scrim" onClick={() => setNavOpen?.(false)} />}
      <div className="mis-body">
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
    </div>
  );
}
