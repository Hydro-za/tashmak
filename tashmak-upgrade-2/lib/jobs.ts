import type { SupabaseClient } from '@supabase/supabase-js';

export const PRIO_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export const sortJobs = (a: any, b: any) => (PRIO_RANK[a.priority] - PRIO_RANK[b.priority]) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || String(a.created_at).localeCompare(String(b.created_at));

export type Staff = { id: string; full_name: string; role: string; active: boolean; deleted: boolean; role_name: string; can_design: boolean; can_produce: boolean; can_qc: boolean };
/** Everyone, including deactivated/deleted people (so history keeps their names). */
export async function staffDirectory(sb: SupabaseClient): Promise<Staff[]> { const { data } = await sb.rpc('staff_directory_v2'); return (data || []) as Staff[]; }
export async function staffNames(sb: SupabaseClient): Promise<Record<string, string>> {
  const rows = await staffDirectory(sb); return Object.fromEntries(rows.map(d => [d.id, d.full_name + (d.deleted ? ' (removed)' : '')]));
}

export async function loadJobBundle(sb: SupabaseClient, id: string) {
  const { data: job } = await sb.from('jobs').select('*').eq('id', id).maybeSingle();
  if (!job) return null;
  const [items, asg, act, notes, files, supplied, qc, names] = await Promise.all([
    sb.from('job_items').select('*').eq('job_id', id).order('position'), sb.from('job_assignments').select('*').eq('job_id', id).eq('active', true),
    sb.from('job_activity').select('*').eq('job_id', id).order('created_at', { ascending: false }), sb.from('job_notes').select('*').eq('job_id', id).order('created_at', { ascending: false }),
    sb.from('file_attachments').select('*').eq('job_id', id).is('archived_at', null).order('created_at', { ascending: false }),
    sb.from('customer_supplied_items').select('*').eq('job_id', id).order('received_at', { ascending: false }), sb.from('qc_checks').select('*').eq('job_id', id).order('created_at', { ascending: false }), staffNames(sb)]);
  const fl = files.data || []; const urls: Record<string, string> = {};
  if (fl.length) { const { data: signed } = await sb.storage.from('job-files').createSignedUrls(fl.map((f: any) => f.storage_path), 3600); (signed || []).forEach((s: any, i: number) => { if (s.signedUrl) urls[fl[i].id] = s.signedUrl; }); }
  return { job, items: items.data || [], assignments: asg.data || [], activity: act.data || [], notes: notes.data || [], files: fl, urls, supplied: supplied.data || [], qc: qc.data || [], names };
}

/** A job is "mine to work on" while it is in a stage my permissions cover. */
export function isMine(perms: string[], status: string) {
  const d = perms.includes('jobs.work_design'), p = perms.includes('jobs.work_production'), q = perms.includes('qc.perform');
  if (d && ['design', 'design_review'].includes(status)) return true;
  if (p && ['queued', 'in_production', 'rework'].includes(status)) return true;
  if (q && status === 'qc') return true;
  return !d && !p && !q ? ['design', 'design_review', 'queued', 'in_production', 'rework', 'qc'].includes(status) : false;
}
