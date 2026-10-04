import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { loadJobBundle } from '@/lib/jobs';
import { Top, StatusBadge, PrioBadge, Overdue } from '@/components/ui';
import ActionButton from '@/components/ActionButton';
import Timeline from '@/components/Timeline';
import JobWorkOrder from '@/components/JobWorkOrder';
import JobManage from '@/components/JobManage';
import JobFiles from '@/components/JobFiles';
import FileUploader from '@/components/FileUploader';
import NoteBox from '@/components/NoteBox';
import AutoRefresh from '@/components/AutoRefresh';
import { QcForm, SuppliedForm } from '@/components/JobForms';
import { jobAction, archiveRecord } from '@/lib/actions';
import { fmtDate, fmtDateTime } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export default async function JobPage({ params }: { params: { id: string } }) {
  const { sb } = await requireOwner();
  const b = await loadJobBundle(sb, params.id); if (!b) notFound();
  const { job, items, assignments, names } = b;
  const [{ data: dir }, { data: cust }, { data: quote }, { data: qcs }] = await Promise.all([sb.rpc('staff_directory'),
    sb.from('customers').select('id,name,notes,phone').eq('id', job.customer_id).maybeSingle(), job.quote_id ? sb.from('quotes').select('id,number').eq('id', job.quote_id).maybeSingle() : Promise.resolve({ data: null }), sb.from('qc_checks').select('id').eq('job_id', job.id)]);
  const emps = (dir || []).filter((e: any) => e.active); const designers = emps.filter((e: any) => e.role === 'designer'); const producers = emps.filter((e: any) => e.role === 'production');
  const ids = (stage: string) => assignments.filter((a: any) => a.stage === stage).map((a: any) => a.user_id);
  const s = job.status; const final = ['completed', 'ready_collection', 'ready_delivery', 'collected', 'delivered', 'ready_invoice', 'cancelled'].includes(s);
  const itemNames = Object.fromEntries(items.map((i: any) => [i.id, i.product_name])); const qcItems = items.filter((i: any) => i.requires_qc).map((i: any) => ({ id: i.id, name: i.product_name, ordered: Number(i.qty_ordered) }));
  const prodStarted = !!job.production_started_at;
  const A = (label: string, action: string, cls = 'btn', extra: any = {}) => <ActionButton key={action + label} className={cls} label={label} action={jobAction} args={[job.id, action]} {...extra} />;
  return (<>
    <AutoRefresh seconds={25} />
    <Top title={'Job ' + job.number} sub={<><StatusBadge status={s} /> <PrioBadge p={job.priority} /> {!final && <Overdue due={job.due_date} status={s} />} · <Link href={'/customers/' + job.customer_id}>{job.customer_name}</Link>{quote ? <> · <Link href={'/quotes/' + quote.id}>Quote {quote.number}</Link></> : null}</>}>
      <Link href="/jobs" className="btn">← Jobs</Link>{quote && <Link href={'/quotes/' + quote.id + '/duplicate'} className="btn">Create repeat job</Link>}
    </Top>
    {cust?.notes && <div className="alert info" style={{ whiteSpace: 'pre-wrap' }}><b>Customer note:</b> {cust.notes}</div>}
    <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <b>Next step</b>
      {s === 'design_review' && <>{A('APPROVE DESIGN', 'design_approve', 'btn primary', { successText: 'Design approved' })}{A('Send back for changes', 'design_reject', 'btn danger', { askNote: 'What needs to change?', noteRequired: true })}</>}
      {s === 'design' && !job.design_started_at && <span className="muted">Waiting for the designer to start…</span>}
      {s === 'design' && job.design_started_at && <span className="muted">Designer is working on it…</span>}
      {s === 'queued' && <span className="muted">Waiting for production to start…</span>}
      {['in_production', 'rework'].includes(s) && <span className="muted">In production…</span>}
      {s === 'qc' && <span className="muted">Awaiting quality check — record it below.</span>}
      {['completed', 'ready_collection', 'ready_delivery'].includes(s) && <>{A('READY FOR COLLECTION', 'ready_collection', s === 'ready_collection' ? 'btn primary' : 'btn')}{A('READY FOR DELIVERY', 'ready_delivery', s === 'ready_delivery' ? 'btn primary' : 'btn')}</>}
      {s === 'ready_collection' && A('COLLECTED', 'collected', 'btn primary', { askNote: 'Collected by / notes (optional)', successText: 'Marked collected' })}
      {s === 'ready_delivery' && A('DELIVERED', 'delivered', 'btn primary', { askNote: 'Delivery notes (optional)', successText: 'Marked delivered' })}
      {['collected', 'delivered'].includes(s) && A('READY FOR INVOICE', 'ready_invoice', 'btn primary', { successText: 'Ready for invoice' })}
      {s === 'ready_invoice' && <span className="badge b-converted">Ready for you to invoice in your accounting software</span>}
      {s === 'cancelled' && <span className="muted">Cancelled{job.cancel_reason ? ': ' + job.cancel_reason : ''}</span>}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {final && A('Reopen job', 'reopen_queued', 'btn', { askNote: 'Reason for reopening (required)', noteRequired: true, successText: 'Job reopened' })}
        {final && job.design_required && A('Reopen to design', 'reopen_design', 'btn sm', { askNote: 'Reason (required)', noteRequired: true })}
        {!final && s !== 'cancelled' && A('Cancel job', 'cancel', 'btn danger sm', { askNote: 'Why is this job being cancelled?', noteRequired: true })}
        {['ready_invoice', 'cancelled'].includes(s) && <ActionButton className="btn ghost sm" label={job.archived_at ? 'Restore' : 'Archive'} action={archiveRecord} args={['job', job.id, !job.archived_at]} confirmText={job.archived_at ? undefined : 'Archive this job? It stays under archived records.'} />}
      </span>
    </div>
    <div className="split"><div>
      <div className="card"><h2>Work order</h2>
        <div className="grid g3" style={{ marginBottom: 12 }}>
          <div><div className="lbl">Due</div><b>{fmtDate(job.due_date)}</b></div><div><div className="lbl">Designer</div>{job.design_required ? (ids('design').map((i: string) => names[i]).join(', ') || <span className="overdue">not assigned</span>) : <span className="muted">no design</span>}</div>
          <div><div className="lbl">Production</div>{ids('production').map((i: string) => names[i]).join(', ') || <span className="overdue">not assigned</span>}</div></div>
        <JobWorkOrder b={b} canProgress={['in_production', 'rework', 'qc', 'queued'].includes(s)} /></div>
      {(s === 'qc' || b.qc.length > 0) && <div className="card"><h2>Quality control</h2>{s === 'qc' && <QcForm jobId={job.id} items={qcItems} />}
        {b.qc.map((q: any) => <div className="linkrow" key={q.id}><span><b>{q.result.replace('_', ' ')}</b> — checked {Number(q.qty_checked)}, rejected {Number(q.qty_rejected)}{q.notes ? ' — ' + q.notes : ''}</span><span className="muted">{names[q.checked_by]} · {fmtDateTime(q.created_at)}</span></div>)}</div>}
      <div className="card"><h2>Files & artwork</h2><JobFiles jobId={job.id} files={b.files} urls={b.urls} names={names} canFinal itemNames={itemNames} productionStarted={prodStarted} />
        <div style={{ marginTop: 14 }}><FileUploader jobId={job.id} items={items.map((i: any) => ({ id: i.id, name: i.product_name }))} /></div></div>
      <div className="card"><h2>Customer-supplied items</h2><SuppliedForm jobId={job.id} items={items.map((i: any) => ({ id: i.id, name: i.product_name }))} /></div>
      <div className="card"><h2>Internal notes</h2><NoteBox jobId={job.id} />{b.notes.map((n: any) => <div className="linkrow" key={n.id}><span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span><span className="muted" style={{ whiteSpace: 'nowrap' }}>{names[n.user_id] || 'Someone'} · {fmtDateTime(n.created_at)}</span></div>)}</div>
    </div><div>
      <div className="card"><h2>Manage</h2><JobManage job={job} designers={designers} producers={producers} designerIds={ids('design')} producerIds={ids('production')} /></div>
      {!final && s !== 'cancelled' && <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Owner overrides (act on behalf of staff)</summary><div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        {s === 'design' && !job.design_started_at && A('Start design', 'design_start', 'btn sm')}{s === 'design' && A('Design complete', 'design_complete', 'btn sm')}
        {['queued', 'rework'].includes(s) && A('Start production', 'production_start', 'btn sm')}{s === 'in_production' && A('Production complete', 'production_complete', 'btn sm')}</div></details>}
      <div className="card"><h2>Timeline</h2><Timeline events={[...b.activity].reverse()} names={names} /></div>
    </div></div>
  </>);
}
