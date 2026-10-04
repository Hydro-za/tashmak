import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { Top, Empty } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function Employees() {
  const { sb } = await requireOwner();
  const [{ data: profiles }, { data: load }] = await Promise.all([sb.from('profiles').select('*').neq('role', 'owner').order('full_name'), sb.rpc('employee_workload')]);
  const w = Object.fromEntries((load || []).map((l: any) => [l.user_id, l]));
  return (<><Top title="Employees"><Link href="/employees/new" className="btn primary">+ New employee</Link></Top>
    {!profiles?.length ? <Empty text="No employees yet. Employees cannot create their own accounts — you add them here." action={<Link className="btn primary" href="/employees/new">Add an employee</Link>} /> :
      <div className="card"><div className="tblwrap"><table className="tbl"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th className="r">Active jobs</th><th className="r">Overdue</th><th className="r">Completed</th><th>Status</th></tr></thead><tbody>
        {profiles.map((p: any) => <tr key={p.id} className={p.active ? '' : 'muted'}><td><Link href={'/employees/' + p.id}><b>{p.full_name}</b></Link></td><td>{p.username}</td><td style={{ textTransform: 'capitalize' }}>{p.role}</td><td className="r">{w[p.id]?.active_jobs ?? 0}</td><td className="r">{w[p.id]?.overdue_jobs ?? 0}</td><td className="r">{w[p.id]?.completed_jobs ?? 0}</td><td>{p.active ? <span className="badge b-accepted">Active</span> : <span className="badge b-rejected">Deactivated</span>}</td></tr>)}</tbody></table></div></div>}</>);
}
