import { requireMe } from '@/lib/session';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { sb, user, profile } = await requireMe();
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null);
  return <Shell role={profile.role} name={profile.full_name} unread={count || 0}>{children}</Shell>;
}
