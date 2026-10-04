'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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
    <div className="center"><div className="card"><h1>Set a new password</h1>
      <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
        <div className="field"><label>New password</label><input type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} required /></div>
        <div className="field"><label>Repeat password</label><input type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} required /></div>
        {err && <div className="alert bad" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form></div></div>
  );
}
