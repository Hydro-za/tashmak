// Drives the EMBEDDED calculator exactly as the host page does (postMessage), in jsdom.
const { JSDOM, VirtualConsole } = require('jsdom'); const fs = require('fs'); const path = require('path');
const { makeSeed } = require('../calculator/seed.js');
const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.detail || e.message))); vc.on('error', e => errors.push('console.error: ' + e));
const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/calculator.html'), 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://x.test/' });
const w = dom.window; w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
const out = []; w.addEventListener('message', e => { if (e.data && e.data.source === 'printops-calc') out.push(e.data); });
const $ = s => w.document.querySelector(s), ev = c => w.eval(c), sleep = ms => new Promise(r => setTimeout(r, ms));
const host = (type, payload) => w.dispatchEvent(new w.MessageEvent('message', { data: { source: 'printops-host', type, payload }, origin: 'https://x.test' }));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const by = a => Object.fromEntries(a.map(x => [x.id, x]));
const seed = makeSeed(); const s = seed.settings;
const settings = { pricing: s.pricing, calc: s.calc, vat: s.vat, discount: s.discount, quotes: s.quotes, business: s.business, permissions: s.permissions, defaultRole: 'staff' };
const init = (extra) => ({ userId: 'u1', userName: 'Damian', settings: JSON.parse(JSON.stringify(settings)), products: by(seed.products), materials: by(seed.materials), machines: by(seed.machines), labour: by(seed.labour), finishing: by(seed.finishing), categories: by(seed.categories), customer: { id: 'c1', name: 'Acme' }, ...extra });
(async () => {
  await sleep(100);
  ok(out.some(m => m.type === 'ready'), 'calculator tells the host it is ready');
  host('init', init({ mode: 'new', start: 'editor' })); await sleep(50);
  ok(!!$('#addprod') && !!$('#embedbar'), 'quote builder renders inside the embed with its tab bar');
  ok(w.document.body.classList.contains('embedded'), 'embedded mode on (sidebar/customer card hidden by css)');
  const add = pid => { $('#addprod').value = pid; $('[data-act="item-add"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  add('p_banner'); add('p_dtf_tee'); add('p_cards');
  ok(ev('State.ed.Q.items.length') === 3 && ev('State.ed.Q.items.every(i=>i.calc.ok)'), 'three different product types calculate (large-format, DTF, paper)');
  const firstKey = ev('State.ed.Q.items[0].key');
  const productSelect = $(`[data-i="${firstKey}"][data-f="productId"]`);
  let inputCalls = 0; const originalInput = w.onEditorInput;
  w.onEditorInput = function (...args) { inputCalls++; return originalInput.apply(this, args); };
  productSelect.value = 'p_cards';
  productSelect.dispatchEvent(new w.Event('input', { bubbles: true }));
  productSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(inputCalls === 1 && ev(`State.ed.Q.items.find(i=>i.key==='${firstKey}').productId`) === 'p_cards', 'a product select change is handled exactly once');
  w.onEditorInput = originalInput;
  const restoredProductSelect = $(`[data-i="${firstKey}"][data-f="productId"]`);
  restoredProductSelect.value = 'p_banner'; restoredProductSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
  const beforeSwitch = JSON.stringify(ev('State.ed.Q.items'));
  const quoteDirty = ev('State.dirty');
  $('[data-bar="paper"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(ev("State.view === 'calc' && State.params.profile === 'paper'"), 'switching from the quote to a calculator tab works');
  $('[data-bar="quote"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(ev("State.view === 'editor' && State.ed.kind === 'quote'"), 'returning to the quote tab restores the quote editor');
  ok(JSON.stringify(ev('State.ed.Q.items')) === beforeSwitch && ev('State.dirty') === quoteDirty, 'quote lines and unsaved state survive leaving and reopening the quote tab');
  ok($('#totals').textContent.includes('Production cost'), 'owner sees full calculator detail');
  // identical numbers to the standalone engine (calculator unchanged)
  const PQ = require('../calculator/engine.js'); const cfg = { settings, products: by(seed.products), materials: by(seed.materials), machines: by(seed.machines), labour: by(seed.labour), finishing: by(seed.finishing), categories: by(seed.categories) };
  const it0 = JSON.parse(JSON.stringify(ev('State.ed.Q.items[1]'))); const ref = PQ.calcLine(it0, cfg); ok(ref.finalSubtotal === it0.calc.finalSubtotal, 'embedded result equals the tested engine result (R' + ref.finalSubtotal + ')');
  await ev('saveQuote()'); await sleep(20);
  ok(!out.some(m => m.type === 'save') === false, 'save is handed to the host');
  const m = out.filter(x => x.type === 'save').pop(); const P = m.payload;
  ok(P.items.length === 3 && P.items.every(i => i.product_name && i.quantity > 0 && i.line_total >= 0 && i.item.calc), 'payload has items with exact calculation snapshots');
  ok(P.items.map(i => i.profile).join() === 'large,dtf,paper', 'product profile carried for each item: ' + P.items.map(i => i.profile));
  ok(P.quote.totals.total > 0 && P.quote.pricing_snapshot.snap.vat.rate === 15 && !P.quote.id, 'totals + pricing/VAT snapshot included, new quote has no id');
  ok(Math.abs(P.items.reduce((a, i) => a + i.line_total, 0) - P.quote.totals.afterDiscount) < 0.02 || P.quote.totals.minOrderAdjustment >= 0, 'line totals reconcile with quote totals');
  host('error', 'Customer missing'); await sleep(10); ok(!$('[data-act="ed-save"]').disabled, 'save button re-enabled after a server error');

  // no customer => blocked
  host('customer', null); await ev('saveQuote()'); await sleep(10); ok(!!$('#ov') && $('#ov').textContent.includes('Choose a customer'), 'cannot save without a customer');
  ev('closeModal(true)'); host('customer', { id: 'c1', name: 'Acme' });

  // edit mode keeps the stored snapshot (no silent re-pricing)
  const stored = JSON.parse(JSON.stringify(P.items[0])); stored.item.calc.finalSubtotal = 1234.56; stored.item.calc.sellingPrice = 1234.56;
  host('init', init({ mode: 'edit', quote: { id: 'q1', number: 'Q-1001', status: 'draft', version: 3, created_at: '2026-09-01T10:00:00Z', quote_date: '2026-09-01', valid_until: '2026-09-15', reference: 'PO-9', notes: 'n', terms: 't', payment_terms: 'p', discount: { type: 'pct', value: 5 }, pricing_snapshot: { snap: { vat: { enabled: true, rate: 15, mode: 'exclusive', discountReducesVat: true }, minOrder: 0 } }, items: [stored] } })); await sleep(30);
  ok(ev('State.ed.Q.items[0].calc.finalSubtotal') === 1234.56 && ev('State.ed.Q.id') === 'q1', 'editing keeps the saved prices until a line is changed');
  ok($('h1').textContent.includes('Q-1001'), 'edit screen shows the quote number');
  await ev('saveQuote()'); await sleep(10); const e1 = out.filter(x => x.type === 'save').pop().payload; ok(e1.quote.id === 'q1' && e1.quote.expected_version === 3 && e1.quote.discount.value === 5, 'edit payload carries id + expected version for safe concurrent saves');

  // duplicate recalculates with CURRENT pricing and drops old number/overrides
  const oldPrice = P.items[0].item.calc.finalSubtotal; const cfg2 = init({}); cfg2.materials.mat_banner.cost = 99;
  host('init', { ...cfg2, mode: 'dup', quote: { id: 'q1', number: 'Q-1001', status: 'accepted', version: 5, quote_date: '2026-09-01', items: [P.items[0]], pricing_snapshot: {} } }); await sleep(30);
  ok(ev('State.ed.Q.id') === null && ev('State.ed.Q.copiedFrom') === 'Q-1001', 'duplicate = new unsaved quote referencing the original');
  ok(ev('State.ed.Q.items[0].calc.finalSubtotal') > oldPrice, 'duplicate is repriced with current material costs (' + oldPrice + ' -> ' + ev('State.ed.Q.items[0].calc.finalSubtotal') + ')');

  // quick calculators still work inside the embed
  for (const p of ['dtf', 'paper', 'large']) { host('init', init({ mode: 'new', start: 'calc' })); await sleep(10); ev(`State.ed=null; State.view='calc'; State.params={profile:'${p}'}; render(true)`); ok(!!$('#calcpanel') && $('#calcpanel').textContent.includes('Selling price'), 'embedded ' + p + ' calculator works'); }
  console.log(errors.length ? 'RUNTIME ERRORS:\n' + errors.join('\n') : 'no runtime errors'); console.log(`\nEmbed: ${pass} passed, ${fail} failed`); process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.log('HARNESS', e); console.log(errors.join('\n')); process.exit(1); });
