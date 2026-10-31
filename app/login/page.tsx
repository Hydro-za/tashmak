'use client';
import { useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import Logo from '../../components/Logo';
import ThemeToggle from '../../components/ThemeToggle';
import PasswordInput from '../../components/PasswordInput';
import { requestPasswordReset } from '@/lib/password-reset-actions';

export default function Login() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const toEmail = (v: string) => {
    v = v.trim().toLowerCase();
    return v.includes('@') ? v : v + '@employees.invalid';
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    setInfo('');
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email: toEmail(id), password: pw });
    if (error) {
      setErr('Incorrect username or password.');
      setBusy(false);
      return;
    }
    window.location.href = '/';
  }

  async function forgot() {
    setErr('');
    setInfo('');
    const identifier = id.trim();
    if (!identifier) {
      setErr('Enter your username or registered email address above first.');
      return;
    }
    setBusy(true);
    try {
      const result = await requestPasswordReset(identifier);
      if (!result.ok) {
        setErr(result.error || 'Could not send the reset email. Please try again.');
        setBusy(false);
        return;
      }
      const email = identifier.includes('@') ? identifier.toLowerCase() : '';
      window.location.href = '/change-password' + (email ? '?email=' + encodeURIComponent(email) : '');
    } catch {
      setErr('Could not send the reset email. Please try again in a few minutes.');
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="authtop"><Logo width={210} /><ThemeToggle /></div>
        <h1 style={{ fontSize: 22, marginBottom: 2 }}>Welcome back</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>Sign in to Tashmak Design &amp; Print</p>
        <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="u">Username or email</label>
            <input id="u" autoCapitalize="none" autoComplete="username" value={id} onChange={e => setId(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="p">Password</label>
            <PasswordInput id="p" value={pw} onChange={setPw} autoComplete="current-password" required />
          </div>
          {err && <div className="alert bad" role="alert">{err}</div>}
          {info && <div className="alert ok">{info}</div>}
          <button className="btn primary" style={{ minHeight: 44 }} disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
          <button type="button" className="btn ghost sm" onClick={forgot} disabled={busy}>Forgot password</button>
        </form>
      </div>
    </div>
  );
}
