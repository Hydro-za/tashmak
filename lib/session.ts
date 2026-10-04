import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function getMe() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile || !profile.active) return null;
  return { sb, user, profile };
}
export async function requireMe() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.profile.must_change_password) redirect('/change-password');
  return me;
}
export async function requireOwner() {
  const me = await requireMe();
  if (me.profile.role !== 'owner') redirect('/my-jobs');
  return me;
}
export async function requireEmployee() {
  const me = await requireMe();
  if (me.profile.role === 'owner') redirect('/dashboard');
  return me;
}
