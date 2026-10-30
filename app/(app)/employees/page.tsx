import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { Top, Empty } from '@/components/ui';
import RoleManager from '@/components/RoleManager';
import OwnerManager from '@/components/OwnerManager';
export const dynamic = 'force-dynamic';
export default async function Employees({ searchParams }: { searchParams: { tab?: string } }) {
  const { sb } = await requireOwner();
  const tab = ['roles', 'owners'].includes(searchParams.tab || '') ? searchParams.tab! : 'employees';
  const [{ data: profiles }, { data: load }, { data: roles }, { data: permissionRows }, { data: rolePerms }, { data: owners }] = await Promise.all([
    sb.from('profiles').select('*,roles(name)').neq('role', 'owner').order('full_name'),
    sb.rpc('employee_workload'),
    sb.from('roles').select('id,name,description,is_owner,is_system').order('name'),
    sb.rpc('valid_permissions'),
    sb.from('role_permissions').select('role_id,permission'),
    sb.from('profiles').select('id,full_name,username,active,created_at').eq('role', 'owner').is('deleted_at', null).order('created_at')
  ]);
  const w = Object.fromEntries((load || []).map((l: any) => [l.user_id, l]));
  const permissions = (permissionRows || []).map((x: any) => typeof x === 'string' ? x : (x.valid_permissions || x.permission)).filter(Boolean);
  const tabs = [{ id: 'employees', label: 'Employees' }, { id: 'roles', label: 'Roles & permissions' }, { id: 'owners', label: 'Owner accounts' }];
  return <div className="page-employees">
    <Top title="Employees" sub="Manage your team, access levels and owner accounts.">
      {tab === 'employees' && <Link href="/employees/new" className="btn primary">+ New employee</Link>}
    </Top>
    <nav className="workspace-tabs" aria-label="Employee management">
      {tabs.map(t => <Link key={t.id} href={t.id === 'employees' ? '/employees' : '/employees?tab=' + t.id} className={tab === t.id ? 'active' : ''}>{t.label}</Link>)}
    </nav>
    {tab === 'employees' ? (!profiles?.length ? <Empty text="No employees yet. Employees cannot create their own accounts — you add them here." action={<Link className="btn primary" href="/employees/new">Add an employee</Link>} /> :
      <div className="card"><div className="tblwrap"><table className="tbl"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th className="r">Active jobs</th><th className="r">Overdue</th><th className="r">Completed</th><th>Status</th></tr></thead><tbody>
        {profiles.map((p: any) => <tr key={p.id} className={p.active ? '' : 'muted'}><td><Link href={'/employees/' + p.id}><b>{p.full_name}</b></Link></td><td>{p.username}</td><td>{p.roles?.name || 'Unassigned role'}</td><td className="r">{w[p.id]?.active_jobs ?? 0}</td><td className="r">{w[p.id]?.overdue_jobs ?? 0}</td><td className="r">{w[p.id]?.completed_jobs ?? 0}</td><td>{p.active ? <span className="badge b-accepted">Active</span> : <span className="badge b-rejected">Deactivated</span>}</td></tr>)}</tbody></table></div></div>) :
      tab === 'roles' ? <RoleManager roles={roles || []} permissions={permissions} rolePerms={rolePerms || []} /> :
      <OwnerManager owners={owners || []} />}
  </div>;
}
