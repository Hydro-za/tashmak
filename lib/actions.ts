'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { friendlyError } from '@/lib/labels';
import { buildSpec } from '@/lib/spec';
import { sendJobAssignedEmails, sendJobCompletedEmails, sendPasswordResetEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';

type R = { ok: boolean; error?: string; noop?: boolean; data?: any };
const ok = (data?: any, noop?: boolean): R => ({ ok: true, data, noop });
const fail = (e: any): R => ({ ok: false, error: friendlyError(e) });
async function rpc(fn: string, args: any): Promise<R> {
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc(fn, args);
    if (error) return fail(error);
    return ok(data, !!(data && data.noop));
  } catch (e) { return fail(e); }
}

/* ---------- quotes ---------- */
export async function setQuoteStatus(quoteId: string, status: string, note?: string | null): Promise<R> {
  const r = await rpc('set_quote_status', { p_quote: quoteId, p_status: status, p_note: note || null });
  revalidatePath('/quotes'); revalidatePath('/quotes/' + quoteId); return r;
}
export async function archiveRecord(kind: 'quote' | 'job' | 'customer', id: string, archive = true): Promise<R> {
  const r = await rpc('archive_record', { p_kind: kind, p_id: id, p_archive: archive });
  revalidatePath('/', 'layout'); return r;
}

export async function startJob(input: { quoteId: string; dueDate: string | null; priority: string; designRequired: boolean; designApproval: boolean; designerId: string | null; productionIds: string[]; instructions: string; qc: Record<string, boolean> }): Promise<R> {
  try {
    const sb = createClient();
    const [{ data: qi, error: e1 }, { data: mats }, { data: fins }] = await Promise.all([
      sb.from('quote_items').select('*').eq('quote_id', input.quoteId).order('position'),
      sb.from('materials').select('id,name,data'), sb.from('finishing_options').select('id,name,data')]);
    if (e1 || !qi?.length) return fail(e1 || new Error('quote_needs_items'));
    const ctx = { materials: Object.fromEntries((mats || []).map((m: any) => [m.id, { ...m.data, name: m.name }])), finishing: Object.fromEntries((fins || []).map((f: any) => [f.id, { ...f.data, name: f.name }])) };
    const items = qi.map((q: any) => ({
      quote_item_id: q.id, product_name: q.product_name, category_name: q.category_name, profile: q.profile, qty_ordered: q.quantity,
      spec: buildSpec({ ...q.item, profile: q.profile }, ctx), instructions: q.item?.notes || null, requires_qc: !!input.qc[q.id]
    }));
    const r = await rpc('start_job', { p_quote: input.quoteId, p_due: input.dueDate || null, p_priority: input.priority, p_design_required: input.designRequired, p_design_approval: input.designApproval,
      p_designer: input.designRequired ? input.designerId : null, p_production: input.productionIds, p_items: items, p_instructions: input.instructions || null });
    revalidatePath('/jobs'); revalidatePath('/quotes/' + input.quoteId); return r;
  } catch (e) { return fail(e); }
}

