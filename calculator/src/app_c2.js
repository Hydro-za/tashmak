/* ===== quote view / print / PDF / status / job ===== */
function quoteVatLabel(q) { const t = q.totals || {}; return t.vatEnabled ? (t.vatMode === 'inclusive' ? 'All prices include VAT' : 'All prices exclude VAT; VAT is added in the totals') : 'VAT not charged'; }
function quoteDocHTML(q) {
  const S = State.cfg.settings, b = S.business || {}, t = q.totals || {}, inc = t.vatMode === 'inclusive';
  const rows = (q.items || []).map((it, i) => { const c = it.calc || {}; return `<tr><td>${i + 1}</td><td><b>${e(it.productName)}</b>${it.desc ? `<div>${e(it.desc)}</div>` : ''}<div class="small">${e(it.specText || '')}${it.notes ? '\n' + e(it.notes) : ''}</div></td><td class="r">${e(it.qty)}</td><td class="r">${money(c.unitPrice)}</td><td class="r">${c.discountAmount > 0 ? '-' + money(c.discountAmount) : '—'}</td><td class="r">${money(c.finalSubtotal)}</td></tr>`; }).join('');
  return `<div class="qdoc" id="qdoc"><div class="hdr"><div>${b.logo ? `<img class="logo" src="${e(b.logo)}" alt="">` : ''}<div><b>${e(b.name)}</b></div><div class="small">${e(b.address)}\n${e(b.phone)}${b.email ? ' · ' + e(b.email) : ''}${b.website ? '\n' + e(b.website) : ''}${b.regNo ? '\nReg: ' + e(b.regNo) : ''}${b.vatNo ? '\nVAT No: ' + e(b.vatNo) : ''}</div></div>
   <div style="text-align:right"><h1>QUOTATION</h1><div><b>${e(q.number)}</b></div><div class="small">Date: ${fmtDate(q.date)}\nValid until: ${fmtDate(q.expiry)}${q.ref ? '\nReference: ' + e(q.ref) : ''}${q.staffName ? '\nPrepared by: ' + e(q.staffName) : ''}</div></div></div>
   <div class="cols"><div><div class="small"><b>Quote for</b></div><div><b>${e(q.customer.name)}</b></div>${q.customer.company ? `<div>${e(q.customer.company)}</div>` : ''}<div class="small">${e(q.customer.phone)}${q.customer.email ? '\n' + e(q.customer.email) : ''}</div></div></div>
   <table><thead><tr><th style="width:30px">#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Discount</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
   <div class="tot"><div><span>Items</span><span>${money(t.gross)}</span></div>${t.lineDiscounts > 0 ? `<div><span>Line discounts</span><span>-${money(t.lineDiscounts)}</span></div>` : ''}${t.quoteDiscount > 0 ? `<div><span>Discount</span><span>-${money(t.quoteDiscount)}</span></div>` : ''}${t.minOrderAdjustment > 0 ? `<div><span>Minimum order adjustment</span><span>${money(t.minOrderAdjustment)}</span></div>` : ''}
   <div><span>Subtotal${t.vatEnabled ? ' (excl. VAT)' : ''}</span><span>${money(t.subtotal)}</span></div>${t.vatEnabled ? `<div><span>VAT ${pctf(t.vatRate)}</span><span>${money(t.vat)}</span></div>` : ''}<div class="g"><span>Total${t.vatEnabled ? ' (incl. VAT)' : ''}</span><span>${money(t.total)}</span></div></div>
   <div class="small" style="text-align:right;margin-top:4px">${e(quoteVatLabel(q))}</div>
   ${q.notes ? `<div style="margin-top:16px"><b>Notes</b><div class="small">${e(q.notes)}</div></div>` : ''}${q.paymentTerms ? `<div style="margin-top:12px"><b>Payment terms</b><div class="small">${e(q.paymentTerms)}</div></div>` : ''}${q.terms ? `<div style="margin-top:12px"><b>Terms & conditions</b><div class="small">${e(q.terms)}</div></div>` : ''}</div>`;
}
function viewQuote() {
  const q = State.quotes[State.params.id];
  if (!q || (!can('viewAllQuotes') && q.createdBy !== State.me.id)) return `<div class="top"><h1>Quote not found</h1><button class="btn" data-act="nav" data-v="quotes">Back</button></div>`;
  const st = effStatus(q), t = q.totals || {}, ds = quoteApproval(q);
  resolveNames([q.createdBy, ...(q.history || []).map(h => h.uid)]);
  const next = STATUSES.filter(s => s[0] !== q.status && s[0] !== 'converted' && s[0] !== 'expired').map(s => `<button class="btn sm" data-act="q-status" data-id="${e(q.id)}" data-s="${s[0]}">Mark ${s[1]}</button>`).join('');
  let internal = '';
  if (can('viewCosts') || can('viewProfit') || can('viewMargin')) internal = `<div class="card noprint"><h2>Internal — not shown to the customer</h2><div class="grid g4">${can('viewCosts') ? `<div class="metric"><div class="k">Production cost</div><div class="v">${money(t.productionCost)}</div></div>` : ''}${can('viewProfit') ? `<div class="metric"><div class="k">Gross profit</div><div class="v">${money(t.grossProfit)}</div></div>` : ''}${can('viewMargin') ? `<div class="metric"><div class="k">Gross margin</div><div class="v">${pctf(t.marginPct)}</div></div>` : ''}<div class="metric"><div class="k">Total discount</div><div class="v">${pctf(t.discountPct)}</div></div></div>
   ${(q.items || []).filter(i => i.override).map(i => `<div class="alert warn" style="margin-top:10px">Manual price override on “${e(i.productName)}”: calculated ${money(i.override.original)} → ${money(i.override.price)}${i.override.reason ? ' — ' + e(i.override.reason) : ''} (${e(nameOf(i.override.by))}, ${fmtTime(i.override.at)})</div>`).join('')}</div>`;
  return `<div class="top noprint"><div><h1>${e(q.number)} ${badge(st)}</h1><div class="muted">Created by ${e(q.staffName || nameOf(q.createdBy))} · ${fmtTime(q.createdAt)}</div></div>
   <div class="actions"><button class="btn" data-act="nav" data-v="quotes">← Quotes</button>${can('editQuotes') ? `<button class="btn" data-act="edit-quote" data-id="${e(q.id)}">Edit</button>` : ''}${can('createQuotes') ? `<button class="btn" data-act="dup-quote" data-id="${e(q.id)}">Duplicate</button>` : ''}<button class="btn" data-act="q-print">Print</button><button class="btn primary" data-act="q-pdf" data-id="${e(q.id)}">Download PDF</button></div></div>
   ${ds.needs ? `<div class="alert warn noprint"><b>Discount of ${pctf(t.discountPct)} needs approval</b> before this quote can be sent or accepted. ${ds.canApprove ? `<button class="btn sm" data-act="q-approve" data-id="${e(q.id)}">Approve discount</button>` : 'Ask a manager to approve.'}</div>` : (q.discountApproval ? `<div class="alert ok noprint">Discount approved by ${e(nameOf(q.discountApproval.by))} on ${fmtTime(q.discountApproval.at)}.</div>` : '')}
   ${can('changeStatus') ? `<div class="card noprint" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>Status</b>${next}${q.status !== 'converted' && (q.status === 'accepted' || can('createQuotes')) ? `<button class="btn sm primary" data-act="q-convert" data-id="${e(q.id)}">Convert to job</button>` : ''}${can('deleteQuotes') ? `<button class="btn sm danger" data-act="q-delete" data-id="${e(q.id)}" style="margin-left:auto">Delete</button>` : ''}</div>` : ''}
   ${quoteDocHTML(q)}<div style="height:14px"></div>${internal}
   <div class="card noprint"><h2>History</h2>${(q.history || []).slice().reverse().map(h => `<div class="rowline sub"><span>${e(h.action)}${h.detail ? ' — ' + e(h.detail) : ''}</span><span>${e(nameOf(h.uid))} · ${fmtTime(h.ts)}</span></div>`).join('') || '<p class="muted">No history.</p>'}</div>`;
}
function quoteApproval(q) {
  const t = q.totals || {}, S = State.cfg.settings;
  const pol = PQ.discountPolicy(S, q.createdRole || 'staff', PQ.num(t.discountPct));
  const approved = q.discountApproval && PQ.num(q.discountApproval.pct) + 0.005 >= PQ.num(t.discountPct);
  const mgrMax = PQ.num((S.discount || {}).managerMaxPct, 0);
  return { needs: pol.needsApproval && !approved, canApprove: can('approveDiscount') && (isOwnerRole() || PQ.num(t.discountPct) <= mgrMax) };
}
async function setStatus(q, s) {
  if (['sent', 'accepted', 'converted'].includes(s) && quoteApproval(q).needs) { toast('This quote\'s discount needs manager approval first', 'bad'); return false; }
  const old = q.status, now = Date.now(), me = State.me.id || 'local'; const n = clone(q);
  n.status = s; n.updatedAt = now; n.history = [...(n.history || []), { ts: now, uid: me, action: 'Status changed', detail: statusLabel(old) + ' → ' + statusLabel(s) }].slice(-100);
  const r = await safe(() => DB.setQuote(n)); if (r) await DB.audit('Quote status changed', q.number, statusLabel(old), statusLabel(s)); return !!r;
}
Object.assign(ACT, {
  'q-status': async el => { const q = State.quotes[el.dataset.id]; if (await setStatus(q, el.dataset.s)) { toast('Status updated'); render(true); } },
  'q-approve': async el => {
    const q = clone(State.quotes[el.dataset.id]), now = Date.now();
    if (!await confirmDialog({ title: 'Approve discount?', body: `<p>Approve a total discount of <b>${pctf(q.totals.discountPct)}</b> on ${e(q.number)}?</p>`, okLabel: 'Approve' })) return;
    q.discountApproval = { by: State.me.id || 'local', at: now, pct: q.totals.discountPct }; q.history = [...(q.history || []), { ts: now, uid: State.me.id || 'local', action: 'Manager approved discount', detail: pctf(q.totals.discountPct) }];
    if (await safe(() => DB.setQuote(q), 'Discount approved')) { await DB.audit('Manager approved discount', q.number, '', pctf(q.totals.discountPct)); render(true); }
  },
  'q-convert': async el => {
    const q = State.quotes[el.dataset.id];
    if (quoteApproval(q).needs) { toast('Discount needs approval first', 'bad'); return; }
    if (!await confirmDialog({ title: 'Convert to job?', body: `<p>Create a production job from ${e(q.number)} and mark the quote as <b>Converted to Job</b>.</p>`, okLabel: 'Convert' })) return;
    const job = { id: 'job_' + q.id, quoteId: q.id, number: q.number.replace(/^[A-Za-z]+/, 'JOB'), customer: q.customer, items: q.items.map(i => ({ name: i.productName, desc: i.desc, spec: i.specText, qty: i.qty })), total: (q.totals || {}).total, status: 'new', createdAt: Date.now(), createdBy: State.me.id || 'local' };
    await safe(async () => { await DB.setJob(job); await setStatus(q, 'converted'); }, 'Job created'); await DB.audit('Converted quote to job', q.number, '', job.number); render(true);
  },
  'q-delete': async el => { const q = State.quotes[el.dataset.id]; if (!await confirmDialog({ title: 'Delete quote ' + q.number + '?', body: '<p>This permanently removes the quote. Consider marking it Rejected instead. This cannot be undone.</p>', okLabel: 'Delete permanently', danger: true })) return; if (await safe(() => DB.delQuote(q.id), 'Quote deleted')) { await DB.audit('Deleted quote', q.number); go('quotes', {}); } },
  'q-print': () => { try { window.print(); } catch (er) { toast('Printing is blocked here — use Download PDF', 'bad'); } },
  'q-pdf': el => downloadPDF(State.quotes[el.dataset.id])
});

