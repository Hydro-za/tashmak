import { redirect } from 'next/navigation';
import { requireMe, homeFor } from '@/lib/session';
export const dynamic = 'force-dynamic';
export default async function Home() { const me = await requireMe(); redirect(homeFor(me)); }
