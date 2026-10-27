import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Perm = 'jobs.view_all' | 'jobs.manage' | 'jobs.work_design' | 'jobs.work_production' | 'customers.view' | 'customers.manage' | 'employees.view' | 'employees.manage' | 'roles.manage' | 'qc.perform' | 'salary.view' | 'salary.manage' | 'labour.manage' | 'settings.manage' | 'notifications.manage' | 'reports.view';

/** One auth + profile + permission lookup per request (layout and page share it). */
export const getMe = cache(async () => {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: pm }] = await Promise.all([sb.from('profiles').select('*').eq('id', user.id).maybeSingle(), sb.rpc('my_permissions')]);
  if (!profile || !profile.active || profile.deleted_at) return null;
  const perms: string[] = (pm && pm.permissions) || [];
  const isOwner = profile.role === 'owner';
  return { sb, user, profile, perms, roleName: (pm && pm.role_name) || profile.role, isOwner, can: (p: Perm) => isOwner || perms.includes(p) };
});
export async function requireMe() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.profile.must_change_password) redirect('/change-password');
  return me;
}
export async function requireOwner() {
  const me = await requireMe();
  if (!me.isOwner) redirect(me.can('jobs.view_all') ? '/dashboard' : '/my-jobs');
  return me;
}
/** Passes when the user holds ANY of the listed permissions (owners always pass). */
export async function requirePerm(...ps: Perm[]) {
  const me = await requireMe();
  if (!ps.some(p => me.can(p))) redirect(me.can('jobs.view_all') ? '/dashboard' : '/my-jobs');
  return me;
}
export async function requireEmployee() {
  const me = await requireMe();
  if (me.isOwner) redirect('/dashboard');
  return me;
}
/** Where a signed-in person lands. */
export const homeFor = (me: { isOwner: boolean; can: (p: Perm) => boolean }) => (me.isOwner || me.can('jobs.view_all')) ? '/dashboard' : '/my-jobs';
