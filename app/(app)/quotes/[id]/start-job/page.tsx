import { notFound, redirect } from 'next/navigation';
import { requireOwner } from '@/lib/session';
import { loadQuote } from '@/lib/quotes';
import { staffDirectory } from '@/lib/jobs';
import StartJobForm from '@/components/StartJobForm';
import { Top } from '@/components/ui';
import { todaySA } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export default async function StartJobPage({ params }: { params: { id: string } }) {
  const { sb } = await requireOwner();
  const q = await loadQuote(sb, params.id); if (!q) notFound();
  if (q.job_id) redirect('/jobs/' + q.job_id);
  if (q.status !== 'accepted') return <><Top title={'Start job — ' + q.number} /><div className="alert warn">This quote must be marked as accepted before a job can start.</div></>;
  const [dir, { data: ss }] = await Promise.all([staffDirectory(sb), sb.from('system_settings').select('key,value').in('key', ['jobs', 'workflow'])]);
  const s = Object.fromEntries((ss || []).map((r: any) => [r.key, r.value]));
  const d = new Date(todaySA() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + Number(s.jobs?.defaultDueDays ?? 7));
  const emps = dir.filter(e => e.active && !e.deleted);
  return (<>
    <Top title={'Start job — ' + q.number} sub={q.customers?.name} />
    <StartJobForm quoteId={q.id} items={q.items.map((i: any) => ({ id: i.id, name: i.product_name, qty: Number(i.quantity), category: i.category_name || '' }))} designers={emps.filter(e => e.can_design)} producers={emps.filter(e => e.can_produce)}
      defaultDue={d.toISOString().slice(0, 10)} defaultPriority={s.jobs?.defaultPriority || 'normal'} defaultApproval={!!s.workflow?.designApprovalDefault} qcDefaults={s.workflow?.qcCategories || []} />
  </>);
}
