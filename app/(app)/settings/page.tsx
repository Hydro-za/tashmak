import { requirePerm } from '@/lib/session';
import { Top } from '@/components/ui';
import { SettingsCard, BusinessCard } from '@/components/SettingsForms';
import { fmtDateTime } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function Settings() {
  const me = await requirePerm('settings.manage'); const sb = me.sb;
  const [{ data: ss }, { data: cats }, { data: audit }] = await Promise.all([sb.from('system_settings').select('key,value'), sb.from('product_categories').select('name').order('name'), sb.from('config_audit').select('*').order('created_at', { ascending: false }).limit(40)]);
  const s = Object.fromEntries((ss || []).map((r: any) => [r.key, r.value]));
  const num: any[] = [{ k: 'prefix', l: 'Prefix', t: 'text' }, { k: 'yearFormat', l: 'Year in number', t: 'select', opts: [['none', 'None'], ['YYYY', '2026'], ['YY', '26']] }, { k: 'separator', l: 'Separator', t: 'text' }, { k: 'length', l: 'Digits', t: 'int' }, { k: 'startNumber', l: 'Start / next number at least', t: 'int', help: 'Numbers always go up and are never reused.' }];
  return (<><Top title="Settings" sub="Pricing, materials, products and VAT live under Products & Pricing" />
    <BusinessCard value={s.business || {}} />
    <SettingsCard skey="quotes" title="Quotes" value={s.quotes || {}} preview fields={[...num, { k: 'expiryDays', l: 'Quote valid for (days)', t: 'int' }, { k: 'paymentTerms', l: 'Payment terms', t: 'area' }, { k: 'terms', l: 'Terms & conditions', t: 'area' }, { k: 'defaultNotes', l: 'Default customer notes', t: 'area' }]} />
    <SettingsCard skey="jobs" title="Jobs" value={s.jobs || {}} preview fields={[...num, { k: 'defaultPriority', l: 'Default priority', t: 'select', opts: [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']] }, { k: 'defaultDueDays', l: 'Default due date (days after start)', t: 'int' }]} />
    <SettingsCard skey="workflow" title="Workflow" value={s.workflow || { designApprovalDefault: false, qcCategories: [] }} cats={(cats || []).map((c: any) => c.name)} fields={[{ k: 'designApprovalDefault', l: 'Owner must approve designs before production (default for new jobs)', t: 'check' }, { k: 'qcCategories', l: 'Categories that need a quality check by default', t: 'cats', help: 'You can still switch QC on or off per item when starting a job.' }]} />
    <SettingsCard skey="notifications" title="Notifications" value={s.notifications || { inApp: true }} fields={[{ k: 'inApp', l: 'In-app notifications (the bell). Phone push notifications are not part of this version.', t: 'check' }]} />
    <div className="card"><h2>Recent configuration changes</h2>{(audit || []).map((a: any) => <div className="linkrow" key={a.id}><span>{a.action} — {a.table_name}{a.record_id ? ' · ' + a.record_id : ''}</span><span className="muted">{fmtDateTime(a.created_at)}</span></div>)}{!audit?.length && <p className="muted">No changes yet.</p>}</div></>);
}
