import Link from 'next/link';
import { requireEmployee } from '@/lib/session';
import { PrioBadge, DueFlag, Empty, JobStatus, Top } from '@/components/ui';
import AutoRefresh from '@/components/AutoRefresh';
import { sortJobs, isMine } from '@/lib/jobs';
import { fmtDate } from '@/lib/labels';
export const dynamic = 'force-dynamic';

export default async function MyJobs() {
  const me = await requireEmployee(); const sb = me.sb;
  const { data } = await sb.from('jobs').select('*, job_items(product_name,qty_ordered), job_assignments(user_id,stage,active)').is('archived_at', null);
  const mine = (data || []).filter((j: any) => isMine(me.perms, j.status)).sort(sortJobs);
  return (<div className="page-staff-work">
    <AutoRefresh seconds={30} />
    <Top title="My Jobs" sub={mine.length + " assigned " + (mine.length === 1 ? "job" : "jobs")} />
    {!mine.length ? <Empty text="Nothing assigned to you right now. New jobs will appear here." /> : mine.map((j: any) => (
      <Link key={j.id} href={'/my-jobs/' + j.id} className={'jobcard ' + j.priority}>
        <div className="staff-jobcard-head"><span className="t">{j.title || j.number}</span><PrioBadge p={j.priority} /></div>
        <div className="m">{j.number} · {j.customer_name}</div>
        <div className="staff-jobcard-items">{j.job_items.map((i: any) => `${Number(i.qty_ordered)} × ${i.product_name}`).join(' · ')}</div>
        <div className="m staff-jobcard-meta">Due {fmtDate(j.due_date)} <DueFlag due={j.due_date} status={j.status} /> · <JobStatus job={j} /></div>
      </Link>))}
  </div>);
}