/* ---------- jobs ---------- */
async function notifyJobCompleted(jobId: string, completedBy: string) {
  const sb = createAdminClient();
  const [{ data: job }, { data: employee }] = await Promise.all([
    sb.from('jobs').select('number,title,customer_name,customer_id').eq('id', jobId).maybeSingle(),
    sb.from('profiles').select('full_name,username').eq('id', completedBy).maybeSingle()
  ]);
  if (!job) return;
  let customerName = job.customer_name || 'Customer';
  if (!job.customer_name && job.customer_id) {
    const { data: customer } = await sb.from('customers').select('name').eq('id', job.customer_id).maybeSingle();
    customerName = customer?.name || customerName;
  }
  await sendJobCompletedEmails({
    jobNumber: job.number, jobTitle: job.title || 'Production job', customerName,
    employeeName: employee?.full_name || 'Tashmak team member', employeeId: employee?.username || '',
    jobUrl: (process.env.NEXT_PUBLIC_APP_URL || 'https://tashmak-system.vercel.app') + '/jobs/' + jobId
  });
}
export async function jobAction(jobId: string, action: string, note?: string | null): Promise<R> {
  const r = await rpc('job_action', { p_job: jobId, p_action: action, p_note: note || null });
  if (r.ok && !r.noop && action === 'production_complete' && r.data?.status === 'completed') {
    try { const sb = createClient(); const { data: { user } } = await sb.auth.getUser(); if (user?.id) await notifyJobCompleted(jobId, user.id); }
    catch (e) { console.error('Job completion email failed', e); }
  }
  revalidatePath('/jobs/' + jobId); revalidatePath('/my-jobs'); return r;
}
export async function assignJob(jobId: string, stage: string, userIds: string[]): Promise<R> {
  const r = await rpc('job_assign', { p_job: jobId, p_stage: stage, p_users: userIds });
  if (r.ok && !r.noop && userIds.length) {
    const sb = createClient();
    const [{data: job},{data: customer},{data: employees}] = await Promise.all([
      sb.from('jobs').select('number,title,customer_name,customer_id,instructions').eq('id',jobId).maybeSingle(),
      sb.from('jobs').select('customer_id').eq('id',jobId).maybeSingle().then(async x=>x.data?.customer_id?sb.from('customers').select('name').eq('id',x.data.customer_id).maybeSingle():{data:null}),
      sb.from('profiles').select('id,full_name,username,recovery_email').in('id',userIds).eq('active',true)
    ]);
    if (job && employees?.length) await sendJobAssignedEmails(employees.filter((e:any)=>e.recovery_email).map((e:any)=>({email:e.recovery_email,name:e.full_name,employeeId:e.username})),{jobNumber:job.number,jobTitle:job.title||'Production job',customerName:job.customer_name||customer?.name||'Customer',description:job.instructions||'Please review the job details in Tashmak System.',assignedBy:'Tashmak System',jobUrl:(process.env.NEXT_PUBLIC_APP_URL||'https://tashmak-system.vercel.app')+'/jobs/'+jobId});
  }
  revalidatePath('/jobs/' + jobId); return r;
}
export async function updateJobDetails(jobId: string, patch: any, expectedVersion?: number): Promise<R> {
  const r = await rpc('job_update_details', { p_job: jobId, p_patch: patch, p_expected_version: expectedVersion ?? null }); revalidatePath('/jobs/' + jobId); return r;
}
export async function addNote(jobId: string, note: string): Promise<R> {
  if (!note || !note.trim()) return { ok: false, error: 'Write a note first.' };
  if (note.length > 2000) return { ok: false, error: 'Notes are limited to 2000 characters.' };
  const r = await rpc('add_job_note', { p_job: jobId, p_note: note.trim() }); revalidatePath('/jobs/' + jobId); revalidatePath('/my-jobs/' + jobId); return r;
}
export async function recordQc(jobId: string, itemId: string | null, result: string, checked: number, rejected: number, notes: string): Promise<R> {
  const r = await rpc('record_qc', { p_job: jobId, p_item: itemId, p_result: result, p_checked: checked, p_rejected: rejected, p_notes: notes || null });
  if (r.ok && r.data?.status === 'completed') {
    try { const sb = createClient(); const { data: { user } } = await sb.auth.getUser(); if (user?.id) await notifyJobCompleted(jobId, user.id); }
    catch (e) { console.error('Job completion email failed', e); }
  }
  revalidatePath('/jobs/' + jobId); return r;
}
export async function setQcResult(jobId: string, result: 'passed' | 'not_passed', note?: string | null): Promise<R> {
  if (!['passed', 'not_passed'].includes(result)) return { ok: false, error: 'Choose Passed or Not Passed.' };
  if (note && note.length > 500) return { ok: false, error: 'Keep the note under 500 characters.' };
  const r = await rpc('set_qc_result', { p_job: jobId, p_result: result, p_note: note || null }); revalidatePath('/jobs/' + jobId); revalidatePath('/my-jobs/' + jobId); return r;
}
export async function createJob(i: { customerId: string; title: string; dueDate: string | null; priority: string; designRequired: boolean; designApproval: boolean; designerId: string | null; productionIds: string[]; instructions: string; items: { product_name: string; qty_ordered: number; details: string; requires_qc: boolean }[] }): Promise<R> {
  if (!i.customerId) return { ok: false, error: 'Choose a customer.' };
  if (!Array.isArray(i.items) || !i.items.length) return { ok: false, error: 'Add at least one item.' };
  for (const [n, it] of i.items.entries()) { if (!it.product_name?.trim()) return { ok: false, error: `Item ${n + 1}: enter what is being made.` }; if (!(Number(it.qty_ordered) > 0)) return { ok: false, error: `Item ${n + 1}: quantity must be more than zero.` }; }
  if (i.title && i.title.length > 120) return { ok: false, error: 'Keep the job name under 120 characters.' };
  const r = await rpc('create_job', { p_customer: i.customerId, p_title: i.title || null, p_due: i.dueDate || null, p_priority: i.priority, p_design_required: i.designRequired, p_design_approval: i.designApproval,
    p_designer: i.designRequired ? i.designerId : null, p_production: i.productionIds, p_items: i.items.map(x => ({ product_name: x.product_name.trim(), qty_ordered: Number(x.qty_ordered), details: x.details || '', requires_qc: !!x.requires_qc })), p_instructions: i.instructions || null });
  revalidatePath('/jobs'); return r;
}
export async function updateProgress(jobId: string, itemId: string, inProd: number, completed: number, rejected: number, rework: number): Promise<R> {
  const r = await rpc('update_item_progress', { p_item: itemId, p_in_production: inProd, p_completed: completed, p_rejected: rejected, p_rework: rework }); revalidatePath('/jobs/' + jobId); revalidatePath('/my-jobs/' + jobId); return r;
}
export async function recordSupplied(jobId: string, itemId: string | null, description: string, qty: number, condition: string, notes: string): Promise<R> {
  const r = await rpc('record_supplied_item', { p_job: jobId, p_item: itemId, p_description: description, p_qty: qty, p_condition: condition || null, p_notes: notes || null }); revalidatePath('/jobs/' + jobId); revalidatePath('/my-jobs/' + jobId); return r;
}
export async function registerFile(jobId: string, itemId: string | null, kind: string, path: string, name: string, mime: string, size: number): Promise<R> {
  const r = await rpc('register_file', { p_job: jobId, p_quote: null, p_customer: null, p_item: itemId, p_kind: kind, p_path: path, p_name: name, p_mime: mime, p_size: size }); revalidatePath('/jobs/' + jobId); revalidatePath('/my-jobs/' + jobId); return r;
}
export async function setFinalFile(jobId: string, fileId: string, confirm?: boolean | string, reason?: string): Promise<R> {
  const r = await rpc('set_final_file', { p_file: fileId, p_confirm: confirm === true, p_reason: reason || null }); revalidatePath('/jobs/' + jobId); revalidatePath('/my-jobs/' + jobId); return r;
}
export async function markNotificationsRead(ids?: string[]): Promise<R> { const r = await rpc('mark_notifications_read', { p_ids: ids ?? null }); revalidatePath('/', 'layout'); return r; }

