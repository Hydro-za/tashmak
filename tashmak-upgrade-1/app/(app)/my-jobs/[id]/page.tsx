import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireEmployee } from '@/lib/session';
import { loadJobBundle } from '@/lib/jobs';
import { PrioBadge, Overdue, StatusBadge } from '@/components/ui';
import ActionButton from '@/components/ActionButton';
import JobWorkOrder from '@/components/JobWorkOrder';
import JobFiles from '@/components/JobFiles';
import FileUploader from '@/components/FileUploader';
import NoteBox from '@/components/NoteBox';
import Timeline from '@/components/Timeline';
import AutoRefresh from '@/components/AutoRefresh';
import { SuppliedForm } from '@/components/JobForms';
import { jobAction } from '@/lib/actions';
import { fmtDate, fmtDateTime } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export default async function MyJob({ params }: { params: { id: string } }) {
  const { sb, profile } = await requireEmployee();
  const b = await loadJobBundle(sb, params.id); if (!b) notFound();
  const { job, items, names } = b; const s = job.status; const isDes = profile.role === 'designer';
  const finals = b.files.filter((f: any) => f.is_final);
  const itemNames = Object.fromEntries(items.map((i: any) => [i.id, i.product_name]));
  const itemOpts = items.map((i: any) => ({ id: i.id, name: i.product_name }));
  const btn = (label: string, action: string, cls = 'bigbtn') => <ActionButton className={cls} label={label} pendingLabel="Please wait…" action={jobAction} args={[job.id, action]} successText={label.toLowerCase().includes('complete') ? 'Saved — well done' : 'Started'} />;
  return (<>
    <AutoRefresh seconds={30} />
    <Link href="/my-jobs" className="btn ghost sm">← My Jobs</Link>
    <div className="card" style={{ marginTop: 8, borderLeft: '8px solid ' + (job.priority === 'urgent' ? 'var(--bad)' : job.priority === 'high' ? 'var(--warn)' : 'var(--line)') }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h1>{job.number}</h1><span><PrioBadge p={job.priority} /> <StatusBadge status={s} /></span></div>
      <div style={{ fontSize: 16, marginTop: 4 }}><b>{job.customer_name}</b></div>
      <div className="muted" style={{ marginTop: 4 }}>Due <b>{fmtDate(job.due_date)}</b> <Overdue due={job.due_date} status={s} /></div>
      {isDes && s === 'design' && (!job.design_started_at ? btn('START DESIGN', 'design_start') : btn('DESIGN COMPLETE', 'design_complete', 'bigbtn ok'))}
      {isDes && s === 'design_review' && <div className="alert info" style={{ marginTop: 10 }}>Design sent — waiting for the Owner to approve it.</div>}
      {!isDes && ['queued', 'rework'].includes(s) && (finals.length === 0 && b.files.some((f: any) => ['artwork', 'design', 'print_ready', 'dtf_artwork'].includes(f.kind)) ? <div className="alert warn" style={{ marginTop: 10 }}>No file is marked FINAL yet — check with the Owner before printing.</div> : null)}
      {!isDes && ['queued', 'rework'].includes(s) && btn(s === 'rework' ? 'RESTART PRODUCTION (REWORK)' : 'START PRODUCTION', 'production_start')}
      {!isDes && s === 'in_production' && btn('PRODUCTION COMPLETE', 'production_complete', 'bigbtn ok')}
      {!isDes && s === 'qc' && <div className="alert info" style={{ marginTop: 10 }}>Production is complete — waiting for quality check.</div>}
      {!isDes && s === 'design' && <div className="alert info" style={{ marginTop: 10 }}>Waiting for design to finish. You will be notified when it is ready.</div>}
    </div>
    {finals.length > 0 && <div className="alert ok"><b>FINAL / PRODUCTION READY FILE:</b> {finals.map((f: any) => <a key={f.id} href={b.urls[f.id]} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}><b>{f.file_name}</b> (v{f.version})</a>)}</div>}
    <JobWorkOrder b={b} canProgress={!isDes && ['in_production', 'rework'].includes(s)} />
    <div className="card"><h2>Files</h2><JobFiles jobId={job.id} files={b.files} urls={b.urls} names={names} canFinal={isDes} itemNames={itemNames} productionStarted={!!job.production_started_at} />
      <div style={{ marginTop: 14 }}><FileUploader jobId={job.id} items={itemOpts} kinds={isDes ? ['design', 'print_ready', 'dtf_artwork', 'artwork', 'reference', 'logo', 'other'] : ['photo', 'production', 'reference', 'garment_ref', 'other']} /></div></div>
    {!isDes && <div className="card"><h2>Customer-supplied items received</h2><SuppliedForm jobId={job.id} items={itemOpts} /></div>}
    <div className="card"><h2>Notes</h2><NoteBox jobId={job.id} />{b.notes.map((n: any) => <div className="linkrow" key={n.id}><span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span><span className="muted" style={{ whiteSpace: 'nowrap' }}>{names[n.user_id] || 'Someone'} · {fmtDateTime(n.created_at)}</span></div>)}</div>
    <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Job history</summary><div style={{ marginTop: 10 }}><Timeline events={[...b.activity].reverse()} names={names} /></div></details>
  </>);
}
