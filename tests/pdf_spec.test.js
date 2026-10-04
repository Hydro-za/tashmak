// Compiles lib/*.ts on the fly (see package.json "test:logic") and checks PDF + employee-safe spec building.
const path = require('path'); const dir = process.env.COMPILED || '/tmp/pdft';
const { buildQuotePdf } = require(path.join(dir, 'quotePdf.js')); const { buildSpec } = require(path.join(dir, 'spec.js'));
const { overdueDays, friendlyError, money } = require(path.join(dir, 'labels.js'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
(async () => {
  const q = { number: 'Q-1001', quote_date: '2026-10-02', valid_until: '2026-10-16', reference: 'PO-77', customers: { name: 'Acme Traders', company: 'Acme (Pty) Ltd', phone: '082 000 0000', email: 'jo@acme.co.za' },
    notes: 'Deliver to the Cape Town branch', payment_terms: '50% deposit', terms: 'Valid for 14 days.', pricing_snapshot: { staffName: 'Damian' },
    totals: { gross: 1500, lineDiscounts: 100, quoteDiscount: 140, subtotal: 1260, vat: 189, vatRate: 15, vatEnabled: true, vatMode: 'exclusive', total: 1449 },
    items: [{ product_name: 'A4 Flyer', description: 'Spring promo', quantity: 500, unit_price: 1.5, line_total: 750, item: { specText: '210 × 297 mm · 130gsm gloss · double-sided', calc: { discountAmount: 0 } } },
            { product_name: 'DTF T-shirt', description: '', quantity: 20, unit_price: 40, line_total: 650, item: { specText: 'Front 21×29.7cm', notes: 'Navy', calc: { discountAmount: 150 } } }] };
  const blob = await buildQuotePdf(q, { name: 'Print Co (Pty) Ltd', address: '12 Example St', phone: '021 000 0000', vatNo: '4123456789' });
  const buf = Buffer.from(await blob.arrayBuffer()); const txt = buf.toString('latin1');
  ok(txt.startsWith('%PDF') && buf.length > 2000, 'valid PDF bytes (' + buf.length + ' bytes)');
  ['Q-1001', 'Acme Traders', 'A4 Flyer', 'DTF T-shirt', 'R1,449.00', 'Valid until', 'QUOTATION', 'Print Co', 'VAT 15%', 'Terms & conditions', '50% deposit'].forEach(s => ok(txt.includes(s), 'PDF contains "' + s + '"'));
  ok(!/production|profit|margin/i.test(txt.replace(/Terms|Payment/g, '')) , 'PDF contains no internal cost/profit wording');
  // spec for employees: no prices/costs
  const ctx = { materials: { m1: { name: '130gsm gloss SRA3', costBasis: 'sheet', cost: 0.85 }, g1: { name: 'Hoodie', costBasis: 'unit', type: 'garment', cost: 135 } }, finishing: { f1: { name: 'Eyelets', askQty: true, qtyLabel: 'per piece' }, f2: { name: 'Hem' } } };
  const rows = buildSpec({ profile: 'large', qty: 2, w: 3, h: 1, unit: 'm', materialId: 'm1', finishing: [{ id: 'f1', qty: 6 }, { id: 'f2' }], notes: 'Hang on fence', calc: { productionCost: 99, sellingPrice: 300 } }, ctx);
  const flat = JSON.stringify(rows);
  ok(rows.some(r => r.label === 'Size' && r.value === '3 × 1 m') && flat.includes('Eyelets (6 per piece)') && flat.includes('Hem'), 'large-format spec shows size and finishing');
  ok(!/0\.85|135|cost|price|99|300/i.test(flat.replace('Hang on fence', '')), 'spec never contains prices or costs');
  const dtf = buildSpec({ profile: 'dtf', qty: 12, materialId: 'g1', garmentColour: 'Black', prints: [{ label: 'Front', w: 21, h: 29.7, count: 1 }, { label: 'Back', w: 30, h: 30, count: 1 }] }, ctx);
  ok(dtf.some(r => r.label === 'Garment' && r.value === 'Hoodie') && dtf.some(r => r.label === 'Garment colour') && dtf.some(r => r.label.startsWith('Print 2')) && !dtf.some(r => r.label === 'Print sides'), 'DTF spec has garment + print positions and no paper fields');
  const paper = buildSpec({ profile: 'paper', qty: 500, w: 90, h: 55, unit: 'mm', materialId: 'm1', sides: 2, colour: 'colour' }, ctx);
  ok(paper.some(r => r.label === 'Print sides' && r.value === 'Double-sided') && !paper.some(r => r.label === 'Garment colour'), 'paper spec has print sides and no garment fields');
  // helpers
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' }); const d2 = new Date(today + 'T12:00:00Z'); d2.setUTCDate(d2.getUTCDate() - 2);
  ok(overdueDays(d2.toISOString().slice(0, 10), 'in_production') === 2 && overdueDays(d2.toISOString().slice(0, 10), 'completed') === 0 && overdueDays(today, 'queued') === 0, 'overdue days: 2 / finished = 0 / due today = 0');
  ok(friendlyError(new Error('invalid_transition: x')).includes('not available') && friendlyError({ message: 'permission denied for table jobs' }).includes('permission') && money(1234.5) === 'R1,234.50', 'friendly errors and money format');
  console.log(`\nLogic: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
