import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePerm } from '@/lib/session';
import { loadJobBundle, staffDirectory } from '@/lib/jobs';
import { Top, JobStatus, QcBadge, PrioBadge, DueFlag } from '@/components/ui';
import ActionButton from '@/components/ActionButton';
import Timeline from '@/components/Timeline';
import JobWorkOrder from '@/components/JobWorkOrder';
import JobManage from '@/components/JobManage';
import NoteBox from '@/components/NoteBox';
import AutoRefresh from '@/components/AutoRefresh';
import QcPanel from '@/components/QcPanel';
import { jobAction, archiveRecord } from '@/lib/actions';
import { JOB_STATUS, fmtDate } from '@/lib/labels';
import JobInvoicePanel from '@/components/JobInvoicePanel';

export const dynamic = 'force-dynamic';
export default async function JobPage({ params }: { params: { id: string } }) {
  const me = await requirePerm('jobs.view_all'); const sb = me.sb; const canManage = me.can('jobs.manage');
  const b = await loadJobBundle(sb, params.id); if (!b) notFound();
  const { job, items, assignments, names } = b;
  const [staff, { data: cust }, { data: quote }] = await Promise.all([staffDirectory(sb),
    me.can('customers.view') ? sb.from('customers').select('id,name,notes,phone').eq('id', job.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    me.isOwner && job.quote_id ? sb.from('quotes').select('id,number').eq('id', job.quote_id).maybeSingle() : Promise.resolve({ data: null })]);
  const live = staff.filter(e => e.active && !e.deleted); const designers = live.filter(e => e.can_design); const producers = live.filter(e => e.can_produce);
  const ids = (stage: string) => assignments.filter((a: any) => a.stage === stage).map((a: any) => a.user_id);
  const s = job.status; const final = ['completed', 'ready_collection', 'ready_delivery', 'collected', 'delivered', 'ready_invoice', 'cancelled'].includes(s);
  const title = job.title || items.map((i: any) => i.product_name).slice(0, 2).join(', ') || job.number;
  const invoiceEligible = me.isOwner && ['collected', 'delivered', 'ready_invoice'].includes(s);
  let invoiceSnapshot: any = null; let invoiceRows: any[] = []; let invoiceEvents: any[] = [];
  if (invoiceEligible) {
    const [snapshotResult, rowsResult, eventsResult] = await Promise.all([sb.rpc('invoice_job_snapshot', { p_job_id: job.id }), sb.from('job_invoices').select('*').eq('job_id', job.id).order('version', { ascending: false }).limit(1), sb.from('job_invoice_events').select('*').eq('job_id', job.id).order('performed_at', { ascending: false }).limit(20)]);
    invoiceSnapshot = snapshotResult.data; invoiceRows = rowsResult.data || []; invoiceEvents = eventsResult.data || [];
  }
  const currentInvoice = invoiceRows[0] || null;
  const hasQc = items.some((i: any) => i.requires_qc) || job.qc_status !== 'not_checked' || s === 'qc';
  const A = (label: string, action: string, cls = 'btn', extra: any = {}) => <ActionButton key={action + label} className={cls} label={label} action={jobAction} args={[job.id, action]} {...extra} />;
  return (<>
    <AutoRefresh seconds={45} />
    <Top title={title} sub={<><b>{job.number}</b> · <JobStatus job={job} /> <span className="muted">({(JOB_STATUS[s] || { label: s }).label})</span> {hasQc && <QcBadge status={job.qc_status} />} <PrioBadge p={job.priority} /> {!final && <DueFlag due={job.due_date} status={s} />} · {cust ? <Link href={'/customers/' + job.customer_id}>{job.customer_name}</Link> : job.customer_name}{quote ? <> · <Link href={'/quotes/' + quote.id}>Quote {quote.number}</Link></> : null}</>}>
      <Link href="/jobs" className="btn">← Jobs</Link>{quote && me.isOwner && <Link href={'/quotes/' + quote.id + '/duplicate'} className="btn">Create repeat job</Link>}
    </Top>
    {cust?.notes && <div className="alert info" style={{ whiteSpace: 'pre-wrap' }}><b>Customer note:</b> {cust.notes}</div>}
    {canManage && <div className="card job-progress-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <b>Next steps</b>
      {s === 'design_review' && <>{A('APPROVE DESIGN', 'design_approve', 'btn primary', { successText: 'Design approved' })}{A('Send back for changes', 'design_reject', 'btn danger', { askNote: 'What needs to change?', noteRequired: true })}</>}
      {s === 'qc' && <span className="muted">Awaiting quality check — record it in the Quality check box below.</span>}
      {['completed', 'ready_collection', 'ready_delivery'].includes(s) && <>{A('READY FOR COLLECTION', 'ready_collection', s === 'ready_collection' ? 'btn primary' : 'btn')}{A('READY FOR DELIVERY', 'ready_delivery', s === 'ready_delivery' ? 'btn primary' : 'btn')}</>}
      {s === 'ready_collection' && A('COLLECTED', 'collected', 'btn primary', { askNote: 'Collected by / notes (optional)', successText: 'Marked collected' })}
      {s === 'ready_delivery' && A('DELIVERED', 'delivered', 'btn primary', { askNote: 'Delivery notes (optional)', successText: 'Marked delivered' })}
      {['collected', 'delivered'].includes(s) && me.isOwner && <span className="badge b-converted">Ready for invoice</span>}
      {s === 'ready_invoice' && <span className="badge b-converted">Ready for invoice</span>}
      {s === 'cancelled' && <span className="muted">Cancelled{job.cancel_reason ? ': ' + job.cancel_reason : ''}</span>}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {final && A('Reopen job', 'reopen_queued', 'btn', { askNote: 'Reason for reopening (required)', noteRequired: true, successText: 'Job reopened' })}
        {final && job.design_required && A('Reopen to design', 'reopen_design', 'btn sm', { askNote: 'Reason (required)', noteRequired: true })}
        {!final && s !== 'cancelled' && A('Cancel job', 'cancel', 'btn danger sm', { askNote: 'Why is this job being cancelled?', noteRequired: true })}
        {me.isOwner && ['ready_invoice', 'cancelled'].includes(s) && <ActionButton className="btn ghost sm" label={job.archived_at ? 'Restore' : 'Archive'} action={archiveRecord} args={['job', job.id, !job.archived_at]} confirmText={job.archived_at ? undefined : 'Archive this job? It stays under archived records.'} />}
      </span>
    </div>}
    {invoiceEligible && <JobInvoicePanel snapshot={invoiceSnapshot} invoice={currentInvoice} events={invoiceEvents || []} />}
    <div className="split"><div>
      <div className="card"><h2>Work order</h2>
        <div className="grid g3" style={{ marginBottom: 12 }}>
          <div><div className="lbl">Due</div><b>{fmtDate(job.due_date)}</b></div><div><div className="lbl">Designer</div>{job.design_required ? (ids('design').map((i: string) => names[i]).join(', ') || <span className="overdue">not assigned</span>) : <span className="muted">no design</span>}</div>
          <div><div className="lbl">Production</div>{ids('production').map((i: string) => names[i]).join(', ') || <span className="overdue">not assigned</span>}</div></div>
        <JobWorkOrder b={b} canProgress={canManage && ['in_production', 'rework', 'qc', 'queued'].includes(s)} /></div>
      {hasQc && <div className="card"><h2>Quality check</h2><QcPanel jobId={job.id} status={s} qcStatus={job.qc_status} checkedBy={job.qc_checked_by ? names[job.qc_checked_by] || null : null} checkedAt={job.qc_checked_at} note={job.qc_note} canCheck={me.can('qc.perform')} awaiting={s === 'qc'} /></div>}
      <div className="card"><h2>Internal notes</h2>{canManage && <NoteBox jobId={job.id} />}{b.notes.map((n: any) => <div className="linkrow" key={n.id}><span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span><span className="muted" style={{ whiteSpace: 'nowrap' }}>{names[n.user_id] || 'Someone'}</span></div>)}{!b.notes.length && !canManage && <p className="muted">No notes.</p>}</div>
    </div><div>
      {canManage && <div className="card"><h2>Manage</h2><JobManage job={job} designers={designers} producers={producers} designerIds={ids('design')} producerIds={ids('production')} /></div>}
      
      <div className="card"><h2>Timeline</h2><Timeline events={[...b.activity].reverse()} names={names} /></div>
    </div></div>
  </>);
}
