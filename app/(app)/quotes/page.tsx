import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { Top, StatusBadge, Empty } from '@/components/ui';
import { QUOTE_STATUS, money, fmtDate } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export default async function Quotes({ searchParams }: { searchParams: { q?: string; status?: string; archived?: string } }) {
  const { sb } = await requireOwner();
  let query = sb.from('quotes').select('id,number,status,quote_date,valid_until,total,archived_at,customers(name,company),job_id').order('created_at', { ascending: false }).limit(300);
  if (searchParams.status && QUOTE_STATUS[searchParams.status]) query = query.eq('status', searchParams.status);
  query = searchParams.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data } = await query; const term = (searchParams.q || '').trim().toLowerCase();
  const rows = (data || []).filter((r: any) => !term || [r.number, r.customers?.name, r.customers?.company].join(' ').toLowerCase().includes(term));
  const chip = (label: string, params: Record<string, string>, on: boolean) => <Link key={label} className={on ? 'on' : ''} href={{ pathname: '/quotes', query: { ...(searchParams.q ? { q: searchParams.q } : {}), ...params } }}>{label}</Link>;
  return (<>
    <Top title="Quotes"><Link href="/quotes/new" className="btn primary">+ New quote</Link></Top>
    <form className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input name="q" defaultValue={searchParams.q || ''} placeholder="Quote number or customer" style={{ flex: 1, minWidth: 200 }} />{searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}<button className="btn">Search</button></form>
    <div className="chips">{chip('All', {}, !searchParams.status && !searchParams.archived)}{Object.entries(QUOTE_STATUS).map(([k, v]) => chip(v.label, { status: k }, searchParams.status === k))}{chip('Archived', { archived: '1' }, !!searchParams.archived)}</div>
    {!rows.length ? <Empty text="No quotes found." action={<Link className="btn primary" href="/quotes/new">Create a quote</Link>} /> :
      <div className="card"><div className="tblwrap"><table className="tbl"><thead><tr><th>Quote</th><th>Customer</th><th>Date</th><th>Valid until</th><th>Status</th><th className="r">Total</th></tr></thead><tbody>
        {rows.map((r: any) => <tr key={r.id} className="click"><td><Link href={'/quotes/' + r.id}><b>{r.number}</b></Link></td><td>{r.customers?.name}{r.customers?.company ? <div className="muted">{r.customers.company}</div> : null}</td><td>{fmtDate(r.quote_date)}</td><td>{fmtDate(r.valid_until)}</td><td><StatusBadge kind="quote" status={r.status} /></td><td className="r">{money(r.total)}</td></tr>)}
      </tbody></table></div></div>}
  </>);
}
