/* ===== line-item editor, quote editor, calculators ===== */
const PAPER_SIZES = [['A6', 105, 148], ['A5', 148, 210], ['A4', 210, 297], ['A3', 297, 420], ['DL', 99, 210], ['Business card', 90, 55], ['A2', 420, 594], ['A1', 594, 841]];
const PRINT_SIZES = [['A6', 10.5, 14.8], ['A5', 14.8, 21], ['A4', 21, 29.7], ['A3', 29.7, 42], ['Chest 10×10', 10, 10], ['Pocket 8×8', 8, 8]];
const POSITIONS = ['Front', 'Back', 'Left chest', 'Right chest', 'Left sleeve', 'Right sleeve', 'Neck', 'Other'];
const GROUPS = [['base', 'Base price'], ['material', 'Materials'], ['print', 'Ink / printing'], ['machine', 'Machine cost'], ['labour', 'Labour'], ['finishing', 'Finishing'], ['packaging', 'Packaging'], ['wastage', 'Wastage'], ['other', 'Other costs'], ['custom', 'Custom cost']];
const clone = o => JSON.parse(JSON.stringify(o));
const activeProducts = () => Object.values(State.cfg.products).filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
const primaryMaterialId = p => { const c = (p.components || []).find(c => c.primary && c.materialId) || (p.components || []).find(c => c.materialId); return c ? c.materialId : ''; };
const finDefaultQty = id => { const f = State.cfg.finishing[id]; return f && f.askQty ? f.defaultQty || 1 : 1; };
const needsDimsUI = p => ['large', 'paper'].includes(p.profile) || ['per_sqm', 'per_metre'].includes(p.method) || PQ.num(p.defaultW) > 0;

function recalc(it) {
  const cfg = engineCfg(), p = cfg.products[it.productId];
  it.calc = PQ.calcLine(it, cfg); it.pricedAt = Date.now();
  if (p) {
    it.productName = p.name; const c = cfg.categories[p.category]; it.categoryName = c ? c.name : '';
    const parts = [];
    if (needsDimsUI(p) && PQ.num(it.w) > 0 && PQ.num(it.h) > 0) parts.push(`${it.w} × ${it.h} ${it.unit || 'mm'}`);
    const m = it.materialId && cfg.materials[it.materialId]; if (m) parts.push(m.name);
    if (p.profile === 'paper') { parts.push(PQ.num(it.sides) === 2 ? 'double-sided' : 'single-sided'); parts.push(it.colour === 'bw' ? 'B&W' : 'full colour'); if (PQ.num(it.pages) > 1) parts.push(it.pages + ' pages'); }
    if (p.profile === 'dtf') { if (it.garmentColour) parts.push(it.garmentColour); (it.prints || []).forEach(x => parts.push(`${x.label || 'Print'} ${x.w}×${x.h}cm${PQ.num(x.count) > 1 ? ' ×' + x.count : ''}`)); }
    const fin = (it.finishing || []).map(s => (cfg.finishing[s.id] || {}).name).filter(Boolean); if (fin.length) parts.push('Finishing: ' + fin.join(', '));
    it.specText = parts.join(' · ');
  }
}
function newItem(prodId) {
  const p = State.cfg.products[prodId]; if (!p) return null;
  const it = { key: uid('i'), productId: prodId, desc: '', qty: p.defaultQty || 1, unit: p.unit || 'mm', w: p.defaultW || '', h: p.defaultH || '', sides: p.defaultSides || 1, pages: p.defaultPages || 1, colour: 'colour',
    materialId: primaryMaterialId(p), prints: clone(p.defaultPrints || []), garmentColour: '', finishing: (p.defaultFinishing || []).map(id => ({ id, qty: finDefaultQty(id) })),
    extraMinutes: '', labourId: '', customLabel: '', customCost: '', markupOverride: '', discount: { type: 'pct', value: '' }, notes: '', override: null };
  recalc(it); return it;
}
const fld = (label, inner, help, cls) => `<div class="field ${cls || ''}"><label>${label}</label>${inner}${help ? `<div class="help">${help}</div>` : ''}</div>`;
const opt = (v, l, sel) => `<option value="${e(v)}" ${sel ? 'selected' : ''}>${e(l)}</option>`;

