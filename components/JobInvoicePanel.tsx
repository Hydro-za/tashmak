'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeJobAccountingEntry, markJobInvoiceSent, saveJobInvoice } from '@/lib/actions';
import { toast } from './ToastHost';

const money = (value: number | string | null | undefined) =>
  value == null || value === '' ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value));

const snapshotFields = [
  'customer_name', 'job_number', 'job_title', 'quote_id', 'quote_number',
  'sales_amount', 'vat_treatment', 'vat_amount', 'materials_cost', 'labour_cost', 'invoice_total', 'items'
];

const statusLabel: Record<string, string> = {
  needs_review: 'Needs review',
  ready_for_invoice: 'Ready to send',
  invoice_sent: 'Invoice sent',
  cancelled: 'Cancelled',
  superseded: 'Replaced by a newer version'
};

export default function JobInvoicePanel({ snapshot, completion, invoice: initialInvoice, jobStatus }: { snapshot: any; completion: any; invoice: any; jobStatus: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [invoice, setInvoice] = useState<any>(initialInvoice || null);
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoice?.invoice_number || '');
  const [verifiedTotal, setVerifiedTotal] = useState(initialInvoice?.verified_total == null ? '' : String(initialInvoice.verified_total));
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInvoice(initialInvoice || null);
    setInvoiceNumber(initialInvoice?.invoice_number || '');
    setVerifiedTotal(initialInvoice?.verified_total == null ? '' : String(initialInvoice.verified_total));
  }, [initialInvoice?.id, initialInvoice?.status, initialInvoice?.invoice_number, initialInvoice?.verified_total]);

  if (!snapshot) {
    return <section className="card job-invoice-panel">
      <h2>Invoice preparation</h2>
      <p className="muted">The linked quote or its accounting figures could not be loaded. Refresh the page and check the quote before preparing an invoice.</p>
    </section>;
  }

  const isJobDone = jobStatus === 'job_done';
  const products = Array.isArray(snapshot.items) ? snapshot.items.filter((line: any) => line && (line.product_name || line.description)) : [];
  const isCurrentInvoice = !!invoice && snapshotFields.every((field) =>
    JSON.stringify(invoice.source_snapshot?.[field] ?? null) === JSON.stringify(snapshot[field] ?? null)
  );
  const total = Number(snapshot.invoice_total);
  const verified = Number(verifiedTotal);
  const totalMatches = verifiedTotal.trim() !== '' && Number.isFinite(verified) && Math.abs(verified - total) <= 0.01;
  const quoteHasErrors = Array.isArray(snapshot.quote_totals?.errors) && snapshot.quote_totals.errors.length > 0;
  const canSave = !busy && !!invoiceNumber.trim() && invoiceNumber.trim().length <= 80 && verifiedTotal.trim() !== '' && Number.isFinite(verified) && verified >= 0 && !isJobDone && (invoice?.status !== 'invoice_sent' || !isCurrentInvoice) && (invoice?.status !== 'invoice_sent' || invoiceNumber.trim() !== invoice.invoice_number);
  const canMarkSent = !busy && !!invoice?.id && invoice.status === 'ready_for_invoice' && isCurrentInvoice;
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

  async function prepareInvoice() {
    if (!canSave) return;
    setBusy(true);
    try {
      const result = await saveJobInvoice(snapshot.job_id, invoiceNumber.trim(), verified);
      if (!result.ok) { toast(result.error || 'Could not save invoice details', 'bad'); return; }
      const ready = !!snapshot.items_valid && !quoteHasErrors && totalMatches;
      setInvoice({ id: result.data, invoice_number: invoiceNumber.trim(), verified_total: verified, status: ready ? 'ready_for_invoice' : 'needs_review', review_reason: ready ? null : (!snapshot.items_valid || quoteHasErrors) ? 'Saved quote calculations need review before an invoice can be prepared.' : 'Verified invoice total does not match the saved quote total.', source_snapshot: snapshot });
      toast(ready ? 'Invoice details saved' : 'Saved — review required');
      router.refresh();
    } catch {
      toast('Could not reach the server. Nothing was changed — please try again.', 'bad');
    } finally { setBusy(false); }
  }

  async function markSent() {
    if (!canMarkSent) return;
    setBusy(true);
    try {
      const result = await markJobInvoiceSent(invoice.id);
      if (!result.ok) { toast(result.error || 'Could not record invoice as sent', 'bad'); return; }
      setInvoice((current: any) => ({ ...current, status: 'invoice_sent', sent_at: new Date().toISOString() }));
      toast('Invoice marked as sent');
      router.refresh();
    } catch {
      toast('Could not reach the server. Please try again.', 'bad');
    } finally { setBusy(false); }
  }

  async function finishJob() {
    if (busy || !handoffConfirmed || invoice?.status !== 'invoice_sent' || !isCurrentInvoice || isJobDone) return;
    setBusy(true);
    try {
      const result = await completeJobAccountingEntry(snapshot.job_id, true, true);
      if (!result.ok) { toast(result.error || 'Invoice is recorded as sent, but the job could not be completed.', 'bad'); return; }
      toast('Job completed');
      router.refresh();
    } catch {
      toast('Could not reach the server. The invoice remains recorded as sent.', 'bad');
    } finally { setBusy(false); }
  }

  return (
    <section className="card job-invoice-panel">
      <div className="job-invoice-head">
        <div>
          <h2>Invoice tracking</h2>
          <p className="muted">Check the quote figures, record your invoice number, then mark it sent after sending it outside Tashmak.</p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'View accounting details'}</button>
      </div>

      {invoice && <div className="alert info" role="status">
        <b>{statusLabel[invoice.status] || invoice.status}</b>
        {' · '}Invoice {invoice.invoice_number}
        {invoice.status === 'invoice_sent' && invoice.sent_at ? ' · Sent ' + new Date(invoice.sent_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : ''}
        {!isCurrentInvoice && invoice.status !== 'invoice_sent' ? ' · Quote figures changed — prepare a new version.' : ''}
        {invoice.review_reason && <div>{invoice.review_reason}</div>}
      </div>}
      {isJobDone && <div className="alert ok"><b>Job completed.</b>{completion?.completed_at ? ' Recorded ' + new Date(completion.completed_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) + '.' : ''}</div>}

      {open && <>
        <h3 style={{ margin: '14px 0 8px' }}>Products ({products.length})</h3>
        {products.length ? <div className="tblwrap"><table className="tbl">
          <thead><tr><th>Product / description</th><th className="r">Quantity</th><th className="r">Unit price</th><th className="r">Line total</th></tr></thead>
          <tbody>{products.map((line: any, index: number) => <tr key={line.id || index}>
            <td data-label="Product / description"><b>{line.product_name || 'Product'}</b>{(line.description || line.category_name) && <div className="muted">{[line.description, line.profile, line.item?.specText, line.item?.notes, line.category_name].filter(Boolean).join(' · ')}</div>}</td>
            <td className="r" data-label="Quantity">{line.quantity == null ? '—' : Number(line.quantity).toLocaleString('en-ZA')}</td>
            <td className="r" data-label="Unit price">{money(line.unit_price)}</td>
            <td className="r" data-label="Line total"><b>{money(line.line_total)}</b></td>
          </tr>)}</tbody>
        </table></div> : <div className="alert warn">No saved product lines are available. Review the quote before preparing an invoice.</div>}

        <h3 style={{ margin: '18px 0 8px' }}>Invoice figures</h3>
        <div className="tblwrap"><table className="tbl"><thead><tr><th>Accounting field</th><th>Value</th></tr></thead>
          <tbody>{entries.map(([label, value]) => <tr key={label}><td data-label="Accounting field">{label}</td><td data-label="Value"><b>{value}</b></td></tr>)}</tbody>
        </table></div>

        {!snapshot.items_valid && <div className="alert warn" style={{ marginTop: 12 }}>The saved quote calculations need review before this invoice can be marked ready.</div>}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Tashmak stores the invoice number, verified total and sending status. It does not create or send the invoice in your accounting system.</p>

        {!isJobDone && (invoice?.status !== 'invoice_sent' || !isCurrentInvoice) && <>
          <div className="grid g2" style={{ marginTop: 14 }}>
            <div className="field"><label htmlFor="job-invoice-number">Invoice number</label><input id="job-invoice-number" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} maxLength={80} placeholder="Enter the manual invoice number" /></div>
            <div className="field"><label htmlFor="job-invoice-total">Verified invoice total (R)</label><input id="job-invoice-total" type="number" min="0" step="0.01" value={verifiedTotal} onChange={e => setVerifiedTotal(e.target.value)} placeholder={Number.isFinite(total) ? total.toFixed(2) : '0.00'} /></div>
          </div>
          <div className="pillrow" style={{ marginTop: 10 }}><button type="button" className="btn primary" disabled={!canSave} onClick={prepareInvoice}>{busy ? 'Saving…' : invoice ? 'Save invoice details / new version' : 'Save invoice details'}</button></div>
        </>}

        {invoice?.status === 'ready_for_invoice' && <div className="pillrow" style={{ marginTop: 10 }}>
          <button type="button" className="btn primary" disabled={!canMarkSent} onClick={markSent}>{busy ? 'Saving…' : 'Mark invoice as sent'}</button>
          <span className="muted">Only use this after the invoice has actually been sent to the customer.</span>
        </div>}
        {invoice?.status === 'invoice_sent' && !isCurrentInvoice && <div className="alert warn">The quote figures changed after this invoice was sent. If an updated invoice is required, record it using a new invoice number.</div>}
        {invoice?.status === 'invoice_sent' && !isJobDone && isCurrentInvoice && <>
          <label className="chk" style={{ marginTop: 14 }}><input type="checkbox" checked={handoffConfirmed} onChange={e => setHandoffConfirmed(e.target.checked)} /> The job has been collected or delivered to the customer.</label>
          <div className="pillrow" style={{ marginTop: 10 }}><button type="button" className="btn primary" disabled={busy || !handoffConfirmed || !isCurrentInvoice} onClick={finishJob}>{busy ? 'Completing…' : 'Complete job'}</button></div>
        </>}
        {invoice?.status === 'needs_review' && <p className="muted" style={{ marginTop: 10 }}>Correct the quote calculations or verified total, then save the invoice details again. It cannot be marked as sent until its review passes.</p>}
      </>}
    </section>
  );
}
