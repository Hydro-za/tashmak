'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const [id, setId] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [info, setInfo] = useState('');
  const toEmail = (v: string) => { v = v.trim().toLowerCase(); return v.includes('@') ? v : v + '@employees.invalid'; };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setErr(''); setInfo('');
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email: toEmail(id), password: pw });
    if (error) { setErr('Incorrect username or password.'); setBusy(false); return; }
    window.location.href = '/';
  }
  async function forgot() {
    setErr(''); setInfo('');
    if (!id.includes('@')) { setErr('Enter the Owner email address above first. Employees: ask the Owner to reset your password.'); return; }
    const sb = createClient();
    const { error } = await sb.auth.resetPasswordForEmail(id.trim().toLowerCase(), { redirectTo: window.location.origin + '/auth/callback?next=/change-password' });
    if (error) setErr('Could not send the reset email right now. Please try again in a few minutes.'); else setInfo('If that address belongs to the Owner account, a reset link has been sent.');
  }
  return (
    <div className="center"><div className="card">
      <h1 style={{ marginBottom: 4 }}>PrintOps</h1><p className="muted" style={{ marginTop: 0 }}>Sign in to continue</p>
      <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="u">Username or email</label><input id="u" autoCapitalize="none" autoComplete="username" value={id} onChange={e => setId(e.target.value)} required /></div>
        <div className="field"><label htmlFor="p">Password</label><input id="p" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required /></div>
        {err && <div className="alert bad" role="alert">{err}</div>}{info && <div className="alert ok">{info}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="btn ghost sm" onClick={forgot}>Forgot password (Owner)</button>
      </form>
    </div></div>
  );
}
