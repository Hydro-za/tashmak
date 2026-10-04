import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { Top, StatusBadge, Overdue } from '@/components/ui';
import CustomerForm from '@/components/CustomerForm';
import ActionButton from '@/components/ActionButton';
import { archiveRecord } from '@/lib/actions';
import { money, fmtDate } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function CustomerPage({ params, searchParams }: { params: { id: string }; searchParams: { edit?: string } }) {
  const { sb } = await requireOwner();
  const { data: c } = await sb.from('customers').select('*').eq('id', params.id).maybeSingle(); if (!c) notFound();
  const [{ data: quotes }, { data: jobs }] = await Promise.all([
    sb.from('quotes').select('id,number,status,quote_date,total').eq('customer_id', c.id).order('created_at', { ascending: false }),
    sb.from('jobs').select('id,number,status,due_date,fulfilment,fulfilled_at,created_at').eq('customer_id', c.id).order('created_at', { ascending: false })]);
  const active = (jobs || []).filter((j: any) => !['completed', 'ready_collection', 'ready_delivery', 'collected', 'delivered', 'ready_invoice', 'cancelled'].includes(j.status));
  const done = (jobs || []).filter((j: any) => !active.includes(j));
  return (<>
    <Top title={c.name} sub={c.company}><Link href="/customers" className="btn">← Customers</Link><Link href={'/quotes/new?customer=' + c.id} className="btn primary">+ New quote</Link>{!searchParams.edit && <Link href={'?edit=1'} className="btn">Edit</Link>}
      <ActionButton className="btn ghost" label={c.archived_at ? 'Restore' : 'Archive'} action={archiveRecord} args={['customer', c.id, !c.archived_at]} confirmText={c.archived_at ? undefined : 'Archive this customer? Their history is kept.'} /></Top>
    {searchParams.edit ? <CustomerForm c={c} /> : <div className="card"><div className="grid g2"><div><div className="lbl">Phone</div>{c.phone || '—'}</div><div><div className="lbl">Email</div>{c.email || '—'}</div><div><div className="lbl">Address</div><div style={{ whiteSpace: 'pre-wrap' }}>{c.address || '—'}</div></div></div>
      {c.notes && <div className="alert info" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}><b>Customer notes:</b> {c.notes}</div>}</div>}
    <div className="card"><h2>Quotes ({quotes?.length || 0})</h2>{(quotes || []).map((q: any) => <div className="linkrow" key={q.id}><Link href={'/quotes/' + q.id}><b>{q.number}</b> · {fmtDate(q.quote_date)}</Link><span><StatusBadge kind="quote" status={q.status} /> {money(q.total)}</span></div>) || null}{!quotes?.length && <p className="muted">No quotes yet.</p>}</div>
    <div className="card"><h2>Active jobs ({active.length})</h2>{active.map((j: any) => <div className="linkrow" key={j.id}><Link href={'/jobs/' + j.id}><b>{j.number}</b> · due {fmtDate(j.due_date)} <Overdue due={j.due_date} status={j.status} /></Link><StatusBadge status={j.status} /></div>)}{!active.length && <p className="muted">None.</p>}</div>
    <div className="card"><h2>Completed work, collection & delivery ({done.length})</h2>{done.map((j: any) => <div className="linkrow" key={j.id}><Link href={'/jobs/' + j.id}><b>{j.number}</b>{j.fulfilled_at ? ` · ${j.fulfilment === 'delivery' ? 'delivered' : 'collected'} ${fmtDate(j.fulfilled_at)}` : ''}</Link><StatusBadge status={j.status} /></div>)}{!done.length && <p className="muted">None yet.</p>}</div>
  </>);
}
