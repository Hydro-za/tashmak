import Link from 'next/link';
import { requireEmployee } from '@/lib/session';
import { Empty, JobStatus } from '@/components/ui';
import { isMine } from '@/lib/jobs';
import { fmtDate } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function Completed() {
  const me = await requireEmployee(); const sb = me.sb;
  const { data } = await sb.from('jobs').select('id,number,title,customer_name,status,due_date,completed_at,design_started_at,design_completed_at,job_items(product_name,qty_ordered)').order('updated_at', { ascending: false }).limit(200);
  const done = (data || []).filter((j: any) => !isMine(me.perms, j.status));
  return (<><h1 style={{ marginBottom: 12 }}>Completed</h1>
    {!done.length ? <Empty text="Finished jobs will appear here." /> : done.map((j: any) => <Link key={j.id} href={'/my-jobs/' + j.id} className="jobcard"><div className="t">{j.title || j.number}</div><div className="m">{j.customer_name}</div>
      <div style={{ marginTop: 4 }}>{j.job_items.map((i: any) => `${Number(i.qty_ordered)} × ${i.product_name}`).join(' · ')}</div><div className="m" style={{ marginTop: 4 }}><JobStatus job={j} /> {j.completed_at ? 'Completed ' + fmtDate(j.completed_at) : ''}</div></Link>)}</>);
}
