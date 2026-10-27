import Link from 'next/link';
import { requirePerm } from '@/lib/session';
import { Top } from '@/components/ui';
import CreateJobForm from '@/components/CreateJobForm';
import { staffDirectory } from '@/lib/jobs';
import { money, fmtDate, todaySA } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function NewJob() {
  const me = await requirePerm('jobs.manage'); const sb = me.sb;
  const [dir, { data: customers }, { data: ss }, { data: quotes }] = await Promise.all([staffDirectory(sb),
    me.can('customers.view') ? sb.from('customers').select('id,name,company').is('archived_at', null).order('name') : Promise.resolve({ data: [] as any[] }),
    sb.from('system_settings').select('key,value').in('key', ['jobs', 'workflow']),
    me.isOwner ? sb.from('quotes').select('id,number,quote_date,total,customers(name,company)').eq('status', 'accepted').is('job_id', null).is('archived_at', null).order('accepted_at', { ascending: false }) : Promise.resolve({ data: [] as any[] })]);
  const s = Object.fromEntries((ss || []).map((r: any) => [r.key, r.value]));
  const d = new Date(todaySA() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + Number(s.jobs?.defaultDueDays ?? 7));
  const live = dir.filter(e => e.active && !e.deleted);
  return (<><Top title="New job" sub="Create a job directly, or start one from an accepted quote" />
    {!!quotes?.length && <div className="card"><h2>Accepted quotes waiting for a job</h2>{quotes.map((q: any) => <div className="linkrow" key={q.id}><span><b>{q.number}</b> · {q.customers?.name}{q.customers?.company ? ' — ' + q.customers.company : ''} · {fmtDate(q.quote_date)} · {money(q.total)}</span><Link className="btn primary sm" href={'/quotes/' + q.id + '/start-job'}>START JOB</Link></div>)}</div>}
    {!customers?.length ? <div className="alert warn">You need permission to view customers (and at least one customer) before creating a job directly.</div> :
      <CreateJobForm customers={customers} designers={live.filter(e => e.can_design)} producers={live.filter(e => e.can_produce)} defaultDue={d.toISOString().slice(0, 10)} defaultPriority={s.jobs?.defaultPriority || 'normal'} defaultApproval={!!s.workflow?.designApprovalDefault} />}</>);
}
