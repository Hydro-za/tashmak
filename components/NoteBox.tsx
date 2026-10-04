'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { addNote } from '@/lib/actions';
import { toast } from './ToastHost';
export default function NoteBox({ jobId }: { jobId: string }) {
  const [v, setV] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false); const router = useRouter();
  async function save() {
    if (lock.current || !v.trim()) return; lock.current = true; setBusy(true);
    const r = await addNote(jobId, v).catch(() => ({ ok: false, error: 'Could not reach the server.' } as any));
    lock.current = false; setBusy(false);
    if (r.ok) { setV(''); toast('Note added'); router.refresh(); } else toast(r.error || 'Could not add the note', 'bad');
  }
  return <div><textarea value={v} onChange={e => setV(e.target.value)} maxLength={2000} placeholder="Add an internal note…" data-noRefresh /><button className="btn sm" style={{ marginTop: 6 }} onClick={save} disabled={busy || !v.trim()}>{busy ? 'Saving…' : 'Add note'}</button></div>;
}