function itemFieldsHTML(it) {
  const cfg = engineCfg(), p = cfg.products[it.productId], k = e(it.key); if (!p) return '<p class="muted">Product missing.</p>';
  const A = f => `data-i="${k}" data-f="${f}"`;
  const prim = (p.components || []).find(c => c.primary && c.materialId) || (p.components || []).find(c => c.materialId);
  const pm = prim && cfg.materials[prim.materialId];
  const matChoices = pm ? Object.values(cfg.materials).filter(m => m.costBasis === pm.costBasis && (m.active !== false || m.id === it.materialId)).sort((a, b) => a.name.localeCompare(b.name)) : [];
  let h = '';
  h += `<div class="grid g2">${fld('Description', `<input ${A('desc')} value="${e(it.desc)}" placeholder="Job name / artwork ref (shown on quote)">`)}
    ${fld('Quantity', `<div class="qty"><button class="btn" type="button" data-act="qty-dec" data-key="${k}">−</button><input type="number" inputmode="numeric" min="0" step="any" ${A('qty')} value="${e(it.qty)}"><button class="btn" type="button" data-act="qty-inc" data-key="${k}">+</button></div>`)}</div>`;
  h += '<div class="grid g3" style="margin-top:12px">';
  if (needsDimsUI(p)) {
    if (p.profile === 'paper') h += fld('Finished size', `<select ${A('sizePreset')}><option value="">Custom</option>${PAPER_SIZES.map(s => opt(s[0], `${s[0]} (${s[1]}×${s[2]})`, it.unit === 'mm' && PQ.num(it.w) === s[1] && PQ.num(it.h) === s[2])).join('')}</select>`);
    h += fld('Width', `<input type="number" inputmode="decimal" min="0" step="any" ${A('w')} value="${e(it.w)}">`) + fld('Height', `<input type="number" inputmode="decimal" min="0" step="any" ${A('h')} value="${e(it.h)}">`) +
      fld('Unit', `<select ${A('unit')}>${['mm', 'cm', 'm'].map(u => opt(u, u, it.unit === u)).join('')}</select>`);
  }
  if (matChoices.length) h += fld(p.profile === 'dtf' ? 'Garment' : 'Material', `<select ${A('materialId')}>${matChoices.map(m => opt(m.id, m.name, m.id === it.materialId)).join('')}</select>`);
  if (p.profile === 'dtf') h += fld('Garment colour', `<input ${A('garmentColour')} value="${e(it.garmentColour || '')}" placeholder="e.g. White, Black, Navy">`);
  if (p.profile === 'paper') h += fld('Print sides', `<select ${A('sides')}>${opt(1, 'Single-sided', PQ.num(it.sides) === 1)}${opt(2, 'Double-sided', PQ.num(it.sides) === 2)}</select>`) + fld('Colour', `<select ${A('colour')}>${opt('colour', 'Full colour', it.colour !== 'bw')}${opt('bw', 'Black & white', it.colour === 'bw')}</select>`) + fld('Pages (per copy)', `<input type="number" min="1" step="1" ${A('pages')} value="${e(it.pages)}">`, 'Booklets: total pages');
  h += '</div>';
  if (p.usePrintList) {
    h += `<div class="lbl" style="margin:14px 0 6px">Print positions & sizes (cm)</div>`;
    (it.prints || []).forEach((pr, i) => {
      const P = f => `data-i="${k}" data-pr="${i}" data-f="${f}"`;
      h += `<div class="listrow" style="grid-template-columns:1.3fr 1fr 1fr .8fr auto"><div class="field"><label>Position</label><input list="poslist" ${P('prLabel')} value="${e(pr.label || '')}"></div>
        <div class="field"><label>Width cm</label><input type="number" min="0" step="any" ${P('prW')} value="${e(pr.w)}"></div><div class="field"><label>Height cm</label><input type="number" min="0" step="any" ${P('prH')} value="${e(pr.h)}"></div>
        <div class="field"><label>Count</label><input type="number" min="1" step="1" ${P('prCount')} value="${e(pr.count)}"></div>
        <div style="display:flex;gap:4px"><select ${P('prPreset')} style="width:92px"><option value="">Size…</option>${PRINT_SIZES.map(s => `<option value="${s[0]}">${s[0]}</option>`).join('')}</select><button class="btn icon danger" type="button" data-act="pr-del" data-key="${k}" data-idx="${i}" aria-label="Remove print">✕</button></div></div>`;
    });
    h += `<datalist id="poslist">${POSITIONS.map(x => `<option value="${x}">`).join('')}</datalist><button class="btn sm" type="button" data-act="pr-add" data-key="${k}">+ Add print position</button>`;
  }
  const allowed = (p.allowedFinishing || []).map(id => cfg.finishing[id]).filter(f => f && (f.active !== false || (it.finishing || []).some(s => s.id === f.id)));
  if (allowed.length) {
    h += `<div class="lbl" style="margin:14px 0 4px">Finishing & extras</div><div>${allowed.map(f => {
      const sel = (it.finishing || []).find(s => s.id === f.id);
      return `<div class="fin"><input type="checkbox" ${sel ? 'checked' : ''} data-i="${k}" data-f="finOn" data-fin="${e(f.id)}" id="fin-${k}-${e(f.id)}"><label for="fin-${k}-${e(f.id)}">${e(f.name)}</label>${f.askQty ? `<span style="display:flex;gap:6px;align-items:center"><span class="muted" style="font-size:12px">${e(f.qtyLabel || 'Qty')}</span><input type="number" min="0" step="1" data-i="${k}" data-f="finQty" data-fin="${e(f.id)}" value="${e(sel ? sel.qty : f.defaultQty || 1)}" ${sel ? '' : 'disabled'}></span>` : '<span></span>'}</div>`;
    }).join('')}</div>`;
  }
  h += '<div class="grid g3" style="margin-top:14px">';
  h += fld('Custom cost (R, total)', `<input type="number" min="0" step="any" inputmode="decimal" ${A('customCost')} value="${e(it.customCost)}">`, 'Supplier / outsourced cost added to production cost') + fld('Custom cost label', `<input ${A('customLabel')} value="${e(it.customLabel)}" placeholder="e.g. Supplier mugs">`);
  if (can('overrideMarkup')) h += fld('Markup override %', `<input type="number" min="0" step="any" ${A('markupOverride')} value="${e(it.markupOverride)}" placeholder="default">`, 'Leave blank to use the default');
  if (can('overrideMarkup')) h += fld('Extra labour (minutes)', `<input type="number" min="0" step="any" ${A('extraMinutes')} value="${e(it.extraMinutes)}">`) + fld('Labour type', `<select ${A('labourId')}><option value="">Product default</option>${Object.values(cfg.labour).map(l => opt(l.id, l.name, it.labourId === l.id)).join('')}</select>`);
  if (can('applyDiscount')) h += fld('Line discount', `<div style="display:flex;gap:6px"><select ${A('discType')} style="width:84px"><option value="pct" ${it.discount.type !== 'fixed' ? 'selected' : ''}>%</option><option value="fixed" ${it.discount.type === 'fixed' ? 'selected' : ''}>R</option></select><input type="number" min="0" step="any" ${A('discVal')} value="${e(it.discount.value)}"></div>`);
  h += '</div>';
  if (can('overridePrice')) {
    const ov = it.override;
    h += `<div style="margin-top:12px"><label class="chk"><input type="checkbox" ${A('ovOn')} ${ov ? 'checked' : ''}> Manual price override</label><div class="grid g2" id="ov-${k}" style="margin-top:8px;${ov ? '' : 'display:none'}">${fld('Override price for the whole line (R)', `<input type="number" min="0" step="any" ${A('ovPrice')} value="${e(ov ? ov.price : '')}">`) + fld('Reason (optional)', `<input ${A('ovReason')} value="${e(ov ? ov.reason || '' : '')}">`)}</div></div>`;
  }
  h += `<div style="margin-top:12px">${fld('Notes', `<input ${A('notes')} value="${e(it.notes)}" placeholder="Internal / customer notes for this line">`)}</div>`;
  return h;
}

