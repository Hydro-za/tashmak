'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { jobAction as runJobAction } from '@/lib/actions';

export async function assignedJobAction(jobId: string, action: string, note?: string | null) {
  if (action === 'design_start' || action === 'production_start') {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'Please sign in again.' };
    const stage = action === 'design_start' ? 'design' : 'production';
    const { data, error } = await sb.from('job_assignments').select('id')
      .eq('job_id', jobId).eq('user_id', user.id).eq('stage', stage).eq('active', true).limit(1);
    if (error) return { ok: false, error: 'Could not verify this job assignment.' };
    if (!data?.length) return { ok: false, error: 'Only the employee assigned to this stage can accept and start this job.' };
  }
  const result = await runJobAction(jobId, action, note);
  revalidatePath('/jobs/' + jobId);
  revalidatePath('/my-jobs');
  return result;
}
