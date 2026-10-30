'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from './ToastHost';
import PasswordInput from './PasswordInput';
export default function ProfileForm() {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function change(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setErr('');
    if (a.length < 8) { setErr('Use at least 8 characters.'); return; } if (a !== b) { setErr('The two passwords do not match.'); return; }
    setBusy(true); const { error } = await createClient().auth.updateUser({ password: a }); setBusy(false);
    if (error) setErr('Could not change the password. Try a different one.'); else { toast('Password changed'); setA(''); setB(''); }
  }
  async function out() { await createClient().auth.signOut(); window.location.href = '/login'; }
  return (<div className="card"><h2>Change password</h2><form onSubmit={change} className="grid g2"><div className="field"><label>New password</label><PasswordInput value={a} onChange={setA} autoComplete="new-password" /></div><div className="field"><label>Repeat</label><PasswordInput value={b} onChange={setB} autoComplete="new-password" /></div>
    {err && <div className="alert bad" style={{ gridColumn: '1/-1' }}>{err}</div>}<div><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div></form><hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} /><button className="btn" onClick={out}>Sign out</button></div>);
}