function calcDetailsHTML(it) {
  const c = it.calc, qty = PQ.num(it.qty) || 1, showC = can('viewCosts');
  let h = `<div class="rowline"><span>Unit price</span><b>${money(c.unitPrice)}</b></div><div class="rowline"><span>Quantity</span><span>${e(it.qty)}</span></div>`;
  if (c.discountAmount > 0) h += `<div class="rowline sub"><span>Line discount</span><span>-${money(c.discountAmount)}</span></div>`;
  h += `<div class="rowline tot"><span>Line total</span><span>${money(c.finalSubtotal)}</span></div>`;
  if (c.minApplied) h += `<div class="muted" style="font-size:12px">Minimum charge of ${money(c.minPrice)} applied.</div>`;
  if (c.overrideApplied) h += `<div class="alert warn" style="margin-top:8px">Manual price override (calculated price was ${money(c.calculatedPrice)}).</div>`;
  if (!showC) return h;
  const rows = GROUPS.map(([g, label]) => {
    const ls = c.lines.filter(l => l.group === g); if (!ls.length) return '';
    return `<tr><td colspan="4" style="background:var(--soft);font-weight:600">${label}</td></tr>` + ls.map(l => `<tr><td>${e(l.label)}</td><td class="muted">${e(l.detail)}</td><td class="r">${money(l.amount / qty)}</td><td class="r">${money(l.amount)}</td></tr>`).join('');
  }).join('');
  h += `<details class="calc"><summary>Calculation details</summary><div class="tblwrap"><table class="tbl" style="margin-top:8px"><thead><tr><th>Cost item</th><th>How</th><th class="r">Per unit</th><th class="r">Total</th></tr></thead><tbody>${rows}
    <tr><td colspan="2"><b>Production cost</b></td><td class="r"><b>${money(c.productionCost / qty)}</b></td><td class="r"><b>${money(c.productionCost)}</b></td></tr>
    <tr><td colspan="2">${c.markupMode === 'margin' ? 'Margin' : 'Markup'} ${pctf(c.markupPct)} <span class="muted">(${e(c.markupSource)})</span></td><td class="r">${money((c.sellingBeforeMin - c.productionCost) / qty)}</td><td class="r">${money(c.sellingBeforeMin - c.productionCost)}</td></tr>
    <tr><td colspan="2"><b>Selling price</b> ${c.minApplied ? '<span class="muted">(after minimum charge)</span>' : ''}${c.calculatedPrice !== c.sellingBeforeMin && !c.minApplied ? '<span class="muted">(after rounding)</span>' : ''}</td><td class="r"><b>${money(c.calculatedPrice / qty)}</b></td><td class="r"><b>${money(c.calculatedPrice)}</b></td></tr>
    ${c.overrideApplied ? `<tr><td colspan="3">Manual override price</td><td class="r">${money(c.sellingPrice)}</td></tr>` : ''}
    ${c.discountAmount > 0 ? `<tr><td colspan="3">Discount</td><td class="r">-${money(c.discountAmount)}</td></tr>` : ''}
    <tr><td colspan="3"><b>Line total (× ${e(it.qty)})</b></td><td class="r"><b>${money(c.finalSubtotal)}</b></td></tr>
    ${can('viewProfit') ? `<tr><td colspan="3">Gross profit</td><td class="r">${money(c.grossProfit)}</td></tr>` : ''}${can('viewMargin') ? `<tr><td colspan="3">Gross margin</td><td class="r">${pctf(c.marginPct)}</td></tr>` : ''}</tbody></table></div></details>`;
  return h;
}
function itemResultHTML(it) {
  const c = it.calc; let h = '';
  if (!c.ok) h += c.errors.map(x => `<div class="alert bad">${e(x)}</div>`).join('');
  h += (c.warnings || []).map(x => `<div class="alert warn">${e(x)}</div>`).join('');
  if (c.ok || c.finalSubtotal > 0) h += calcDetailsHTML(it);
  return h;
}
function itemHTML(it, idx, opts) {
  const c = it.calc || {}, closed = it.closed ? 'closed' : '';
  return `<div class="item ${closed}" id="it-${e(it.key)}"><div class="ih" data-act="item-toggle" data-key="${e(it.key)}"><span class="badge">${idx + 1}</span><span class="t">${e(it.productName || 'Item')}${it.desc ? ' — ' + e(it.desc) : ''} <span class="muted">× ${e(it.qty)}</span></span><span class="p">${money(c.finalSubtotal)}</span></div>
  <div class="ib"><div class="grid g2" style="margin-bottom:12px">${fld('Product', `<select data-i="${e(it.key)}" data-f="productId">${productOptions(it.productId)}</select>`)}<div style="display:flex;gap:6px;align-items:flex-end;justify-content:flex-end">${opts && opts.single ? '' : `<button class="btn sm" data-act="item-dup" data-key="${e(it.key)}">Duplicate line</button><button class="btn sm danger" data-act="item-del" data-key="${e(it.key)}">Remove</button>`}</div></div>
  <div class="it-fields">${itemFieldsHTML(it)}</div><div class="it-res" style="margin-top:14px">${itemResultHTML(it)}</div></div></div>`;
}
function productOptions(sel) {
  const cats = Object.values(State.cfg.categories).sort((a, b) => a.name.localeCompare(b.name)), prods = activeProducts();
  const cur = State.cfg.products[sel]; const list = cur && cur.active === false ? [...prods, cur] : prods;
  let h = '';
  cats.forEach(c => { const ps = list.filter(p => p.category === c.id); if (ps.length) h += `<optgroup label="${e(c.name)}">${ps.map(p => opt(p.id, p.name, p.id === sel)).join('')}</optgroup>`; });
  const orphan = list.filter(p => !cats.some(c => c.id === p.category)); if (orphan.length) h += orphan.map(p => opt(p.id, p.name, p.id === sel)).join('');
  return h;
}

