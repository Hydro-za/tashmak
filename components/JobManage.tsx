'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateJobDetails, assignJob } from '@/lib/actions';
import { toast } from './ToastHost';
import ActionButton from './ActionButton';

type Emp = { id: string; full_name: string; role: string };
export default function JobManage({ job, designers, producers, designerIds, producerIds }: { job: any; designers: Emp[]; producers: Emp[]; designerIds: string[]; producerIds: string[] }) {
  const router = useRouter(); const [due, setDue] = useState(job.due_date || ''); const [prio, setPrio] = useState(job.priority); const [busy, setBusy] = useState(false);
  const [des, setDes] = useState(designerIds[0] || ''); const [prod, setProd] = useState<string[]>(producerIds);
  async function save() {
    setBusy(true); const patch: any = {}; if (prio !== job.priority) patch.priority = prio; if ((due || '') !== (job.due_date || '')) patch.due_date = due || '';
    if (!Object.keys(patch).length) { toast('Nothing changed'); setBusy(false); return; }
    const r = await updateJobDetails(job.id, patch, job.version).catch(() => ({ ok: false, error: 'Could not reach the server.' } as any)); setBusy(false);
    if (r.ok) { toast('Job updated'); router.refresh(); } else toast(r.error || 'Could not update', 'bad');
  }
  const togg = (id: string) => setProd(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  return (
    <div>
      <div className="grid g3" style={{ alignItems: 'end' }}>
        <div className="field"><label>Due date</label><input type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
        <div className="field"><label>Priority</label><select value={prio} onChange={e => setPrio(e.target.value)}>{['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></div>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save due date / priority'}</button>
      </div>
      {job.design_required && <div className="grid g2" style={{ marginTop: 14, alignItems: 'end' }}>
        <div className="field"><label>Designer</label><select value={des} onChange={e => setDes(e.target.value)}><option value="">— none —</option>{designers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></div>
        <ActionButton className="btn" label="Assign designer" action={assignJob} args={[job.id, 'design', des ? [des] : []]} successText="Designer updated" />
      </div>}
      <div style={{ marginTop: 14 }}><label className="lbl">Production employees</label><div className="chips">{producers.map(p => <button type="button" key={p.id} className={prod.includes(p.id) ? 'on' : ''} onClick={() => togg(p.id)}>{p.full_name}</button>)}</div>
        <ActionButton className="btn" label="Save production team" action={assignJob} args={[job.id, 'production', prod]} successText="Production team updated" /></div>
    </div>
  );
}
