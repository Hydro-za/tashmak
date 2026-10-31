import { Spec } from './ui';
import MarkItemComplete from './MarkItemComplete';

/** Focused work order: item specifications, notes and one completion action per item. */
export default function JobWorkOrder({ b, canProgress, showQty = true }: { b: any; canProgress: boolean; showQty?: boolean }) {
  const { job, items } = b;
  return (
    <div>
      {job.instructions && <div className="alert info" style={{ whiteSpace: 'pre-wrap' }}><b>Special instructions:</b> {job.instructions}</div>}
      {items.map((it: any, i: number) => {
        const completed = Number(it.qty_completed) || 0;
        const rejected = Number(it.qty_rejected) || 0;
        const done = completed >= Number(it.qty_ordered);
        return <div className="card" key={it.id} style={{ borderLeft: '4px solid var(--ink)' }}>
          <div className="hd"><h2>{i + 1}. {it.product_name} <span className="muted" style={{ fontWeight: 400 }}>× {Number(it.qty_ordered)}</span></h2><span className="badge">{done ? 'completed' : it.status.replace('_', ' ')}</span></div>
          <Spec rows={(it.spec || []).filter((r: any) => r.label !== 'Quantity').map((r: any) => ({ label: r.label, value: r.value }))} />
          {it.requires_qc && <div className="muted" style={{ marginTop: 6 }}>⚑ Quality check required</div>}
          {it.instructions && <div style={{ marginTop: 6 }}><b>Item notes:</b> {it.instructions}</div>}
          {showQty && <div className="muted" style={{ marginTop: 8 }}>Completed {completed} of {Number(it.qty_ordered)}{rejected ? ' · Rejected ' + rejected : ''}</div>}
          {canProgress && <div style={{ marginTop: 12 }}><MarkItemComplete jobId={job.id} item={it} /></div>}
        </div>;
      })}
    </div>
  );
}
