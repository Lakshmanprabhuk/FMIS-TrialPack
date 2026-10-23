'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import './login.css';
import { t } from './login-text';

const PATHS = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  org: <><path d="M4 20V6l8-3 8 3v14" /><path d="M9 20v-5h6v5M9 9h.01M15 9h.01M9 12h.01M15 12h.01" /></>,
  goal: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.4 2.9 8.3 7 9.5 4.1-1.2 7-5.1 7-9.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10M10 20v-5h4v5" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100" /></>,
  chart: <><path d="M5 20V11M12 20V5M19 20v-7" /></>,
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8.5 10h7" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.200 3 14.800 0 18M12 3c-3 3.200-3 14.800 0 18" /></>,
  print: <><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="17" cy="6" r="2.5" /><circle cx="17" cy="18" r="2.5" /><path d="m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6" /></>,
  db: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  bolt: <><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" /></>,
  gift: <><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5V20h14v-7.5M12 8.5V20M12 8.5C10 8.500 7.500 7 8.500 5.200 9.800 3.500 12 6 12 8.500Zm0 0c2 0 4.500-1.500 3.500-3.300C14.200 3.500 12 6 12 8.500Z" /></>,
  spark: <><path d="M12 3c.8 4.800 3.200 7.200 8 8-4.800.8-7.200 3.200-8 8-.8-4.800-3.200-7.200-8-8 4.800-.8 7.200-3.200 8-8z" /></>,
};
function Ic({ n, s = 18 }) {
  return (
    <svg className="lg-ic" viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[n]}
    </svg>
  );
}


