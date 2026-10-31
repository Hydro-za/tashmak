'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { markJobInvoiceSent } from '@/lib/actions';
import { toast } from './ToastHost';

const money = (value: number | null | undefined) =>
  value == null ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value));

export default function DashboardInvoices({ rows }: { rows: any[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const ready = rows.filter((row) => row.status === 'ready_for_invoice');

  async function markDone(row: any) {
    if (!row.current_invoice_id || busyId) return;
    const confirmed = window.confirm(
      `Mark invoice ${row.invoice_number} as done? Confirm it has been entered in Sage and issued. This records completion in Tashmak; it does not create or send the invoice in Sage.`
    );
    if (!confirmed) return;

    setBusyId(row.current_invoice_id);
    const result = await markJobInvoiceSent(row.current_invoice_id);
    setBusyId(null);
    if (result.ok) {
      toast('Invoice marked as done');
      router.refresh();
    } else {
      toast(result.error || 'Could not mark this invoice as done', 'bad');
    }
  }

  return (
    <section className="card" aria-labelledby="dashboard-invoices-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 id="dashboard-invoices-heading" style={{ marginBottom: 4 }}>
            Ready for invoice <span className="muted" style={{ fontWeight: 400 }}>({ready.length})</span>
          </h2>
          <p className="muted" style={{ margin: 0 }}>Use these figures for manual entry into Sage, then mark each invoice done.</p>
        </div>
        <Link href="/jobs?status=ready_invoice" className="btn sm">View invoice jobs</Link>
      </div>

      {ready.length ? (
        <div style={{ marginTop: 12 }}>
          {ready.slice(0, 8).map((row: any) => (
            <article key={row.current_invoice_id} className="card" style={{ margin: '12px 0 0', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <Link href={`/jobs/${row.job_id}`} style={{ textDecoration: 'none' }}>
                    <b>{row.customer_name || 'Customer'}</b>
                  </Link>
                  <div className="muted">{row.job_number} · {row.job_title || row.quote_number || 'Printing job'}</div>
                </div>
                <div><span className="muted">Invoice no. </span><b>{row.invoice_number}</b></div>
              </div>

              <div className="grid g2" style={{ marginTop: 12, gap: 8 }}>
                <div><span className="muted">Sales amount</span><div><b>{money(row.sales_amount)}</b></div></div>
                <div><span className="muted">VAT treatment</span><div><b>{row.vat_treatment || '—'}</b></div></div>
                <div><span className="muted">VAT amount</span><div><b>{money(row.vat_amount)}</b></div></div>
                <div><span className="muted">Materials cost</span><div><b>{money(row.materials_cost)}</b></div></div>
                <div><span className="muted">Labour cost</span><div><b>{money(row.labour_cost)}</b></div></div>
                <div><span className="muted">Invoice total</span><div><b>{money(row.invoice_total)}</b></div></div>
              </div>

              <div style={{ marginTop: 14 }}>
                <button className="btn sm primary" disabled={busyId !== null} onClick={() => markDone(row)}>
                  {busyId === row.current_invoice_id ? 'Saving…' : 'Done'}
                </button>
              </div>
            </article>
          ))}
          {ready.length > 8 && <p className="muted">Showing 8 of {ready.length} invoices. <Link href="/jobs?status=ready_invoice">View invoice jobs</Link></p>}
        </div>
      ) : <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>No accounting entries are waiting to be completed.</p>}
    </section>
  );
}