/* ---------- customers ---------- */
export async function saveCustomer(v: { id?: string; name: string; company?: string; phone?: string; email?: string; address?: string; notes?: string }): Promise<R> {
  const name = (v.name || '').trim();
  if (!name) return { ok: false, error: 'Customer name is required.' };
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return { ok: false, error: 'That email address does not look right.' };
  const row = { name, company: v.company?.trim() || null, phone: v.phone?.trim() || null, email: v.email?.trim() || null, address: v.address?.trim() || null, notes: v.notes?.trim() || null };
  try {
    const sb = createClient(); let res;
    if (v.id) res = await sb.from('customers').update(row).eq('id', v.id).select('id').single();
    else { const { data: { user } } = await sb.auth.getUser(); res = await sb.from('customers').insert({ ...row, created_by: user?.id }).select('id').single(); }
    if (res.error) { if (res.error.code === '23505') return { ok: false, error: 'A customer with that name and company already exists.' }; return fail(res.error); }
    revalidatePath('/customers'); return ok({ id: res.data.id });
  } catch (e) { return fail(e); }
}

/* ---------- employees (all privileged work happens inside the database) ---------- */
export async function createEmployee(v: { username: string; fullName: string; roleIds: string[]; password: string; email:string }): Promise<R> {
  const email=(v.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false,error:'Enter a valid employee email address.'};
  const r = await rpc('create_employee_multi', { p_username: v.username, p_full_name: v.fullName, p_role_ids: v.roleIds, p_password: v.password, p_recovery_email: email, p_phone: null }); revalidatePath('/employees'); return r;
}
export async function requestPasswordReset(email:string):Promise<R>{
  const address=(email||'').trim().toLowerCase();
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(address)) return {ok:false,error:'Enter a valid email address.'};
  try {
    const sb=createAdminClient();
    let profile:any=null;
    const {data:employee}=await sb.from('profiles').select('id,full_name,recovery_email').ilike('recovery_email',address).eq('active',true).maybeSingle();
    profile=employee;
    // Owners may have no recovery_email; their verified Auth email is their recovery address.
    if(!profile){
      for(let page=1;page<=20&&!profile;page++){
        const {data,error}=await sb.auth.admin.listUsers({page,perPage:1000});
        if(error) throw error;
        const matched=data.users.find((u:any)=>(u.email||'').toLowerCase()===address);
        if(matched){
          const {data:p}=await sb.from('profiles').select('id,full_name,recovery_email').eq('id',matched.id).eq('active',true).maybeSingle();
          profile=p;
        }
        if(data.users.length<1000) break;
      }
    }
    if(profile){
      const {data:userData,error:userError}=await sb.auth.admin.getUserById(profile.id);
      if(userError) throw userError;
      const authEmail=userData?.user?.email;
      if(authEmail){
        const {data:link,error}=await sb.auth.admin.generateLink({type:'recovery',email:authEmail,options:{redirectTo:(process.env.NEXT_PUBLIC_APP_URL||'https://tashmak-system.vercel.app')+'/auth/callback?next=/change-password'}});
        if(error) throw error;
        const actionUrl=link.properties?.action_link;
        if(actionUrl) await sendPasswordResetEmail(address,profile.full_name||'there',actionUrl);
      }
    }
    // Do not reveal whether an account exists.
    return ok();
  }catch(e){return fail(e);}
}
export async function resetEmployeePassword(userId: string, pw: string): Promise<R> { return rpc('reset_employee_password', { p_user: userId, p_password: pw }); }
export async function setEmployeeActive(userId: string, active: boolean): Promise<R> { const r = await rpc('set_employee_active', { p_user: userId, p_active: active }); revalidatePath('/employees'); return r; }
export async function updateEmployee(userId: string, fullName: string, roleIds: string[], phone: string, email:string): Promise<R> {
  const recovery=(email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recovery)) return {ok:false,error:'Enter a valid employee email address.'};
  const r = await rpc('update_employee_multi', { p_user: userId, p_full_name: fullName, p_role_ids: roleIds, p_phone: phone || null, p_recovery_email: recovery, p_clear_recovery: false }); revalidatePath('/employees'); revalidatePath('/employees/' + userId); revalidatePath('/dashboard'); return r;
}
export async function saveRole(id: string | null, name: string, description: string, permissions: string[]): Promise<R> { const r = await rpc('save_role', { p_id: id, p_name: name, p_description: description, p_perms: permissions }); revalidatePath('/roles'); revalidatePath('/employees'); return r; }
export async function deleteRole(id: string): Promise<R> { const r = await rpc('delete_role', { p_id: id }); revalidatePath('/roles'); revalidatePath('/employees'); return r; }
export async function createOwner(v: { email: string; username: string; fullName: string; password: string }): Promise<R> { const r = await rpc('create_owner', { p_email: v.email, p_username: v.username, p_full_name: v.fullName, p_password: v.password }); revalidatePath('/owners'); return r; }

