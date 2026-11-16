import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { Top, Empty } from '@/components/ui';
import { money, fmtDateTime } from '@/lib/labels';

export const dynamic = 'force-dynamic';

const labels: Record<string, string> = {
  needs_review: 'Needs review', ready_for_invoice: 'Ready to send',
  invoice_sent: 'Invoice sent', cancelled: 'Cancelled', superseded: 'Replaced'
};
const tones: Record<string, string> = {
  needs_review: 'b-rejected', ready_for_invoice: 'b-converted',
  invoice_sent: 'b-accepted', cancelled: 'b-rejected', superseded: ''
};

export default async function InvoicesPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const params = await searchParamsPromise;
  const { sb } = await requireOwner();
  const { data, error } = await sb.from('job_invoices')
    .select('id,job_id,version,invoice_number,status,customer_name,job_number,job_description,quote_number,invoice_total,verified_total,review_reason,prepared_at,sent_at,verified_total,job_invoice_payments(id,amount,method,reference,received_at)')
    .order('prepared_at', { ascending: false }).limit(500);
  if (error) throw new Error('Could not load invoice records: ' + error.message);

  const latest = new Map<string, any>();
  for (const row of data || []) {
    const previous = latest.get(row.job_id);
    if (!previous || Number(row.version) > Number(previous.version)) latest.set(row.job_id, row);
  }
  const term = (params.q || '').trim().toLowerCase();
  const rows = [...latest.values()].filter(row =>
    (!params.status || row.status === params.status) &&
    (!term || [row.invoice_number, row.job_number, row.customer_name, row.job_description, row.quote_number].join(' ').toLowerCase().includes(term))
  );
  const rowsWithPayments = rows.map(row => { const paid = (row.job_invoice_payments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0); return { ...row, paid_total: paid, balance: Math.max(0, Number(row.verified_total || 0) - paid), payment_status: Number(row.verified_total || 0) - paid <= 0.01 ? 'Paid' : paid > 0 ? 'Part paid' : 'Unpaid' }; });
  const filters = [['all', 'All'], ['needs_review', 'Needs review'], ['ready_for_invoice', 'Ready to send'], ['invoice_sent', 'Invoice sent']];
  const chip = (key: string, label: string) => <Link key={key} className={((params.status || 'all') === key ? 'on' : '')} href={{ pathname: '/invoices', query: { ...(key !== 'all' ? { status: key } : {}), ...(params.q ? { q: params.q } : {}) } }}>{label}</Link>;

  return <div className="page-invoices">
    <Top title="Invoices" sub="Track invoice numbers, verified totals and sending status. Invoices are prepared and sent manually outside Tashmak." />
    <form className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input name="q" defaultValue={params.q || ''} placeholder="Invoice number, job or customer" style={{ flex: 1, minWidth: 200 }} />
      {params.status && <input type="hidden" name="status" value={params.status} />}
      <button className="btn">Search</button>
    </form>
    <div className="chips">{filters.map(([key, label]) => chip(key, label))}</div>
    {!rows.length ? <Empty text={data?.length ? 'No invoices match these filters.' : 'No invoices have been prepared yet. Open a job marked Ready for invoice to record its invoice number and verified total.'} /> :
      <div className="card invoice-list-card"><div className="invoice-desktop-list"><div className="tblwrap"><table className="tbl">
        <thead><tr><th>Invoice</th><th>Job / customer</th><th>Status</th><th className="r">Invoice total</th><th className="r">Verified total</th><th>Payment</th><th>Prepared / sent</th></tr></thead>
        <tbody>{rowsWithPayments.map(row => <tr key={row.id}>
          <td data-label="Invoice"><b>{row.invoice_number}</b><div className="muted">Version {row.version}</div></td>
          <td data-label="Job / customer"><Link href={'/jobs/' + row.job_id}><b>{row.job_number}</b></Link><div className="muted">{row.customer_name}</div></td>
          <td data-label="Status"><span className={'badge ' + (tones[row.status] || '')}>{labels[row.status] || row.status}</span>{row.review_reason && <div className="muted" style={{ maxWidth: 240 }}>{row.review_reason}</div>}</td>
          <td className="r" data-label="Invoice total">{money(row.invoice_total)}</td>
          <td className="r" data-label="Verified total">{money(row.verified_total)}</td>
          <td data-label="Prepared / sent">{fmtDateTime(row.prepared_at)}{row.sent_at ? <div className="muted">Sent {fmtDateTime(row.sent_at)}</div> : null}</td>
        </tr>)}</tbody>
      </table></div></div>
      <div className="invoice-mobile-list">{rowsWithPayments.map(row => <Link key={row.id} href={'/jobs/' + row.job_id} className="invoice-mobile-card">
        <div className="invoice-mobile-head"><b>{row.invoice_number}</b><span className={'badge ' + (tones[row.status] || '')}>{labels[row.status] || row.status}</span></div>
        <div className="muted">{row.job_number} · {row.customer_name}</div>
        <div className="invoice-mobile-values">
          <div><small>Invoice total</small><b>{money(row.invoice_total)}</b></div>
          <div><small>Verified total</small><b>{money(row.verified_total)}</b></div>
        </div>
        <div className="muted">Prepared {fmtDateTime(row.prepared_at)}{row.sent_at ? ' · Sent ' + fmtDateTime(row.sent_at) : ''}</div>
        {row.review_reason && <div className="muted">{row.review_reason}</div>}
      </Link>)}</div></div>}
  </div>;
}
