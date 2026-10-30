'use client';
import { useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import Logo from '../../components/Logo';
import ThemeToggle from '../../components/ThemeToggle';
import PasswordInput from '../../components/PasswordInput';
import { requestPasswordReset } from '@/lib/actions';

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
    if (!id.includes('@')) { setErr('Enter your registered employee or owner email address above.'); return; }
    setBusy(true);
    const result=await requestPasswordReset(id.trim().toLowerCase());
    setBusy(false);
    if(!result.ok) setErr(result.error||'Could not send the reset email. Please try again.');
    else setInfo('If this email is registered, a secure password reset link has been sent.');
  }