/* ---------- editor session ---------- */
function newQuoteDraft() {
  const S = State.cfg.settings, Q = S.quotes || {}, today = todayISO();
  return { id: null, number: null, status: 'draft', createdAt: 0, createdBy: State.me.id || 'local', customer: { name: '', company: '', phone: '', email: '' }, ref: '', date: today, expiry: addDays(today, PQ.num(Q.expiryDays, 14)),
    staffName: State.me.name || '', notes: Q.defaultNotes || '', terms: Q.terms || '', paymentTerms: Q.paymentTerms || '', items: [], discount: { type: 'pct', value: '' }, discountApproval: null, history: [],
    snap: { vat: { enabled: S.vat.enabled, rate: S.vat.rate, mode: S.vat.mode, discountReducesVat: (S.discount || {}).discountReducesVat !== false }, minOrder: PQ.num((S.pricing || {}).minOrder) } };
}
function viewEditor() {
  if (!State.ed) {
    const P = State.params; let Q;
    if (P.id && State.quotes[P.id]) { Q = clone(State.quotes[P.id]); }
    else if (P.dupOf && State.quotes[P.dupOf]) {
      const src = clone(State.quotes[P.dupOf]); Q = newQuoteDraft(); Q.customer = src.customer; Q.ref = ''; Q.notes = src.notes; Q.terms = src.terms || Q.terms; Q.paymentTerms = src.paymentTerms || Q.paymentTerms; Q.discount = src.discount || Q.discount;
      Q.items = src.items.map(i => { i.key = uid('i'); i.override = null; return i; }); Q.items.forEach(recalc); Q.copiedFrom = src.number;
    } else { Q = newQuoteDraft(); if (State.pendingItem) { Q.items = [State.pendingItem]; State.pendingItem = null; } }
    Q.items.forEach(i => { if (!i.key) i.key = uid('i'); if (!i.calc) recalc(i); });
    State.ed = { kind: 'quote', Q, isNew: !Q.id };
    if (Q.copiedFrom) State.dirty = true;
  }
  const { Q } = State.ed, S = State.cfg.settings;
  if (!can(Q.id ? 'editQuotes' : 'createQuotes')) return `<div class="alert bad">You don't have permission to ${Q.id ? 'edit' : 'create'} quotes.</div>`;
  const cust = Object.values(State.customers);
  return `<div class="top"><div><h1>${Q.id ? 'Edit ' + e(Q.number) : 'New quote'}</h1>${Q.copiedFrom ? `<div class="muted">Copied from ${e(Q.copiedFrom)} — prices recalculated with current pricing</div>` : ''}</div>
    <div class="actions"><button class="btn" data-act="ed-cancel">Cancel</button><button class="btn primary" data-act="ed-save">Save quote</button></div></div>
  <div class="split"><div>
   <div class="card"><h2>Customer & quote details</h2><div class="grid g2">
    ${fld('Customer name *', `<input data-q="customer.name" list="custlist" value="${e(Q.customer.name)}" autocomplete="off">`)}${fld('Company', `<input data-q="customer.company" value="${e(Q.customer.company)}">`)}
    ${fld('Phone', `<input type="tel" data-q="customer.phone" value="${e(Q.customer.phone)}">`)}${fld('Email', `<input type="email" data-q="customer.email" value="${e(Q.customer.email)}">`)}
    ${fld('Quote number', `<input value="${e(Q.number || 'Assigned automatically when saved')}" disabled>`)}${fld('Your reference / PO', `<input data-q="ref" value="${e(Q.ref)}">`)}
    ${fld('Quote date', `<input type="date" data-q="date" value="${e(Q.date)}">`)}${fld('Expiry date', `<input type="date" data-q="expiry" value="${e(Q.expiry)}">`)}
    ${fld('Prepared by', `<input data-q="staffName" value="${e(Q.staffName)}">`)}${fld('Customer notes (shown on quote)', `<input data-q="notes" value="${e(Q.notes)}">`)}</div>
    <datalist id="custlist">${cust.map(c => `<option value="${e(c.name)}">`).join('')}</datalist></div>
   <div id="items">${Q.items.map((it, i) => itemHTML(it, i)).join('')}</div>
   <div class="card noprint" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><div class="field" style="flex:1;min-width:200px"><label>Add line item</label><select id="addprod"><option value="">Choose a product…</option>${productOptions('')}</select></div><button class="btn primary" data-act="item-add">+ Add item</button></div>
   <div class="card"><h2>Quote-level settings</h2><div class="grid g2">
    ${can('applyDiscount') ? fld('Whole-quote discount', `<div style="display:flex;gap:6px"><select data-q="discount.type" style="width:84px"><option value="pct" ${Q.discount.type !== 'fixed' ? 'selected' : ''}>%</option><option value="fixed" ${Q.discount.type === 'fixed' ? 'selected' : ''}>R</option></select><input type="number" min="0" step="any" data-q="discount.value" value="${e(Q.discount.value)}"></div>`) : ''}
    ${fld('Payment terms', `<textarea data-q="paymentTerms">${e(Q.paymentTerms)}</textarea>`)}${fld('Terms & conditions', `<textarea data-q="terms">${e(Q.terms)}</textarea>`, '', 'span2')}</div></div>
  </div>
  <div class="sticky"><div class="card" id="totals">${totalsHTML(Q)}</div></div></div>
  <div class="stickybar" id="sbar">${sbarHTML(Q)}</div>`;
}
function totalsFor(Q) { return PQ.calcQuote(Q.items, Q.discount, Q.snap.vat, { minOrder: Q.snap.minOrder }); }
function discountState(Q, t) {
  const pol = PQ.discountPolicy(State.cfg.settings, role(), t.discountPct);
  const approved = Q.discountApproval && PQ.num(Q.discountApproval.pct) + 0.005 >= t.discountPct;
  return { pol, needsApproval: pol.needsApproval && !approved, blocked: !pol.allowed };
}
function totalsHTML(Q) {
  const t = totalsFor(Q), inc = t.vatMode === 'inclusive', ds = discountState(Q, t);
  const bad = Q.items.filter(i => !i.calc.ok).length;
  let h = `<h2>Quote total</h2>`;
  if (!Q.items.length) h += '<p class="muted">Add a line item to begin.</p>';
  h += `<div class="rowline"><span>${inc && t.vatEnabled ? 'Items (incl. VAT)' : 'Items'}</span><span>${money(t.gross)}</span></div>`;
  if (t.lineDiscounts > 0) h += `<div class="rowline sub"><span>Line discounts</span><span>-${money(t.lineDiscounts)}</span></div>`;
  if (t.quoteDiscount > 0) h += `<div class="rowline sub"><span>Quote discount</span><span>-${money(t.quoteDiscount)}</span></div>`;
  if (t.minOrderAdjustment > 0) h += `<div class="rowline sub"><span>Minimum order adjustment</span><span>${money(t.minOrderAdjustment)}</span></div>`;
  h += `<div class="rowline"><span>Subtotal${t.vatEnabled ? ' (excl. VAT)' : ''}</span><span>${money(t.subtotal)}</span></div>`;
  if (t.vatEnabled) h += `<div class="rowline"><span>VAT ${pctf(t.vatRate)}</span><span>${money(t.vat)}</span></div>`;
  h += `<div class="rowline tot"><span>Total</span><span id="grand">${money(t.total)}</span></div><div class="muted" style="font-size:12px">${t.vatEnabled ? (inc ? 'Prices include VAT.' : 'Prices exclude VAT; VAT added above.') : 'VAT not charged.'}</div>`;
  if (t.discountPct > 0) h += `<div class="muted" style="font-size:12px;margin-top:4px">Total discount: ${pctf(t.discountPct)}</div>`;
  if (ds.blocked) h += `<div class="alert bad" style="margin-top:8px">${e(ds.pol.reason || 'Discount not allowed')}</div>`;
  else if (ds.needsApproval) h += `<div class="alert warn" style="margin-top:8px">Discount of ${pctf(t.discountPct)} exceeds your ${pctf(ds.pol.max)} limit. It can be saved, but needs manager approval before the quote is sent or accepted.</div>`;
  t.errors.forEach(x => h += `<div class="alert bad" style="margin-top:8px">${e(x)}</div>`);
  if (bad) h += `<div class="alert bad" style="margin-top:8px">${bad} line item${bad > 1 ? 's have' : ' has'} errors — see the item below.</div>`;
  if (can('viewCosts') || can('viewProfit') || can('viewMargin')) {
    h += `<div style="border-top:1px dashed var(--line);margin-top:10px;padding-top:8px"><div class="lbl">Internal — not shown to customer</div>`;
    if (can('viewCosts')) h += `<div class="rowline sub"><span>Production cost</span><span>${money(t.productionCost)}</span></div>`;
    if (can('viewProfit')) h += `<div class="rowline sub"><span>Gross profit</span><span>${money(t.grossProfit)}</span></div>`;
    if (can('viewMargin')) h += `<div class="rowline sub"><span>Gross margin</span><span>${pctf(t.marginPct)}</span></div>`;
    h += '</div>';
  }
  h += `<div class="noprint" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" data-act="ed-save" style="flex:1">Save quote</button>${Q.items.length ? '<button class="btn" data-act="ed-reprice">Reprice all</button>' : ''}</div>`;
  return h;
}
const sbarHTML = Q => { const t = totalsFor(Q); return `<div><small>${t.vatEnabled ? (t.vatMode === 'inclusive' ? 'Total incl. VAT' : 'Total incl. VAT') : 'Total'}</small><span id="sbtotal">${money(t.total)}</span></div><button class="btn" style="min-height:40px" data-act="ed-jump">Details</button><button class="btn primary" style="min-height:40px" data-act="ed-save">Save</button>`; };