export async function saveJobInvoice(jobId: string, invoiceNumber: string, verifiedTotal: number): Promise<R> { const r = await rpc('save_job_invoice', { p_job_id: jobId, p_invoice_number: invoiceNumber, p_verified_total: verifiedTotal }); revalidatePath('/invoices'); revalidatePath('/dashboard'); revalidatePath('/jobs'); revalidatePath('/jobs/' + jobId); return r; }
export async function markJobInvoiceSent(invoiceId: string): Promise<R> { const r = await rpc('mark_job_invoice_sent', { p_invoice_id: invoiceId }); revalidatePath('/invoices'); revalidatePath('/dashboard'); revalidatePath('/jobs'); return r; }
export async function cancelJobInvoice(invoiceId: string, reason: string): Promise<R> { const r = await rpc('cancel_job_invoice', { p_invoice_id: invoiceId, p_reason: reason }); revalidatePath('/invoices'); revalidatePath('/dashboard'); return r; }

/* ---------- settings ---------- */
const PRIOS = ['low', 'normal', 'high', 'urgent'];
function validateSetting(key: string, v: any): string | null {
  const str = (x: any, max: number) => typeof x === 'string' && x.length <= max;
  const intIn = (x: any, a: number, b: number) => Number.isInteger(x) && x >= a && x <= b;
  if (!v || typeof v !== 'object') return 'Invalid settings';
  if (key === 'business') { if (!str(v.name, 120) || !v.name.trim()) return 'Business name is required.'; for (const k of ['address', 'phone', 'email', 'website', 'regNo', 'vatNo']) if (!str(v[k] ?? '', 400)) return k + ' is too long.'; if (!str(v.logo ?? '', 400000)) return 'Logo image is too large.'; }
  if (key === 'quotes' || key === 'jobs') {
    if (!str(v.prefix ?? '', 10)) return 'Prefix is too long (max 10).'; if (!['YYYY', 'YY', 'none'].includes(v.yearFormat)) return 'Invalid year format.'; if (!str(v.separator ?? '', 3)) return 'Separator is too long.';
    if (!intIn(v.length, 1, 10)) return 'Digits must be 1–10.'; if (!intIn(v.startNumber, 1, 999999999)) return 'Start number must be 1 or more.';
  }
  if (key === 'quotes') { if (!intIn(v.expiryDays, 1, 365)) return 'Quote validity must be 1–365 days.'; if (!str(v.terms ?? '', 6000) || !str(v.paymentTerms ?? '', 2000) || !str(v.defaultNotes ?? '', 2000)) return 'Text is too long.'; }
  if (key === 'jobs') { if (!PRIOS.includes(v.defaultPriority)) return 'Invalid default priority.'; if (!intIn(v.defaultDueDays, 0, 365)) return 'Default due days must be 0–365.'; }
  if (key === 'workflow') { if (typeof v.designApprovalDefault !== 'boolean' || !Array.isArray(v.qcCategories) || v.qcCategories.some((c: any) => typeof c !== 'string')) return 'Invalid workflow settings.'; }
  if (key === 'notifications' && typeof v.inApp !== 'boolean') return 'Invalid notification settings.';
  return null;
}
export async function saveSystemSetting(key: string, value: any): Promise<R> {
  if (!['business', 'quotes', 'jobs', 'workflow', 'notifications'].includes(key)) return { ok: false, error: 'Unknown setting.' };
  const bad = validateSetting(key, value); if (bad) return { ok: false, error: bad };
  try {
    const sb = createClient(); const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('system_settings').update({ value, updated_by: user?.id }).eq('key', key);
    if (error) return fail(error); revalidatePath('/settings'); return ok();
  } catch (e) { return fail(e); }
}

