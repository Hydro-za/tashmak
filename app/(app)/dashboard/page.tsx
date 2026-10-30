import Link from 'next/link';
import { requirePerm } from '@/lib/session';
import { Top, StatusBadge, PrioBadge, Overdue } from '@/components/ui';
import Timeline from '@/components/Timeline';
import AutoRefresh from '@/components/AutoRefresh';
import OverdueCheck from '@/components/OverdueCheck';
import { FINAL_JOB, fmtDate, overdueDays, todaySA } from '@/lib/labels';
import { sortJobs, staffNames } from '@/lib/jobs';
export const dynamic = 'force-dynamic';
export default async function Dashboard({ searchParams }: { searchParams: { cat?: string } }) {
  const me = await requirePerm('jobs.view_all'); const sb = me.sb;
  const [{ data: jobs }, { data: workload }, { data: act }, names, { data: cats }, { count: acceptedWaiting }] = await Promise.all([
    sb.from('jobs').select('*, job_items(category_name,product_name)').is('archived_at', null).order('created_at', { ascending: false }).limit(1000),
    sb.rpc('employee_workload'), sb.from('job_activity').select('*').order('created_at', { ascending: false }).limit(15), staffNames(sb), sb.from('product_categories').select('name').order('name'),
    sb.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'accepted').is('job_id', null).is('archived_at', null)]);
  const cat = searchParams.cat; const t = todaySA();
  const all = (jobs || []).filter((j: any) => !cat || j.job_items.some((i: any) => i.category_name === cat));
  const act_ = all.filter((j: any) => !FINAL_JOB.includes(j.status));
  const c = (f: (j: any) => boolean) => all.filter(f).length;
  const stat = (label: string, v: number, href: string, tone?: string) => <Link href={href} className="stat" style={{ textDecoration: 'none', borderColor: tone === 'bad' && v ? 'var(--bad)' : undefined }}><div className="k">{label}</div><div className="v" style={{ color: tone === 'bad' && v ? 'var(--bad)' : undefined }}>{v}</div></Link>;
  const list = (title: string, rows: any[], empty: string) => <div className="card"><h2>{title} <span className="muted" style={{ fontWeight: 400 }}>({rows.length})</span></h2>{rows.slice(0, 6).map((j: any) => <div className="linkrow" key={j.id}><Link href={'/jobs/' + j.id}><b>{j.title || j.number}</b> · {j.customer_name} <Overdue due={j.due_date} status={j.status} /></Link><span><PrioBadge p={j.priority} /> {fmtDate(j.due_date)}</span></div>)}{!rows.length && <p className="muted">{empty}</p>}{rows.length > 6 && <p className="muted">+ {rows.length - 6} more in Jobs</p>}</div>;
  return (<div className="page-dashboard">
    <AutoRefresh seconds={60} /><OverdueCheck />
    <Top title="Dashboard" sub={fmtDate(t)}>{me.isOwner && <Link href="/quotes/new" className="btn primary">+ NEW QUOTE</Link>}{me.can('customers.manage') && <Link href="/customers/new" className="btn">+ NEW CUSTOMER</Link>}{me.can('jobs.manage') && <Link href="/jobs/new" className="btn">+ NEW JOB</Link>}<Link href="/jobs" className="btn">VIEW PRODUCTION QUEUE</Link><Link href="/jobs?due=overdue" className="btn">VIEW OVERDUE</Link></Top>
    <div className="chips"><Link href="/dashboard" className={!cat ? 'on' : ''}>All products</Link>{(cats || []).map((k: any) => <Link key={k.name} href={'/dashboard?cat=' + encodeURIComponent(k.name)} className={cat === k.name ? 'on' : ''}>{k.name}</Link>)}</div>
    {me.isOwner && !!acceptedWaiting && <div className="alert info"><Link href="/jobs/new"><b>{acceptedWaiting} accepted quote{acceptedWaiting > 1 ? 's' : ''}</b> waiting for a job to be started →</Link></div>}
    <div className="stats">
      {stat('Due today', c(j => j.due_date === t && !FINAL_JOB.includes(j.status)), '/jobs?due=today')}{stat('Overdue', c(j => overdueDays(j.due_date, j.status) > 0), '/jobs?due=overdue', 'bad')}
      {stat('Awaiting design', c(j => ['design', 'design_review'].includes(j.status)), '/jobs?status=design')}{stat('In production', c(j => ['in_production', 'rework'].includes(j.status)), '/jobs?status=in_production')}
      {stat('Waiting to start', c(j => j.status === 'queued'), '/jobs?status=queued')}{stat('Awaiting QC', c(j => j.status === 'qc'), '/jobs?status=qc')}{stat('Completed', c(j => j.status === 'completed'), '/jobs?status=completed')}
      {stat('Ready for collection', c(j => j.status === 'ready_collection'), '/jobs?status=ready_collection')}{stat('Ready for delivery', c(j => j.status === 'ready_delivery'), '/jobs?status=ready_delivery')}{stat('Ready for invoice', c(j => j.status === 'ready_invoice'), '/jobs?status=ready_invoice')}
    </div>
    <div className="grid g2">
      {list('Due today', act_.filter((j: any) => j.due_date === t).sort(sortJobs), 'Nothing due today.')}{list('Overdue', act_.filter((j: any) => overdueDays(j.due_date, j.status) > 0).sort(sortJobs), 'Nothing is overdue. 🎉')}
      {list('Awaiting design', act_.filter((j: any) => ['design', 'design_review'].includes(j.status)).sort(sortJobs), 'No jobs in design.')}{list('In production', act_.filter((j: any) => ['in_production', 'rework', 'qc'].includes(j.status)).sort(sortJobs), 'No jobs in production.')}
    </div>
    <div className="card"><h2>Employee workload</h2>{(workload || []).length ? <div className="tblwrap"><table className="tbl"><thead><tr><th>Employee</th><th className="r">Active</th><th className="r">Overdue</th><th className="r">Completed</th></tr></thead><tbody>{(workload || []).map((w: any) => <tr key={w.user_id}><td><Link href={'/employees/' + w.user_id}><b>{w.full_name}</b></Link> <span className="muted">— {w.role}</span></td><td className="r">{w.active_jobs}</td><td className="r" style={{ color: w.overdue_jobs ? 'var(--bad)' : undefined }}>{w.overdue_jobs}</td><td className="r">{w.completed_jobs}</td></tr>)}</tbody></table></div> : <p className="muted">No employees yet. <Link href="/employees/new">Add one</Link>.</p>}</div>
    <div className="card"><h2>Recent activity</h2><Timeline events={act || []} names={names} /></div>
  </div>);
}
