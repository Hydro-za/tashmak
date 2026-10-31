/* PrintQuote pricing engine — pure, deterministic, no DOM, no hard-coded prices.
   Everything it needs comes from the `cfg` object (settings + catalogs). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PQ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (v, d = 0) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : d; };
const has = v => v !== undefined && v !== null && v !== '' && Number.isFinite(typeof v === 'number' ? v : parseFloat(v));
const UNIT_MM = { mm: 1, cm: 10, m: 1000 };

const METHODS = {
  per_item:    { label: 'Per item',            basis: 'item' },
  per_sqm:     { label: 'Per square metre',    basis: 'sqm' },
  per_metre:   { label: 'Per metre',           basis: 'metre' },
  per_sheet:   { label: 'Per sheet',           basis: 'sheet' },
  per_page:    { label: 'Per page',            basis: 'page' },
  per_print:   { label: 'Per print',           basis: 'print' },
  per_garment: { label: 'Per garment',         basis: 'item' },
  fixed:       { label: 'Fixed price',         basis: 'fixed' },
  tiered:      { label: 'Tiered by quantity',  basis: null }
};
const BASES = {
  item: 'per item', print: 'per print', printSqm: 'per m² of print area', sqm: 'per m²',
  sheet: 'per sheet', sheetSide: 'per sheet side', page: 'per page', metre: 'per linear metre', fixed: 'once-off'
};
const FIN_METHODS = {
  fixed: 'Fixed price', per_item: 'Per item', per_metre: 'Per metre', per_sqm: 'Per m²',
  per_page: 'Per page', percent: 'Percentage of direct cost', labour: 'Labour-based'
};

function roundTo(value, rounding) {
  const step = num(rounding && rounding.step, 0);
  if (!(step > 0)) return r2(value);
  const mode = (rounding && rounding.mode) || 'nearest';
  const q = value / step;
  const f = mode === 'up' ? Math.ceil(q - 1e-9) : mode === 'down' ? Math.floor(q + 1e-9) : Math.round(q);
  return r2(f * step);
}

function upsOnSheet(sw, sh, pw, ph, gutter) {
  if (!(sw > 0 && sh > 0 && pw > 0 && ph > 0)) return 1;
  const g = gutter || 0;
  const fit = (aw, ah, bw, bh) => Math.floor((aw + g) / (bw + g)) * Math.floor((ah + g) / (bh + g));
  return Math.max(fit(sw, sh, pw, ph), fit(sw, sh, ph, pw), 0);
}
function sheetCalc(mat, wmm, hmm, qty, leaves, gutter) {
  if (!(mat && mat.sheetW > 0 && mat.sheetH > 0) || !(wmm > 0 && hmm > 0))
    return { sheets: Math.ceil(qty * leaves), ups: 1, tiles: 1 };
  const ups = upsOnSheet(mat.sheetW, mat.sheetH, wmm, hmm, gutter);
  if (ups > 0) return { sheets: Math.ceil(qty * leaves / ups), ups, tiles: 1 };
  const tiles = Math.ceil(wmm / mat.sheetW) * Math.ceil(hmm / mat.sheetH);
  return { sheets: qty * leaves * tiles, ups: 0, tiles };
}

function resolveMarkup(line, prod, cat, S) {
  const P = S.pricing || {};
  if (has(line.markupOverride)) return { pct: num(line.markupOverride), source: 'quote override' };
  if (has(prod.markupPct)) return { pct: num(prod.markupPct), source: 'product' };
  if (cat && has(cat.markupPct)) return { pct: num(cat.markupPct), source: 'category' };
  return { pct: num(P.defaultMarkup, 0), source: 'global default' };
}

function calcLine(line, cfg) {
  const S = cfg.settings || {}, C = S.calc || {}, P = S.pricing || {};
  const res = { ok: false, errors: [], warnings: [], lines: [], groups: {}, info: {}, productionCost: 0, finalSubtotal: 0, calculatedPrice: 0, sellingPrice: 0 };
  const err = m => res.errors.push(m), warn = m => res.warnings.push(m);
  const prod = (cfg.products || {})[line.productId];
  if (!prod) { err('Select a product'); return res; }
  if (prod.active === false) warn('This product is currently disabled');
  const cat = (cfg.categories || {})[prod.category];
  const method = METHODS[prod.method] ? prod.method : 'per_item';

  // ---- validation of raw inputs
  const qty = num(line.qty);
  if (!(qty > 0)) err('Quantity must be greater than zero');
  const intOnly = !['per_sqm', 'per_metre'].includes(method);
  if (qty > 0 && intOnly && !Number.isInteger(qty)) err('Quantity must be a whole number');
  const unit = line.unit || prod.unit || 'mm';
  const k = UNIT_MM[unit] || 1;
  const wIn = has(line.w) ? num(line.w) * k : num(prod.defaultW) * (UNIT_MM[prod.unit || 'mm'] || 1);
  const hIn = has(line.h) ? num(line.h) * k : num(prod.defaultH) * (UNIT_MM[prod.unit || 'mm'] || 1);
  if (wIn < 0 || hIn < 0) err('Width and height cannot be negative');
  const wmm = Math.max(0, wIn), hmm = Math.max(0, hIn);
  const sides = Math.min(2, Math.max(1, Math.round(num(line.sides, num(prod.defaultSides, 1)))));
  const pages = Math.max(1, Math.floor(num(line.pages, num(prod.defaultPages, 1))));
  if (has(line.customCost) && num(line.customCost) < 0) err('Custom cost cannot be negative');
  if (has(line.extraMinutes) && num(line.extraMinutes) < 0) err('Extra labour minutes cannot be negative');
  if (has(line.markupOverride)) {
    const mu = num(line.markupOverride);
    if (mu < 0 || mu > num(P.maxMarkup, 1000)) err('Markup must be between 0% and ' + num(P.maxMarkup, 1000) + '%');
    if (C.markupMode === 'margin' && mu >= 100) err('Margin must be below 100%');
  }

  // ---- resolve components (line may override the primary material)
  const comps = (prod.components || []).map(c => ({ ...c }));
  let primIdx = comps.findIndex(c => c.primary && c.materialId);
  if (primIdx < 0) primIdx = comps.findIndex(c => c.materialId);
  if (primIdx >= 0 && line.materialId) comps[primIdx].materialId = line.materialId;
  const mats = cfg.materials || {};
  const primMat = primIdx >= 0 ? mats[comps[primIdx].materialId] : null;

  // ---- geometry / quantities
  const needsDims = ['large', 'paper'].includes(prod.profile) || ['per_sqm', 'per_metre'].includes(method) ||
    comps.some(c => { const m = c.materialId && mats[c.materialId]; return m && ['sqm', 'metre', 'sheet'].includes(m.costBasis) && !prod.usePrintList; });
  if (needsDims && !(wmm > 0 && hmm > 0)) err('Width and height are required for this product');
  const itemAreaM2 = wmm * hmm / 1e6;
  const totalAreaM2 = itemAreaM2 * qty;
  const lengthM = Math.max(wmm, hmm) / 1000;
  const perimeterM = 2 * (wmm + hmm) / 1000;
  const leaves = pages <= 1 ? 1 : Math.ceil(pages / sides);
  const impressions = pages <= 1 ? sides : pages;

  let printsPerItem = 1, printAreaPerItem = itemAreaM2;
  if (prod.usePrintList) {
    const list = (Array.isArray(line.prints) && line.prints.length ? line.prints : prod.defaultPrints) || [];
    printsPerItem = 0; printAreaPerItem = 0;
    list.forEach((p, i) => {
      const pw = num(p.w), ph = num(p.h), pc = num(p.count, 1);
      if (pw <= 0 || ph <= 0) err('Print ' + (i + 1) + ': width and height must be greater than zero');
      if (pc < 1 || !Number.isInteger(pc)) err('Print ' + (i + 1) + ': count must be a whole number of 1 or more');
      printsPerItem += pc; printAreaPerItem += pw * ph / 10000 * pc;
    });
    if (!list.length) err('Add at least one print position');
  }
  const gutter = has(prod.gutterMm) ? num(prod.gutterMm) : num(C.gutterMm, 3);
  const primSheet = sheetCalc(primMat && primMat.costBasis === 'sheet' ? primMat : null, wmm, hmm, qty, leaves, gutter);
  if (primMat && primMat.costBasis === 'sheet' && primSheet.ups === 0)
    warn('Finished size is larger than the sheet; sheets are tiled');

  const areaForMat = prod.usePrintList ? printAreaPerItem * qty : totalAreaM2;
  const B = {
    item: qty, print: qty * printsPerItem, printSqm: printAreaPerItem * qty, sqm: totalAreaM2,
    sheet: primSheet.sheets, sheetSide: primSheet.sheets * sides, page: qty * pages, metre: qty * lengthM, fixed: 1
  };
  const tierQtyBasis = prod.tierBasis || 'item';
  res.info = {
    qty, unit, widthMm: wmm, heightMm: hmm, itemAreaM2: itemAreaM2, totalAreaM2, perimeterM, lengthM,
    sides, pages, leaves, impressions, printsPerItem, printAreaPerItemM2: printAreaPerItem,
    printAreaPerItemCm2: printAreaPerItem * 10000, totalPrints: B.print, totalPrintAreaM2: B.printSqm,
    sheets: primSheet.sheets, upsPerSheet: primSheet.ups, filmMetres: 0
  };

  const add = (group, label, detail, amount) => {
    amount = r2(amount);
    if (amount === 0 && group !== 'base') return;
    res.lines.push({ group, label, detail, amount });
  };
  const money = v => 'R' + r2(v).toFixed(2);
  const fmtN = v => (Math.round(v * 1000) / 1000).toString();

  // ---- 1. base price (method / tiers)
  let baseSell = null;
  const units = method === 'tiered' ? B[tierQtyBasis] : B[METHODS[method].basis];
  let basePrice = num(prod.basePrice), tierNote = '';
  if (method === 'tiered' || (prod.tiers && prod.tiers.length && method !== 'fixed')) {
    const tiers = (prod.tiers || []).slice().sort((a, b) => num(a.from) - num(b.from));
    if (!tiers.length) { if (method === 'tiered') err('This tiered product has no tiers configured'); }
    else {
      const tq = B[tierQtyBasis];
      let t = tiers[0]; tiers.forEach(x => { if (tq >= num(x.from)) t = x; });
      basePrice = num(t.price);
      const next = tiers.find(x => num(x.from) > num(t.from));
      tierNote = ' (tier ' + num(t.from) + (next ? '–' + (num(next.from) - 1) : '+') + ')';
      res.info.tier = { from: num(t.from), price: num(t.price) };
    }
  }
  if (basePrice > 0 || (prod.baseIsSell && method !== 'per_item')) {
    const label = METHODS[method].label + ' base price' + tierNote;
    if (prod.baseIsSell) {
      // base price is a SELLING price that covers materials, print, machines & labour;
      // finishing and custom costs are marked up and added on top.
      baseSell = r2(basePrice * units);
      add('base', label, fmtN(units) + ' × ' + money(basePrice) + ' sell price — covers materials, printing, machines & labour (no markup)', 0);
    } else {
      add('base', label, fmtN(units) + ' × ' + money(basePrice), basePrice * units);
    }
  }
  if (num(prod.setupFee) > 0) add('other', 'Setup fee', 'once-off', num(prod.setupFee));

  // ---- 2. components (materials & other costs)
  comps.forEach(c => {
    const grp = c.group || 'material';
    if (c.materialId) {
      const m = mats[c.materialId];
      if (!m) { err('Material no longer exists (' + (c.label || c.materialId) + ')'); return; }
      if (m.active === false) warn('Material "' + m.name + '" is disabled');
      let usage = 0, u = '';
      if (m.costBasis === 'sheet') { usage = c === comps[primIdx] ? primSheet.sheets : sheetCalc(m, wmm, hmm, qty, leaves, gutter).sheets; u = 'sheets'; }
      else if (m.costBasis === 'sqm') { usage = areaForMat; u = 'm²'; }
      else if (m.costBasis === 'metre') {
        const rw = num(m.rollWidth) / 1000;
        if (!(rw > 0)) { err('Roll width missing for material "' + m.name + '"'); return; }
        usage = areaForMat / rw; u = 'm';
        if (!prod.usePrintList && Math.min(wmm, hmm) / 1000 > rw + 1e-9) warn('Smaller side is wider than the ' + m.rollWidth + 'mm roll of "' + m.name + '"');
        if (prod.usePrintList) res.info.filmMetres += usage;
      } else { usage = num(c.qtyPer, 1) * B[c.perBasis || 'item']; u = m.costBasis === 'kg' ? 'kg' : 'units'; }
      const amt = usage * num(m.cost);
      add(grp, c.label || m.name, fmtN(usage) + ' ' + u + ' × ' + money(m.cost) + ' (' + m.name + ')', amt);
      if (num(m.wastagePct) > 0) add('wastage', m.name + ' material wastage', num(m.wastagePct) + '% of ' + money(amt), amt * num(m.wastagePct) / 100);
      if (has(m.stock) && num(m.stock) > 0 && usage > num(m.stock)) warn('Low stock: "' + m.name + '" needs ' + fmtN(usage) + ' ' + u + ', ' + m.stock + ' available');
    } else {
      const q = B[c.basis || 'item'];
      add(grp, c.label || 'Cost', fmtN(q) + ' ' + (BASES[c.basis || 'item'] || '') + ' × ' + money(c.rate), num(c.rate) * q);
    }
  });

  // ---- 3. print cost
  const pr = prod.print;
  const printBasisKey = (pr && pr.basis) || 'print';
  if (pr && num(pr.rate) > 0) {
    let rate = num(pr.rate);
    const bw = line.colour === 'bw';
    if (bw && has(pr.bwFactor)) rate *= num(pr.bwFactor);
    const q = printBasisKey === 'sqm' ? areaForMat : printBasisKey === 'printSqm' ? B.printSqm : B[printBasisKey];
    add('print', pr.label || 'Printing', fmtN(q) + ' ' + (BASES[printBasisKey] || '') + ' × ' + money(rate) + (bw ? ' (B&W)' : ''), rate * q);
  }
  const printQty = printBasisKey === 'sqm' ? areaForMat : printBasisKey === 'printSqm' ? B.printSqm : B[printBasisKey];

  // ---- 4. machines
  if (C.includeMachine !== false) (prod.machines || []).forEach(pm => {
    const m = (cfg.machines || {})[pm.machineId];
    if (!m) { if (pm.machineId) err('Machine no longer exists'); return; }
    if (m.active === false) warn('Machine "' + m.name + '" is disabled');
    const hrs = (num(pm.minutesPerUnit) * B[pm.unitBasis || 'item'] + num(pm.fixedMinutes)) / 60;
    const parts = [];
    let amt = 0;
    const s = num(m.setupCost); if (s > 0) { amt += s; parts.push('setup ' + money(s)); }
    const pp = num(m.costPerPrint) * printQty; if (pp > 0) { amt += pp; parts.push(fmtN(printQty) + ' prints × ' + money(m.costPerPrint)); }
    const ps = num(m.costPerSqm) * areaForMat; if (ps > 0) { amt += ps; parts.push(fmtN(areaForMat) + ' m² × ' + money(m.costPerSqm)); }
    const hr = num(m.costPerHour) + num(m.maintenancePerHour) + num(m.depreciationPerHour);
    if (hrs > 0 && hr > 0) { amt += hrs * hr; parts.push(fmtN(hrs) + ' h × ' + money(hr)); }
    add('machine', m.name, parts.join(' + '), amt);
  });

  // ---- 5. labour
  const labCost = (lab, hours) => {
    let c = hours * num(lab.hourly);
    if (num(lab.minCharge) > 0 && hours > 0) c = Math.max(c, num(lab.minCharge));
    return c * (1 + num(lab.markupPct) / 100);
  };
  if (C.includeLabour !== false) {
    (prod.labour || []).forEach(pl => {
      const lab = (cfg.labour || {})[pl.labourId];
      if (!lab) { if (pl.labourId) err('Labour type no longer exists'); return; }
      const hrs = (num(pl.minutesPerUnit) * B[pl.unitBasis || 'item'] + num(pl.setupMinutes)) / 60;
      if (hrs > 0) add('labour', lab.name, fmtN(hrs) + ' h × ' + money(lab.hourly), labCost(lab, hrs));
    });
    if (num(line.extraMinutes) > 0) {
      const lab = (cfg.labour || {})[line.labourId] || (cfg.labour || {})[((prod.labour || [])[0] || {}).labourId];
      if (lab) add('labour', 'Extra labour: ' + lab.name, fmtN(num(line.extraMinutes) / 60) + ' h × ' + money(lab.hourly), labCost(lab, num(line.extraMinutes) / 60));
      else err('Choose a labour type for the extra labour minutes');
    }
  }

  // ---- 6. finishing
  const directSoFar = () => res.lines.filter(l => ['material', 'print', 'machine', 'labour', 'base'].includes(l.group)).reduce((a, l) => a + l.amount, 0);
  if (C.includeFinishing !== false) (line.finishing || []).forEach(sel => {
    if (!sel || typeof sel.id !== 'string' || !sel.id) { err('A selected finishing option is incomplete. Remove it before saving.'); return; }
    const f = (cfg.finishing || {})[sel.id];
    if (!f) { err('A selected finishing option no longer exists'); return; }
    if (f.active === false) warn('Finishing "' + f.name + '" is disabled');
    const qp = f.askQty ? num(sel.qty, num(f.defaultQty, 1)) : 1;
    if (qp < 0) { err(f.name + ': quantity cannot be negative'); return; }
    let amt = 0, detail = '';
    switch (f.method) {
      case 'fixed': amt = num(f.price); detail = 'fixed'; break;
      case 'per_item': amt = num(f.price) * qty * qp; detail = fmtN(qty * qp) + ' × ' + money(f.price); break;
      case 'per_page': amt = num(f.price) * qty * pages * qp; detail = fmtN(qty * pages * qp) + ' pages × ' + money(f.price); break;
      case 'per_sqm': amt = num(f.price) * areaForMat; detail = fmtN(areaForMat) + ' m² × ' + money(f.price); break;
      case 'per_metre': {
        const per = f.metreBasis === 'width' ? wmm / 1000 : f.metreBasis === 'height' ? hmm / 1000 : perimeterM;
        amt = num(f.price) * per * qty * qp; detail = fmtN(per * qty * qp) + ' m × ' + money(f.price); break;
      }
      case 'percent': { const b = directSoFar(); amt = b * num(f.price) / 100; detail = num(f.price) + '% of ' + money(b); break; }
      case 'labour': {
        const lab = (cfg.labour || {})[f.labourId];
        if (!lab) { err(f.name + ': labour type missing'); return; }
        const hrs = num(f.minutes) * qty * qp / 60;
        amt = labCost(lab, hrs); detail = fmtN(hrs) + ' h × ' + money(lab.hourly); break;
      }
      default: err(f.name + ': unknown pricing method'); return;
    }
    if (num(f.setup) > 0) { amt += num(f.setup); detail += ' + setup ' + money(f.setup); }
    if (num(f.minCharge) > 0 && amt < num(f.minCharge)) { amt = num(f.minCharge); detail = 'minimum charge'; }
    add('finishing', f.name, detail, amt);
  });

  // ---- 7. other costs & custom cost
  (prod.otherCosts || []).forEach(o => {
    const q = B[o.basis || 'fixed'];
    add('other', o.label || 'Other cost', fmtN(q) + ' × ' + money(o.amount), num(o.amount) * q);
  });
  if (has(line.customCost) && num(line.customCost) > 0) add('custom', line.customLabel || 'Custom cost', 'entered on quote', num(line.customCost));

  // ---- 8. wastage
  const wpct = has(line.wastagePct) ? num(line.wastagePct) : has(prod.wastagePct) ? num(prod.wastagePct) : num(P.defaultWastagePct, 0);
  if (wpct < 0 || wpct > 100) err('Wastage must be between 0% and 100%');
  if (C.includeWastage !== false && wpct > 0) {
    const g = (grp) => res.lines.filter(l => l.group === grp).reduce((a, l) => a + l.amount, 0);
    const applies = C.wastageAppliesTo || 'materials_print';
    const b = applies === 'materials' ? g('material') : applies === 'direct' ? g('material') + g('print') + g('machine') + g('labour') + g('base') : g('material') + g('print');
    add('wastage', 'Wastage allowance', wpct + '% of ' + money(b) + ' (' + applies.replace('_', ' + ') + ')', b * wpct / 100);
  }

  // ---- honour the on/off switches for whole groups
  const off = { packaging: C.includePackaging === false, other: C.includeOther === false, custom: false };
  res.lines = res.lines.filter(l => !off[l.group]);

  // ---- totals
  const groups = {};
  res.lines.forEach(l => { groups[l.group] = r2((groups[l.group] || 0) + l.amount); });
  res.groups = groups;
  const cost = r2(res.lines.reduce((a, l) => a + l.amount, 0));
  res.productionCost = cost;

  // ---- markup → selling price
  const mk = resolveMarkup(line, prod, cat, S);
  res.markupPct = mk.pct; res.markupSource = mk.source; res.markupMode = C.markupMode === 'margin' ? 'margin' : 'markup';
  const applyMk = c => res.markupMode === 'margin' ? (mk.pct >= 100 ? c : c / (1 - mk.pct / 100)) : c * (1 + mk.pct / 100);
  let sell;
  if (baseSell !== null) {
    const extras = (groups.finishing || 0) + (groups.custom || 0);
    sell = baseSell + applyMk(extras);
  } else sell = applyMk(cost);
  sell = r2(sell);
  res.sellingBeforeMin = sell;

  // ---- minimum price (product → category → global)
  const minP = has(prod.minPrice) && num(prod.minPrice) > 0 ? num(prod.minPrice) : (cat && has(cat.minPrice) && num(cat.minPrice) > 0 ? num(cat.minPrice) : num(P.minCharge, 0));
  res.minPrice = minP; res.minApplied = false;
  if (sell < minP) { sell = minP; res.minApplied = true; }
  sell = roundTo(sell, P.rounding);
  res.calculatedPrice = sell;

  // ---- manual override
  let finalSell = sell;
  res.overrideApplied = false;
  if (line.override && has(line.override.price)) {
    if (num(line.override.price) < 0) err('Override price cannot be negative');
    else { finalSell = r2(num(line.override.price)); res.overrideApplied = true; }
  }
  res.sellingPrice = finalSell;

  // ---- line discount
  let disc = 0;
  const d = line.discount;
  if (d && has(d.value) && num(d.value) !== 0) {
    if (num(d.value) < 0) err('Discount cannot be negative');
    else if (d.type === 'pct') { if (num(d.value) > 100) err('Discount cannot exceed 100%'); else disc = finalSell * num(d.value) / 100; }
    else { if (num(d.value) > finalSell + 1e-9) err('Discount cannot exceed the line price'); else disc = num(d.value); }
  }
  res.discountAmount = r2(disc);
  res.finalSubtotal = r2(finalSell - disc);
  res.unitPrice = qty > 0 ? r2(finalSell / qty) : 0;
  res.unitCost = qty > 0 ? r2(cost / qty) : 0;
  res.grossProfit = r2(res.finalSubtotal - cost);
  res.marginPct = res.finalSubtotal > 0 ? r2(res.grossProfit / res.finalSubtotal * 100) : 0;
  res.ok = res.errors.length === 0;
  return res;
}

// ---- quote totals ---------------------------------------------------------
function calcQuote(items, quoteDiscount, vatCfg, opts) {
  opts = opts || {};
  const vc = vatCfg || {};
  const calcs = items.map(i => i.calc || {});
  const gross = r2(calcs.reduce((a, c) => a + num(c.sellingPrice), 0));
  const lineDisc = r2(calcs.reduce((a, c) => a + num(c.discountAmount), 0));
  const net0 = r2(gross - lineDisc);
  let qd = 0; const errors = [];
  const d = quoteDiscount;
  if (d && has(d.value) && num(d.value) !== 0) {
    if (num(d.value) < 0) errors.push('Discount cannot be negative');
    else if (d.type === 'pct') { if (num(d.value) > 100) errors.push('Discount cannot exceed 100%'); else qd = net0 * num(d.value) / 100; }
    else { if (num(d.value) > net0 + 1e-9) errors.push('Discount cannot exceed the quote subtotal'); else qd = num(d.value); }
  }
  qd = r2(qd);
  let afterDisc = r2(net0 - qd);
  let minAdj = 0;
  if (num(opts.minOrder) > 0 && afterDisc > 0 && afterDisc < num(opts.minOrder)) { minAdj = r2(num(opts.minOrder) - afterDisc); afterDisc = r2(afterDisc + minAdj); }
  const enabled = vc.enabled !== false, rate = num(vc.rate, 0);
  if (enabled && (rate < 0 || rate > 100)) errors.push('VAT rate is invalid');
  const inclusive = vc.mode === 'inclusive';
  const reduces = vc.discountReducesVat !== false;
  const preDisc = r2(net0 + minAdj);
  const vatBaseAmt = reduces ? afterDisc : preDisc;
  let vat = 0, total, subtotalEx;
  if (!enabled) { total = afterDisc; subtotalEx = afterDisc; }
  else if (inclusive) { vat = r2(vatBaseAmt - vatBaseAmt / (1 + rate / 100)); total = afterDisc; subtotalEx = r2(total - vat); }
  else { vat = r2(vatBaseAmt * rate / 100); total = r2(afterDisc + vat); subtotalEx = afterDisc; }
  const cost = r2(calcs.reduce((a, c) => a + num(c.productionCost), 0));
  const revenue = enabled && inclusive ? r2(total - vat) : afterDisc;
  const grossProfit = r2(revenue - cost);
  const totalDiscount = r2(lineDisc + qd);
  const discountBase = r2(gross + minAdj);
  return {
    gross, lineDiscounts: lineDisc, quoteDiscount: qd, minOrderAdjustment: minAdj, afterDiscount: afterDisc,
    subtotal: subtotalEx, vat, total, vatEnabled: enabled, vatRate: rate, vatMode: inclusive ? 'inclusive' : 'exclusive',
    productionCost: cost, revenue, grossProfit, marginPct: revenue > 0 ? r2(grossProfit / revenue * 100) : 0,
    totalDiscount, discountPct: discountBase > 0 ? r2(totalDiscount / discountBase * 100) : 0, errors
  };
}

// ---- permissions & discount policy ---------------------------------------
const PERMS = [
  ['createQuotes', 'Create quotes'], ['editQuotes', 'Edit quotes'], ['viewAllQuotes', 'View all staff quotes'],
  ['deleteQuotes', 'Delete quotes'], ['changeStatus', 'Change quote status'], ['viewCosts', 'See production costs'],
  ['viewProfit', 'See gross profit'], ['viewMargin', 'See gross margin %'], ['overrideMarkup', 'Override markup on a quote'],
  ['overridePrice', 'Manually override prices'], ['applyDiscount', 'Apply discounts'], ['approveDiscount', 'Approve discounts'],
  ['viewReports', 'View dashboard reports'], ['editProducts', 'Add / edit / delete products'],
  ['editPricing', 'Change materials, labour, machines, finishing, markups & settings'], ['manageUsers', 'Manage staff & permissions'],
  ['viewAudit', 'View audit log'], ['importExport', 'Import / export']
];
function hasPerm(S, role, perm) {
  if (role === 'owner') return true;
  if (perm === 'manageUsers') return false;
  return !!(((S.permissions || {})[role] || {})[perm]);
}
function discountPolicy(S, role, pct) {
  if (role === 'owner' || !(pct > 0)) return { allowed: true, needsApproval: false, max: Infinity };
  const D = S.discount || {};
  if (role === 'staff' && D.allowStaff === false) return { allowed: false, needsApproval: false, max: 0, reason: 'Staff discounts are switched off' };
  const max = num(role === 'manager' ? D.managerMaxPct : D.staffMaxPct, 0);
  if (pct <= max + 1e-9) return { allowed: true, needsApproval: false, max };
  if (D.requireApproval !== false) return { allowed: true, needsApproval: true, max };
  return { allowed: false, needsApproval: false, max, reason: 'Discount exceeds your limit of ' + max + '%' };
}

// ---- quote numbering ------------------------------------------------------
function formatQuoteNumber(S, year, seq) {
  const Q = (S && S.quotes) || {};
  const sep = Q.separator === undefined ? '-' : Q.separator;
  const yf = Q.yearFormat || 'YYYY';
  const yr = yf === 'none' ? '' : yf === 'YY' ? String(year).slice(-2) : String(year);
  const digits = String(seq).padStart(Math.max(1, num(Q.length, 4)), '0');
  return [Q.prefix === undefined ? 'QT' : Q.prefix, yr, digits].filter(x => x !== '').join(sep);
}
function nextSeq(counter, S, year) {
  const Q = (S && S.quotes) || {};
  const start = Math.max(1, Math.floor(num(Q.startNumber, 1)));
  if (!counter || !Number.isFinite(counter.seq)) return start;
  if (Q.resetYearly !== false && counter.year !== year) return start;
  return Math.max(counter.seq + 1, start);
}

// ---- generic helpers ------------------------------------------------------
function diffObjects(a, b, skip) {
  const out = []; skip = skip || [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  keys.forEach(k => {
    if (skip.includes(k)) return;
    const x = (a || {})[k], y = (b || {})[k];
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ key: k, old: x, new: y });
  });
  return out;
}
function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; }

return { r2, num, has, roundTo, upsOnSheet, sheetCalc, calcLine, calcQuote, hasPerm, discountPolicy, PERMS,
  formatQuoteNumber, nextSeq, diffObjects, deepFreeze, METHODS, BASES, FIN_METHODS, UNIT_MM };
});
