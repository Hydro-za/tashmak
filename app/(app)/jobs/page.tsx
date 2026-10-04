import Link from 'next/link';
import { Suspense } from 'react';
import { requireOwner } from '@/lib/session';
import { Top, StatusBadge, PrioBadge, Overdue, Empty } from '@/components/ui';
import FilterMemory, { ResetFilter } from '@/components/FilterMemory';
import { JOB_STATUS, QUEUE, FINAL_JOB, fmtDate, overdueDays, todaySA } from '@/lib/labels';
import { sortJobs, staffNames } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
type SP = { q?: string; status?: string; priority?: string; employee?: string; product?: string; cat?: string; profile?: string; due?: string; from?: string; to?: string; view?: string; archived?: string; done?: string };
export default async function Jobs({ searchParams: sp }: { searchParams: SP }) {
  const { sb } = await requireOwner();
  let query = sb.from('jobs').select('*, quotes(number), job_items(product_name,category_name,profile), job_assignments(user_id,stage,active)').order('created_at', { ascending: false }).limit(600);
  query = sp.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (sp.status && JOB_STATUS[sp.status]) query = query.eq('status', sp.status);
  if (sp.priority) query = query.eq('priority', sp.priority);
  if (sp.from) query = query.gte('created_at', sp.from); if (sp.to) query = query.lte('created_at', sp.to + 'T23:59:59');
  const [{ data }, names, { data: cats }] = await Promise.all([query, staffNames(sb), sb.from('product_categories').select('id,name').order('name')]);
  const t = todaySA(); const term = (sp.q || '').trim().toLowerCase(); const prod = (sp.product || '').trim().toLowerCase();
  let rows = (data || []).filter((j: any) => {
    if (!sp.status && !sp.archived && !sp.done && FINAL_JOB.includes(j.status)) return false;
    if (term && ![j.number, j.customer_name, j.quotes?.number].join(' ').toLowerCase().includes(term)) return false;
    if (sp.employee && !j.job_assignments.some((a: any) => a.active && a.user_id === sp.employee)) return false;
    if (prod && !j.job_items.some((i: any) => (i.product_name || '').toLowerCase().includes(prod))) return false;
    if (sp.cat && !j.job_items.some((i: any) => i.category_name === sp.cat)) return false;
    if (sp.profile && !j.job_items.some((i: any) => i.profile === sp.profile)) return false;
    if (sp.due === 'today' && j.due_date !== t) return false; if (sp.due === 'overdue' && overdueDays(j.due_date, j.status) === 0) return false;
    return true;
  }).sort(sortJobs);
  const q = (o: Partial<SP>) => { const p = new URLSearchParams(); Object.entries({ ...sp, ...o }).forEach(([k, v]) => { if (v) p.set(k, String(v)); }); return '/jobs?' + p.toString(); };
  const board = (sp.view || 'board') === 'board';
  const emps = Object.entries(names);
  const chip = (label: string, o: Partial<SP>, on: boolean) => <Link key={label} href={on ? '/jobs' : '/jobs?' + new URLSearchParams(o as any).toString()} className={on ? 'on' : ''}>{label}</Link>;
  const jobLink = (j: any) => <Link key={j.id} href={'/jobs/' + j.id} className="qcard"><b>{j.number}</b> <PrioBadge p={j.priority} /><div>{j.customer_name}</div><div className="muted">{(j.job_items || []).map((i: any) => i.product_name).slice(0, 2).join(', ')}{j.job_items.length > 2 ? ' +' + (j.job_items.length - 2) : ''}</div><div className="muted">Due {fmtDate(j.due_date)} <Overdue due={j.due_date} status={j.status} /></div></Link>;
  return (<>
    <Suspense fallback={null}><FilterMemory /></Suspense>
    <Top title="Jobs"><Link href="/jobs/new" className="btn primary">+ New job</Link></Top>
    <div className="chips">
      {chip("Today's jobs", { due: 'today' }, sp.due === 'today' && Object.keys(sp).length === 1)}{chip('Overdue', { due: 'overdue' }, sp.due === 'overdue' && Object.keys(sp).length === 1)}{chip('DTF jobs', { profile: 'dtf' }, sp.profile === 'dtf' && Object.keys(sp).length === 1)}
      {chip('Awaiting design', { status: 'design' }, sp.status === 'design' && Object.keys(sp).length === 1)}{chip('In production', { status: 'in_production' }, sp.status === 'in_production' && Object.keys(sp).length === 1)}{chip('Ready for collection', { status: 'ready_collection' }, sp.status === 'ready_collection' && Object.keys(sp).length === 1)}
      {chip('Ready for invoice', { status: 'ready_invoice' }, sp.status === 'ready_invoice' && Object.keys(sp).length === 1)}{Object.keys(sp).filter(k => k !== 'view').length > 0 && <ResetFilter />}
    </div>
    <form className="card" method="get"><div className="grid g4">
      <div className="field"><label>Job no. / customer / quote no.</label><input name="q" defaultValue={sp.q} /></div>
      <div className="field"><label>Product</label><input name="product" defaultValue={sp.product} /></div>
      <div className="field"><label>Category</label><select name="cat" defaultValue={sp.cat || ''}><option value="">All</option>{(cats || []).map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
      <div className="field"><label>Status</label><select name="status" defaultValue={sp.status || ''}><option value="">Active jobs</option>{Object.entries(JOB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
      <div className="field"><label>Priority</label><select name="priority" defaultValue={sp.priority || ''}><option value="">Any</option>{['urgent', 'high', 'normal', 'low'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
      <div className="field"><label>Employee</label><select name="employee" defaultValue={sp.employee || ''}><option value="">Anyone</option>{emps.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
      <div className="field"><label>Due</label><select name="due" defaultValue={sp.due || ''}><option value="">Any</option><option value="today">Today</option><option value="overdue">Overdue</option></select></div>
      <div className="field"><label>Created from</label><input type="date" name="from" defaultValue={sp.from} /></div>
      <div className="field"><label>Created to</label><input type="date" name="to" defaultValue={sp.to} /></div></div>
      <input type="hidden" name="view" value={sp.view || 'board'} /><div style={{ marginTop: 10, display: 'flex', gap: 8 }}><button className="btn primary">Apply filters</button><Link className="btn" href={q({ view: board ? 'list' : 'board' })}>{board ? 'List view' : 'Queue view'}</Link>
        <Link className="btn ghost" href={q({ archived: sp.archived ? '' : '1' })}>{sp.archived ? 'Hide archived' : 'Show archived'}</Link><Link className="btn ghost" href={q({ done: sp.done ? '' : '1' })}>{sp.done ? 'Hide finished' : 'Show finished'}</Link></div></form>
    {!rows.length ? <Empty text="No jobs match." action={<Link className="btn primary" href="/jobs/new">Start a job</Link>} /> : board ?
      <div className="queue">{QUEUE.map(col => { const list = rows.filter((j: any) => col.statuses.includes(j.status)); return <div className="col" key={col.key}><h3>{col.label} <span className="muted">({list.length})</span></h3>{list.map(jobLink)}</div>; })}</div> :
      <div className="card"><div className="tblwrap"><table className="tbl"><thead><tr><th>Job</th><th>Customer</th><th>Items</th><th>Status</th><th>Priority</th><th>Due</th><th>Team</th></tr></thead><tbody>{rows.map((j: any) => <tr key={j.id}>
        <td><Link href={'/jobs/' + j.id}><b>{j.number}</b></Link>{j.quotes?.number && <div className="muted">{j.quotes.number}</div>}</td><td>{j.customer_name}</td><td>{j.job_items.map((i: any) => i.product_name).join(', ')}</td><td><StatusBadge status={j.status} /></td><td><PrioBadge p={j.priority} /></td>
        <td>{fmtDate(j.due_date)} <Overdue due={j.due_date} status={j.status} /></td><td className="muted">{j.job_assignments.filter((a: any) => a.active).map((a: any) => names[a.user_id]).filter(Boolean).join(', ')}</td></tr>)}</tbody></table></div></div>}
  </>);
}
