'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
/** Creates the "job is overdue" reminders at most once per hour per browser (the database makes it once per job per day). */
export default function OverdueCheck() {
  const router = useRouter();
  useEffect(() => {
    const last = Number(sessionStorage.getItem('overdue-check') || 0); if (Date.now() - last < 3600_000) return;
    sessionStorage.setItem('overdue-check', String(Date.now()));
    createClient().rpc('generate_overdue_notifications').then(({ data }) => { if (data && Number(data) > 0) router.refresh(); });
  }, [router]);
  return null;
}
