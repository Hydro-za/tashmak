import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireEmployee } from '@/lib/session';
import { loadJobBundle } from '@/lib/jobs';
import { PrioBadge, JobStatus, QcBadge, DueFlag } from '@/components/ui';
import ActionButton from '@/components/ActionButton';
import JobWorkOrder from '@/components/JobWorkOrder';
import JobFiles from '@/components/JobFiles';
import FileUploader from '@/components/FileUploader';
import NoteBox from '@/components/NoteBox';
import Timeline from '@/components/Timeline';
import AutoRefresh from '@/components/AutoRefresh';
import QcPanel from '@/components/QcPanel';
import { SuppliedForm } from '@/components/JobForms';
import { jobAction } from '@/lib/actions';
import JobProgressActions from '@/components/JobProgressActions';
import { fmtDate, JOB_STATUS } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export default async function MyJob({ params }: { params: { id: string } }) {
  const me = await requireEmployee(); const sb = me.sb;
  const b = await loadJobBundle(sb, params.id); if (!b) notFound();
  const { job, items, names } = b; const s = job.status;
  const mine = b.assignments.filter((a: any) => a.user_id === me.user.id).map((a: any) => a.stage);
  const isDes = mine.includes('design'); const isProd = mine.includes('production') || (!isDes && me.can('jobs.manage'));
  const canQc = me.can('qc.perform'); const hasQc = items.some((i: any) => i.requires_qc) || job.qc_status !== 'not_checked' || s === 'qc';
  const finals = b.files.filter((f: any) => f.is_final);
  const itemNames = Object.fromEntries(items.map((i: any) => [i.id, i.product_name]));
  const itemOpts = items.map((i: any) => ({ id: i.id, name: i.product_name }));
  const title = job.title || items.map((i: any) => i.product_name).slice(0, 2).join(', ') || job.number;
  const kinds = [...(isDes ? ['design', 'print_ready', 'dtf_artwork', 'artwork', 'reference', 'logo'] : []), ...(isProd || !isDes ? ['photo', 'production', 'reference', 'garment_ref'] : []), 'other'];
  return (<>
    <AutoRefresh seconds={30} />
    <Link href="/my-jobs" className="btn ghost sm">← My Jobs</Link>
    <div className="card job-progress-actions" style={{ marginTop: 8, borderLeft: '8px solid ' + (job.priority === 'urgent' ? 'var(--bad)' : job.priority === 'high' ? 'var(--warn)' : 'var(--line)') }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h1>{title}</h1><span><PrioBadge p={job.priority} /> <JobStatus job={job} /></span></div>
      <div className="muted">{job.number} · <b>{job.customer_name}</b> · {(JOB_STATUS[s] || { label: s }).label}</div>
      <div className="muted" style={{ marginTop: 4 }}>Due <b>{fmtDate(job.due_date)}</b> <DueFlag due={job.due_date} status={s} /> {hasQc && <QcBadge status={job.qc_status} />}</div>
      {isDes && s === 'design_review' && <div className="alert info" style={{ marginTop: 10 }}>Design sent — waiting for approval.</div>}
      {s === 'qc' && !canQc && <div className="alert info" style={{ marginTop: 10 }}>Production is complete — waiting for the quality check.</div>}
      {s === 'design' && !isDes && <div className="alert info" style={{ marginTop: 10 }}>Waiting for design to finish. You will be notified when it is ready.</div>}
    </div>
    <JobProgressActions job={job} canDesign={isDes} canProduction={isProd} hasArtwork={b.files.some((f: any) => ['artwork', 'design', 'print_ready', 'dtf_artwork'].includes(f.kind))} hasFinal={finals.length > 0} />
    {job.qc_status === 'not_passed' && job.qc_note && ['rework', 'in_production'].includes(s) && <div className="alert bad"><b>Did not pass the quality check:</b> {job.qc_note}</div>}
    {finals.length > 0 && <div className="alert ok"><b>FINAL / PRODUCTION READY FILE:</b> {finals.map((f: any) => <a key={f.id} href={b.urls[f.id]} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}><b>{f.file_name}</b> (v{f.version})</a>)}</div>}
    <JobWorkOrder b={b} canProgress={isProd && ['in_production', 'rework'].includes(s)} />
    {hasQc && (canQc || s === 'qc' || job.qc_status !== 'not_checked') && <div className="card"><h2>Quality check</h2><QcPanel jobId={job.id} status={s} qcStatus={job.qc_status} checkedBy={job.qc_checked_by ? names[job.qc_checked_by] || null : null} checkedAt={job.qc_checked_at} note={job.qc_note} canCheck={canQc} awaiting={s === 'qc'} /></div>}
    <div className="card"><h2>Files</h2><JobFiles jobId={job.id} files={b.files} urls={b.urls} names={names} canFinal={isDes || me.can('jobs.manage')} itemNames={itemNames} productionStarted={!!job.production_started_at} />
      <div style={{ marginTop: 14 }}><FileUploader jobId={job.id} items={itemOpts} kinds={kinds} /></div></div>
    {isProd && <div className="card"><h2>Customer-supplied items received</h2><SuppliedForm jobId={job.id} items={itemOpts} /></div>}
    <div className="card"><h2>Notes</h2><NoteBox jobId={job.id} />{b.notes.map((n: any) => <div className="linkrow" key={n.id}><span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span><span className="muted" style={{ whiteSpace: 'nowrap' }}>{names[n.user_id] || 'Someone'}</span></div>)}</div>
    <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Job history</summary><div style={{ marginTop: 10 }}><Timeline events={[...b.activity].reverse()} names={names} /></div></details>
  </>);
}