/* ---------- demo catalogue (placeholder pricing, clearly marked) ---------- */
export async function loadDemoCatalogue(): Promise<R> {
  try {
    const sb = createClient();
    const { count } = await sb.from('products').select('id', { count: 'exact', head: true });
    if (count && count > 0) return { ok: false, error: 'Products already exist — demo data was not loaded.' };
    const mod: any = await import('@/calculator/seed.js'); const seed = (mod.makeSeed || mod.default?.makeSeed)();
    const tables: [string, any[]][] = [['product_categories', seed.categories], ['materials', seed.materials], ['machines', seed.machines], ['labour_types', seed.labour], ['finishing_options', seed.finishing], ['products', seed.products]];
    for (const [t, rows] of tables) {
      const { error } = await sb.from(t).upsert(rows.map((r: any) => ({ id: r.id, name: r.name, data: r })), { onConflict: 'id' });
      if (error) return fail(error);
    }
    const s = seed.settings; await sb.from('pricing_settings').update({ data: { demo: true, pricing: s.pricing, calc: s.calc, vat: s.vat, discount: s.discount } }).eq('id', 1);
    revalidatePath('/products'); return ok();
  } catch (e) { return fail(e); }
}

/* ---------- quote saving (the calculator hands over the finished quote; the database function stores it atomically) ---------- */
const num = (x: any) => typeof x === 'number' && Number.isFinite(x);
export async function saveQuoteAction(input: { customerId: string; requestId: string; quote: any; items: any[] }): Promise<R> {
  try {
    const { quote: q, items } = input;
    if (!input.customerId) return { ok: false, error: 'Choose a customer first.' };
    if (!Array.isArray(items) || !items.length) return { ok: false, error: 'Add at least one item.' };
    if (JSON.stringify(input).length > 900_000) return { ok: false, error: 'This quote is too large to save.' };
    if (!q || !q.totals || !num(q.totals.total) || q.totals.total < 0) return { ok: false, error: 'The quote total is not valid.' };
    for (const [i, it] of items.entries()) {
      if (!it.product_name || !num(it.quantity) || it.quantity <= 0 || !num(it.unit_price) || it.unit_price < 0 || !num(it.line_total) || it.line_total < 0) return { ok: false, error: `Line ${i + 1} has invalid values.` };
    }
    const sb = createClient(); let copiedFrom: string | null = null;
    if (!q.id && q.copied_from_number) { const { data } = await sb.from('quotes').select('id').eq('number', q.copied_from_number).maybeSingle(); copiedFrom = data?.id || null; }
    const pq: any = { customer_id: input.customerId, quote_date: q.quote_date, valid_until: q.valid_until || '', reference: q.reference, notes: q.notes, terms: q.terms, payment_terms: q.payment_terms,
      discount: q.discount || {}, pricing_snapshot: q.pricing_snapshot || {}, totals: q.totals };
    if (q.id) { pq.id = q.id; if (q.expected_version) pq.expected_version = q.expected_version; } else { pq.client_request_id = input.requestId; if (copiedFrom) pq.copied_from = copiedFrom; }
    const { data, error } = await sb.rpc('save_quote', { p_quote: pq, p_items: items });
    if (error) return fail(error);
    revalidatePath('/quotes'); revalidatePath('/customers'); return ok(data);
  } catch (e) { return fail(e); }
}
