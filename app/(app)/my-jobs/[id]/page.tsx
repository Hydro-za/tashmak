import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireEmployee } from '@/lib/session';
import { loadJobBundle } from '@/lib/jobs';
import { PrioBadge, JobStatus, QcBadge, DueFlag } from '@/components/ui';
import JobWorkOrder from '@/components/JobWorkOrder';
import NoteBox from '@/components/NoteBox';
import Timeline from '@/components/Timeline';
import AutoRefresh from '@/components/AutoRefresh';
import QcPanel from '@/components/QcPanel';
import JobProgressActions from '@/components/JobProgressActions';
import { fmtDate, JOB_STATUS } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export default async function MyJob({ params }: { params: { id: string } }) {
  const me = await requireEmployee(); const sb = me.sb;
  const b = await loadJobBundle(sb, params.id); if (!b) notFound();
  const { job, items, names } = b; const s = job.status;
  const mine = b.assignments.filter((a: any) => a.user_id === me.user.id && a.active !== false).map((a: any) => a.stage);
  const isDes = mine.includes('design'); const isProd = mine.includes('production');
  const canQc = me.can('qc.perform'); const hasQc = items.some((i: any) => i.requires_qc) || job.qc_status !== 'not_checked' || s === 'qc';
  const finals = b.files.filter((f: any) => f.is_final);
  const title = job.title || items.map((i: any) => i.product_name).slice(0, 2).join(', ') || job.number;
  const { data: customer } = isDes && job.customer_id ? await sb.from('customers').select('notes').eq('id', job.customer_id).maybeSingle() : { data: null };
  return (<>
    <AutoRefresh seconds={30} />
    <Link href="/my-jobs" className="btn ghost sm">← My Jobs</Link>
    <div className="card job-progress-actions" style={{ marginTop: 8, borderLeft: '8px solid ' + (job.priority === 'urgent' ? 'var(--bad)' : job.priority === 'high' ? 'var(--warn)' : 'var(--line)') }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h1>{title}</h1><span><PrioBadge p={job.priority} /> <JobStatus job={job} /></span></div>
      <div className="muted">{job.number} · <b>{job.customer_name}</b> · {(JOB_STATUS[s] || { label: s }).label}</div>
      <div className="muted" style={{ marginTop: 4 }}>Due <b>{fmtDate(job.due_date)}</b> <DueFlag due={job.due_date} status={s} /> {hasQc && <QcBadge status={job.qc_status} />}</div>
      {isDes && s === 'design' && <div className="alert info" style={{ marginTop: 10 }}><b>Designer instructions:</b> Review all information and notes supplied by the customer before beginning the design. Use those details as the design brief.</div>}
      {isDes && customer?.notes && <div className="alert info" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}><b>Customer information for design:</b> {customer.notes}</div>}
      {isDes && s === 'design_review' && <div className="alert info" style={{ marginTop: 10 }}>Design sent — waiting for approval.</div>}
      {s === 'qc' && !canQc && <div className="alert info" style={{ marginTop: 10 }}>Production is complete — waiting for the quality check.</div>}
      {s === 'design' && !isDes && <div className="alert info" style={{ marginTop: 10 }}>Waiting for design to finish. You will be notified when it is ready.</div>}
    </div>
    <JobProgressActions job={job} canDesign={isDes} canProduction={isProd} hasArtwork={false} hasFinal={false} />
    {job.qc_status === 'not_passed' && job.qc_note && ['rework', 'in_production'].includes(s) && <div className="alert bad"><b>Did not pass the quality check:</b> {job.qc_note}</div>}
    <JobWorkOrder b={b} canProgress={isProd && ['in_production', 'rework', 'queued'].includes(s)} />
    {hasQc && (canQc || s === 'qc' || job.qc_status !== 'not_checked') && <div className="card"><h2>Quality check</h2><QcPanel jobId={job.id} status={s} qcStatus={job.qc_status} checkedBy={job.qc_checked_by ? names[job.qc_checked_by] || null : null} checkedAt={job.qc_checked_at} note={job.qc_note} canCheck={canQc} awaiting={s === 'qc'} /></div>}
    <div className="card"><h2>Notes</h2><NoteBox jobId={job.id} />{b.notes.map((n: any) => <div className="linkrow" key={n.id}><span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span><span className="muted" style={{ whiteSpace: 'nowrap' }}>{names[n.user_id] || 'Someone'}</span></div>)}</div>
    <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Job history</summary><div style={{ marginTop: 10 }}><Timeline events={[...b.activity].reverse()} names={names} /></div></details>
  </>);
}