function refreshItem(it) {
  const box = $('#it-' + it.key); if (!box) return;
  const c = it.calc, ih = $('.ih', box);
  ih.querySelector('.p').textContent = money(c.finalSubtotal);
  ih.querySelector('.t').innerHTML = `${e(it.productName || 'Item')}${it.desc ? ' — ' + e(it.desc) : ''} <span class="muted">× ${e(it.qty)}</span>`;
  const openDet = $('details.calc', box) && $('details.calc', box).open;
  $('.it-res', box).innerHTML = itemResultHTML(it);
  if (openDet) { const d = $('details.calc', box); if (d) d.open = true; }
  if (State.ed.kind === 'calc') refreshCalcPanel();
}
function refreshTotals() {
  const ed = State.ed; if (!ed || ed.kind !== 'quote') return;
  const t = $('#totals'); if (t) t.innerHTML = totalsHTML(ed.Q); const s = $('#sbar'); if (s) s.innerHTML = sbarHTML(ed.Q);
}
function rerenderItem(it) { const box = $('#it-' + it.key); if (!box) return; const idx = State.ed.Q ? State.ed.Q.items.indexOf(it) : 0; const tmp = document.createElement('div'); tmp.innerHTML = itemHTML(it, idx < 0 ? 0 : idx, State.ed.kind === 'calc' ? { single: true } : null); box.replaceWith(tmp.firstElementChild); }
function markDirty() { State.dirty = true; }
function setDeep(o, path, v) { const ks = path.split('.'); let x = o; ks.slice(0, -1).forEach(k => x = x[k]); x[ks[ks.length - 1]] = v; }
function itemsOf() { const ed = State.ed; return ed.kind === 'calc' ? [ed.item] : ed.Q.items; }