export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard');
    });
  }, [router]);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInErr) {
      setError(signInErr.message);
      return;
    }
    router.replace('/dashboard');
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!name.trim() || !orgName.trim()) {
      setError(t('au.fill'));
      return;
    }
    setLoading(true);
    const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      setLoading(false);
      setError(signUpErr.message);
      return;
    }

    // If email confirmation is enabled in Supabase, there's no session yet —
    // the profile row gets created on first login instead (see handleLogin
    // fallback below is not needed because we also attempt the insert here;
    // if it fails due to no session, we retry right after confirmed login).
    if (data.session && data.user) {
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: data.user.id,
        name: name.trim(),
        org_name: orgName.trim(),
        email,
        purpose: purpose.trim() || null,
      });
      setLoading(false);
      if (profileErr) {
        setError(t('au.profileFail', { e: profileErr.message }));
        return;
      }
      router.replace('/dashboard');
      return;
    }

    setLoading(false);
    setNotice(t('au.confirm'));
    setMode('login');
  }

  const formRef = useRef(null);
  const howRef = useRef(null);
  const [go, setGo] = useState(false);
  useEffect(() => {
    const el = howRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setGo(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setGo(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  function startFree() {
    setMode('signup');
    setError('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div id="login-screen" className="lg">
      <div className="lg-shell">
        <header className="lg-top">
          <div className="lg-brand">
            <span className="lg-mark">I</span>
            <span>Insightly</span>
          </div>
        </header>

        <main className="lg-main">
          <section className="lg-story">
            <div className="lg-eyebrow lg-rise"><span className="lg-pulse" /> {t('lp.kicker')}</div>
            <h1 className="lg-h1 lg-rise lg-d1">
              {t('au.tag', { em: '\u0000' }).split('\u0000').flatMap((part, i, a) => (i < a.length - 1 ? [part, <em key={i}>{t('au.tagEm')}</em>] : [part]))}
            </h1>
            <p className="lg-lead lg-rise lg-d2">{t('au.sub')}</p>
            <div className="lg-cta-row lg-rise lg-d2">
              <button type="button" className="lg-cta" onClick={startFree}>{t('lg.cta')} <span aria-hidden="true">→</span></button>
            </div>
            <p className="lg-reassure lg-rise lg-d2">{t('lg.noCard')} <i>·</i> {t('lg.quick')}</p>
            <ul className="lg-feats lg-rise lg-d3">
              {[['chart', 'lp.f1t', 'lv.f1'], ['doc', 'lp.f2t', 'lp.f2'], ['spark', 'lv.f3t', 'lv.f3'], ['print', 'lv.f4t', 'lv.f4']].map(([ic, tk, bk]) => (
                <li key={tk}>
                  <span className="lg-fi"><Ic n={ic} s={22} /></span>
                  <b>{t(tk)}</b>
                  <p>{t(bk)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="lg-stage lg-rise lg-d1" aria-hidden="true">
            <div className="lg-file"><span className="lg-csv">CSV</span><span><b>sales.csv</b><small>{t('lg.csvRows')}</small></span></div>
            <svg className="lg-arrow" viewBox="0 0 130 84" fill="none"><path d="M8 2C6 46 40 70 112 64" /><path d="m100 53 14 11-13 12" /></svg>
            <div className="lg-sheets">
              <div className="lg-sheet lg-s1"><span className="lg-tag">PDF</span><b>{t('lg.rep1')}</b><i className="lg-sk w" /><i className="lg-sk" /><div className="lg-tb"><i /><i /><i /><i /><i /><i /></div></div>
              <div className="lg-sheet lg-s2"><b>{t('lg.rep2')}</b><div className="lg-dn" /><i className="lg-sk w" /><i className="lg-sk" /></div>
              <div className="lg-sheet lg-s3"><b>{t('lg.rep3')}</b><div className="lg-tb lg-tl"><i /><i /><i /><i /><i /><i /></div><i className="lg-sk w" /></div>
            </div>
            <div className="lg-dash">
              <aside className="lg-side">
                <div className="lg-sb"><span>I</span> Insightly</div>
                {[['home', 'lv.n1'], ['chart', 'lv.n2'], ['grid', 'lv.n3'], ['spark', 'lv.n4'], ['bolt', 'lv.n5'], ['db', 'lv.n6']].map(([ic, k], i) => <a key={k} className={i === 0 ? 'on' : ''}><Ic n={ic} s={13} />{t(k)}</a>)}
              </aside>
              <div className="lg-dm">
                <div className="lg-bar"><span className="lg-search">{t('lg.search')}</span><span className="lg-chipb">{t('lg.period')}</span></div>
                <div className="lg-dh"><div><h2>{t('lg.dashH')}</h2><p>{t('lg.dashS')}</p></div><em>{t('lg.sample')}</em></div>
                <div className="lg-kpis">
                  {[['k1', '12.4M', '26.2%'], ['k2', '5,482', '18.7%'], ['k3', '2,265', '12.4%'], ['k4', '18.6%', '4.3%']].map(([k, v, d], j) => (
                    <div className="lg-kpi" key={k} style={{ '--j': j }}><span>{t('lg.' + k)}</span><strong>{v}</strong><small>↗ {d}</small>
                      <div className="lg-spk"><i /><i /><i /><i /><i /><i /><i /></div></div>
                  ))}
                </div>
                <div className="lg-charts">
                  <div className="lg-cc">
                    <div className="lg-ct"><b>{t('lg.revT')}</b></div>
                    <div className="lg-plot">
                      <div className="lg-grid"><i /><i /><i /><i /><i /></div>
                      <div className="lg-bars">{[22, 30, 42, 38, 53, 50, 61, 65, 74, 71, 84, 96].map((h, i) => <i key={i} style={{ '--h': h + '%', '--i': i }} />)}</div>
                      <svg className="lg-line" viewBox="0 0 420 145" preserveAspectRatio="none"><polyline pathLength="1" points="4,122 40,104 76,112 112,78 148,88 184,66 220,73 256,48 292,57 328,34 364,26 412,5" /></svg>
                    </div>
                  </div>
                  <div className="lg-cc">
                    <div className="lg-ct"><b>{t('lg.catT')}</b></div>
                    <div className="lg-donw">
                      <div className="lg-donut"><span>42%</span></div>
                      <div className="lg-leg"><span><i />{t('lg.pa')}<b>42%</b></span><span><i />{t('lg.pb')}<b>28%</b></span><span><i />{t('lg.pc')}<b>18%</b></span><span><i />{t('lg.po')}<b>12%</b></span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg-cap"><span className="lg-pulse" /> {t('lg.stage')}</div>
          </section>

          <aside className="lg-card lg-rise lg-d2" ref={formRef}>
            <div className="lg-cbrand"><span className="lg-mark">I</span><span>Insightly</span></div>
            <h2 className="lg-title">{mode === 'login' ? t('au.welcome') : t('au.create')}</h2>
            <p className="lg-sub">{mode === 'login' ? t('au.subLogin') : t('au.subSignup')}</p>

            <div className="lg-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>{t('au.tabLogin')}</button>
              <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); }}>{t('au.tabSignup')}</button>
            </div>

            {error && <div className="lg-msg lg-err" role="alert">{error}</div>}
            {notice && <div className="lg-msg lg-ok" role="status">{notice}</div>}

            <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
              {mode === 'signup' && (
                <>
                  <label className="lg-f"><span>{t('au.name')}</span><div className="lg-in"><Ic n="user" /><input type="text" placeholder="Jane Doe" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></div></label>
                  <label className="lg-f"><span>{t('au.org')}</span><div className="lg-in"><Ic n="org" /><input type="text" placeholder="Acme Inc." autoComplete="organization" value={orgName} onChange={(e) => setOrgName(e.target.value)} required /></div></label>
                  <label className="lg-f"><span>{t('au.purpose')}</span><div className="lg-in"><Ic n="goal" /><input type="text" placeholder={t('au.purposePh')} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div></label>
                </>
              )}
              <label className="lg-f"><span>{t('au.email')}</span><div className="lg-in"><Ic n="mail" /><input type="email" placeholder="you@company.com" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></label>
              <label className="lg-f"><span>{t('au.password')}</span>
                <div className="lg-in"><Ic n="lock" />
                  <input type={showPw ? 'text' : 'password'} placeholder={mode === 'login' ? t('au.pwLogin') : t('au.pwSignup')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" className="lg-eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? t('lp.hidePw') : t('lp.showPw')} aria-pressed={showPw}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS.eye}{showPw && <path d="M4 20 20 4" />}</svg>
                  </button>
                </div>
              </label>
              <button className="lg-submit" type="submit" disabled={loading}>
                {loading ? t('au.wait') : mode === 'login' ? t('au.signIn') : t('au.createBtn')}
              </button>
            </form>

            <div className="lg-priv">
              <span className="lg-shield"><Ic n="shield" s={22} /></span>
              <div><b>{t('lg.privT')}</b><p>{t('lp.trust')}</p></div>
            </div>
            <p className="lg-foot">
              {mode === 'login' ? t('lg.newTo') : t('lg.haveAcc')}{' '}
              <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? t('au.tabSignup') : t('au.tabLogin')}</button>
            </p>
          </aside>
        </main>

        <footer className="lg-strip lg-rise lg-d3">
          {[['db', '3,400+', t('au.s1')], ['bolt', '< 30s', t('au.s2')], ['gift', t('au.s3v'), t('au.s3')], ['spark', t('au.s4v'), t('au.s4')]].map(([ic, v, l]) => (
            <div className="lg-stat" key={l}><span className="lg-si"><Ic n={ic} s={22} /></span><div><b>{v}</b><small>{l}</small></div></div>
          ))}
        </footer>

        <section className={'lg-how' + (go ? ' go' : '')} ref={howRef}>
          <div className="lg-how-head">
            <span className="lg-eyebrow"><span className="lg-pulse" /> {t('lg.howK')}</span>
            <h2>{t('lg.howT')}</h2>
            <p>{t('lg.howS')}</p>
          </div>
          <div className="lg-flowd">
            <div className="lg-rail" aria-hidden="true"><i className="lg-rail-fill" /><i className="lg-rail-dot" /></div>
            <article className="lg-node lg-w1">
              <span className="lg-num">1</span>
              <div className="lg-vis lg-v1" aria-hidden="true">
                <div className="lg-dz"><span>{t('lg.drop')}</span></div>
                <div className="lg-drag"><span className="lg-csv">CSV</span>sales.csv</div>
              </div>
              <h3>{t('lp.st1')}</h3><p>{t('lg.h1d')}</p>
            </article>
            <article className="lg-node lg-w2">
              <span className="lg-num">2</span>
              <div className="lg-vis lg-v2" aria-hidden="true">
                {['c1', 'c2', 'c3', 'c4'].map((k, i) => <span key={k} className="lg-col" style={{ '--i': i }}><i>✓</i>{t('lg.' + k)}</span>)}
                <small>{t('lg.found')}</small>
              </div>
              <h3>{t('lp.st2')}</h3><p>{t('lg.h2d')}</p>
            </article>
            <article className="lg-node lg-w3">
              <span className="lg-num">3</span>
              <div className="lg-vis lg-v3" aria-hidden="true">
                <div className="lg-mini"><b>12.4M</b><em>↗ 26.2%</em></div>
                <div className="lg-mbars">{[30, 46, 38, 58, 50, 72, 88].map((h, i) => <i key={i} style={{ '--h': h + '%', '--i': i }} className={i === 6 ? 'hot' : ''} />)}</div>
                <span className="lg-flag">⚑ {t('lg.outl')}</span>
              </div>
              <h3>{t('lp.st3')}</h3><p>{t('lg.h3d')}</p>
            </article>
            <article className="lg-node lg-w4">
              <span className="lg-num">4</span>
              <div className="lg-vis lg-v4" aria-hidden="true">
                <div className="lg-fm"><span className="p">PDF</span></div>
                <div className="lg-meta"><span>{t('lv.chipA')}</span><span>{t('lv.chipB')}</span></div>
              </div>
              <h3>{t('lv.st4')}</h3><p>{t('lv.h4d')}</p>
            </article>
          </div>
        </section>

        <section className="lg-band">
          <div>
            <h2>{t('lg.ctaT')}</h2>
            <p>{t('lg.ctaS')}</p>
          </div>
          <button type="button" className="lg-cta lg-cta-light" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); startFree(); }}>{t('lg.ctaB')} <span aria-hidden="true">→</span></button>
        </section>

        <footer className="lg-legal">
          <span><b>I</b> Insightly</span>
          <span>{t('lp.trust')}</span>
          <span>© 2026 Insightly</span>
        </footer>
      </div>
    </div>
  );
}
