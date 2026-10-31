import { fmtDate } from './labels';

const money = (value: any) => {
  const amount = Number(value || 0);
  return (amount < 0 ? '-' : '') + 'R' + Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
const pct = (value: any) => Math.round(Number(value || 0) * 100) / 100 + '%';
const ascii = (value: any) => String(value ?? '')
  .replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/·/g, '|')
  .replace(/[^\x20-\x7E\n]/g, '');

/** Builds the customer-facing PDF from the SAVED quote (stored prices - never recalculated). */
export async function buildQuotePdf(q: any, business: any): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const R = W - M;
  const CONTENT_BOTTOM = H - 50;
  const t = q.totals || {};
  const b = business || {};
  const c = q.customers || {};
  const items = Array.isArray(q.items) ? q.items : [];
  const ink = [33, 40, 44];
  const muted = [103, 112, 118];
  const lineColor = [205, 212, 216];
  const headerFill = [242, 245, 246];
  const accent = [4, 118, 123];
  const white = [255, 255, 255];
  let y = M;

  const txt = (value: any, x: number, yy: number, options?: any) => doc.text(ascii(value), x, yy, options);
  const setInk = () => doc.setTextColor(ink[0], ink[1], ink[2]);
  const setMuted = () => doc.setTextColor(muted[0], muted[1], muted[2]);
  const setAccent = () => doc.setTextColor(accent[0], accent[1], accent[2]);
  const wrap = (value: any, width: number, fontSize: number, fontStyle = 'normal') => {
    const text = String(value ?? '').trim();
    if (!text) return [] as string[];
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(ascii(text), width) as string[];
  };
  const rule = (x1: number, yy: number, x2: number, strong = false) => {
    const color = strong ? accent : lineColor;
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(strong ? 1 : 0.55);
    doc.line(x1, yy, x2, yy);
    doc.setLineWidth(0.5);
  };

  function drawTableHeader() {
    const qtyX = 352;
    const unitX = 420;
    const discountX = 483;
    const totalX = R - 6;
    doc.setFillColor(headerFill[0], headerFill[1], headerFill[2]);
    doc.rect(M, y, R - M, 23, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setInk();
    txt('#', M + 7, y + 15);
    txt('Description', M + 25, y + 15);
    txt('Qty', qtyX, y + 15, { align: 'right' });
    txt('Unit price', unitX, y + 15, { align: 'right' });
    txt('Discount', discountX, y + 15, { align: 'right' });
    txt('Total', totalX, y + 15, { align: 'right' });
    rule(M, y + 23, R);
    doc.setFont('helvetica', 'normal');
    y += 29;
  }

  const drawRunningHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setInk();
    txt(b.name || 'Tashmak Design & Print', M, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setMuted();
    txt('QUOTATION  |  ' + (q.number || ''), R, 40, { align: 'right' });
    rule(M, 50, R, true);
    setInk();
    y = 69;
  };

  function addPage(repeatTable: boolean) {
    doc.addPage();
    drawRunningHeader();
    if (repeatTable) drawTableHeader();
  }

  // Business identity and quote details use a familiar, document-style two-column header.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setInk();
  let brandX = M;
  if (b.logo) {
    try {
      const logoW = Math.min(72, Number(b.logoW) || 72);
      const logoH = Math.min(42, logoW * (Number(b.logoH) || 42) / Math.max(1, Number(b.logoW) || 72));
      doc.addImage(b.logo, b.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M, 31, logoW, logoH);
      brandX = M + logoW + 12;
    } catch {
      // The optional logo must not stop a customer from downloading the quote.
    }
  }
  const brandWidth = Math.max(160, 270 - (brandX - M));
  const businessName = wrap(b.name || 'Tashmak Design & Print', brandWidth, 10.5, 'bold');
  let businessY = 42;
  businessName.forEach((part: string) => {
    setInk();
    txt(part, brandX, businessY);
    businessY += 13;
  });
  const businessDetails = [
    b.address,
    [b.phone, b.email].filter(Boolean).join('  |  '),
    b.website,
    [b.regNo && 'Reg: ' + b.regNo, b.vatNo && 'VAT No: ' + b.vatNo].filter(Boolean).join('  |  '),
  ].filter(Boolean);
  businessDetails.forEach((detail: string) => {
    const lines = wrap(detail, brandWidth, 7.8);
    lines.forEach((part: string) => {
      setMuted();
      txt(part, brandX, businessY);
      businessY += 10;
    });
  });

  const rightX = R;
  const rightWidth = 205;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  setAccent();
  txt('QUOTATION', rightX, 45, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setInk();
  txt(q.number || 'Quote', rightX, 64, { align: 'right' });
  const quoteDetails = [
    q.quote_date ? 'Date: ' + fmtDate(q.quote_date) : '',
    q.valid_until ? 'Valid until: ' + fmtDate(q.valid_until) : '',
    q.reference ? 'Reference: ' + q.reference : '',
    q.pricing_snapshot?.staffName ? 'Prepared by: ' + q.pricing_snapshot.staffName : '',
  ].filter(Boolean);
  let quoteY = 81;
  quoteDetails.forEach((detail: string) => {
    const parts = wrap(detail, rightWidth, 8);
    parts.forEach((part: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setMuted();
      txt(part, rightX, quoteY, { align: 'right' });
      quoteY += 11;
    });
  });

  const headerBottom = Math.max(businessY, quoteY) + 10;
  rule(M, headerBottom, R);
  y = headerBottom + 21;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setAccent();
  txt('BILL TO', M, y);
  y += 16;
  const customerName = wrap(c.name || 'Customer', 300, 10.5, 'bold');
  customerName.forEach((part: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setInk();
    txt(part, M, y);
    y += 13;
  });
  const customerDetails = [c.company, c.phone, c.email].filter(Boolean);
  customerDetails.forEach((detail: string) => {
    wrap(detail, 300, 8.5).forEach((part: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setMuted();
      txt(part, M, y);
      y += 11;
    });
  });
  y += 17;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setInk();
  txt('Quoted items', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setMuted();
  txt('All amounts in South African rand (ZAR).', R, y, { align: 'right' });
  y += 9;
  drawTableHeader();

  if (items.length === 0) {
    if (y + 35 > CONTENT_BOTTOM) addPage(true);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setMuted();
    txt('No items have been added to this quotation.', M + 25, y + 15);
    rule(M, y + 25, R);
    y += 34;
  }

  items.forEach((it: any, index: number) => {
    const calc = (it.item && it.item.calc) || {};
    const lines: { text: string; style: string; size: number; color: number[] }[] = [];
    const addLine = (value: any, style: string, size: number, color: number[]) => {
      wrap(value, 254, size, style).forEach((part: string) => lines.push({ text: part, style, size, color }));
    };
    addLine(it.product_name || 'Product', 'bold', 8.7, ink);
    addLine(it.description, 'normal', 8.2, muted);
    addLine(it.item?.specText, 'normal', 7.8, muted);
    if (it.item?.notes) addLine('Notes: ' + it.item.notes, 'italic', 7.8, muted);
    if (!lines.length) lines.push({ text: 'Product details not provided', style: 'normal', size: 8, color: muted });

    const completeRowHeight = Math.max(32, lines.length * 11 + 14);
    const maximumFullRowHeight = CONTENT_BOTTOM - (69 + 29);
    if (y + completeRowHeight > CONTENT_BOTTOM && completeRowHeight <= maximumFullRowHeight) addPage(true);

    let offset = 0;
    let firstPart = true;
    while (offset < lines.length) {
      if (CONTENT_BOTTOM - y < 33) addPage(true);
      const capacity = Math.max(1, Math.floor((CONTENT_BOTTOM - y - 14) / 11));
      const chunk = lines.slice(offset, offset + capacity);
      const rowHeight = Math.max(32, chunk.length * 11 + 14);
      if (y + rowHeight > CONTENT_BOTTOM) {
        addPage(true);
        continue;
      }

      let lineY = y + 13;
      chunk.forEach((part) => {
        doc.setFont('helvetica', part.style);
        doc.setFontSize(part.size);
        doc.setTextColor(part.color[0], part.color[1], part.color[2]);
        txt(part.text, M + 25, lineY);
        lineY += 11;
      });

      if (firstPart) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        setInk();
        txt(String(index + 1), M + 7, y + 14);
        txt(Number(it.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 3 }), 352, y + 14, { align: 'right' });
        txt(money(it.unit_price), 420, y + 14, { align: 'right' });
        const discount = Number(calc.discountAmount || 0);
        txt(discount > 0 ? '-' + money(discount) : '-', 483, y + 14, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        txt(money(it.line_total), R - 6, y + 14, { align: 'right' });
      }

      y += rowHeight;
      offset += chunk.length;
      firstPart = false;
      if (offset < lines.length) addPage(true);
    }
    rule(M, y - 3, R);
    setInk();
  });

  const rows = [
    ['Items', money(t.gross)],
    ...(Number(t.lineDiscounts) > 0 ? [['Line discounts', '-' + money(t.lineDiscounts)]] : []),
    ...(Number(t.quoteDiscount) > 0 ? [['Discount', '-' + money(t.quoteDiscount)]] : []),
    ...(Number(t.minOrderAdjustment) > 0 ? [['Minimum order adjustment', money(t.minOrderAdjustment)]] : []),
    ['Subtotal' + (t.vatEnabled ? ' (excl. VAT)' : ''), money(t.subtotal)],
    ...(t.vatEnabled ? [['VAT ' + pct(t.vatRate), money(t.vat)]] : []),
    ['Total' + (t.vatEnabled ? ' (incl. VAT)' : ''), money(t.total)],
  ] as [string, string][];
  const plainRows = rows.slice(0, -1);
  const summaryHeight = 24 + plainRows.length * 15 + 1 + 22 + 19;
  let summaryTop = y + 14;
  if (summaryTop + summaryHeight > CONTENT_BOTTOM) {
    addPage(false);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setInk();
    txt('Quote summary', M, y);
    summaryTop = y + 15;
  }
  const totalsX = R - 214;
  const totalsW = 214;
  let totalY = summaryTop + 10;

  plainRows.forEach(([label, amount], index: number) => {
    if (index === plainRows.length - 1) rule(totalsX, totalY - 9, R);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setInk();
    txt(label, totalsX, totalY);
    txt(amount, R, totalY, { align: 'right' });
    totalY += 15;
  });

  rule(totalsX, totalY - 7, R, true);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setInk();
  const totalRow = rows[rows.length - 1];
  txt(totalRow[0], totalsX, totalY + 8);
  txt(totalRow[1], R, totalY + 8, { align: 'right' });
  totalY += 21;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setMuted();
  txt(t.vatEnabled ? (t.vatMode === 'inclusive' ? 'All prices include VAT.' : 'VAT is added to the subtotal.') : 'VAT not charged.', R, totalY + 1, { align: 'right' });
  setInk();
  y = totalY + 17;

  const sections: [string, any][] = [
    ['Notes', q.notes],
    ['Payment terms', q.payment_terms],
    ['Terms & conditions', q.terms],
  ];
  sections.forEach(([heading, body]) => {
    if (!body) return;
    const bodyLines = wrap(body, R - M, 8.5);
    if (!bodyLines.length) return;
    let offset = 0;
    let first = true;
    while (offset < bodyLines.length) {
      const titleHeight = 14;
      if (CONTENT_BOTTOM - y < titleHeight + 23) addPage(false);
      const capacity = Math.max(1, Math.floor((CONTENT_BOTTOM - y - titleHeight - 5) / 11));
      const part = bodyLines.slice(offset, offset + capacity);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      setInk();
      txt(first ? heading : heading + ' (continued)', M, y + 10);
      y += titleHeight;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setInk();
      part.forEach((line: string) => {
        txt(line, M, y + 8);
        y += 11;
      });
      y += 9;
      rule(M, y - 5, R);
      y += 10;
      offset += part.length;
      first = false;
      if (offset < bodyLines.length) addPage(false);
    }
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    rule(M, H - 36, R);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setMuted();
    const contact = [b.phone, b.email].filter(Boolean).join('  |  ');
    txt([b.name || 'Tashmak Design & Print', contact].filter(Boolean).join('  |  '), M, H - 21);
    txt('Page ' + page + ' of ' + pageCount, R, H - 21, { align: 'right' });
    setInk();
  }

  return doc.output('blob');
}
