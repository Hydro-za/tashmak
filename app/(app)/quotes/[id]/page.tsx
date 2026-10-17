import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireOwner } from '@/lib/session';
import { loadQuote } from '@/lib/quotes';
import { Top, StatusBadge } from '@/components/ui';
import ActionButton from '@/components/ActionButton';
import QuotePdfButtons from '@/components/QuotePdfButtons';
import Timeline from '@/components/Timeline';
import { setQuoteStatus, archiveRecord } from '@/lib/actions';
import { money, fmtDate, fmtDateTime } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export default async function QuotePage({ params }: { params: { id: string } }) {
  const { sb } = await requireOwner();
  const q = await loadQuote(sb, params.id); if (!q) notFound();
  const [{ data: ss }, { data: act }, { data: dir }, { data: job }] = await Promise.all([
    sb.from('system_settings').select('value').eq('key', 'business').maybeSingle(),
    sb.from('job_activity').select('*').eq('quote_id', params.id).order('created_at', { ascending: false }),
    sb.rpc('staff_directory'), q.job_id ? sb.from('jobs').select('id,number,status').eq('id', q.job_id).maybeSingle() : Promise.resolve({ data: null })]);
  const names = Object.fromEntries((dir || []).map((d: any) => [d.id, d.full_name]));
  const business = ss?.value || {}; const t = q.totals || {}; const c = q.customers || {};
  const editable = ['draft', 'sent'].includes(q.status);
  return (<>
    <Top title={'Quote ' + q.number} sub={<><StatusBadge kind="quote" status={q.status} /> · {c.name}{c.company ? ' — ' + c.company : ''}</>}>
      <Link href="/quotes" className="btn">← Quotes</Link>
      {editable && <Link href={'/quotes/' + q.id + '/edit'} className="btn">Edit</Link>}
      <Link href={'/quotes/' + q.id + '/duplicate'} className="btn">Duplicate quote</Link>
    </Top>
    <div className="card noprint">
      <QuotePdfButtons quote={q} business={business} />
      <p className="muted" style={{ marginBottom: 0 }}>Send the PDF to the customer on WhatsApp yourself, then record their answer below.</p>
    </div>
    <div className="card noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <b>Status</b>
      {q.status === 'draft' && <ActionButton className="btn" label="Mark as Sent" action={setQuoteStatus} args={[q.id, 'sent']} successText="Marked as sent" />}
      {['draft', 'sent'].includes(q.status) && <>
        <ActionButton className="btn primary" label="MARK AS ACCEPTED" action={setQuoteStatus} args={[q.id, 'accepted']} confirmText="Mark this quote as ACCEPTED by the customer?" successText="Quote accepted" />
        <ActionButton className="btn danger" label="MARK AS DECLINED" action={setQuoteStatus} args={[q.id, 'declined']} confirmText="Mark this quote as DECLINED?" successText="Quote declined" /></>}
      {q.status === 'accepted' && !q.job_id && <><Link href={'/quotes/' + q.id + '/start-job'} className="bigbtn" style={{ width: 'auto', minHeight: 44, padding: '0 22px', fontSize: 15, textDecoration: 'none', marginTop: 0 }}>START JOB</Link>
        <ActionButton className="btn danger sm" label="Cancel quote" action={setQuoteStatus} args={[q.id, 'cancelled']} confirmText="Cancel this accepted quote?" /></>}
      {['declined', 'cancelled'].includes(q.status) && <ActionButton className="btn" label="Reopen as draft" action={setQuoteStatus} args={[q.id, 'draft']} />}
      {job && <Link href={'/jobs/' + job.id} className="btn">Job {job.number} →</Link>}
      {['draft', 'declined', 'cancelled'].includes(q.status) && <ActionButton className="btn ghost sm" label={q.archived_at ? 'Restore' : 'Archive'} action={archiveRecord} args={['quote', q.id, !q.archived_at]} confirmText={q.archived_at ? undefined : 'Archive this quote? It stays available under Archived.'} />}
      {q.accepted_at && <span className="muted">Accepted {fmtDateTime(q.accepted_at)}{q.accepted_by ? ' by ' + (names[q.accepted_by] || 'Owner') : ''}</span>}
      {q.declined_at && <span className="muted">Declined {fmtDateTime(q.declined_at)}</span>}
    </div>
    <div className="qdoc">
      <div className="hdr"><div><img className="logo" src={business.logo || '/brand/logo.png'} alt="" /><div><b>{business.name}</b></div><div className="small">{business.address}{'\n'}{business.phone}{business.email ? ' · ' + business.email : ''}{business.vatNo ? '\nVAT No: ' + business.vatNo : ''}</div></div>
        <div style={{ textAlign: 'right' }}><h1>QUOTATION</h1><div><b>{q.number}</b></div><div className="small">Date: {fmtDate(q.quote_date)}{'\n'}Valid until: {fmtDate(q.valid_until)}{q.reference ? '\nReference: ' + q.reference : ''}</div></div></div>
      <div className="small"><b>Quote for</b></div><div><b>{c.name}</b></div>{c.company && <div>{c.company}</div>}<div className="small">{c.phone}{c.email ? '\n' + c.email : ''}</div>
      <table><thead><tr><th style={{ width: 30 }}>#</th><th>Description</th><th className="r">Qty</th><th className="r">Unit price</th><th className="r">Discount</th><th className="r">Total</th></tr></thead><tbody>
        {q.items.map((it: any, i: number) => { const cc = it.item?.calc || {}; return <tr key={it.id}><td>{i + 1}</td><td><b>{it.product_name}</b>{it.description ? <div>{it.description}</div> : null}<div className="small">{it.item?.specText}{it.item?.notes ? '\n' + it.item.notes : ''}</div></td><td className="r">{Number(it.quantity)}</td><td className="r">{money(it.unit_price)}</td><td className="r">{cc.discountAmount > 0 ? '-' + money(cc.discountAmount) : '—'}</td><td className="r">{money(it.line_total)}</td></tr>; })}
      </tbody></table>
      <div className="tot"><div><span>Items</span><span>{money(t.gross)}</span></div>{t.lineDiscounts > 0 && <div><span>Line discounts</span><span>-{money(t.lineDiscounts)}</span></div>}{t.quoteDiscount > 0 && <div><span>Discount</span><span>-{money(t.quoteDiscount)}</span></div>}{t.minOrderAdjustment > 0 && <div><span>Minimum order adjustment</span><span>{money(t.minOrderAdjustment)}</span></div>}
        <div><span>Subtotal{t.vatEnabled ? ' (excl. VAT)' : ''}</span><span>{money(t.subtotal)}</span></div>{t.vatEnabled && <div><span>VAT {t.vatRate}%</span><span>{money(t.vat)}</span></div>}<div className="g"><span>Total{t.vatEnabled ? ' (incl. VAT)' : ''}</span><span>{money(t.total)}</span></div></div>
      {q.notes && <div style={{ marginTop: 16 }}><b>Notes</b><div className="small">{q.notes}</div></div>}{q.payment_terms && <div style={{ marginTop: 12 }}><b>Payment terms</b><div className="small">{q.payment_terms}</div></div>}{q.terms && <div style={{ marginTop: 12 }}><b>Terms & conditions</b><div className="small">{q.terms}</div></div>}
    </div>
    <div className="card noprint" style={{ marginTop: 14 }}><h2>Internal</h2><div className="grid g4"><div className="metric"><div className="k">Production cost</div><div className="v">{money(t.productionCost)}</div></div><div className="metric"><div className="k">Gross profit</div><div className="v">{money(t.grossProfit)}</div></div><div className="metric"><div className="k">Margin</div><div className="v">{t.marginPct}%</div></div><div className="metric"><div className="k">Prices saved</div><div className="v" style={{ fontSize: 13 }}>{fmtDateTime(q.created_at)}</div></div></div>
      <p className="muted" style={{ marginBottom: 0 }}>These values are frozen at the time the quote was saved — later price changes never alter this quote.</p></div>
    <div className="card noprint"><h2>History</h2><Timeline events={act || []} names={names} /></div>
  </>);
}
