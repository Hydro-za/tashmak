'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Creates overdue-job reminders at most once per hour per browser. The database
 * function is responsible for avoiding duplicate reminders for each job/day. */
export default function OverdueCheck() {
  const router = useRouter();

  useEffect(() => {
    const key = 'overdue-check';
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 60 * 60 * 1000) return;

    sessionStorage.setItem(key, String(Date.now()));
    void createClient()
      .rpc('generate_overdue_notifications')
      .then(({ data, error }) => {
        if (!error && data && Number(data) > 0) router.refresh();
      });
  }, [router]);

  return null;
}
