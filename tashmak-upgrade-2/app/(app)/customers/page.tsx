import Link from 'next/link';
import { requirePerm } from '@/lib/session';
import { Top, Empty } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function Customers({ searchParams }: { searchParams: { q?: string; archived?: string } }) {
  const me = await requirePerm('customers.view', 'customers.manage'); const sb = me.sb;
  let query = sb.from('customers').select('id,name,company,phone,email,archived_at').order('name').limit(500);
  query = searchParams.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data } = await query; const t = (searchParams.q || '').trim().toLowerCase();
  const rows = (data || []).filter((c: any) => !t || [c.name, c.company, c.phone, c.email].join(' ').toLowerCase().includes(t));
  return (<>
    <Top title="Customers">{me.can('customers.manage') && <Link href="/customers/new" className="btn primary">+ New customer</Link>}</Top>
    <form className="card" style={{ display: 'flex', gap: 8 }}><input name="q" defaultValue={searchParams.q || ''} placeholder="Search name, company, phone, email" style={{ flex: 1 }} /><button className="btn">Search</button></form>
    <div className="chips"><Link className={!searchParams.archived ? 'on' : ''} href="/customers">Active</Link><Link className={searchParams.archived ? 'on' : ''} href="/customers?archived=1">Archived</Link></div>
    {!rows.length ? <Empty text="No customers found." action={<Link className="btn primary" href="/customers/new">Add a customer</Link>} /> :
      <div className="card"><div className="tblwrap"><table className="tbl"><thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Email</th></tr></thead><tbody>{rows.map((c: any) => <tr key={c.id}><td><Link href={'/customers/' + c.id}><b>{c.name}</b></Link></td><td>{c.company}</td><td>{c.phone}</td><td>{c.email}</td></tr>)}</tbody></table></div></div>}
  </>);
}
