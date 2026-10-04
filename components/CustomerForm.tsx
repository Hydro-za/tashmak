'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCustomer } from '@/lib/actions';
import { toast } from './ToastHost';
export default function CustomerForm({ c }: { c?: any }) {
  const router = useRouter(); const [v, setV] = useState({ name: c?.name || '', company: c?.company || '', phone: c?.phone || '', email: c?.email || '', address: c?.address || '', notes: c?.notes || '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const lock = useRef(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setErr('');
    const r = await saveCustomer({ id: c?.id, ...v }).catch(() => ({ ok: false, error: 'Could not reach the server.' } as any));
    lock.current = false; setBusy(false);
    if (r.ok) { toast('Customer saved'); router.push('/customers/' + r.data.id); router.refresh(); } else setErr(r.error || 'Could not save');
  }
  const f = (k: keyof typeof v, label: string, type = 'text') => <div className="field"><label>{label}</label><input type={type} value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>;
  return (
    <form onSubmit={submit} className="card"><div className="grid g2">{f('name', 'Name *')}{f('company', 'Company')}{f('phone', 'Phone / WhatsApp', 'tel')}{f('email', 'Email', 'email')}</div>
      <div className="field" style={{ marginTop: 12 }}><label>Address</label><textarea value={v.address} onChange={e => setV({ ...v, address: e.target.value })} /></div>
      <div className="field" style={{ marginTop: 12 }}><label>Customer notes (shown when creating quotes & jobs)</label><textarea value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} placeholder="e.g. Prefers WhatsApp communication" /></div>
      {err && <div className="alert bad" style={{ marginTop: 12 }}>{err}</div>}<button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !v.name.trim()}>{busy ? 'Saving…' : 'Save customer'}</button></form>
  );
}
