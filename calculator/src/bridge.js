/* ===== PrintOps bridge: connects the existing calculator to the management app =====
   The calculator code above is unchanged. This file only (1) receives catalogue/pricing from the host page,
   (2) hides the calculator's own customer card / sidebar, and (3) hands the finished quote back to the host,
   which stores it in PostgreSQL through the save_quote() database function. */
(function () {
  const ORIGIN = window.location.origin;
  const post = (type, payload) => window.parent.postMessage({ source: 'printops-calc', type, payload }, ORIGIN);
  let cur = null;

  window.addEventListener('message', ev => {
    if (ev.origin !== ORIGIN) return;
    const m = ev.data; if (!m || m.source !== 'printops-host') return;
    if (m.type === 'init') init(m.payload);
    else if (m.type === 'error') { setBusy(false); toast(m.payload, 'bad'); }
    else if (m.type === 'customer') { cur = m.payload; }
  });

  function setBusy(b) { $$('[data-act="ed-save"]').forEach(x => x.disabled = b); }

  function itemFromDb(row, fresh) {
    const it = JSON.parse(JSON.stringify(row.item || {}));
    it.key = uid('i'); it.productId = it.productId || row.product_id;
    if (fresh) { it.override = null; }
    return it;
  }

  function init(p) {
    State.mode = 'embedded'; State.me = { id: p.userId, name: p.userName, isOwner: true, canEdit: true, canData: true };
    p.settings.demo = false; State.cfg.settings = p.settings;
    ['products', 'materials', 'machines', 'labour', 'finishing', 'categories'].forEach(k => { State.cfg[k] = p[k] || {}; });
    State.loaded.settings = true; State.customers = {}; State.quotes = {}; State.embedded = true; State.audit = [];
    document.body.classList.add('embedded');
    cur = p.customer || null;
    const q = p.quote;
    if (q) {
      const Q = newQuoteDraft();
      Q.customer = { name: q.customerName || (cur && cur.name) || '', company: '', phone: '', email: '' };
      Q.ref = q.reference || ''; Q.notes = q.notes || ''; Q.terms = q.terms || Q.terms; Q.paymentTerms = q.payment_terms || Q.paymentTerms; Q.discount = q.discount && q.discount.type ? q.discount : Q.discount;
      Q.date = q.quote_date || Q.date; Q.expiry = q.valid_until || Q.expiry;
      const snapBox = q.pricing_snapshot || {}; if (snapBox.snap) Q.snap = snapBox.snap; if (snapBox.staffName) Q.staffName = snapBox.staffName;
      if (p.mode === 'edit') {
        Q.id = q.id; Q.number = q.number; Q.status = q.status; Q.version = q.version; Q.createdAt = Date.parse(q.created_at) || 0;
        Q.items = (q.items || []).map(r => itemFromDb(r, false));
        Q.items.forEach(i => { if (!i.calc) recalc(i); });
      } else { // duplicate / repeat order: new quote, prices recalculated with CURRENT pricing, overrides dropped
        Q.copiedFrom = q.number; Q.snap = newQuoteDraft().snap; Q.date = todayISO(); Q.expiry = addDays(Q.date, PQ.num((State.cfg.settings.quotes || {}).expiryDays, 14));
        Q.items = (q.items || []).map(r => itemFromDb(r, true)); Q.items.forEach(recalc);
      }
      State.ed = { kind: 'quote', Q, isNew: !Q.id };
      if (Q.copiedFrom) State.dirty = true;
    }
    State.view = p.start === 'calc' ? 'calc' : 'editor'; State.params = p.start === 'calc' ? { profile: 'dtf' } : {};
    buildBar(); render(true);
  }

  function buildBar() {
    if ($('#embedbar')) return;
    const bar = document.createElement('div'); bar.id = 'embedbar';
    bar.innerHTML = [['quote', 'Quote builder'], ['dtf', 'DTF calculator'], ['paper', 'Paper calculator'], ['large', 'Large-format calculator']].map(t => `<button data-bar="${t[0]}">${t[1]}</button>`).join('');
    document.body.insertBefore(bar, $('#app'));
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-bar]'); if (!b) return; const v = b.dataset.bar;
      State.ed = v === 'quote' ? State.ed : null;
      if (v === 'quote') { State.view = 'editor'; State.params = {}; render(true); } else { State.ed = null; State.view = 'calc'; State.params = { profile: v }; render(true); }
    });
  }

  /* quote is handed to the host instead of being written to the old claude.ai storage */
  saveQuote = async function () {
    const ed = State.ed; if (!ed || ed.kind !== 'quote') return; const Q = ed.Q, errs = [];
    if (!cur || !cur.id) errs.push('Choose a customer above the calculator first');
    if (!Q.date) errs.push('Quote date is required'); if (Q.expiry && Q.date && Q.expiry < Q.date) errs.push('Expiry date is before the quote date');
    if (!Q.items.length) errs.push('Add at least one line item');
    Q.items.forEach((it, i) => { recalc(it); if (!it.calc.ok) errs.push(`Line ${i + 1}: ${it.calc.errors[0]}`); if (it.override && !(PQ.has(it.override.price) && PQ.num(it.override.price) >= 0)) errs.push(`Line ${i + 1}: enter an override price`); });
    const t = totalsFor(Q); t.errors.forEach(x => errs.push(x));
    if (errs.length) { openModal({ title: 'Please fix before saving', body: `<ul>${errs.map(x => `<li>${e(x)}</li>`).join('')}</ul>`, footer: '<button class="btn primary" data-act="modal-close">OK</button>' }); return; }
    const now = Date.now();
    Q.items.forEach(it => { if (it.override && !it.override.at) it.override = { price: PQ.num(it.override.price), reason: it.override.reason || '', original: it.calc.calculatedPrice, by: State.me.id, at: now }; });
    const payload = {
      quote: { id: Q.id || null, quote_date: Q.date, valid_until: Q.expiry || null, reference: Q.ref || null, notes: Q.notes || null, terms: Q.terms || null, payment_terms: Q.paymentTerms || null,
        discount: Q.discount || {}, pricing_snapshot: { snap: Q.snap, staffName: Q.staffName || '', pricedAt: now }, totals: t, expected_version: Q.version || null, copied_from_number: Q.copiedFrom || null },
      items: Q.items.map(it => { const c = JSON.parse(JSON.stringify(it)); delete c.closed; return {
        product_id: it.productId, product_name: it.productName, category_name: it.categoryName || '', profile: (State.cfg.products[it.productId] || {}).profile || 'general',
        description: it.desc || '', quantity: PQ.num(it.qty), unit_price: PQ.num(it.calc.unitPrice), line_total: PQ.num(it.calc.finalSubtotal), item: c }; })
    };
    setBusy(true); post('save', payload);
  };
  ACT['ed-cancel'] = () => post('cancel');
  document.addEventListener('input', () => { if (!State.dirty) { State.dirty = true; } post('dirty', true); }, { once: true });
  if (window.ResizeObserver) new ResizeObserver(() => post('height', document.documentElement.scrollHeight)).observe(document.body);
  post('ready', true);
})();