function changeProduct(it, pid) {
  const n = newItem(pid); if (!n) return;
  n.key = it.key; n.desc = it.desc; n.notes = it.notes; n.qty = it.qty || n.qty; n.discount = it.discount; n.customCost = it.customCost; n.customLabel = it.customLabel; n.closed = it.closed;
  Object.keys(it).forEach(k => delete it[k]); Object.assign(it, n); recalc(it); rerenderItem(it); if (State.ed.kind === 'calc') refreshCalcPanel();
}
function onEditorInput(t) {
  const ed = State.ed; if (!ed) return;
  if (t.dataset.q) {
    let v = t.value; setDeep(ed.Q, t.dataset.q, v);
    if (t.dataset.q === 'customer.name') { const c = Object.values(State.customers).find(x => x.name === v); if (c) { ['company', 'phone', 'email'].forEach(k => { if (!ed.Q.customer[k]) { ed.Q.customer[k] = c[k] || ''; const inp = $(`[data-q="customer.${k}"]`); if (inp) inp.value = c[k] || ''; } }); } }
    markDirty(); if (t.dataset.q.startsWith('discount')) refreshTotals(); return;
  }
  if (t.dataset.calc) { onCalcInput(t); return; }
  const it = itemsOf().find(x => x.key === t.dataset.i); if (!it) return;
  const f = t.dataset.f, v = t.type === 'checkbox' ? t.checked : t.value;
  if (f === 'productId') { changeProduct(it, v); }
  else {
    switch (f) {
      case 'unit': { const o = PQ.UNIT_MM[it.unit] || 1, n = PQ.UNIT_MM[v] || 1; ['w', 'h'].forEach(k => { if (PQ.has(it[k])) it[k] = Math.round(PQ.num(it[k]) * o / n * 1e4) / 1e4; }); it.unit = v; rerenderFields(it); break; }
      case 'sizePreset': { const s = PAPER_SIZES.find(x => x[0] === v); if (s) { it.unit = 'mm'; it.w = s[1]; it.h = s[2]; rerenderFields(it); } break; }
      case 'discType': it.discount.type = v; break; case 'discVal': it.discount.value = v; break;
      case 'ovOn': { it.override = v ? { price: it.calc.calculatedPrice, reason: '' } : null; const b = $('#ov-' + it.key); if (b) { b.style.display = v ? '' : 'none'; const pi = $('[data-f="ovPrice"]', b); if (pi && v) pi.value = it.calc.calculatedPrice; } break; }
      case 'ovPrice': if (it.override) it.override.price = v; break; case 'ovReason': if (it.override) it.override.reason = v; break;
      case 'finOn': { const id = t.dataset.fin; it.finishing = (it.finishing || []).filter(s => s.id !== id); if (v) it.finishing.push({ id, qty: finDefaultQty(id) }); const qi = $(`[data-i="${it.key}"][data-f="finQty"][data-fin="${id}"]`); if (qi) { qi.disabled = !v; if (v) qi.value = finDefaultQty(id); } break; }
      case 'finQty': { const s = (it.finishing || []).find(x => x.id === t.dataset.fin); if (s) s.qty = v; break; }
      case 'prLabel': case 'prW': case 'prH': case 'prCount': { const pr = it.prints[+t.dataset.pr]; pr[{ prLabel: 'label', prW: 'w', prH: 'h', prCount: 'count' }[f]] = f === 'prLabel' ? v : v; break; }
      case 'prPreset': { const s = PRINT_SIZES.find(x => x[0] === v); if (s) { const pr = it.prints[+t.dataset.pr]; pr.w = s[1]; pr.h = s[2]; rerenderFields(it); } break; }
      default: it[f] = v;
    }
    recalc(it); refreshItem(it);
  }
  markDirty(); refreshTotals();
}
function rerenderFields(it) { const box = $('#it-' + it.key); if (box) $('.it-fields', box).innerHTML = itemFieldsHTML(it); }

