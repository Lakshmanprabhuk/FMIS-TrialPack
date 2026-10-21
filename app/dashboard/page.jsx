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
import { computeDeep } from '../../lib/mis/deep';
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
  const [stage, setStage] = useState('drop'); // drop | processing | error | report
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
    setStage('drop');
    setFileName('');
    setErrMsg('');
  }

  function showError(msg) {
    setErrMsg(msg);
    setStage('error');
  }

  const upd = (id, patch) => setStages((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function handleFile(file) {
    const run = ++runRef.current;
    const stale = () => run !== runRef.current;
    setFileName(file.name);
    setStages(freshStages());
    setStage('processing');

    try {
      // 1. Parse
      upd('parse', { status: 'running', detail: 'Reading file…' });
      await tick();
      const { rows, fields } = await parseFile(file, (p) => {
        if (!stale()) upd('parse', { detail: `${plural(p.rows, 'row')} read (${Math.round(p.pct * 100)}%)` });
      });
      if (stale()) return;
      upd('parse', { status: 'done', detail: `${plural(rows.length, 'row')} · ${plural(fields.length, 'column')}` });

      // 2. Profile & validate
      upd('profile', { status: 'running', detail: 'Detecting column types…' });
      await tick();
      const ds = buildDataset(rows, fields);
      if (stale()) return;
      const bits = [
        plural(ds.n, 'row'),
        plural(ds.fields.length, 'column'),
        `${ds.dates.length} date column${ds.dates.length === 1 ? '' : 's'} detected`,
        `${ds.numeric.length} numeric`,
      ];
      if (ds.stats.dupes) bits.push(plural(ds.stats.dupes, 'duplicate'));
      upd('profile', { status: 'done', detail: bits.join(' · ') });

      // 3. Compute
      upd('compute', { status: 'running', detail: 'Totals, trends, rankings, exceptions…' });
      await tick();
      const baseView = defaultView(ds);
      const mask = buildMask(ds, { from: '', to: '', cats: {}, dropDupes: false });
      const ins = computeInsights(ds, mask, baseView);
      const deep = computeDeep(ds, mask, baseView, ins);
      const facts = [
        ...buildFacts(ds, ins, baseView).filter((f) => !(deep.forecast.ok && f.id === 'trend_projection')),
        ...deep.items.map(({ id, text }) => ({ id, text })),
      ];
      const meta = buildMeta(ds, ins, baseView, file.name);
      if (stale()) return;
      upd('compute', {
        status: 'done',
        detail: `${plural(ins.groups.length, 'segment')} · ${plural(ins.series ? ins.series.labels.length : 0, 'period')} · ${plural(ins.outliers.count, 'outlier')} flagged`,
      });

      // 4. Narrative (text only; every figure is already computed)
      upd('narrative', { status: 'running', detail: 'Writing management commentary…' });
      const token = await getToken();
      if (!token) {
        router.replace('/');
        return;
      }
      let narrative = null;
      let note = '';
      try {
        const raw = await fetchNarrative(facts, meta, token);
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

      // 5. Build
      upd('build', { status: 'running', detail: 'Assembling sections…' });
      await tick();
      if (stale()) return;
      setReport({ ds, fileName: file.name, facts, meta, narrative, narrativeNote: note, generatedAt: new Date(), baseView });
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
      const raw = await fetchNarrative(report.facts, report.meta, token);
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
        <div className="hdr-logo">
          <div className="hdr-mark">I</div>
          <div className="hdr-name">
            Insightly <span>/ {profile?.orgName || '...'}</span>
          </div>
        </div>
        <div className="hdr-divider"></div>
        <div className="hdr-breadcrumb">{stage === 'report' ? 'MIS Report' : stage === 'processing' ? 'Building report…' : 'Upload Data'}</div>
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
        <ReportShell report={report} onReupload={resetToDrop} onRetryNarrative={retryNarrative} narrativeBusy={narrativeBusy} />
      )}
    </div>
  );
}
