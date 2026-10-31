import Link from 'next/link';
import { requirePerm } from '@/lib/session';
import { Top, PrioBadge } from '@/components/ui';
import AutoRefresh from '@/components/AutoRefresh';
import { FINAL_JOB, fmtDate, todaySA } from '@/lib/labels';
import { sortJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const me = await requirePerm('jobs.view_all'); const sb = me.sb;
  const [{ data: jobs }, workloadResult, { count: acceptedWaiting }] = await Promise.all([
    sb.from('jobs').select('*, job_items(category_name,product_name)').is('archived_at', null).order('created_at', { ascending: false }).limit(1000),
    me.can('employees.view') ? sb.rpc('employee_workload') : Promise.resolve({ data: [] }),
    sb.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'accepted').is('job_id', null).is('archived_at', null)
  ]);
  const t = todaySA();
  const workload = workloadResult.data || [];
  const all = jobs || [];
  const active = all.filter((j: any) => !FINAL_JOB.includes(j.status));
  const dueToday = active.filter((j: any) => j.due_date === t);
  const production = active.filter((j: any) => ['queued', 'design', 'design_review', 'in_production', 'rework', 'qc'].includes(j.status));
  const awaitingQc = active.filter((j: any) => j.status === 'qc');
  const readyForHandoff = all.filter((j: any) => ['ready_collection', 'ready_delivery'].includes(j.status));
  const readyForInvoice = all.filter((j: any) => j.status === 'ready_invoice');
  const attention = [...new Map([...dueToday, ...active.filter((j: any) => j.status === 'qc')].map(j => [j.id, j])).values()].sort(sortJobs);
  const stat = (label: string, value: number, href: string, danger = false) => <Link href={href} className="stat" style={{ textDecoration: 'none', borderColor: danger && value ? 'var(--bad)' : undefined }}><div className="k">{label}</div><div className="v" style={{ color: danger && value ? 'var(--bad)' : undefined }}>{value}</div></Link>;

  return <div className="page-dashboard">
    <AutoRefresh seconds={60} />
    <Top title="Dashboard" sub={fmtDate(t)}>
      {me.isOwner && <Link href="/quotes/new" className="btn primary">+ NEW QUOTE</Link>}
      {me.can('jobs.manage') && <Link href="/jobs/new" className="btn">+ NEW JOB</Link>}
      <Link href="/jobs" className="btn">ALL JOBS</Link>
    </Top>

    {me.isOwner && !!acceptedWaiting && <div className="alert info"><Link href="/jobs/new"><b>{acceptedWaiting} accepted quote{acceptedWaiting > 1 ? 's' : ''}</b> waiting for a job to be started →</Link></div>}

    <div className="stats">
      {stat('Due today', dueToday.length, '/jobs?due=today')}
      {stat('Active work', production.length, '/jobs?status=active')}
      {stat('Awaiting QC', awaitingQc.length, '/jobs?status=qc')}
      {stat('Ready for handoff', readyForHandoff.length, '/jobs?status=ready_handoff')}
      {stat('Ready for invoice', readyForInvoice.length, '/jobs?status=ready_invoice')}
    </div>

    <div className="card">
      <h2>Needs attention <span className="muted" style={{ fontWeight: 400 }}>({attention.length})</span></h2>
      {attention.slice(0, 8).map((j: any) => <div className="linkrow" key={j.id}>
        <Link href={'/jobs/' + j.id}><b>{j.title || j.number}</b> · {j.customer_name}</Link>
        <span><PrioBadge p={j.priority} /> {j.status === 'qc' ? 'Awaiting QC' : fmtDate(j.due_date)}</span>
      </div>)}
      {!attention.length && <p className="muted">No due today or QC jobs. You’re up to date.</p>}
      {attention.length > 8 && <p className="muted">Showing 8 of {attention.length}. <Link href="/jobs">View all jobs</Link></p>}
    </div>

    {me.can('employees.view') && <div className="card">
      <h2>Team workload</h2>
      {(workload || []).length ? <div className="tblwrap"><table className="tbl"><thead><tr><th>Employee</th><th className="r">Active jobs</th></tr></thead><tbody>
        {(workload || []).map((w: any) => <tr key={w.user_id}><td><Link href={'/employees/' + w.user_id}><b>{w.full_name}</b></Link></td><td className="r">{w.active_jobs}</td></tr>)}
      </tbody></table></div> : <p className="muted">No team workload to show.</p>}
    </div>}
  </div>;
}
