'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { parseFile, buildDataset } from '../../lib/mis/dataset';
import { buildMask, computeInsights, defaultView } from '../../lib/mis/engine';
import { buildFacts, buildMeta } from '../../lib/mis/facts';
import { fetchNarrative, sanitizeNarrative } from '../../lib/mis/narrative';
import ProcessingView from './components/ProcessingView';
import ReportShell from './components/ReportShell';
import ThemePicker from './components/ThemePicker';
import ReviewData from './components/ReviewData';
import ConfirmUnderstanding from './components/ConfirmUnderstanding';
import { computeDeep } from '../../lib/mis/deep';
import { fetchVerify } from '../../lib/mis/verify';
import { focusFacts } from '../../lib/mis/focus';
import { computeAnalyst } from '../../lib/mis/analyst';
import { initialSchema, planAnalysis, buildVerifyPayload, buildCtxSchema, buildUserContext } from '../../lib/mis/plan';
import './mis.css';

const STAGES = [
  { id: 'parse', label: 'Parse file' },
  { id: 'profile', label: 'Profile & validate data' },
  { id: 'compute', label: 'Compute aggregations' },
  { id: 'narrative', label: 'Generate narrative' },
  { id: 'build', label: 'Build report' },
];
const freshStages = () => STAGES.map((s) => ({ ...s, status: 'pending', detail: '' }));
const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;

