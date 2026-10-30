import Link from 'next/link';
import { Suspense } from 'react';
import { requirePerm } from '@/lib/session';
import { Top, JobStatus, QcBadge, PrioBadge, DueFlag, Empty } from '@/components/ui';
import FilterMemory, { ResetFilter } from '@/components/FilterMemory';
import { SIMPLE, simpleStatus, isCompletedJob, dueState, fmtDate, type SimpleKey } from '@/lib/labels';
import { sortJobs, staffNames } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
type SP = { tab?: string; q?: string; status?: string; priority?: string; employee?: string; due?: string; view?: string; archived?: string };
export default async function Jobs({ searchParams: sp }: { searchParams: SP }) {
  const me = await requirePerm('jobs.view_all');
  const tab = sp.tab === 'completed' ? 'completed' : 'active';
  let query = me.sb.from('jobs').select('*, quotes(number), job_items(product_name), job_assignments(user_id,stage,active)').order('created_at', { ascending: false }).limit(600);
  query = sp.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (sp.priority) query = query.eq('priority', sp.priority);
  const [{ data }, names] = await Promise.all([query, staffNames(me.sb)]);
  const term = (sp.q || '').trim().toLowerCase();
  const all = data || [];
  const inTab = all.filter((j: any) => (tab === 'completed') === isCompletedJob(j));
  const rows = inTab.filter((j: any) => {
    if (term && ![j.number, j.title, j.customer_name, j.quotes?.number, ...j.job_items.map((i: any) => i.product_name)].join(' ').toLowerCase().includes(term)) return false;
    if (sp.status && simpleStatus(j) !== sp.status) return false;
    if (sp.employee && !j.job_assignments.some((a: any) => a.active && a.user_id === sp.employee)) return false;
    if (sp.due === 'overdue' && dueState(j.due_date, j.status) !== 'overdue') return false;
    if (sp.due === 'soon' && !['soon', 'overdue'].includes(dueState(j.due_date, j.status) || '')) return false;
    return true;
  }).sort(tab === 'completed' ? (a: any, b: any) => String(b.completed_at || b.updated_at).localeCompare(String(a.completed_at || a.updated_at)) : sortJobs);
  const activeCount = all.filter((j: any) => !isCompletedJob(j)).length, doneCount = all.length - activeCount;
  const q = (o: Partial<SP>) => { const p = new URLSearchParams(); Object.entries({ ...sp, ...o }).forEach(([k, v]) => { if (v) p.set(k, String(v)); }); return '/jobs?' + p.toString(); };
  const board = tab === 'active' && sp.view === 'board';
  const team = (j: any) => j.job_assignments.filter((a: any) => a.active).map((a: any) => names[a.user_id]).filter(Boolean);
  const staff = Object.entries(names);
  const name = (j: any) => j.title || j.job_items.map((i: any) => i.product_name).slice(0, 2).join(', ') || j.number;
  const card = (j: any) => <Link key={j.id} href={'/jobs/' + j.id} className="qcard"><b>{name(j)}</b> <PrioBadge p={j.priority} /><div className="muted">{j.number} · {j.customer_name}</div><div className="muted">{team(j).join(', ') || 'Not assigned'}</div><div className="muted">Due {fmtDate(j.due_date)} <DueFlag due={j.due_date} status={j.status} /></div></Link>;
  return (<div className="page-jobs">
    <Suspense fallback={null}><FilterMemory /></Suspense>
    <Top title="Jobs">{me.can('jobs.manage') && <Link href="/jobs/new" className="btn primary">+ New job</Link>}</Top>
    <div className="tabs"><Link href={q({ tab: 'active', status: '', view: '' }).replace('tab=active&', '')} className={tab === 'active' ? 'tablink on' : 'tablink'}>Active ({activeCount})</Link><Link href={q({ tab: 'completed', status: '', view: '' })} className={tab === 'completed' ? 'tablink on' : 'tablink'}>Completed ({doneCount})</Link></div>
    <div className="chips">
      {tab === 'active' && (Object.keys(SIMPLE) as SimpleKey[]).filter(k => !['completed', 'cancelled'].includes(k)).map(k => <Link key={k} href={q({ status: sp.status === k ? '' : k })} className={sp.status === k ? 'on' : ''}>{SIMPLE[k].label}</Link>)}
      <Link href={q({ due: sp.due === 'overdue' ? '' : 'overdue' })} className={sp.due === 'overdue' ? 'on' : ''}>Overdue</Link><Link href={q({ due: sp.due === 'soon' ? '' : 'soon' })} className={sp.due === 'soon' ? 'on' : ''}>Due soon</Link>
      {(sp.q || sp.status || sp.priority || sp.employee || sp.due) && <ResetFilter />}
    </div>
    <form className="card" method="get"><input type="hidden" name="tab" value={tab} /><div className="grid g4">
      <div className="field"><label>Search name, job no., customer, product</label><input name="q" defaultValue={sp.q} /></div>
      <div className="field"><label>Priority</label><select name="priority" defaultValue={sp.priority || ''}><option value="">Any</option>{['urgent', 'high', 'normal', 'low'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
      <div className="field"><label>Assigned employee</label><select name="employee" defaultValue={sp.employee || ''}><option value="">Anyone</option>{staff.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}><button className="btn primary">Apply</button>{tab === 'active' && <Link className="btn" href={q({ view: board ? '' : 'board' })}>{board ? 'List view' : 'Board view'}</Link>}<Link className="btn ghost" href={q({ archived: sp.archived ? '' : '1' })}>{sp.archived ? 'Hide archived' : 'Archived'}</Link></div></div></form>
    {!rows.length ? <Empty text={tab === 'completed' ? 'No completed jobs match.' : 'No active jobs match.'} action={me.can('jobs.manage') && tab === 'active' ? <Link className="btn primary" href="/jobs/new">Create a job</Link> : undefined} /> : board ?
      <div className="queue" style={{ gridTemplateColumns: 'repeat(3,minmax(240px,1fr))' }}>{(['pending', 'in_progress', 'awaiting_qc'] as SimpleKey[]).map(k => { const list = rows.filter((j: any) => simpleStatus(j) === k); return <div className="col" key={k}><h3>{SIMPLE[k].label} <span className="muted">({list.length})</span></h3>{list.map(card)}</div>; })}</div> :
      <div className="card"><div className="tblwrap"><table className="tbl"><thead><tr><th>Job</th><th>Customer</th><th>Assigned to</th><th>Status</th><th>Created</th><th>{tab === 'completed' ? 'Completed' : 'Due'}</th></tr></thead><tbody>{rows.map((j: any) => <tr key={j.id}>
        <td><Link href={'/jobs/' + j.id}><b>{name(j)}</b></Link><div className="muted">{j.number}{j.quotes?.number ? ' · ' + j.quotes.number : ''} <PrioBadge p={j.priority} /></div></td>
        <td>{j.customer_name}</td><td className="muted">{team(j).join(', ') || <span className="overdue">Not assigned</span>}</td>
        <td><JobStatus job={j} /><div style={{ marginTop: 4 }}>{j.job_items.length > 0 && j.qc_status !== 'not_checked' || j.status === 'qc' ? <QcBadge status={j.qc_status} /> : null}</div></td>
        <td>{fmtDate(j.created_at)}</td><td>{tab === 'completed' ? fmtDate(j.completed_at || j.updated_at) : <>{fmtDate(j.due_date)} <div><DueFlag due={j.due_date} status={j.status} /></div></>}</td></tr>)}</tbody></table></div></div>}
  </div>);
}
