'use client';
import { useEffect, useState } from 'react';
import { completePasswordReset } from '@/lib/password-reset-actions';
import Logo from '../../components/Logo';
import ThemeToggle from '../../components/ThemeToggle';
import PasswordInput from '../../components/PasswordInput';

export default function ChangePassword() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('email');
    if (value) setEmail(value);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!/^\d{4}$/.test(code)) { setErr('Enter the four-digit code from your email.'); return; }
    if (a.length < 8) { setErr('Use at least 8 characters.'); return; }
    if (a !== b) { setErr('The two passwords do not match.'); return; }
    setBusy(true);
    const result = await completePasswordReset(email, code, a);
    if (!result.ok) { setErr(result.error || 'Could not change the password. Try again.'); setBusy(false); return; }
    setSuccess(true);
    setBusy(false);
  }

  return <div className="authwrap"><div className="authcard">
    <div className="authtop"><Logo width={190} /><ThemeToggle /></div>
    {success ? <>
      <h1 style={{ fontSize: 22 }}>Password updated</h1>
      <p className="muted">Your password has been changed successfully. You can now sign in using your new password.</p>
      <a className="btn primary" href="/login" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Back to sign in</a>
    </> : <>
      <h1 style={{ fontSize: 22 }}>Reset your password</h1>
      <p className="muted">If the account matches, a four-digit code has been sent to its registered recovery email. If you requested the code using your username, enter the recovery email linked to that account below. The code expires after 10 minutes and can only be used once.</p>
      <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="reset-email">Registered recovery email</label><input id="reset-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="reset-code">Four-digit verification code</label><input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} pattern="[0-9]{4}" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} required /></div>
        <div className="field"><label>New password</label><PasswordInput value={a} onChange={setA} autoComplete="new-password" required /></div>
        <div className="field"><label>Repeat new password</label><PasswordInput value={b} onChange={setB} autoComplete="new-password" required /></div>
        {err && <div className="alert bad" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify code and save password'}</button>
        <a className="btn ghost sm" href="/login" style={{ textAlign: 'center', textDecoration: 'none' }}>Back to sign in</a>
      </form>
    </>}
  </div></div>;
}