export default function Dashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [trial, setTrial] = useState(null);
  const [trialLoading, setTrialLoading] = useState(true);
  const [stage, setStage] = useState('drop'); // drop | parsing | review | confirm | processing | error | report
  const [pre, setPre] = useState(null); // { rows, fields, ds } as first detected, before any edit
  const [schema, setSchema] = useState(null);
  const [conf, setConf] = useState(null); // { ds, plan } built from the user's edits
  const [verify, setVerify] = useState(null);
  const [verifyState, setVerifyState] = useState('loading');
  const [verifyError, setVerifyError] = useState('');
  const [highlight, setHighlight] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [fileName, setFileName] = useState('');
  const [stages, setStages] = useState(freshStages());
  const [report, setReport] = useState(null);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const runRef = useRef(0);
  const fileInputRef = useRef(null);

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

  async function handleSignOut() {
    runRef.current++;
    await supabase.auth.signOut();
    router.replace('/');
  }

  function resetToDrop() {
    runRef.current++; // invalidates any in-flight pipeline
    setReport(null);
    setPre(null);
    setSchema(null);
    setConf(null);
    setVerify(null);
    setNavOpen(false);
    setStage('drop');
    setFileName('');
    setErrMsg('');
  }

  function showError(msg) {
    setErrMsg(msg);
    setStage('error');
  }

  const upd = (id, patch) => setStages((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Step 1: read the file and detect columns. Nothing is analysed and nothing is sent anywhere yet.
  async function handleFile(file) {
    const run = ++runRef.current;
    const stale = () => run !== runRef.current;
    setFileName(file.name);
    setStages(freshStages());
    setStage('parsing');
    try {
      upd('parse', { status: 'running', detail: 'Reading file…' });
      await tick();
      const { rows, fields } = await parseFile(file, (p) => {
        if (!stale()) upd('parse', { detail: `${plural(p.rows, 'row')} read (${Math.round(p.pct * 100)}%)` });
      });
      if (stale()) return;
      upd('parse', { status: 'done', detail: `${plural(rows.length, 'row')} · ${plural(fields.length, 'column')}` });
      upd('profile', { status: 'running', detail: 'Detecting column types…' });
      await tick();
      const ds = buildDataset(rows, fields);
      if (stale()) return;
      upd('profile', { status: 'done', detail: `${ds.dates.length} date, ${ds.numeric.length} numeric` });
      setPre({ rows, fields, ds });
      setSchema(initialSchema(ds));
      setHighlight('');
      setStage('review');
    } catch (e) {
      if (!stale()) showError(e?.message || 'Something went wrong while reading the file.');
    }
  }

  // Step 2: apply the user's edits to build the confirmed dataset, then ask the AI whether it understands it.
  async function confirmSchema() {
    if (!pre || !schema) return;
    const run = ++runRef.current;
    const stale = () => run !== runRef.current;
    let ds;
    try {
      ds = buildDataset(pre.rows, pre.fields, schema);
    } catch (e) {
      showError(e?.message || 'Could not apply your changes.');
      return;
    }
    setConf({ ds, plan: planAnalysis(ds) });
    setVerify(null);
    setVerifyError('');
    setVerifyState('loading');
    setStage('confirm');
    try {
      const token = await getToken();
      if (!token) {
        router.replace('/');
        return;
      }
      const v = await fetchVerify(buildVerifyPayload(ds, pre.rows, schema), token);
      if (stale()) return;
      setVerify(v);
      setVerifyState('ok');
    } catch (e) {
      if (stale()) return;
      if (e.status === 401) {
        router.replace('/');
        return;
      }
      setVerifyError(
        e.status === 429
          ? 'Your weekly free trial has already been used.'
          : 'The AI check could not be completed. Your columns are shown as the app read them.'
      );
      setVerifyState('error');
    }
  }

  function editColumn(orig) {
    runRef.current++;
    setHighlight(orig);
    setStage('review');
  }

  // Step 3: the full analysis on the confirmed dataset. focusText is empty for the standard run.
  async function runAnalysis(focusText) {
    if (!conf || !pre) return;
    const run = ++runRef.current;
    const stale = () => run !== runRef.current;
    const { ds } = conf;
    setStages(freshStages());
    setStage('processing');
    try {
      upd('parse', { status: 'done', detail: `${plural(ds.n, 'row')} · ${plural(ds.fields.length, 'column')} (your confirmed version)` });
      upd('profile', { status: 'done', detail: `${ds.dates.length} date column${ds.dates.length === 1 ? '' : 's'} · ${ds.numeric.length} numeric` });

      upd('compute', { status: 'running', detail: 'Totals, trends, rankings, exceptions…' });
      await tick();
      const baseView = defaultView(ds);
      const mask = buildMask(ds, { from: '', to: '', cats: {}, dropDupes: !!schema.dropDupes });
      const ins = computeInsights(ds, mask, baseView);
      const deep = computeDeep(ds, mask, baseView, ins);
      const fcs = focusText ? focusFacts(ds, mask, baseView, ins, focusText) : { matches: [], items: [] };
      let an = { items: [] };
      try {
        an = computeAnalyst(ds, mask, baseView, ins, { schema: buildCtxSchema(ds), focus: focusText || '' }) || an;
      } catch {
        /* a failing optional module must never stop the report */
      }
      const core = [
        ...buildFacts(ds, ins, baseView).filter((f) => !(deep.forecast.ok && f.id === 'trend_projection')),
        ...deep.items.map(({ id, text }) => ({ id, text })),
      ];
      const room = Math.max(0, 215 - core.length - fcs.items.length);
      const facts = [...core, ...fcs.items, ...(an.items || []).slice(0, room)];
      const meta = buildMeta(ds, ins, baseView, fileName);
      if (stale()) return;
      upd('compute', {
        status: 'done',
        detail: `${plural(ins.groups.length, 'segment')} · ${plural(ins.series ? ins.series.labels.length : 0, 'period')} · ${plural(ins.outliers.count, 'outlier')} flagged`,
      });

      upd('narrative', { status: 'running', detail: focusText ? 'Writing commentary and answering your focus…' : 'Writing management commentary…' });
      const token = await getToken();
      if (!token) {
        router.replace('/');
        return;
      }
      const context = buildUserContext(ds, schema, focusText);
      let narrative = null;
      let note = '';
      try {
        const raw = await fetchNarrative(facts, meta, token, context);
        narrative = sanitizeNarrative(raw, facts);
        if (!narrative || (!narrative.summary && !narrative.takeaways.length)) {
          narrative = null;
          note = 'Commentary came back incomplete, so computed takeaways are shown instead.';
        }
      } catch (e) {
        if (e.status === 401) {
          router.replace('/');
          return;
        }
        note =
          e.status === 429
            ? 'Your weekly free trial has already been used, so commentary is unavailable. It resets ' +
              (e.nextAvailableAt ? new Date(e.nextAvailableAt).toLocaleString() : 'next week') +
              '.'
            : 'Commentary is temporarily unavailable. All figures below are unaffected.';
      }
      if (stale()) return;
      upd('narrative', narrative ? { status: 'done', detail: 'Commentary ready' } : { status: 'warn', detail: 'Skipped. Report uses computed takeaways' });

      upd('build', { status: 'running', detail: 'Assembling sections…' });
      await tick();
      if (stale()) return;
      setReport({
        ds, fileName, facts, meta, narrative, narrativeNote: note, generatedAt: new Date(), baseView, context,
        focus: focusText ? { text: focusText, items: fcs.items, matches: fcs.matches } : null,
        initialDropDupes: !!schema.dropDupes,
        initialTarget: schema.target || '',
      });
      upd('build', { status: 'done', detail: 'Done' });
      setStage('report');
      refreshTrial();
    } catch (e) {
      if (!stale()) showError(e?.message || 'Something went wrong while building the report.');
    }
  }

  async function retryNarrative() {
    if (!report) return;
    setNarrativeBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        router.replace('/');
        return;
      }
      const raw = await fetchNarrative(report.facts, report.meta, token, report.context);
      const narrative = sanitizeNarrative(raw, report.facts);
      if (narrative && (narrative.summary || narrative.takeaways.length)) {
        setReport((r) => ({ ...r, narrative, narrativeNote: '' }));
        refreshTrial();
      } else {
        setReport((r) => ({ ...r, narrativeNote: 'Commentary came back incomplete. Please try again.' }));
      }
    } catch (e) {
      setReport((r) => ({
        ...r,
        narrativeNote: e.status === 429 ? 'Your weekly free trial has already been used.' : 'Commentary is still unavailable. Please try again shortly.',
      }));
    } finally {
      setNarrativeBusy(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }

  if (!ready) return null;

  return (
    <div id="app">
      <header className="hdr">
        {stage === 'report' && (
          <button className="hdr-burger" onClick={() => setNavOpen((o) => !o)} aria-label="Open report menu" aria-expanded={navOpen}>
            <span /><span /><span />
          </button>
        )}
        <div className="hdr-logo">
          <div className="hdr-mark">I</div>
          <div className="hdr-name">
            Insightly <span>/ {profile?.orgName || '...'}</span>
          </div>
        </div>
        <div className="hdr-divider"></div>
        <div className="hdr-breadcrumb">
          {{ report: 'MIS Report', processing: 'Building report…', parsing: 'Reading file…', review: 'Review your data', confirm: 'Confirm understanding' }[stage] || 'Upload Data'}
        </div>
        <div className="hdr-right">
          {!trialLoading && trial && <div id="hdr-trial">{trial.eligible ? 'Trial available' : 'Trial used this week'}</div>}
          {fileName && stage !== 'drop' && (
            <div className="hdr-chip" style={{ display: 'block' }}>
              {fileName}
            </div>
          )}
          {stage !== 'drop' && (
            <button className="btn-outline" onClick={resetToDrop}>
              ← New file
            </button>
          )}
          <ThemePicker />
          <button className="btn-outline" onClick={handleSignOut}>
            Sign out
          </button>
          <div className="hdr-avatar">{(profile?.name || '?')[0]?.toUpperCase()}</div>
        </div>
      </header>

      {stage === 'drop' &&
        (trialLoading ? null : trial && !trial.eligible ? (
          <div className="trial-block">
            <div className="trial-block-card">
              <div className="trial-block-ico">⏳</div>
              <div className="trial-block-h">Weekly trial already used</div>
              <div className="trial-block-sub">
                Each account gets one free report per week.
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
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('over');
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove('over')}
            onDrop={onDrop}
          >
            <div className="drop-graphic">📊</div>
            <div className="drop-h">Drop your data file here</div>
            <div className="drop-sub">Get a full management report: KPIs, trends, rankings and exceptions</div>
            <div className="drop-hint">Any structure · Any delimiter · Large files supported</div>
            <div className="drop-formats">
              <span className="drop-fmt">.CSV</span>
              <span className="drop-fmt">.TSV</span>
              <span className="drop-fmt">Any delimiter</span>
            </div>
            <button className="btn-browse" onClick={() => fileInputRef.current?.click()}>
              📁 Choose file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              id="finput"
              accept=".csv,.tsv,.txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files[0]) handleFile(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </div>
        ))}

      {stage === 'parsing' && <ProcessingView stages={stages.slice(0, 2)} fileName={fileName} title="Reading your file" />}

      {stage === 'review' && pre && schema && (
        <ReviewData fileName={fileName} rows={pre.rows} ds={pre.ds} schema={schema} setSchema={setSchema} highlight={highlight} onContinue={confirmSchema} onCancel={resetToDrop} />
      )}

      {stage === 'confirm' && conf && (
        <ConfirmUnderstanding
          fileName={fileName}
          ds={conf.ds}
          plan={conf.plan}
          verify={verify}
          verifyState={verifyState}
          verifyError={verifyError}
          busy={false}
          onEdit={editColumn}
          onBack={() => {
            runRef.current++;
            setHighlight('');
            setStage('review');
          }}
          onStart={runAnalysis}
        />
      )}

      {stage === 'processing' && <ProcessingView stages={stages} fileName={fileName} />}

      {stage === 'error' && (
        <>
          <div id="errmsg" style={{ display: 'block' }}>
            {errMsg}
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button className="btn-browse" onClick={resetToDrop}>
              ↻ Try again
            </button>
          </div>
        </>
      )}

      {stage === 'report' && report && (
        <ReportShell report={report} onReupload={resetToDrop} onRetryNarrative={retryNarrative} narrativeBusy={narrativeBusy} navOpen={navOpen} setNavOpen={setNavOpen} />
      )}
    </div>
  );
}