Object.assign(ACT, {
  'item-toggle': el => { if (event && event.target.closest('button')) return; const it = itemsOf().find(x => x.key === el.dataset.key); if (!it) return; it.closed = !it.closed; $('#it-' + it.key).classList.toggle('closed', it.closed); },
  'item-add': () => { const s = $('#addprod'); if (!s.value) { toast('Choose a product first', 'bad'); return; } const it = newItem(s.value); State.ed.Q.items.push(it); const tmp = document.createElement('div'); tmp.innerHTML = itemHTML(it, State.ed.Q.items.length - 1); $('#items').appendChild(tmp.firstElementChild); s.value = ''; markDirty(); refreshTotals(); $('#it-' + it.key).scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'item-del': async el => { if (!await confirmDialog({ title: 'Remove line item?', body: '<p>This line item will be removed from the quote.</p>', okLabel: 'Remove', danger: true })) return; const Q = State.ed.Q; Q.items = Q.items.filter(x => x.key !== el.dataset.key); $('#it-' + el.dataset.key).remove(); $$('#items .item .ih .badge').forEach((b, i) => b.textContent = i + 1); markDirty(); refreshTotals(); },
  'item-dup': el => { const Q = State.ed.Q, src = Q.items.find(x => x.key === el.dataset.key); const c = clone(src); c.key = uid('i'); c.override = null; Q.items.splice(Q.items.indexOf(src) + 1, 0, c); recalc(c); $('#items').innerHTML = Q.items.map((it, i) => itemHTML(it, i)).join(''); markDirty(); refreshTotals(); },
  'qty-inc': el => stepQty(el, 1), 'qty-dec': el => stepQty(el, -1),
  'pr-add': el => { const it = itemsOf().find(x => x.key === el.dataset.key); it.prints.push({ label: 'Back', w: 21, h: 29.7, count: 1 }); recalc(it); rerenderFields(it); refreshItem(it); markDirty(); refreshTotals(); },
  'pr-del': el => { const it = itemsOf().find(x => x.key === el.dataset.key); it.prints.splice(+el.dataset.idx, 1); recalc(it); rerenderFields(it); refreshItem(it); markDirty(); refreshTotals(); },
  'ed-jump': () => { const t = $('#totals'); if (t) t.scrollIntoView({ behavior: 'smooth' }); },
  'ed-cancel': () => go(State.ed.Q.id ? 'quote' : 'quotes', State.ed.Q.id ? { id: State.ed.Q.id } : {}),
  'ed-save': () => saveQuote(),
  'ed-reprice': async () => {
    if (!await confirmDialog({ title: 'Reprice all lines with current pricing?', body: '<p>Every line will be recalculated using today\'s materials, labour, machine and markup settings, and the quote will adopt today\'s VAT and minimum-order settings. Manual overrides are kept.</p>', okLabel: 'Reprice' })) return;
    const Q = State.ed.Q, S = State.cfg.settings; Q.snap = newQuoteDraft().snap; Q.items.forEach(recalc); $('#items').innerHTML = Q.items.map((it, i) => itemHTML(it, i)).join(''); markDirty(); refreshTotals(); toast('Quote repriced');
  }
});
function stepQty(el, d) { const it = itemsOf().find(x => x.key === el.dataset.key); const inp = $(`[data-i="${it.key}"][data-f="qty"]`); const step = it.qty >= 1000 ? 100 : it.qty >= 100 ? 10 : 1; const v = Math.max(0, Math.round((PQ.num(it.qty) + d * step) * 1000) / 1000); it.qty = v; inp.value = v; recalc(it); refreshItem(it); markDirty(); refreshTotals(); }

async function saveQuote() {
  const ed = State.ed, Q = ed.Q, S = State.cfg.settings, errs = [];
  if (!Q.customer.name.trim()) errs.push('Customer name is required');
  if (Q.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Q.customer.email.trim())) errs.push('Email address looks invalid');
  if (!Q.date) errs.push('Quote date is required'); if (Q.expiry && Q.date && Q.expiry < Q.date) errs.push('Expiry date is before the quote date');
  if (!Q.items.length) errs.push('Add at least one line item');
  Q.items.forEach((it, i) => { recalc(it); if (!it.calc.ok) errs.push(`Line ${i + 1}: ${it.calc.errors[0]}`); if (it.override && !(PQ.num(it.override.price) >= 0 && PQ.has(it.override.price))) errs.push(`Line ${i + 1}: enter an override price`); });
  const t = totalsFor(Q); t.errors.forEach(x => errs.push(x));
  const ds = discountState(Q, t); if (ds.blocked) errs.push(ds.pol.reason || 'Discount not allowed');
  if (errs.length) { openModal({ title: 'Please fix before saving', body: `<ul>${errs.map(x => `<li>${e(x)}</li>`).join('')}</ul>`, footer: '<button class="btn primary" data-act="modal-close">OK</button>' }); return; }
  const btns = $$('[data-act="ed-save"]'); btns.forEach(b => b.disabled = true);
  try {
    const now = Date.now(), me = State.me.id || 'local'; let created = false;
    const prev = Q.id ? State.quotes[Q.id] : null;
    // stamp manual overrides
    for (const [i, it] of Q.items.entries()) if (it.override) {
      const pv = prev && prev.items.find(x => x.key === it.key), same = pv && pv.override && PQ.num(pv.override.price) === PQ.num(it.override.price);
      if (!same) { it.override = { price: PQ.num(it.override.price), reason: it.override.reason || '', original: it.calc.calculatedPrice, by: me, at: now };
        await DB.audit('Manual price override', `${Q.number || 'new quote'} line ${i + 1} ${it.productName}`, money(it.calc.calculatedPrice), money(it.override.price)); }
    }
    if (!Q.id) { Q.number = await nextQuoteNumber(); Q.id = quoteDocId(Q.number); Q.createdAt = now; Q.createdBy = me; Q.createdRole = role(); created = true; }
    Q.totals = t; Q.updatedAt = now; Q.updatedBy = me; Q.status = Q.status || 'draft';
    Q.history = [...(Q.history || []), { ts: now, uid: me, action: created ? 'Quote created' : 'Quote edited', detail: `Total ${money(t.total)}` }].slice(-100);
    Q.items.forEach(i => { delete i.closed; });
    await DB.setQuote(Q);
    await DB.audit(created ? 'Created quote' : 'Edited quote', Q.number, prev ? money((prev.totals || {}).total) : '', money(t.total));
    if (ds.needsApproval) await DB.audit('Discount awaiting approval', Q.number, '', pctf(t.discountPct));
    const c = Q.customer; if (c.name.trim()) { const id = 'c_' + slug((c.email || c.name + c.company)).slice(0, 60); await DB.setCustomer({ id, name: c.name.trim(), company: c.company, phone: c.phone, email: c.email }); }
    State.dirty = false; toast('Saved ' + Q.number); go('quote', { id: Q.id }, true);
  } catch (er) { console.error(er); toast(explainError(er), 'bad'); btns.forEach(b => b.disabled = false); }
}

