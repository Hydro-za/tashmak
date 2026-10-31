const PQ = require('../calculator/engine.js'); const { makeSeed } = require('../calculator/seed.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, m) => ok(Math.abs(a - b) < 0.006, m + ' (got ' + a + ', want ' + b + ')');
const mk = () => { const s = makeSeed(); const by = a => Object.fromEntries(a.map(x => [x.id, x]));
  return { settings: s.settings, products: by(s.products), materials: by(s.materials), machines: by(s.machines), labour: by(s.labour), finishing: by(s.finishing), categories: by(s.categories) }; };
const line = (pid, o) => ({ productId: pid, qty: 1, ...o });
let cfg = mk();

// 1. Costs — hand-computed banner: 2m x 1m, qty 1
cfg.settings.pricing.rounding = { step: 0, mode: 'nearest' };
let r = PQ.calcLine(line('p_banner', { w: 2, h: 1, unit: 'm', finishing: [] }), cfg);
ok(r.ok, 'banner ok ' + r.errors);
const mat = 2 * 24, matW = mat * 0.03, ink = 2 * 26;
near(r.groups.material, mat, 'banner material = area × R/m²');
near(r.groups.print, ink, 'banner ink');
near(r.groups.machine, (15 + 4 * 2 + ((3 * 2 + 6) / 60) * (90 + 20 + 30)), 'banner machine: setup + per m² + hours');
near(r.groups.labour, ((3 * 2 + 6) / 60) * 110, 'banner labour');
near(r.groups.wastage, matW + (mat + ink) * 0.05, 'wastage = material wastage + product wastage on mat+print');
near(r.productionCost, r.lines.reduce((a, l) => a + l.amount, 0), 'cost = sum of displayed lines');

// 2. Markup: category 60% applies (product markup null), override, product
near(r.sellingBeforeMin, r.productionCost * 1.6, 'category markup 60% used'); ok(r.markupSource === 'category', 'markup source');
r = PQ.calcLine(line('p_banner', { w: 2, h: 1, unit: 'm', finishing: [], markupOverride: 30 }), cfg);
near(r.sellingBeforeMin, r.productionCost * 1.3, 'quote markup override'); ok(r.markupSource === 'quote override', 'override source');
cfg.products.p_banner.markupPct = 80; r = PQ.calcLine(line('p_banner', { w: 2, h: 1, unit: 'm', finishing: [] }), cfg);
near(r.sellingBeforeMin, r.productionCost * 1.8, 'product markup beats category'); cfg.products.p_banner.markupPct = null;
cfg.settings.calc.markupMode = 'margin'; cfg.products.p_banner.markupPct = 50;
r = PQ.calcLine(line('p_banner', { w: 2, h: 1, unit: 'm', finishing: [] }), cfg); near(r.sellingBeforeMin, r.productionCost / 0.5, 'margin mode');
near(r.marginPct, 50, 'margin mode yields 50% margin'); cfg.settings.calc.markupMode = 'markup'; cfg = mk(); cfg.settings.pricing.rounding = { step: 0 };

// 3. Paper: sheets / imposition
r = PQ.calcLine(line('p_flyer', { qty: 100, finishing: [] }), cfg);
ok(r.info.upsPerSheet === 2 && r.info.sheets === 50, 'A4 flyer 2-up on SRA3 => 50 sheets (got ' + r.info.sheets + '/' + r.info.upsPerSheet + ')');
r = PQ.calcLine(line('p_cards', { qty: 500, finishing: [] }), cfg);
ok(r.info.upsPerSheet === 21 && r.info.sheets === 24, 'business cards 21-up => 24 sheets (got ' + r.info.sheets + '/' + r.info.upsPerSheet + ')');
near(r.groups.print, 24 * 2 * 0.75, 'print cost = sheets × sides × rate');
const bw = PQ.calcLine(line('p_cards', { qty: 500, finishing: [], colour: 'bw' }), cfg);
near(bw.groups.print, 24 * 2 * 0.75 * 0.4, 'B&W factor applied');
const single = PQ.calcLine(line('p_cards', { qty: 500, finishing: [], sides: 1 }), cfg);
ok(single.groups.print < r.groups.print, 'single-sided cheaper');
r = PQ.calcLine(line('p_booklet', { qty: 50, pages: 12, finishing: [] }), cfg);
ok(r.info.leaves === 6 && r.info.upsPerSheet === 4 && r.info.sheets === Math.ceil(50 * 6 / 4), 'booklet 12pp double sided = 6 leaves/copy, 4-up on SRA3 (sheets ' + r.info.sheets + ')');

// 4. DTF
r = PQ.calcLine(line('p_dtf_tee', { qty: 10, finishing: [], prints: [{ w: 21, h: 29.7, count: 1 }, { w: 30, h: 30, count: 1 }] }), cfg);
ok(r.ok, 'dtf ok ' + r.errors);
const pa = (21 * 29.7 + 900) / 10000;
near(r.info.printAreaPerItemM2, pa, 'DTF print area per garment (2 prints)'); near(r.info.totalPrints, 20, 'total prints');
near(r.info.filmMetres, pa * 10 / 0.6, 'film usage in metres = area / roll width');
near(r.groups.print, pa * 10 * 55, 'DTF ink cost');
const tee = r.lines.find(l => l.label === 'Garment'); near(tee.amount, 400, 'garment cost 10 × R40');
const pack = r.lines.find(l => l.group === 'packaging'); near(pack.amount, 15, 'packaging');
const rNeg = PQ.calcLine(line('p_dtf_tee', { qty: 1, prints: [{ w: -5, h: 10, count: 1 }] }), cfg); ok(!rNeg.ok, 'negative print size rejected');

// 5. Tiered sell pricing (1-10=20, 11-50=17, 51-100=14, 101+=12)
const tp = q => PQ.calcLine(line('p_dtf_transfer', { qty: q, finishing: [] }), cfg);
[[5, 20], [10, 20], [11, 17], [50, 17], [51, 14], [100, 14], [101, 12], [400, 12]].forEach(([q, p]) => near(tp(q).sellingBeforeMin, q * p, 'tier qty ' + q + ' @ R' + p));
ok(tp(4).minApplied === true, 'min charge applied on 4 transfers (R80 < R100 min)'); near(tp(4).calculatedPrice, 100, 'min charge price');
near(tp(200).grossProfit, 200 * 12 - tp(200).productionCost, 'profit = tier sell price − real component cost'); ok(tp(200).productionCost > 0 && tp(200).productionCost < 2400, 'tier product still tracks real cost');
const tpf = PQ.calcLine(line('p_dtf_transfer', { qty: 20, finishing: [{ id: 'fin_pack' }] }), cfg); near(tpf.sellingBeforeMin, 20 * 17 + 20 * 2 * 1, 'finishing added on top of tier price, marked up at product markup 0%');

// 6. Minimum charges (product, category, global)
r = PQ.calcLine(line('p_cards', { qty: 10, finishing: [] }), cfg); ok(r.minApplied && r.calculatedPrice === 120, 'product minimum R120 (got ' + r.calculatedPrice + ')');
cfg.products.p_cards.minPrice = null; cfg.categories.cat_paper.minPrice = 75;
r = PQ.calcLine(line('p_cards', { qty: 10, finishing: [] }), cfg); ok(r.minApplied && r.calculatedPrice === 75, 'category minimum used');
cfg.categories.cat_paper.minPrice = null; cfg.settings.pricing.minCharge = 60;
r = PQ.calcLine(line('p_cards', { qty: 10, finishing: [] }), cfg); ok(r.minApplied && r.calculatedPrice === 60, 'global minimum used'); cfg = mk();

// 7. Rounding
cfg.settings.pricing.rounding = { step: 5, mode: 'nearest' };
r = PQ.calcLine(line('p_flyer', { qty: 137, finishing: [] }), cfg); ok(r.calculatedPrice % 5 === 0, 'rounds to nearest R5 (' + r.calculatedPrice + ')');
cfg.settings.pricing.rounding = { step: 10, mode: 'up' }; r = PQ.calcLine(line('p_flyer', { qty: 137, finishing: [] }), cfg);
ok(r.calculatedPrice % 10 === 0 && r.calculatedPrice >= r.sellingBeforeMin, 'rounds up to R10');
cfg.settings.pricing.rounding = { step: 0 }; r = PQ.calcLine(line('p_flyer', { qty: 137, finishing: [] }), cfg);
ok(r.calculatedPrice === r.sellingBeforeMin, 'no rounding');

// 8. Finishing methods
cfg = mk(); cfg.settings.pricing.rounding = { step: 0 };
const fin = (id, extra) => PQ.calcLine(line('p_banner', { w: 2, h: 1, unit: 'm', finishing: [{ id, qty: extra }] }), cfg).lines.find(l => l.group === 'finishing');
near(fin('fin_hem').amount, 4 * 6, 'per metre (perimeter 6m × R4)');
near(fin('fin_eyelet', 6).amount, 2.5 * 6, 'eyelets: 6 per piece × R2.5');
near(fin('fin_weed').amount, 30 * 2, 'per m² finishing');
near(fin('fin_install').amount, 250, 'labour-based finishing honours minimum charge');
near(fin('fin_setup').amount, 50, 'fixed finishing');
cfg.finishing.fin_pct = { id: 'fin_pct', name: 'Rush', method: 'percent', price: 10 };
const withPct = PQ.calcLine(line('p_banner', { w: 2, h: 1, unit: 'm', finishing: [{ id: 'fin_pct' }] }), cfg);
const direct = ['material', 'print', 'machine', 'labour', 'base'].reduce((a, g) => a + (withPct.groups[g] || 0), 0);
near(withPct.lines.find(l => l.group === 'finishing').amount, direct * 0.1, 'percentage finishing on direct cost');
const malformedFinishing = PQ.calcLine(line('p_banner', { w: 2, h: 1, unit: 'm', finishing: [undefined] }), cfg);
ok(!malformedFinishing.ok && malformedFinishing.errors.includes('A selected finishing option is incomplete. Remove it before saving.'), 'missing finishing selection id returns a validation error instead of throwing');

// 9. Discounts & manual override
cfg = mk(); cfg.settings.pricing.rounding = { step: 0 };
const base = PQ.calcLine(line('p_flyer', { qty: 200, finishing: [] }), cfg);
const d10 = PQ.calcLine(line('p_flyer', { qty: 200, finishing: [], discount: { type: 'pct', value: 10 } }), cfg);
near(d10.finalSubtotal, base.calculatedPrice * 0.9, 'line % discount'); 
const dR = PQ.calcLine(line('p_flyer', { qty: 200, finishing: [], discount: { type: 'fixed', value: 25 } }), cfg); near(dR.finalSubtotal, base.calculatedPrice - 25, 'line fixed discount');
ok(!PQ.calcLine(line('p_flyer', { qty: 200, discount: { type: 'pct', value: 120 } }), cfg).ok, 'discount > 100% rejected');
ok(!PQ.calcLine(line('p_flyer', { qty: 200, discount: { type: 'fixed', value: -5 } }), cfg).ok, 'negative discount rejected');
const ov = PQ.calcLine(line('p_flyer', { qty: 200, finishing: [], override: { price: 999.5, reason: 'loyal customer' } }), cfg);
ok(ov.overrideApplied && ov.finalSubtotal === 999.5 && ov.calculatedPrice === base.calculatedPrice, 'override keeps original calculated price and applies override');

// 10. Validation
[['qty 0', { qty: 0 }], ['negative qty', { qty: -3 }], ['negative width', { w: -10, h: 10, unit: 'mm' }], ['zero width on large', { w: 0, h: 0 }]]
  .forEach(([n, o]) => ok(!PQ.calcLine(line('p_poster', o), cfg).ok, n + ' rejected'));
ok(!PQ.calcLine(line('p_flyer', { qty: 12.5 }), cfg).ok, 'fractional flyer qty rejected');
ok(!PQ.calcLine(line('p_flyer', { qty: 5, markupOverride: -4 }), cfg).ok, 'negative markup rejected');
ok(!PQ.calcLine(line('p_flyer', { qty: 5, customCost: -4 }), cfg).ok, 'negative custom cost rejected');
ok(!PQ.calcLine(line('nope', {}), cfg).ok, 'unknown product rejected');
r = PQ.calcLine(line('p_custom', { qty: 10, customCost: 500, customLabel: 'Supplier mugs', finishing: [] }), cfg);
ok(r.ok && r.groups.custom === 500, 'custom cost included');

// 11. Quote totals: VAT exclusive / inclusive / disabled, discount interplay
const items = [{ calc: { sellingPrice: 1000, discountAmount: 100, productionCost: 500 } }, { calc: { sellingPrice: 500, discountAmount: 0, productionCost: 250 } }];
let q = PQ.calcQuote(items, { type: 'pct', value: 10 }, { enabled: true, rate: 15, mode: 'exclusive', discountReducesVat: true });
near(q.gross, 1500, 'gross'); near(q.afterDiscount, 1400 - 140, 'after discounts'); near(q.vat, 1260 * .15, 'VAT on discounted amount'); near(q.total, 1260 * 1.15, 'total incl VAT');
near(q.grossProfit, 1260 - 750, 'profit ex VAT'); near(q.marginPct, (1260 - 750) / 1260 * 100, 'margin %');
q = PQ.calcQuote(items, { type: 'pct', value: 10 }, { enabled: true, rate: 15, mode: 'exclusive', discountReducesVat: false });
near(q.vat, 1400 * .15, 'VAT on pre-discount when configured');
q = PQ.calcQuote(items, { type: 'fixed', value: 200 }, { enabled: true, rate: 15, mode: 'inclusive', discountReducesVat: true });
near(q.total, 1200, 'inclusive: total = discounted price'); near(q.vat, 1200 - 1200 / 1.15, 'inclusive VAT extracted'); near(q.subtotal, 1200 / 1.15, 'inclusive subtotal ex VAT');
q = PQ.calcQuote(items, null, { enabled: false, rate: 15 }); near(q.vat, 0, 'VAT disabled'); near(q.total, 1400, 'total when VAT disabled');
q = PQ.calcQuote(items, null, { enabled: true, rate: 20, mode: 'exclusive' }); near(q.vat, 280, 'VAT rate is configurable (20%)');
ok(PQ.calcQuote(items, { type: 'pct', value: 150 }, { enabled: true, rate: 15 }).errors.length > 0, 'quote discount > 100% flagged');
ok(PQ.calcQuote(items, null, { enabled: true, rate: -5 }).errors.length > 0, 'invalid VAT flagged');
q = PQ.calcQuote([{ calc: { sellingPrice: 80, discountAmount: 0, productionCost: 40 } }], null, { enabled: true, rate: 15 }, { minOrder: 150 });
near(q.minOrderAdjustment, 70, 'minimum order top-up'); near(q.total, 150 * 1.15, 'minimum order total');

// 12. Multiple items in one quote, computed by the engine
cfg = mk(); const its = [line('p_flyer', { qty: 100, finishing: [] }), line('p_dtf_tee', { qty: 20, finishing: [{ id: 'fin_press' }] }), line('p_banner', { w: 3, h: 1, unit: 'm', finishing: [{ id: 'fin_hem' }, { id: 'fin_eyelet', qty: 6 }] })];
its.forEach(i => i.calc = PQ.calcLine(i, cfg)); ok(its.every(i => i.calc.ok), 'all 3 line items calculate: ' + its.map(i => i.calc.errors).join('|'));
q = PQ.calcQuote(its, null, cfg.settings.vat); near(q.gross, its.reduce((a, i) => a + i.calc.sellingPrice, 0), 'quote gross = sum of lines'); near(q.total, q.subtotal + q.vat, 'total = subtotal + VAT');

// 13. Admin price changes affect future quotes; saved snapshots do not
const snap = PQ.deepFreeze(JSON.parse(JSON.stringify(its[0].calc))); const before = snap.sellingPrice;
cfg.materials.mat_130.cost = 1.5; cfg.settings.vat.rate = 16;
const later = PQ.calcLine(its[0], cfg); ok(later.sellingPrice > before, 'new calculation uses new material cost');
ok(snap.sellingPrice === before, 'saved snapshot untouched'); q = PQ.calcQuote(its, null, { enabled: true, rate: 15, mode: 'exclusive' }); near(q.vatRate, 15, 'saved quote keeps its own VAT snapshot');
const src = require('fs').readFileSync(__dirname + '/../calculator/engine.js', 'utf8'); ok(!/R\d+\.\d\d\b/.test(src.replace(/'R'/g, '')) && !/\b15\b.*VAT/.test(src), 'no hard-coded prices or VAT rate in engine source');

// 14. Determinism
const a = JSON.stringify(PQ.calcLine(its[2], cfg)), b = JSON.stringify(PQ.calcLine(its[2], cfg)); ok(a === b, 'same inputs → identical result');

// 15. Permissions & discount policy
cfg = mk(); const S = cfg.settings;
ok(PQ.hasPerm(S, 'owner', 'editPricing') && !PQ.hasPerm(S, 'manager', 'editPricing') && !PQ.hasPerm(S, 'staff', 'viewCosts') && PQ.hasPerm(S, 'manager', 'viewCosts'), 'role permissions');
ok(!PQ.hasPerm(S, 'manager', 'manageUsers'), 'only the owner manages users'); S.permissions.staff.viewCosts = true; ok(PQ.hasPerm(S, 'staff', 'viewCosts'), 'owner can grant staff cost visibility');
ok(PQ.discountPolicy(S, 'staff', 4).allowed && !PQ.discountPolicy(S, 'staff', 4).needsApproval, 'staff within limit');
ok(PQ.discountPolicy(S, 'staff', 12).needsApproval, 'staff above limit needs approval');
S.discount.requireApproval = false; ok(!PQ.discountPolicy(S, 'staff', 12).allowed, 'staff above limit blocked when approval is off');
S.discount.allowStaff = false; ok(!PQ.discountPolicy(S, 'staff', 1).allowed, 'staff discounts switched off'); ok(PQ.discountPolicy(S, 'owner', 90).allowed, 'owner unrestricted');

// 16. Quote numbering
const N = mk().settings; let counter = null; const seen = new Set();
for (let i = 0; i < 5; i++) { const seq = PQ.nextSeq(counter, N, 2026); counter = { year: 2026, seq }; seen.add(PQ.formatQuoteNumber(N, 2026, seq)); }
ok(seen.size === 5 && seen.has('QT-2026-0001') && seen.has('QT-2026-0005'), 'sequential unique numbers: ' + [...seen]);
ok(PQ.nextSeq(counter, N, 2027) === 1, 'yearly reset'); N.quotes.resetYearly = false; ok(PQ.nextSeq(counter, N, 2027) === 6, 'no yearly reset');
N.quotes = { prefix: 'INV', yearFormat: 'YY', separator: '/', length: 6, startNumber: 100 }; ok(PQ.formatQuoteNumber(N, 2026, PQ.nextSeq(null, N, 2026)) === 'INV/26/000100', 'custom prefix/year/length/start');

// 17. Rounding helper & missing refs
ok(PQ.roundTo(12.34, { step: 0 }) === 12.34 && PQ.roundTo(12.5, { step: 1, mode: 'nearest' }) === 13, 'roundTo');
cfg = mk(); delete cfg.materials.mat_130; ok(!PQ.calcLine(line('p_flyer', { qty: 10 }), cfg).ok, 'deleted material surfaces an error rather than silent R0');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
