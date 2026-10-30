'use client';
import { useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import Logo from '../../components/Logo';
import ThemeToggle from '../../components/ThemeToggle';
import PasswordInput from '../../components/PasswordInput';
import { requestPasswordReset } from '@/lib/actions';

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
    if (!id.includes('@')) {
      setErr('Enter your registered employee or owner email address above.');
      return;
    }
    setBusy(true);
    try {
      const result = await requestPasswordReset(id.trim().toLowerCase());
      if (!result.ok) setErr(result.error || 'Could not send the reset email. Please try again.');
      else setInfo('If this email is registered, a secure password reset link has been sent.');
    } catch {
      setErr('Could not send the reset email. Please try again in a few minutes.');
    } finally {
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
