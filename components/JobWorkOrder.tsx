import { Spec } from './ui';
import { fmtDate, fmtDateTime } from '@/lib/labels';
import { ProgressForm } from './JobForms';

/** Work order: what to make, how many, specs, instructions. Never contains prices or costs. */
export default function JobWorkOrder({ b, canProgress, showQty = true }: { b: any; canProgress: boolean; showQty?: boolean }) {
  const { job, items, supplied, names } = b;
  return (
    <div>
      {job.instructions && <div className="alert info" style={{ whiteSpace: 'pre-wrap' }}><b>Special instructions:</b> {job.instructions}</div>}
      {items.map((it: any, i: number) => (
        <div className="card" key={it.id} style={{ borderLeft: '4px solid var(--ink)' }}>
          <div className="hd"><h2>{i + 1}. {it.product_name} <span className="muted" style={{ fontWeight: 400 }}>× {Number(it.qty_ordered)}</span></h2><span className="badge">{it.status.replace('_', ' ')}</span></div>
          <Spec rows={(it.spec || []).filter((r: any) => r.label !== 'Quantity' || false).map((r: any) => ({ label: r.label, value: r.value }))} />
          {it.requires_qc && <div className="muted" style={{ marginTop: 6 }}>⚑ Quality check required</div>}
          {it.instructions && <div style={{ marginTop: 6 }}><b>Notes:</b> {it.instructions}</div>}
          {showQty && (Number(it.qty_completed) > 0 || Number(it.qty_rejected) > 0 || Number(it.qty_rework) > 0 || canProgress) && !canProgress &&
            <div className="muted" style={{ marginTop: 6 }}>Completed {Number(it.qty_completed)} · Rejected {Number(it.qty_rejected)} · Rework {Number(it.qty_rework)}</div>}
          {canProgress && <div style={{ marginTop: 10 }}><ProgressForm jobId={job.id} item={it} /></div>}
          {supplied.filter((s: any) => s.job_item_id === it.id).map((s: any) => <div key={s.id} className="alert warn" style={{ marginTop: 8 }}>Customer-supplied: {Number(s.qty_received)} × {s.description} ({s.condition || 'condition not noted'}) — received {fmtDateTime(s.received_at)} by {names[s.received_by] || 'staff'}</div>)}
        </div>))}
      {supplied.filter((s: any) => !s.job_item_id).map((s: any) => <div key={s.id} className="alert warn">Customer-supplied: {Number(s.qty_received)} × {s.description} ({s.condition || 'condition not noted'}) — received {fmtDate(s.received_at)}</div>)}
    </div>
  );
}
