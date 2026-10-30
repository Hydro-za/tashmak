'use client';
import { useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import Logo from '../../components/Logo';
import ThemeToggle from '../../components/ThemeToggle';
import PasswordInput from '../../components/PasswordInput';

export default function ChangePassword() {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setErr('');
    if (a.length < 8) { setErr('Use at least 8 characters.'); return; }
    if (a !== b) { setErr('The two passwords do not match.'); return; }
    setBusy(true); const sb = createClient();
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { setErr(error.message.includes('same') ? 'Choose a password different from the current one.' : 'Could not change the password. Try again.'); setBusy(false); return; }
    await sb.rpc('password_changed');
    window.location.href = '/';
  }
  return (
    <div className="authwrap"><div className="authcard"><div className="authtop"><Logo width={190} /><ThemeToggle /></div><h1 style={{ fontSize: 22 }}>Set a new password</h1>
      <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
        <div className="field"><label>New password</label><PasswordInput value={a} onChange={setA} autoComplete="new-password" required /></div>
        <div className="field"><label>Repeat password</label><PasswordInput value={b} onChange={setB} autoComplete="new-password" required /></div>
        {err && <div className="alert bad" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form></div></div>
  );
}