/* ---------- PDF ---------- */
let pdfLib;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  if (pdfLib) return pdfLib;
  return pdfLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => { pdfLib = null; rej(new Error('PDF library could not load')); }; document.head.appendChild(s); });
}
async function downloadPDF(q) {
  let J; try { J = await loadJsPDF(); } catch (er) { toast('PDF library could not load — use Print instead', 'bad'); return; }
  const S = State.cfg.settings, b = S.business || {}, t = q.totals || {}, doc = new J({ unit: 'pt', format: 'a4' }), W = 595, M = 40, R = W - M; let y = M;
  const ascii = s => String(s ?? '').replace(/[–—]/g, '-').replace(/[×]/g, 'x').replace(/[·]/g, '|').replace(/[^\x20-\x7E\n]/g, '');
  const txt = (s, x, yy, o) => doc.text(ascii(s), x, yy, o);
  const need = h => { if (y + h > 800) { doc.addPage(); y = M; } };
  if (b.logo) { try { const lw = Math.min(150, PQ.num(b.logoW, 150)), lh = lw * PQ.num(b.logoH, 50) / Math.max(1, PQ.num(b.logoW, 150)); doc.addImage(b.logo, 'PNG', M, y, lw, lh); y += lh + 6; } catch (er) { /* skip logo */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); txt(b.name || '', M, y); y += 14; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  [b.address, [b.phone, b.email].filter(Boolean).join(' | '), b.website, b.regNo && 'Reg: ' + b.regNo, b.vatNo && 'VAT No: ' + b.vatNo].filter(Boolean).forEach(l => String(l).split('\n').forEach(s => { txt(s, M, y); y += 11; }));
  let ry = M; doc.setFont('helvetica', 'bold'); doc.setFontSize(22); txt('QUOTATION', R, ry + 16, { align: 'right' }); doc.setFontSize(11); txt(q.number, R, ry + 34, { align: 'right' }); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  ry += 48; [`Date: ${fmtDate(q.date)}`, `Valid until: ${fmtDate(q.expiry)}`, q.ref && `Reference: ${q.ref}`, q.staffName && `Prepared by: ${q.staffName}`].filter(Boolean).forEach(l => { txt(l, R, ry, { align: 'right' }); ry += 11; });
  y = Math.max(y, ry) + 16; doc.setFont('helvetica', 'bold'); txt('Quote for', M, y); y += 13; doc.setFontSize(11); txt(q.customer.name, M, y); y += 13; doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  [q.customer.company, q.customer.phone, q.customer.email].filter(Boolean).forEach(s => { txt(s, M, y); y += 11; }); y += 10;
  const cx = [M, M + 22, 330, 375, 445, R]; // # | desc | qty | unit | disc | total(right-aligned)
  const head = () => { doc.setFillColor(17, 17, 17); doc.rect(M, y, R - M, 18, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); txt('#', cx[0] + 4, y + 12); txt('Description', cx[1], y + 12); txt('Qty', 365, y + 12, { align: 'right' }); txt('Unit price', 435, y + 12, { align: 'right' }); txt('Discount', 500, y + 12, { align: 'right' }); txt('Total', R - 4, y + 12, { align: 'right' }); doc.setTextColor(0); doc.setFont('helvetica', 'normal'); y += 18; };
  head();
  (q.items || []).forEach((it, i) => {
    const c = it.calc || {}, lines = [];
    doc.setFont('helvetica', 'bold'); lines.push(...doc.splitTextToSize(ascii(it.productName + (it.desc ? ' - ' + it.desc : '')), 270).map(s => [s, 1]));
    doc.setFont('helvetica', 'normal'); lines.push(...doc.splitTextToSize(ascii((it.specText || '') + (it.notes ? ' | ' + it.notes : '')), 270).map(s => [s, 0]));
    const h = lines.length * 11 + 10; if (y + h > 790) { doc.addPage(); y = M; head(); }
    txt(String(i + 1), cx[0] + 4, y + 13); let ly = y + 13; lines.forEach(([s, bold]) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); if (!bold) doc.setTextColor(90); txt(s, cx[1], ly); doc.setTextColor(0); ly += 11; }); doc.setFont('helvetica', 'normal');
    txt(String(it.qty), 365, y + 13, { align: 'right' }); txt(money(c.unitPrice), 435, y + 13, { align: 'right' }); txt(c.discountAmount > 0 ? '-' + money(c.discountAmount) : '-', 500, y + 13, { align: 'right' }); txt(money(c.finalSubtotal), R - 4, y + 13, { align: 'right' });
    y += h; doc.setDrawColor(220); doc.line(M, y - 3, R, y - 3);
  });
  need(140); y += 10; const row = (l, v, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 12 : 9); txt(l, 360, y); txt(v, R - 4, y, { align: 'right' }); y += bold ? 18 : 13; };
  row('Items', money(t.gross)); if (t.lineDiscounts > 0) row('Line discounts', '-' + money(t.lineDiscounts)); if (t.quoteDiscount > 0) row('Discount', '-' + money(t.quoteDiscount)); if (t.minOrderAdjustment > 0) row('Minimum order adjustment', money(t.minOrderAdjustment));
  row('Subtotal' + (t.vatEnabled ? ' (excl. VAT)' : ''), money(t.subtotal)); if (t.vatEnabled) row('VAT ' + pctf(t.vatRate), money(t.vat)); doc.setDrawColor(0); doc.line(360, y - 9, R, y - 9); row('Total' + (t.vatEnabled ? ' (incl. VAT)' : ''), money(t.total), true);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); txt(quoteVatLabel(q), R - 4, y, { align: 'right' }); y += 16; doc.setFontSize(9);
  [['Notes', q.notes], ['Payment terms', q.paymentTerms], ['Terms & conditions', q.terms]].forEach(([h, s]) => { if (!s) return; const ls = doc.splitTextToSize(ascii(s), R - M); need(16 + ls.length * 11); doc.setFont('helvetica', 'bold'); txt(h, M, y); y += 12; doc.setFont('helvetica', 'normal'); ls.forEach(l => { txt(l, M, y); y += 11; }); y += 8; });
  const fn = ('Quote-' + q.number + '.pdf').replace(/[^A-Za-z0-9_.-]/g, '-');
  try {
    const dl = await useCap('downloads');
    if (dl) { await dl.save({ filename: fn, data: doc.output('arraybuffer') }); toast('PDF ready'); }
    else doc.save(fn);
  } catch (er) { if (er && er.code === 'declined') return; try { doc.save(fn); } catch (x) { toast('Could not save the PDF here — use Print', 'bad'); } }
}
