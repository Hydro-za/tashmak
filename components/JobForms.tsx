'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recordQc, updateProgress, recordSupplied } from '@/lib/actions';
import { toast } from './ToastHost';

function useSubmit() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const lock = useRef(false);
  return { busy, run: async (fn: () => Promise<any>, okMsg: string, after?: () => void) => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { const r = await fn(); if (r.ok) { toast(okMsg); after?.(); router.refresh(); } else toast(r.error || 'Could not save', 'bad'); }
    catch { toast('Could not reach the server. Nothing was changed.', 'bad'); } finally { lock.current = false; setBusy(false); }
  } };
}
export function QcForm({ jobId, items }: { jobId: string; items: { id: string; name: string; ordered: number }[] }) {
  const [item, setItem] = useState(''); const [result, setResult] = useState('passed'); const [checked, setChecked] = useState(''); const [rejected, setRejected] = useState('0'); const [notes, setNotes] = useState(''); const { busy, run } = useSubmit();
  const submit = () => {
    const c = Number(checked), r = Number(rejected || 0);
    if (!(c >= 0) || checked === '') { toast('Enter the quantity checked', 'bad'); return; } if (!(r >= 0) || r > c) { toast('Rejected cannot be more than checked', 'bad'); return; }
    if (result !== 'passed' && !notes.trim()) { toast('Add a note explaining the problem', 'bad'); return; }
    run(() => recordQc(jobId, item || null, result, c, r, notes), 'QC recorded', () => { setNotes(''); setChecked(''); setRejected('0'); });
  };
  return (<div><div className="grid g2">
    <div className="field"><label>Item</label><select value={item} onChange={e => setItem(e.target.value)}><option value="">All QC items</option>{items.map(i => <option key={i.id} value={i.id}>{i.name} × {i.ordered}</option>)}</select></div>
    <div className="field"><label>Result</label><select value={result} onChange={e => setResult(e.target.value)}><option value="passed">Passed</option><option value="failed">Failed</option><option value="rework_required">Rework required</option></select></div>
    <div className="field"><label>Quantity checked</label><input type="number" min="0" value={checked} onChange={e => setChecked(e.target.value)} /></div>
    <div className="field"><label>Quantity rejected</label><input type="number" min="0" value={rejected} onChange={e => setRejected(e.target.value)} /></div></div>
    <div className="field" style={{ marginTop: 8 }}><label>Notes</label><input value={notes} onChange={e => setNotes(e.target.value)} /></div>
    <button className={'btn ' + (result === 'passed' ? 'primary' : 'danger')} style={{ marginTop: 10 }} onClick={submit} disabled={busy}>{busy ? 'Saving…' : result === 'passed' ? 'RECORD QC PASSED' : 'RECORD QC FAILED → REWORK'}</button></div>);
}
export function ProgressForm({ jobId, item }: { jobId: string; item: any }) {
  const [v, setV] = useState({ p: item.qty_in_production, c: item.qty_completed, r: item.qty_rejected, w: item.qty_rework }); const { busy, run } = useSubmit();
  const f = (k: 'p' | 'c' | 'r' | 'w', l: string) => <div className="field"><label>{l}</label><input type="number" min="0" step="any" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value as any })} /></div>;
  const accepted = Math.max(0, Number(v.c) - Number(v.r));
  return (<div><div className="grid g4">{f('p', 'In production')}{f('c', 'Completed')}{f('r', 'Rejected')}{f('w', 'Rework')}</div>
    <div className="muted" style={{ margin: '6px 0' }}>Ordered {Number(item.qty_ordered)} · Final accepted {accepted}</div>
    <button className="btn sm" onClick={() => run(() => updateProgress(jobId, item.id, Number(v.p) || 0, Number(v.c) || 0, Number(v.r) || 0, Number(v.w) || 0), 'Quantities saved')} disabled={busy}>{busy ? 'Saving…' : 'Save quantities'}</button></div>);
}
export function SuppliedForm({ jobId, items }: { jobId: string; items: { id: string; name: string }[] }) {
  const [d, setD] = useState(''); const [q, setQ] = useState('1'); const [cond, setCond] = useState(''); const [item, setItem] = useState(''); const [notes, setNotes] = useState(''); const { busy, run } = useSubmit();
  const submit = () => { if (!d.trim()) { toast('Describe the item received', 'bad'); return; } if (!(Number(q) > 0)) { toast('Quantity must be more than zero', 'bad'); return; } run(() => recordSupplied(jobId, item || null, d, Number(q), cond, notes), 'Recorded', () => { setD(''); setCond(''); setNotes(''); setQ('1'); }); };
  return (<div className="grid g2">
    <div className="field"><label>Item received (e.g. Black hoodies, size L)</label><input value={d} onChange={e => setD(e.target.value)} /></div><div className="field"><label>Quantity received</label><input type="number" min="1" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="field"><label>Condition</label><input value={cond} onChange={e => setCond(e.target.value)} placeholder="e.g. New, one stained" /></div><div className="field"><label>For item</label><select value={item} onChange={e => setItem(e.target.value)}><option value="">Whole job</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
    <div className="field" style={{ gridColumn: '1/-1' }}><label>Notes</label><input value={notes} onChange={e => setNotes(e.target.value)} /></div>
    <div><button className="btn" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Record item received'}</button></div></div>);
}
