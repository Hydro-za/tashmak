import { fmtDate } from './labels';

const money = (v: any) => { const n = Number(v || 0); return (n < 0 ? '-' : '') + 'R' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const pct = (v: any) => Math.round(Number(v || 0) * 100) / 100 + '%';
const ascii = (s: any) => String(s ?? '').replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/·/g, '|').replace(/[^\x20-\x7E\n]/g, '');

/** Builds the customer-facing PDF from the SAVED quote (stored prices — never recalculated). */
export async function buildQuotePdf(q: any, business: any): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const W = 595, M = 40, R = W - M; let y = M;
  const t = q.totals || {}; const b = business || {};
  const txt = (s: any, x: number, yy: number, o?: any) => doc.text(ascii(s), x, yy, o);
  const need = (h: number) => { if (y + h > 800) { doc.addPage(); y = M; } };
  if (b.logo) { try { const lw = Math.min(150, b.logoW || 150), lh = lw * (b.logoH || 50) / Math.max(1, b.logoW || 150); doc.addImage(b.logo, b.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M, y, lw, lh); y += lh + 6; } catch { /* logo is optional */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); txt(b.name || '', M, y); y += 14; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  [b.address, [b.phone, b.email].filter(Boolean).join(' | '), b.website, b.regNo && 'Reg: ' + b.regNo, b.vatNo && 'VAT No: ' + b.vatNo].filter(Boolean).forEach((l: string) => String(l).split('\n').forEach(s => { txt(s, M, y); y += 11; }));
  let ry = M; doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(4, 118, 123); txt('QUOTATION', R, ry + 16, { align: 'right' }); doc.setTextColor(0); doc.setFontSize(11); txt(q.number, R, ry + 34, { align: 'right' }); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  ry += 48; [`Date: ${fmtDate(q.quote_date)}`, q.valid_until && `Valid until: ${fmtDate(q.valid_until)}`, q.reference && `Reference: ${q.reference}`, q.pricing_snapshot?.staffName && `Prepared by: ${q.pricing_snapshot.staffName}`].filter(Boolean).forEach((l: any) => { txt(l, R, ry, { align: 'right' }); ry += 11; });
  y = Math.max(y, ry) + 8; doc.setDrawColor(4, 118, 123); doc.setLineWidth(1.5); doc.line(M, y, R, y); doc.setLineWidth(0.5); y += 18; doc.setFont('helvetica', 'bold'); txt('Quote for', M, y); y += 13; doc.setFontSize(11); txt(q.customers?.name || '', M, y); y += 13; doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  [q.customers?.company, q.customers?.phone, q.customers?.email].filter(Boolean).forEach((s: string) => { txt(s, M, y); y += 11; }); y += 10;
  const head = () => { doc.setFillColor(4, 118, 123); doc.rect(M, y, R - M, 18, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); txt('#', M + 4, y + 12); txt('Description', M + 22, y + 12); txt('Qty', 365, y + 12, { align: 'right' }); txt('Unit price', 435, y + 12, { align: 'right' }); txt('Discount', 500, y + 12, { align: 'right' }); txt('Total', R - 4, y + 12, { align: 'right' }); doc.setTextColor(0); doc.setFont('helvetica', 'normal'); y += 18; };
  head();
  (q.items || []).forEach((it: any, i: number) => {
    const c = (it.item && it.item.calc) || {}; const lines: [string, boolean][] = [];
    doc.setFont('helvetica', 'bold'); doc.splitTextToSize(ascii(it.product_name + (it.description ? ' - ' + it.description : '')), 270).forEach((s: string) => lines.push([s, true]));
    doc.setFont('helvetica', 'normal'); doc.splitTextToSize(ascii((it.item?.specText || '') + (it.item?.notes ? ' | ' + it.item.notes : '')), 270).forEach((s: string) => lines.push([s, false]));
    const h = lines.length * 11 + 10; if (y + h > 790) { doc.addPage(); y = M; head(); }
    txt(String(i + 1), M + 4, y + 13); let ly = y + 13; lines.forEach(([s, bold]) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); if (!bold) doc.setTextColor(90); txt(s, M + 22, ly); doc.setTextColor(0); ly += 11; }); doc.setFont('helvetica', 'normal');
    txt(String(Number(it.quantity)), 365, y + 13, { align: 'right' }); txt(money(it.unit_price), 435, y + 13, { align: 'right' }); txt(c.discountAmount > 0 ? '-' + money(c.discountAmount) : '-', 500, y + 13, { align: 'right' }); txt(money(it.line_total), R - 4, y + 13, { align: 'right' });
    y += h; doc.setDrawColor(220); doc.line(M, y - 3, R, y - 3);
  });
  need(140); y += 10;
  const row = (l: string, v: string, bold?: boolean) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 12 : 9); txt(l, 360, y); txt(v, R - 4, y, { align: 'right' }); y += bold ? 18 : 13; };
  row('Items', money(t.gross)); if (t.lineDiscounts > 0) row('Line discounts', '-' + money(t.lineDiscounts)); if (t.quoteDiscount > 0) row('Discount', '-' + money(t.quoteDiscount)); if (t.minOrderAdjustment > 0) row('Minimum order adjustment', money(t.minOrderAdjustment));
  row('Subtotal' + (t.vatEnabled ? ' (excl. VAT)' : ''), money(t.subtotal)); if (t.vatEnabled) row('VAT ' + pct(t.vatRate), money(t.vat)); doc.setDrawColor(4, 118, 123); doc.setLineWidth(1.2); doc.line(360, y - 9, R, y - 9); doc.setLineWidth(0.5); doc.setDrawColor(0); row('Total' + (t.vatEnabled ? ' (incl. VAT)' : ''), money(t.total), true);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); txt(t.vatEnabled ? (t.vatMode === 'inclusive' ? 'All prices include VAT' : 'All prices exclude VAT; VAT is added in the totals') : 'VAT not charged', R - 4, y, { align: 'right' }); y += 16; doc.setFontSize(9);
  [['Notes', q.notes], ['Payment terms', q.payment_terms], ['Terms & conditions', q.terms]].forEach(([h, s]) => {
    if (!s) return; const ls = doc.splitTextToSize(ascii(s), R - M) as string[]; need(16 + ls.length * 11); doc.setFont('helvetica', 'bold'); txt(h as string, M, y); y += 12; doc.setFont('helvetica', 'normal'); ls.forEach(l => { doc.text(l, M, y); y += 11; }); y += 8;
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120); txt(`${b.name || ''}${b.phone ? '  |  ' + b.phone : ''}${b.email ? '  |  ' + b.email : ''}`, M, 820); txt(`Page ${i} of ${pages}`, R, 820, { align: 'right' }); doc.setTextColor(0); }
  return doc.output('blob');
}
