'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeJobAccountingEntry } from '@/lib/actions';
import { toast } from './ToastHost';

const money = (value: number | null | undefined) =>
  value == null ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value));

const snapshotFields = [
  'customer_name', 'job_number', 'job_title', 'quote_id', 'quote_number',
  'sales_amount', 'vat_treatment', 'vat_amount', 'materials_cost', 'labour_cost', 'invoice_total'
];

export default function JobInvoicePanel({ snapshot, completion }: { snapshot: any; completion: any }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (!snapshot) {
    return <section className="card job-invoice-panel">
      <h2>Accounting preparation</h2>
      <p className="muted">This job has no valid linked quote, so its Sage entry figures are not available.</p>
    </section>;
  }

  const isCurrentCompletion = !!completion && snapshotFields.every((field) =>
    String(completion.source_snapshot?.[field] ?? '') === String(snapshot[field] ?? '')
  );
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

  async function markCompleted() {
    if (busy || isCurrentCompletion) return;
    if (!window.confirm('Confirm you have entered these figures into Sage and checked the entry. This records completion in Tashmak; it does not create or submit anything in Sage.')) return;
    setBusy(true);
    const result = await completeJobAccountingEntry(snapshot.job_id);
    setBusy(false);
    if (result.ok) {
      toast('Accounting entry marked completed');
      router.refresh();
    } else {
      toast(result.error || 'Could not mark the accounting entry completed', 'bad');
    }
  }

  return (
    <section className="card job-invoice-panel">
      <div className="job-invoice-head">
        <div>
          <h2>Accounting preparation</h2>
          <p className="muted">Enter these figures into Sage. When you have checked the entry, mark it completed below.</p>
        </div>
        <button className="btn primary" onClick={() => setOpen(!open)}>
          {open ? 'Hide accounting details' : isCurrentCompletion ? 'Completed' : 'Ready for invoice'}
        </button>
      </div>

      {isCurrentCompletion && <div className="alert ok">
        Sage entry marked completed on {new Date(completion.completed_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}.
      </div>}
      {completion && !isCurrentCompletion && <div className="alert warn">
        The accounting figures have changed since the last completion. Update the Sage entry before marking it completed again.
      </div>}

      {open && <>
        <div className="tblwrap" style={{ marginTop: 14 }}>
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
          The saved quote calculations need review before this accounting entry can be completed.
        </div>}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Tashmak records that the Sage entry is complete. It does not create an invoice or enter data into Sage.
        </p>
        <div className="pillrow" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy || isCurrentCompletion || !snapshot.items_valid || snapshot.invoice_total == null} onClick={markCompleted}>
            {busy ? 'Saving…' : isCurrentCompletion ? 'Completed' : 'Mark completed'}
          </button>
        </div>
      </>}
    </section>
  );
}
