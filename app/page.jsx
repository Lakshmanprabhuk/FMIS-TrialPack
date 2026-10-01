'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

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
      setError('Please fill in your name and organisation.');
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
        setError('Account created, but saving your profile failed: ' + profileErr.message);
        return;
      }
      router.replace('/dashboard');
      return;
    }

    setLoading(false);
    setNotice('Check your email to confirm your account, then sign in.');
    setMode('login');
  }

  return (
    <div id="login-screen">
      <div className="login-left">
        <div className="login-brand">
          <div className="login-logo">
            <div className="login-logo-mark">I</div>
            <div className="login-logo-txt">
              Insightly <span>Analytics</span>
            </div>
          </div>
          <div className="login-tagline">
            Turn your data into <em>decisions</em>, instantly.
          </div>
          <div className="login-sub">
            Upload any CSV and get a full AI-powered dashboard in seconds — no setup, no SQL, no
            waiting.
          </div>
        </div>
        <div className="login-stats">
          <div className="login-stat">
            <div className="login-stat-val">3,400+</div>
            <div className="login-stat-lbl">Rows analysed per file</div>
          </div>
          <div className="login-stat">
            <div className="login-stat-val">&lt; 30s</div>
            <div className="login-stat-lbl">From CSV to dashboard</div>
          </div>
          <div className="login-stat">
            <div className="login-stat-val">1 / week</div>
            <div className="login-stat-lbl">Free trial run</div>
          </div>
          <div className="login-stat">
            <div className="login-stat-val">Gemini</div>
            <div className="login-stat-lbl">AI-powered analysis</div>
          </div>
        </div>
        <div className="login-circles"></div>
      </div>

      <div className="login-right">
        <div className="login-right-inner">
          <div style={{ fontSize: 28, marginBottom: 4 }}>👋</div>
          <div className="login-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</div>
          <div className="login-subtitle">
            {mode === 'login' ? 'Sign in to your Insightly workspace' : 'One free trial run per week'}
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={'auth-tab' + (mode === 'login' ? ' active' : '')}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={'auth-tab' + (mode === 'signup' ? ' active' : '')}
              onClick={() => {
                setMode('signup');
                setError('');
              }}
            >
              Sign up
            </button>
          </div>

          {error && <div className="login-err" style={{ display: 'block' }}>{error}</div>}
          {notice && (
            <div className="login-err" style={{ display: 'block', background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-pale)' }}>
              {notice}
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
            {mode === 'signup' && (
              <>
                <div className="lfield">
                  <label>Full name</label>
                  <div className="lfield-wrap">
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <span className="lfield-ico">🧑</span>
                  </div>
                </div>
                <div className="lfield">
                  <label>Organisation</label>
                  <div className="lfield-wrap">
                    <input
                      type="text"
                      placeholder="Acme Inc."
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                    />
                    <span className="lfield-ico">🏢</span>
                  </div>
                </div>
                <div className="lfield">
                  <label>What will you use this for? (optional)</label>
                  <div className="lfield-wrap">
                    <input
                      type="text"
                      placeholder="e.g. monthly sales review"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    />
                    <span className="lfield-ico">🎯</span>
                  </div>
                </div>
              </>
            )}

            <div className="lfield">
              <label>Email</label>
              <div className="lfield-wrap">
                <input
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <span className="lfield-ico">✉️</span>
              </div>
            </div>
            <div className="lfield">
              <label>Password</label>
              <div className="lfield-wrap">
                <input
                  type="password"
                  placeholder={mode === 'login' ? 'Enter your password' : 'At least 6 characters'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <span className="lfield-ico">🔒</span>
              </div>
            </div>

            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
