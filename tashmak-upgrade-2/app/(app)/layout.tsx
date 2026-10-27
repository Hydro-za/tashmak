import { requireMe } from '@/lib/session';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const { count } = await me.sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', me.user.id).is('read_at', null);
  return <Shell name={me.profile.full_name} roleName={me.roleName} isOwner={me.isOwner} perms={me.perms} unread={count || 0}>{children}</Shell>;
}
