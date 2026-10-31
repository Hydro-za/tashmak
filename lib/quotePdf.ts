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
  const M = 42;
  const R = W - M;
  const CONTENT_BOTTOM = H - 52;
  const t = q.totals || {};
  const b = business || {};
  const c = q.customers || {};
  const items = Array.isArray(q.items) ? q.items : [];
  let y = M;

  const color = {
    ink: [27, 38, 43],
    muted: [105, 119, 126],
    soft: [246, 249, 250],
    softAlt: [251, 252, 253],
    line: [224, 231, 233],
    accent: [4, 118, 123],
    accentSoft: [230, 244, 244],
    white: [255, 255, 255],
  };
  const txt = (value: any, x: number, yy: number, options?: any) => doc.text(ascii(value), x, yy, options);
  const wrap = (value: any, width: number, fontSize: number, fontStyle: string) => {
    const text = String(value ?? '').trim();
    if (!text) return [] as string[];
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(ascii(text), width) as string[];
  };
  const setInk = () => doc.setTextColor(color.ink[0], color.ink[1], color.ink[2]);
  const setMuted = () => doc.setTextColor(color.muted[0], color.muted[1], color.muted[2]);
  const setAccent = () => doc.setTextColor(color.accent[0], color.accent[1], color.accent[2]);
  const horizontalRule = (yy: number, strong = false) => {
    const c = strong ? color.accent : color.line;
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(strong ? 1.2 : 0.6);
    doc.line(M, yy, R, yy);
    doc.setLineWidth(0.5);
  };

  const drawRunningHeader = () => {
    doc.setFillColor(color.accent[0], color.accent[1], color.accent[2]);
    doc.roundedRect(M, 24, 34, 4, 2, 2, 'F');
    doc.setFillColor(color.line[0], color.line[1], color.line[2]);
    doc.roundedRect(M + 39, 24, R - M - 39, 4, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setMuted();
    txt(b.name || 'Tashmak Design & Print', M, 47);
    doc.setFont('helvetica', 'normal');
    txt('QUOTATION  |  ' + (q.number || ''), R, 47, { align: 'right' });
    horizontalRule(56);
    setInk();
    y = 72;
  };

  function drawTableHeader() {
    const xQty = 355;
    const xUnit = 425;
    const xDiscount = 488;
    const xTotal = R - 8;
    doc.setFillColor(color.ink[0], color.ink[1], color.ink[2]);
    doc.roundedRect(M, y, R - M, 24, 6, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(color.white[0], color.white[1], color.white[2]);
    txt('#', M + 9, y + 16);
    txt('Description', M + 28, y + 16);
    txt('Qty', xQty, y + 16, { align: 'right' });
    txt('Unit price', xUnit, y + 16, { align: 'right' });
    txt('Discount', xDiscount, y + 16, { align: 'right' });
    txt('Total', xTotal, y + 16, { align: 'right' });
    setInk();
    doc.setFont('helvetica', 'normal');
    y += 31;
  }

  function addPage(repeatTable: boolean) {
    doc.addPage();
    drawRunningHeader();
    if (repeatTable) drawTableHeader();
  }

  // Page one: compact brand header with a clear quote identity and customer card.
  doc.setFillColor(color.accent[0], color.accent[1], color.accent[2]);
  doc.roundedRect(M, 24, 34, 4, 2, 2, 'F');
  doc.setFillColor(color.line[0], color.line[1], color.line[2]);
  doc.roundedRect(M + 39, 24, R - M - 39, 4, 2, 2, 'F');

  let brandX = M;
  let brandY = 50;
  if (b.logo) {
    try {
      const logoW = Math.min(58, Number(b.logoW) || 58);
      const logoH = Math.min(48, logoW * (Number(b.logoH) || 48) / Math.max(1, Number(b.logoW) || 58));
      doc.addImage(b.logo, b.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M, 37, logoW, logoH);
      brandX = M + logoW + 12;
    } catch {
      // A missing or unsupported logo never prevents a quote from downloading.
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setInk();
  txt(b.name || 'Tashmak Design & Print', brandX, brandY);
  let businessY = brandY + 13;
  const businessLines = [
    b.address,
    [b.phone, b.email].filter(Boolean).join('  |  '),
    b.website,
    [b.regNo && 'Reg: ' + b.regNo, b.vatNo && 'VAT No: ' + b.vatNo].filter(Boolean).join('  |  '),
  ];
  businessLines.filter(Boolean).forEach((line: string) => {
    const lines = wrap(line, 238, 7.5, 'normal');
    setMuted();
    lines.forEach((part: string) => {
      txt(part, brandX, businessY);
      businessY += 10;
    });
  });

  const quoteRightX = R;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  setAccent();
  txt('QUOTATION', quoteRightX, 49, { align: 'right' });
  doc.setFontSize(12);
  setInk();
  txt(q.number || 'Quote', quoteRightX, 69, { align: 'right' });

  const headerBottom = Math.max(businessY, 78) + 10;
  horizontalRule(headerBottom, true);
  const cardY = headerBottom + 14;
  const cardGap = 12;
  const leftW = 304;
  const rightW = R - M - leftW - cardGap;
  const customerNameLines = wrap(c.name || 'Customer', leftW - 24, 10.5, 'bold');
  const customerLines = [
    c.company,
    c.phone,
    c.email,
  ].filter(Boolean).flatMap((line: string) => wrap(line, leftW - 24, 8.5, 'normal'));
  const detailLines = [
    'Date: ' + (q.quote_date ? fmtDate(q.quote_date) : '-'),
    q.valid_until ? 'Valid until: ' + fmtDate(q.valid_until) : '',
    q.reference ? 'Reference: ' + q.reference : '',
    q.pricing_snapshot?.staffName ? 'Prepared by: ' + q.pricing_snapshot.staffName : '',
  ].filter(Boolean).flatMap((line: string) => wrap(line, rightW - 24, 8, 'normal'));
  const customerContentHeight = 36 + customerNameLines.length * 12 + customerLines.length * 10;
  const detailContentHeight = 48 + detailLines.length * 10;
  const cardH = Math.max(78, customerContentHeight, detailContentHeight);

  doc.setFillColor(color.soft[0], color.soft[1], color.soft[2]);
  doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
  doc.roundedRect(M, cardY, leftW, cardH, 9, 9, 'FD');
  doc.roundedRect(M + leftW + cardGap, cardY, rightW, cardH, 9, 9, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setAccent();
  txt('PREPARED FOR', M + 12, cardY + 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setInk();
  let customerNameY = cardY + 32;
  customerNameLines.forEach((line: string) => {
    txt(line, M + 12, customerNameY);
    customerNameY += 12;
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setMuted();
  let customerY = customerNameY + 3;
  customerLines.forEach((line: string) => {
    txt(line, M + 12, customerY);
    customerY += 10;
  });

  const detailX = M + leftW + cardGap;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setAccent();
  txt('QUOTE DETAILS', detailX + 12, cardY + 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setMuted();
  let detailY = cardY + 31;
  detailLines.forEach((line: string) => {
    txt(line, detailX + 12, detailY);
    detailY += 10;
  });

  y = cardY + cardH + 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setInk();
  txt('Items and pricing', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setMuted();
  txt('Prices shown are from the saved quotation.', R, y, { align: 'right' });
  y += 12;
  drawTableHeader();

  if (items.length === 0) {
    if (y + 42 > CONTENT_BOTTOM) addPage(true);
    doc.setFillColor(color.softAlt[0], color.softAlt[1], color.softAlt[2]);
    doc.roundedRect(M, y, R - M, 42, 7, 7, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setMuted();
    txt('No items have been added to this quote.', M + 14, y + 25);
    setInk();
    y += 52;
  }

  items.forEach((it: any, index: number) => {
    const calc = (it.item && it.item.calc) || {};
    const lines: { text: string; style: string; color: number[] }[] = [];
    const addWrapped = (value: any, style: string, fontSize: number, ink: number[]) => {
      wrap(value, 250, fontSize, style).forEach((line: string) => lines.push({ text: line, style, color: ink }));
    };
    addWrapped(it.product_name || 'Product', 'bold', 8.5, color.ink);
    addWrapped(it.description, 'normal', 8, color.muted);
    addWrapped(it.item?.specText, 'normal', 7.5, color.muted);
    addWrapped(it.item?.notes, 'italic', 7.5, color.muted);
    if (lines.length === 0) lines.push({ text: 'Product details not provided', style: 'normal', color: color.muted });

    let lineOffset = 0;
    let firstPart = true;
    while (lineOffset < lines.length) {
      if (CONTENT_BOTTOM - y < 34) addPage(true);
      const capacity = Math.max(1, Math.floor((CONTENT_BOTTOM - y - 15) / 11));
      const chunk = lines.slice(lineOffset, lineOffset + capacity);
      const rowH = Math.max(34, chunk.length * 11 + 15);
      if (y + rowH > CONTENT_BOTTOM) {
        addPage(true);
        continue;
      }

      doc.setFillColor(index % 2 === 0 ? color.softAlt[0] : color.soft[0], index % 2 === 0 ? color.softAlt[1] : color.soft[1], index % 2 === 0 ? color.softAlt[2] : color.soft[2]);
      doc.roundedRect(M, y, R - M, rowH - 2, 5, 5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setMuted();
      txt(firstPart ? String(index + 1) : '...', M + 9, y + 16);
      let lineY = y + 15;
      chunk.forEach((line) => {
        doc.setFont('helvetica', line.style);
        doc.setFontSize(line.style === 'bold' ? 8.5 : line.style === 'normal' ? 8 : 7.5);
        doc.setTextColor(line.color[0], line.color[1], line.color[2]);
        txt(line.text, M + 28, lineY);
        lineY += 11;
      });
      if (firstPart) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        setInk();
        txt(Number(it.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 3 }), 355, y + 16, { align: 'right' });
        txt(money(it.unit_price), 425, y + 16, { align: 'right' });
        txt(Number(calc.discountAmount || 0) > 0 ? '-' + money(calc.discountAmount) : '-', 488, y + 16, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        txt(money(it.line_total), R - 8, y + 16, { align: 'right' });
      }
      y += rowH;
      lineOffset += chunk.length;
      firstPart = false;
      if (lineOffset < lines.length) addPage(true);
    }
    doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
    doc.setLineWidth(0.5);
    doc.line(M, y - 3, R, y - 3);
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

  const totalHeight = 32 + (rows.length - 1) * 16 + 23 + 17;
  if (y + totalHeight > CONTENT_BOTTOM) {
    addPage(false);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setInk();
    txt('Quote summary', M, y);
    y += 12;
  } else {
    y += 9;
  }

  const totalsX = R - 228;
  const totalsW = 228;
  const totalsY = y;
  const totalsH = 32 + (rows.length - 1) * 16 + 23 + 17;
  doc.setFillColor(color.soft[0], color.soft[1], color.soft[2]);
  doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
  doc.roundedRect(totalsX, totalsY, totalsW, totalsH, 9, 9, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setAccent();
  txt('QUOTE SUMMARY', totalsX + 13, totalsY + 15);
  let rowY = totalsY + 33;
  rows.slice(0, -1).forEach(([label, amount]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setMuted();
    txt(label, totalsX + 13, rowY);
    setInk();
    txt(amount, totalsX + totalsW - 13, rowY, { align: 'right' });
    rowY += 16;
  });
  doc.setFillColor(color.accentSoft[0], color.accentSoft[1], color.accentSoft[2]);
  doc.roundedRect(totalsX + 8, rowY - 3, totalsW - 16, 23, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setAccent();
  const totalRow = rows[rows.length - 1];
  txt(totalRow[0], totalsX + 14, rowY + 12);
  txt(totalRow[1], totalsX + totalsW - 14, rowY + 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setMuted();
  txt(t.vatEnabled ? (t.vatMode === 'inclusive' ? 'All prices include VAT.' : 'VAT is added to the subtotal.') : 'VAT not charged.', totalsX + 13, rowY + 34);
  setInk();
  y = totalsY + totalsH + 18;

  const sections: [string, any][] = [
    ['Notes', q.notes],
    ['Payment terms', q.payment_terms],
    ['Terms & conditions', q.terms],
  ];
  sections.forEach(([heading, body]) => {
    if (!body) return;
    const bodyLines = wrap(body, R - M - 26, 8.5, 'normal');
    if (bodyLines.length === 0) return;
    let offset = 0;
    let first = true;
    while (offset < bodyLines.length) {
      const labelHeight = first ? 25 : 20;
      if (CONTENT_BOTTOM - y < labelHeight + 24) addPage(false);
      const capacity = Math.max(1, Math.floor((CONTENT_BOTTOM - y - labelHeight - 12) / 11));
      const part = bodyLines.slice(offset, offset + capacity);
      const boxH = labelHeight + part.length * 11 + 12;
      doc.setFillColor(color.softAlt[0], color.softAlt[1], color.softAlt[2]);
      doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
      doc.roundedRect(M, y, R - M, boxH, 7, 7, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setAccent();
      txt(first ? heading : heading + ' (continued)', M + 12, y + 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setInk();
      part.forEach((line: string, lineIndex: number) => txt(line, M + 12, y + labelHeight + lineIndex * 11));
      y += boxH + 9;
      offset += part.length;
      first = false;
      if (offset < bodyLines.length) addPage(false);
    }
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
    doc.setLineWidth(0.6);
    doc.line(M, H - 37, R, H - 37);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setMuted();
    const businessFooter = [b.phone, b.email].filter(Boolean).join('  |  ');
    txt([b.name || 'Tashmak Design & Print', businessFooter].filter(Boolean).join('  |  '), M, H - 22);
    txt('Page ' + page + ' of ' + pageCount, R, H - 22, { align: 'right' });
    setInk();
  }

  return doc.output('blob');
}
