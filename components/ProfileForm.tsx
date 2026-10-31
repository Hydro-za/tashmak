'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { updateMyProfile } from '@/lib/profile-actions';
import { toast } from './ToastHost';
import PasswordInput from './PasswordInput';

export default function ProfileForm({ initial }: { initial: { fullName: string; email: string; phone: string } }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [busy, setBusy] = useState(false); const [profileErr, setProfileErr] = useState(''); const [passwordErr, setPasswordErr] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setProfileErr(''); setBusy(true);
    try {
      const result = await updateMyProfile({ fullName, email, phone });
      if (!result.ok) setProfileErr(result.error || 'Could not update your profile.');
      else { toast(result.message || 'Profile updated'); router.refresh(); }
    } catch { setProfileErr('Could not reach the server. Please try again.'); }
    finally { setBusy(false); }
  }
  async function change(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setPasswordErr('');
    if (a.length < 8) { setPasswordErr('Use at least 8 characters.'); return; }
    if (a !== b) { setPasswordErr('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: a });
      if (error) setPasswordErr('Could not change the password. Try a different one.');
      else { toast('Password changed'); setA(''); setB(''); }
    } catch { setPasswordErr('Could not reach the server. Please try again.'); }
    finally { setBusy(false); }
  }
  async function out() { await createClient().auth.signOut(); window.location.href = '/login'; }
  return (<>
    <div className="card"><h2>Personal details</h2>
      <form onSubmit={save} className="grid g2">
        <div className="field"><label htmlFor="profile-name">Full name</label><input id="profile-name" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} required /></div>
        <div className="field"><label htmlFor="profile-email">Email address</label><input id="profile-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required /><small className="muted">For owner accounts, changing this sends a confirmation email. For employee accounts, this updates the recovery/contact email.</small></div>
        <div className="field"><label htmlFor="profile-phone">Phone number</label><input id="profile-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={40} /></div>
        {profileErr && <div className="alert bad" style={{ gridColumn: '1/-1' }} role="alert">{profileErr}</div>}
        <div><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
      </form>
    </div>
    <div className="card"><h2>Change password</h2><form onSubmit={change} className="grid g2">
      <div className="field"><label>New password</label><PasswordInput value={a} onChange={setA} autoComplete="new-password" /></div>
      <div className="field"><label>Repeat</label><PasswordInput value={b} onChange={setB} autoComplete="new-password" /></div>
      {passwordErr && <div className="alert bad" style={{ gridColumn: '1/-1' }} role="alert">{passwordErr}</div>}
      <div><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
    </form><hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} /><button className="btn" onClick={out}>Sign out</button></div>
  </>);
}
