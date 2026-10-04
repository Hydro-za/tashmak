import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { Top, Empty } from '@/components/ui';
import { money, fmtDate } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function NewJob() {
  const { sb } = await requireOwner();
  const { data } = await sb.from('quotes').select('id,number,quote_date,total,customers(name,company)').eq('status', 'accepted').is('job_id', null).is('archived_at', null).order('accepted_at', { ascending: false });
  return (<><Top title="New job" sub="Every job starts from an accepted quote" />
    {!data?.length ? <Empty text="No accepted quotes are waiting for a job." action={<div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><Link className="btn primary" href="/quotes/new">Create a quote</Link><Link className="btn" href="/quotes">Open quotes</Link></div>} /> :
      <div className="card"><h2>Accepted quotes waiting for a job</h2>{data.map((q: any) => <div className="linkrow" key={q.id}><span><b>{q.number}</b> · {q.customers?.name}{q.customers?.company ? ' — ' + q.customers.company : ''} · {fmtDate(q.quote_date)} · {money(q.total)}</span><Link className="btn primary sm" href={'/quotes/' + q.id + '/start-job'}>START JOB</Link></div>)}</div>}</>);
}
