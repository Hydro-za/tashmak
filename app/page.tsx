import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/session';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const { profile } = await requireMe();
  redirect(profile.role === 'owner' ? '/dashboard' : '/my-jobs');
}
