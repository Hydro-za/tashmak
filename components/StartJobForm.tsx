'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startJob } from '@/lib/actions';
import { toast } from './ToastHost';

type Emp = { id: string; full_name: string; role: string };
export default function StartJobForm({ quoteId, items, designers, producers, defaultDue, defaultPriority, defaultApproval, qcDefaults }: { quoteId: string; items: { id: string; name: string; qty: number; category: string }[]; designers: Emp[]; producers: Emp[]; defaultDue: string; defaultPriority: string; defaultApproval: boolean; qcDefaults: string[] }) {
  const router = useRouter();
  const [due, setDue] = useState(defaultDue); const [prio, setPrio] = useState(defaultPriority); const [design, setDesign] = useState<boolean | null>(null);
  const [designer, setDesigner] = useState(''); const [approval, setApproval] = useState(defaultApproval); const [prod, setProd] = useState<string[]>([]); const [instr, setInstr] = useState('');
  const [qc, setQc] = useState<Record<string, boolean>>(Object.fromEntries(items.map(i => [i.id, qcDefaults.includes(i.category)])));
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return; setErr('');
    if (design === null) { setErr('Please say whether design is required (Yes or No).'); return; }
    if (design && !designer) { setErr('Choose a designer.'); return; }
    if (!design && !prod.length) { setErr('Choose at least one production employee.'); return; }
    lock.current = true; setBusy(true);
    const r = await startJob({ quoteId, dueDate: due || null, priority: prio, designRequired: design, designApproval: design ? approval : false, designerId: design ? designer : null, productionIds: prod, instructions: instr, qc }).catch(() => ({ ok: false, error: 'Could not reach the server. No job was created — try again.' } as any));
    if (r.ok) { toast('Job ' + (r.data?.number || '') + ' started'); router.push('/jobs/' + r.data.id); router.refresh(); }
    else { setErr(r.error || 'Could not start the job'); lock.current = false; setBusy(false); }
  }
  const toggle = (id: string) => setProd(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  return (
    <form onSubmit={submit} className="card">
      <div className="grid g2">
        <div className="field"><label>Due date</label><input type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
        <div className="field"><label>Priority</label><select value={prio} onChange={e => setPrio(e.target.value)}>{['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></div>
      </div>
      <div className="field" style={{ marginTop: 14 }}><label>Is design required?</label>
        <div style={{ display: 'flex', gap: 8 }}><button type="button" className={'btn ' + (design === true ? 'primary' : '')} onClick={() => setDesign(true)}>YES — send to designer</button><button type="button" className={'btn ' + (design === false ? 'primary' : '')} onClick={() => setDesign(false)}>NO — straight to production</button></div></div>
      {design && <div className="grid g2" style={{ marginTop: 12 }}>
        <div className="field"><label>Designer *</label><select value={designer} onChange={e => setDesigner(e.target.value)}><option value="">Choose…</option>{designers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>{!designers.length && <div className="help">No designers yet — add one under Employees.</div>}</div>
        <div className="field"><label>Owner approval</label><label className="chk"><input type="checkbox" checked={approval} onChange={e => setApproval(e.target.checked)} /> I must approve the design before production</label></div></div>}
      <div className="field" style={{ marginTop: 14 }}><label>Production / printer employee{design ? ' (can be assigned later)' : ' *'}</label>
        <div className="chips">{producers.map(p => <button type="button" key={p.id} className={prod.includes(p.id) ? 'on' : ''} onClick={() => toggle(p.id)}>{p.full_name}</button>)}</div>{!producers.length && <div className="help">No production employees yet — add one under Employees.</div>}</div>
      <div className="field" style={{ marginTop: 14 }}><label>Quality check required (per item)</label>
        {items.map(i => <label key={i.id} className="chk" style={{ padding: '4px 0' }}><input type="checkbox" checked={!!qc[i.id]} onChange={e => setQc({ ...qc, [i.id]: e.target.checked })} /> {i.name} <span className="muted">× {i.qty}</span></label>)}</div>
      <div className="field" style={{ marginTop: 14 }}><label>Special instructions (internal)</label><textarea value={instr} onChange={e => setInstr(e.target.value)} maxLength={2000} /></div>
      {err && <div className="alert bad" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <button className="bigbtn" disabled={busy}>{busy ? 'Creating job…' : 'START JOB'}</button>
    </form>
  );
}
