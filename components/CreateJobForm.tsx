'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createJob } from '@/lib/actions';
import { toast } from './ToastHost';

type Emp = { id: string; full_name: string };
type Item = { product_name: string; qty_ordered: string; details: string; requires_qc: boolean };
export default function CreateJobForm({ customers, designers, producers, defaultDue, defaultPriority, defaultApproval }: { customers: { id: string; name: string; company: string | null }[]; designers: Emp[]; producers: Emp[]; defaultDue: string; defaultPriority: string; defaultApproval: boolean }) {
  const router = useRouter(); const lock = useRef(false);
  const [cust, setCust] = useState(''); const [title, setTitle] = useState(''); const [due, setDue] = useState(defaultDue); const [prio, setPrio] = useState(defaultPriority);
  const [design, setDesign] = useState<boolean | null>(null); const [designer, setDesigner] = useState(''); const [approval, setApproval] = useState(defaultApproval); const [prod, setProd] = useState<string[]>([]); const [instr, setInstr] = useState('');
  const [items, setItems] = useState<Item[]>([{ product_name: '', qty_ordered: '1', details: '', requires_qc: false }]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const setItem = (i: number, p: Partial<Item>) => setItems(l => l.map((x, k) => k === i ? { ...x, ...p } : x));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return; setErr('');
    if (!cust) { setErr('Choose a customer.'); return; } if (design === null) { setErr('Say whether design is required.'); return; }
    if (design && !designer) { setErr('Choose a designer.'); return; } if (!design && !prod.length) { setErr('Choose at least one production employee.'); return; }
    lock.current = true; setBusy(true);
    const r = await createJob({ customerId: cust, title, dueDate: due || null, priority: prio, designRequired: design, designApproval: design ? approval : false, designerId: design ? designer : null, productionIds: prod, instructions: instr,
      items: items.map(x => ({ ...x, qty_ordered: Number(x.qty_ordered) })) }).catch(() => ({ ok: false, error: 'Could not reach the server. No job was created — try again.' } as any));
    if (r.ok) { toast('Job ' + (r.data?.number || '') + ' created'); router.push('/jobs/' + r.data.id); router.refresh(); } else { setErr(r.error || 'Could not create the job'); lock.current = false; setBusy(false); }
  }
  const togg = (id: string) => setProd(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  return (
    <form onSubmit={submit} className="card">
      <div className="grid g2">
        <div className="field"><label>Customer *</label><select value={cust} onChange={e => setCust(e.target.value)}><option value="">Choose…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ' — ' + c.company : ''}</option>)}</select></div>
        <div className="field"><label>Job name</label><input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Leave blank to use the item names" /></div>
        <div className="field"><label>Due date</label><input type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
        <div className="field"><label>Priority</label><select value={prio} onChange={e => setPrio(e.target.value)}>{['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></div>
      </div>
      <div className="lbl" style={{ margin: '16px 0 6px' }}>What is being made</div>
      {items.map((it, i) => (
        <div className="listrow" key={i} style={{ gridTemplateColumns: '2fr 90px 2fr auto auto' }}>
          <div className="field"><label>Item *</label><input value={it.product_name} onChange={e => setItem(i, { product_name: e.target.value })} placeholder="e.g. A2 posters" /></div>
          <div className="field"><label>Qty *</label><input type="number" min="1" step="any" value={it.qty_ordered} onChange={e => setItem(i, { qty_ordered: e.target.value })} /></div>
          <div className="field"><label>Details (size, material, colour…)</label><input value={it.details} onChange={e => setItem(i, { details: e.target.value })} /></div>
          <label className="chk" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={it.requires_qc} onChange={e => setItem(i, { requires_qc: e.target.checked })} /> Quality check</label>
          <button type="button" className="btn icon danger" style={{ alignSelf: 'end' }} disabled={items.length === 1} onClick={() => setItems(l => l.filter((_, k) => k !== i))} aria-label="Remove item">✕</button>
        </div>))}
      <button type="button" className="btn sm" onClick={() => setItems(l => [...l, { product_name: '', qty_ordered: '1', details: '', requires_qc: false }])}>+ Add another item</button>
      <div className="field" style={{ marginTop: 16 }}><label>Is design required?</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className={'btn ' + (design === true ? 'primary' : '')} onClick={() => setDesign(true)}>YES — send to designer</button><button type="button" className={'btn ' + (design === false ? 'primary' : '')} onClick={() => setDesign(false)}>NO — straight to production</button></div></div>
      {design && <div className="grid g2" style={{ marginTop: 12 }}>
        <div className="field"><label>Designer *</label><select value={designer} onChange={e => setDesigner(e.target.value)}><option value="">Choose…</option>{designers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></div>
        <div className="field"><label>Approval</label><label className="chk"><input type="checkbox" checked={approval} onChange={e => setApproval(e.target.checked)} /> Designs must be approved before production</label></div></div>}
      <div className="field" style={{ marginTop: 14 }}><label>Production employees{design ? ' (can be assigned later)' : ' *'}</label><div className="chips">{producers.map(p => <button type="button" key={p.id} className={prod.includes(p.id) ? 'on' : ''} onClick={() => togg(p.id)}>{p.full_name}</button>)}</div></div>
      <div className="field" style={{ marginTop: 14 }}><label>Special instructions</label><textarea value={instr} onChange={e => setInstr(e.target.value)} maxLength={2000} /></div>
      {err && <div className="alert bad" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <button className="bigbtn" disabled={busy}>{busy ? 'Creating…' : 'CREATE JOB'}</button>
    </form>
  );
}
