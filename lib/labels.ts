export const JOB_STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: 'Queued', tone: 'draft' }, design: { label: 'Design', tone: 'sent' }, design_review: { label: 'Design review', tone: 'expired' },
  in_production: { label: 'In production', tone: 'sent' }, qc: { label: 'QC', tone: 'expired' }, rework: { label: 'Rework', tone: 'rejected' },
  completed: { label: 'Completed', tone: 'accepted' }, ready_collection: { label: 'Ready for collection', tone: 'accepted' }, ready_delivery: { label: 'Ready for delivery', tone: 'accepted' },
  collected: { label: 'Collected', tone: 'converted' }, delivered: { label: 'Delivered', tone: 'converted' }, ready_invoice: { label: 'Ready for invoice', tone: 'converted' }, cancelled: { label: 'Cancelled', tone: 'rejected' }
};
export const QUOTE_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'draft' }, sent: { label: 'Sent', tone: 'sent' }, accepted: { label: 'Accepted', tone: 'accepted' },
  declined: { label: 'Declined', tone: 'rejected' }, converted: { label: 'Converted to Job', tone: 'converted' }, cancelled: { label: 'Cancelled', tone: 'rejected' }
};
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const FINAL_JOB = ['completed', 'ready_collection', 'ready_delivery', 'collected', 'delivered', 'ready_invoice', 'cancelled'];
export const QUEUE: { key: string; label: string; statuses: string[] }[] = [
  { key: 'waiting', label: 'Waiting', statuses: ['queued'] },
  { key: 'design', label: 'Design', statuses: ['design', 'design_review'] },
  { key: 'production', label: 'Production', statuses: ['in_production', 'rework'] },
  { key: 'qc', label: 'QC', statuses: ['qc'] },
  { key: 'ready', label: 'Ready', statuses: ['completed', 'ready_collection', 'ready_delivery'] }
];
export const money = (v: any) => { const n = Number(v || 0); return (n < 0 ? '-' : '') + 'R' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const sa = (d: any, o: Intl.DateTimeFormatOptions) => new Date(d).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', ...o });
export const fmtDate = (d: any) => d ? sa(String(d).length === 10 ? d + 'T12:00:00' : d, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (d: any) => d ? sa(d, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtTime = (d: any) => d ? sa(d, { hour: '2-digit', minute: '2-digit' }) : '';
export const todaySA = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
export function overdueDays(due: string | null, status: string) {
  if (!due || FINAL_JOB.includes(status)) return 0;
  const t = todaySA(); if (due >= t) return 0;
  return Math.round((new Date(t + 'T00:00:00Z').getTime() - new Date(due + 'T00:00:00Z').getTime()) / 86400000);
}
const ERR: Record<string, string> = {
  forbidden: 'You do not have permission to do that.', not_authenticated: 'Your session has expired — please sign in again.', quote_locked: 'This quote is accepted and can no longer be edited.',
  version_conflict: 'Someone else changed this just now. Reload and try again.', invalid_transition: 'That step is not available for the job\'s current status — refresh to see the latest.',
  due_date_in_past: 'The due date cannot be in the past.', designer_required: 'Choose a designer when design is required.', production_employee_required: 'Choose at least one production employee.',
  quote_not_accepted: 'The quote must be accepted first.', note_required: 'A note is required.', reason_required: 'A reason is required.', confirm_required: 'Confirmation is required because production has already started.',
  username_taken: 'That username is already in use.', invalid_username: 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.', password_too_short: 'Password must be at least 8 characters.',
  customer_required: 'Choose a customer.', quote_needs_items: 'Add at least one item.', invalid_quantities: 'Those quantities are not valid.', completed_exceeds_ordered: 'Completed quantity cannot exceed the ordered quantity.',
  job_archived: 'This job is archived.', last_owner: 'At least one active owner is required.', one_designer_only: 'Only one designer can be assigned.', invalid_employee_for_stage: 'That employee cannot be assigned to this stage.'
};
export function friendlyError(e: any): string {
  const msg: string = (e && (e.message || e.error_description || String(e))) || 'Something went wrong';
  for (const k of Object.keys(ERR)) if (msg.includes(k)) return ERR[k];
  if (/duplicate key/i.test(msg)) return 'That already exists.';
  if (/violates check constraint/i.test(msg)) return 'One of the values is not allowed.';
  if (/permission denied|row-level security/i.test(msg)) return 'You do not have permission to do that.';
  if (/fetch failed|network/i.test(msg)) return 'Could not reach the server. Check your connection and try again.';
  return 'Could not complete that: ' + msg.slice(0, 160);
}
