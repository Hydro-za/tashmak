import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { Top, StatusBadge, PrioBadge, Overdue } from '@/components/ui';
import { EmployeeAdmin } from '@/components/EmployeeForms';
import Timeline from '@/components/Timeline';
import { staffNames } from '@/lib/jobs';
import { FINAL_JOB, fmtDate } from '@/lib/labels';
export const dynamic = 'force-dynamic';
export default async function EmployeePage({ params }: { params: { id: string } }) {
  const { sb } = await requireOwner();
  const { data: e } = await sb.from('profiles').select('*').eq('id', params.id).maybeSingle(); if (!e || e.role === 'owner') notFound();
  const [{ data: asg }, { data: act }, names] = await Promise.all([sb.from('job_assignments').select('stage, jobs(id,number,customer_name,status,priority,due_date)').eq('user_id', e.id).eq('active', true),
    sb.from('job_activity').select('*').eq('user_id', e.id).order('created_at', { ascending: false }).limit(40), staffNames(sb)]);
  const jobs = (asg || []).map((a: any) => ({ ...a.jobs, stage: a.stage })).filter((j: any) => j.id);
  const active = jobs.filter((j: any) => !FINAL_JOB.includes(j.status)); const done = jobs.filter((j: any) => FINAL_JOB.includes(j.status));
  const row = (j: any) => <div className="linkrow" key={j.id + j.stage}><Link href={'/jobs/' + j.id}><b>{j.number}</b> · {j.customer_name} <Overdue due={j.due_date} status={j.status} /></Link><span><PrioBadge p={j.priority} /> <StatusBadge status={j.status} /> {fmtDate(j.due_date)}</span></div>;
  return (<><Top title={e.full_name} sub={e.role + ' · ' + e.username}><Link href="/employees" className="btn">← Employees</Link></Top><EmployeeAdmin e={e} />
    <div className="card"><h2>Assigned jobs ({active.length})</h2>{active.map(row)}{!active.length && <p className="muted">Nothing active.</p>}</div>
    <div className="card"><h2>Completed jobs ({done.length})</h2>{done.map(row)}{!done.length && <p className="muted">None yet.</p>}</div>
    <div className="card"><h2>Recent activity</h2><Timeline events={act || []} names={names} /></div></>);
}
