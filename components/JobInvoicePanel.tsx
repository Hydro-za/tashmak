'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { completeJobAccountingEntry } from '@/lib/actions';
import { toast } from './ToastHost';

const money = (value: number | string | null | undefined) =>
  value == null || value === '' ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value));

const snapshotFields = [
  'customer_name', 'job_number', 'job_title', 'quote_id', 'quote_number',
  'sales_amount', 'vat_treatment', 'vat_amount', 'materials_cost', 'labour_cost', 'invoice_total', 'items'
];

export default function JobInvoicePanel({ snapshot, completion, jobStatus }: { snapshot: any; completion: any; jobStatus: string }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const [invoiceSentConfirmed, setInvoiceSentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const lock = useRef(false);
  const router = useRouter();

  if (!snapshot) {
    return <section className="card job-invoice-panel">
      <h2>Accounting preparation</h2>
      <p className="muted">The linked quote or its accounting figures could not be loaded. Refresh the page; if the problem continues, check the quote before completing this job.</p>
    </section>;
  }

  const isJobDone = jobStatus === 'job_done';
  const isCurrentCompletion = !!completion && snapshotFields.every((field) =>
    JSON.stringify(completion.source_snapshot?.[field] ?? null) === JSON.stringify(snapshot[field] ?? null)
  );
  const products = Array.isArray(snapshot.items) ? snapshot.items.filter((line: any) => line && (line.product_name || line.description)) : [];
  const entries: [string, string][] = [
    ['Customer', snapshot.customer_name || '—'],
    ['Job', [snapshot.job_number, snapshot.job_title || 'Printing job'].filter(Boolean).join(' · ')],
    ['Quote', snapshot.quote_number || '—'],
    ['Sales amount', money(snapshot.sales_amount)],
    ['VAT treatment', snapshot.vat_treatment || '—'],
    ['VAT amount', money(snapshot.vat_amount)],
    ['Materials cost', money(snapshot.materials_cost)],
    ['Labour cost', money(snapshot.labour_cost)],
    ['Invoice total', money(snapshot.invoice_total)]
  ];

  async function markJobDone() {
    if (busy || lock.current || isJobDone) return;
    if (!handoffConfirmed || !invoiceSentConfirmed) {
      setDialogError('Confirm both the handoff and sent invoice before completing this job.');
      return;
    }

    lock.current = true;
    setBusy(true);
    setDialogError('');
    try {
      const result = await completeJobAccountingEntry(snapshot.job_id, handoffConfirmed, invoiceSentConfirmed);
      if (result.ok) {
        setConfirmOpen(false);
        setSuccessOpen(true);
        toast('Job completed');
        router.refresh();
      } else {
        setDialogError(result.error || 'Could not complete this job. Check the job status and try again.');
        toast(result.error || 'Could not complete this job', 'bad');
      }
    } catch {
      setDialogError('Could not reach the server. Nothing was changed — please try again.');
      toast('Could not reach the server. Nothing was changed — please try again.', 'bad');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function openConfirmation() {
    setHandoffConfirmed(false);
    setInvoiceSentConfirmed(false);
    setDialogError('');
    setConfirmOpen(true);
  }

  return (
    <section className="card job-invoice-panel">
      <div className="job-invoice-head">
        <div>
          <h2>Accounting preparation</h2>
          <p className="muted">Enter these saved quote details into Sage, then confirm the handoff and sent invoice to finish the job.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setOpen(!open)}>
          {open ? 'Hide accounting details' : isJobDone ? 'View accounting details' : 'Ready for invoice'}
        </button>
      </div>

      {isJobDone && isCurrentCompletion && <div className="alert ok" role="status">
        <b>Job completed.</b> Handoff and invoice completion were confirmed on {new Date(completion.completed_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}.
      </div>}
      {!isJobDone && completion && isCurrentCompletion && <div className="alert info">
        Sage details were recorded earlier. Confirm the handoff and that the invoice was sent to move this job into Completed.
      </div>}
      {completion && !isCurrentCompletion && <div className="alert warn">
        The products or accounting figures changed since the previous confirmation. Update the Sage entry before completing the job.
      </div>}

      {open && <>
        <h3 style={{ margin: '14px 0 8px' }}>Products to enter in Sage ({products.length})</h3>
        {products.length ? <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Product / description</th><th className="r">Quantity</th><th className="r">Unit price</th><th className="r">Line total</th></tr></thead>
            <tbody>
              {products.map((line: any, index: number) => <tr key={line.id || index}>
                <td><b>{line.product_name || 'Product'}</b>{(line.description || line.category_name) && <div className="muted">{[line.description, line.category_name].filter(Boolean).join(' · ')}</div>}</td>
                <td className="r">{line.quantity == null ? '—' : Number(line.quantity).toLocaleString('en-ZA')}</td>
                <td className="r">{money(line.unit_price)}</td>
                <td className="r"><b>{money(line.line_total)}</b></td>
              </tr>)}
            </tbody>
          </table>
        </div> : <div className="alert warn">No saved product lines are available for this quote. Review the quote before completing the job.</div>}

        <h3 style={{ margin: '18px 0 8px' }}>Invoice details</h3>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Accounting field</th><th>Enter in Sage</th></tr></thead>
            <tbody>
              {entries.map(([label, value]) => <tr key={label}>
                <td>{label}</td><td><b>{value}</b></td>
              </tr>)}
            </tbody>
          </table>
        </div>

        {!snapshot.items_valid && <div className="alert warn" style={{ marginTop: 12 }}>
          The saved quote calculations need review before this job can be completed.
        </div>}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          These products and figures come from the saved quote. Tashmak records your confirmation; it does not enter data into Sage or send the invoice.
        </p>
        {!isJobDone && <div className="pillrow" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" disabled={!snapshot.items_valid || !products.length || snapshot.invoice_total == null} onClick={openConfirmation}>
            Confirm handoff and invoice sent
          </button>
        </div>}
      </>}

      {confirmOpen && typeof document !== 'undefined' && createPortal(
        <div className="overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setConfirmOpen(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="job-completion-title">
            <header className="mh">
              <b id="job-completion-title">Finish this job?</b>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmOpen(false)} disabled={busy} aria-label="Close">✕</button>
            </header>
            <div className="mb">
              <p style={{ marginTop: 0 }}>This moves <b>{snapshot.job_number}</b> to the Completed tab. Confirm both steps first:</p>
              <label className="chk" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '12px 0', padding: 12, border: '1px solid var(--line)', borderRadius: 12 }}>
                <input type="checkbox" checked={handoffConfirmed} onChange={e => { setHandoffConfirmed(e.target.checked); setDialogError(''); }} />
                <span><b>The job has been handed over</b><br /><span className="muted">The customer has collected it or delivery has been completed.</span></span>
              </label>
              <label className="chk" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '12px 0', padding: 12, border: '1px solid var(--line)', borderRadius: 12 }}>
                <input type="checkbox" checked={invoiceSentConfirmed} onChange={e => { setInvoiceSentConfirmed(e.target.checked); setDialogError(''); }} />
                <span><b>The invoice was entered in Sage and sent</b><br /><span className="muted">Tashmak records your confirmation but does not send it for you.</span></span>
              </label>
              {dialogError && <div className="alert bad" role="alert" style={{ marginTop: 10 }}>{dialogError}</div>}
            </div>
            <footer className="mf">
              <button type="button" className="btn" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className="btn primary" onClick={markJobDone} disabled={busy || !handoffConfirmed || !invoiceSentConfirmed}>
                {busy ? 'Completing…' : 'Mark job done'}
              </button>
            </footer>
          </section>
        </div>,
        document.body
      )}

      {successOpen && typeof document !== 'undefined' && createPortal(
        <div className="overlay" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="job-completed-title">
            <header className="mh"><b id="job-completed-title">Job completed</b></header>
            <div className="mb">
              <div className="alert ok" role="status" style={{ marginTop: 0 }}>
                <b>{snapshot.job_number}</b> is finished. The handoff and sent invoice have been recorded.
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>This job is now in the Completed tab in Jobs.</p>
            </div>
            <footer className="mf">
              <button type="button" className="btn primary" onClick={() => router.push('/jobs?status=completed')}>View completed jobs</button>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}