/* ---------- calculators (same engine, focused layouts) ---------- */
const CALC_TABS = [['dtf', 'DTF'], ['paper', 'Paper'], ['large', 'Large format']];
function viewCalc() {
  const profile = State.params.profile || 'dtf';
  const prods = activeProducts().filter(p => p.profile === profile);
  if (!State.ed || State.ed.kind !== 'calc' || State.ed.profile !== profile) {
    const first = prods[0]; State.ed = { kind: 'calc', profile, item: first ? newItem(first.id) : null };
  }
  const it = State.ed.item;
  return `<div class="top"><h1>Calculators</h1></div><div class="tabs">${CALC_TABS.map(t => `<button class="${t[0] === profile ? 'on' : ''}" data-act="calc-tab" data-p="${t[0]}">${t[1]}</button>`).join('')}</div>
  ${!it ? `<div class="card"><p class="muted">No active ${profile} products. Add one in Settings → Products.</p></div>` : `<div class="split"><div class="card" id="items" style="padding:0;border:0;box-shadow:none;background:none">${itemHTML(it, 0, { single: true })}</div><div class="sticky"><div class="card" id="calcpanel">${calcPanelHTML(it, profile)}</div></div></div>`}`;
}
function calcPanelHTML(it, profile) {
  const c = it.calc, i = c.info || {}, qty = PQ.num(it.qty) || 1; const showC = can('viewCosts');
  const M = (k, v) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const n = (v, d = 2) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString();
  const g = k => money((c.groups || {})[k] || 0);
  let m = '';
  if (profile === 'dtf') m = M('Area per garment', n(i.printAreaPerItemCm2) + ' cm²') + M('Total print area', n(i.totalPrintAreaM2, 3) + ' m²') + M('Total prints', i.totalPrints || 0) + M('Est. film usage', n(i.filmMetres || 0, 2) + ' m');
  else if (profile === 'paper') m = M('Sheets needed', i.sheets || 0) + M('Copies per sheet', i.upsPerSheet || 0) + M('Pages per copy', i.pages || 1) + M('Leaves per copy', i.leaves || 1);
  else m = M('Area each', n(i.itemAreaM2, 3) + ' m²') + M('Total area', n(i.totalAreaM2, 3) + ' m²') + M('Perimeter each', n(i.perimeterM) + ' m') + M('Quantity', i.qty || 0);
  let h = `<h2>${profile === 'dtf' ? 'DTF result' : profile === 'paper' ? 'Paper result' : 'Large-format result'}</h2><div class="grid g2" style="margin-bottom:12px">${m}</div>`;
  if (!c.ok) h += c.errors.map(x => `<div class="alert bad">${e(x)}</div>`).join('');
  if (showC) {
    h += GROUPS.filter(([k]) => (c.groups || {})[k]).map(([k, l]) => `<div class="rowline sub"><span>${l}</span><span>${g(k)}</span></div>`).join('');
    h += `<div class="rowline"><span><b>Production cost</b></span><b>${money(c.productionCost)}</b></div><div class="rowline sub"><span>${c.markupMode === 'margin' ? 'Margin' : 'Markup'} ${pctf(c.markupPct)}</span><span>${money(c.sellingBeforeMin - c.productionCost)}</span></div>`;
    if (can('viewProfit')) h += `<div class="rowline sub"><span>Profit</span><span>${money(c.grossProfit)}${can('viewMargin') ? ` (${pctf(c.marginPct)})` : ''}</span></div>`;
  }
  h += `<div class="rowline tot"><span>Selling price</span><span>${money(c.finalSubtotal)}</span></div><div class="rowline sub"><span>Price per ${profile === 'dtf' ? 'garment' : 'unit'}</span><span>${money(c.finalSubtotal / qty)}</span></div><div class="muted" style="font-size:12px">Excludes VAT unless your prices are set to include it.</div>`;
  h += can('createQuotes') ? `<button class="btn primary" style="width:100%;margin-top:12px" data-act="calc-add" ${c.ok ? '' : 'disabled'}>Add to new quote</button>` : '';
  return h;
}
function refreshCalcPanel() { const p = $('#calcpanel'); if (p) p.innerHTML = calcPanelHTML(State.ed.item, State.ed.profile); }
function onCalcInput() {}
Object.assign(ACT, {
  'calc-tab': el => { State.ed = null; State.params = { profile: el.dataset.p }; render(true); },
  'calc-add': () => { const it = clone(State.ed.item); it.key = uid('i'); State.pendingItem = it; State.dirty = false; go('editor', {}, true); }
});
function afterEditorRender() {}
