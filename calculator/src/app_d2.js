/* ===== products + 10-step wizard, users, audit, import/export, boot ===== */
function productsCard(filter, title, tag) {
  const edit = can('editProducts'), showC = can('viewCosts');
  const list = Object.values(State.cfg.products).filter(filter).sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="card"><div class="hd"><h2>${e(title)} <span class="muted" style="font-weight:400">(${list.length})</span></h2>${edit ? `<button class="btn sm primary" data-act="prod-new" data-tag="${tag || ''}">+ New product</button>` : ''}</div>
  ${list.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Product</th><th>Category</th><th>Pricing</th>${showC ? '<th>Markup</th><th>Min price</th>' : ''}<th></th></tr></thead><tbody>${list.map(p => { const c = State.cfg.categories[p.category]; return `<tr class="${p.active === false ? 'muted' : ''}"><td><b>${e(p.name)}</b>${p.demo ? ' <span class="badge b-demo">DEMO</span>' : ''}${p.active === false ? ' <span class="badge">disabled</span>' : ''}</td><td>${e(c ? c.name : '—')}</td><td>${e((PQ.METHODS[p.method] || {}).label || p.method)}</td>${showC ? `<td>${PQ.has(p.markupPct) ? pctf(p.markupPct) : '<span class="muted">inherit</span>'}</td><td>${PQ.num(p.minPrice) ? money(p.minPrice) : '—'}</td>` : ''}<td class="r" style="white-space:nowrap">${edit ? `<button class="btn sm" data-act="prod-edit" data-id="${e(p.id)}">Edit</button> <button class="btn sm" data-act="prod-dup" data-id="${e(p.id)}">Duplicate</button> <button class="btn sm" data-act="prod-toggle" data-id="${e(p.id)}">${p.active === false ? 'Enable' : 'Disable'}</button> <button class="btn sm danger" data-act="prod-del" data-id="${e(p.id)}">Delete</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No products.</p>'}</div>`;
}
const productsTab = () => productsCard(() => true, 'Products') + (can('editPricing') ? catalogCard('categories', null, 'Categories') : '');
Object.assign(ACT, {
  'prod-new': el => openWizard(null, el.dataset.tag), 'prod-edit': el => openWizard(el.dataset.id),
  'prod-dup': async el => { const s = State.cfg.products[el.dataset.id], c = clone(s); c.id = uid('p'); c.name = s.name + ' (copy)'; c.demo = false; if (await safe(() => DB.set('products', c.id, c), 'Duplicated')) { await DB.audit(`Duplicated product "${s.name}"`, 'products'); render(true); } },
  'prod-toggle': async el => { const x = clone(State.cfg.products[el.dataset.id]), was = x.active !== false; x.active = !was; if (await safe(() => DB.set('products', x.id, x), was ? 'Disabled' : 'Enabled')) { await DB.audit(`${was ? 'Disabled' : 'Enabled'} product "${x.name}"`, 'products'); render(true); } },
  'prod-del': async el => { const x = State.cfg.products[el.dataset.id]; if (!await confirmDialog({ title: 'Delete product?', body: `<p>Delete <b>${e(x.name)}</b> permanently? Saved quotes keep their prices and wording. Consider <b>Disable</b> instead.</p>`, okLabel: 'Delete', danger: true })) return; if (await safe(() => DB.del('products', x.id), 'Deleted')) { await DB.audit(`Deleted product "${x.name}"`, 'products'); render(true); } },
  'wz-go': el => wzGo(+el.dataset.s), 'wz-next': () => wzGo(Wz.step + 1), 'wz-back': () => wzGo(Wz.step - 1), 'wz-save': () => wzSave(),
  'wz-add': el => { const l = el.dataset.l, p = Wz.p; if (l === 'tiers') p.tiers.push({ from: (p.tiers.length ? PQ.num(p.tiers[p.tiers.length - 1].from) + 10 : 1), price: 0 });
    else if (l === 'mat') p.components.push({ label: '', materialId: (Object.values(State.cfg.materials)[0] || {}).id || '', group: 'material', qtyPer: 1, perBasis: 'item' });
    else if (l === 'cost') p.components.push({ label: '', rate: 0, basis: 'item', group: 'other' });
    else if (l === 'machines') p.machines.push({ machineId: (Object.values(State.cfg.machines)[0] || {}).id || '', minutesPerUnit: 0, unitBasis: 'item', fixedMinutes: 0 });
    else if (l === 'labour') p.labour.push({ labourId: (Object.values(State.cfg.labour)[0] || {}).id || '', minutesPerUnit: 0, unitBasis: 'item', setupMinutes: 0 });
    else if (l === 'otherCosts') p.otherCosts.push({ label: '', amount: 0, basis: 'fixed' });
    else if (l === 'defaultPrints') p.defaultPrints.push({ label: 'Front', w: 21, h: 29.7, count: 1 });
    else if (l === 'print') p.print = { label: 'Printing', rate: 0, basis: 'sheetSide', bwFactor: 1 };
    wzRender(); },
  'wz-del': el => { const l = el.dataset.l, i = +el.dataset.i; if (l === 'print') Wz.p.print = null; else if (l === 'comp') Wz.p.components.splice(i, 1); else Wz.p[l].splice(i, 1); wzRender(); }
});
let Wz = null;
const WSTEPS = ['Info', 'Pricing', 'Materials', 'Machines', 'Labour', 'Finishing', 'Wastage', 'Markup', 'Minimum', 'Review'];
function newProduct(profile) {
  const cat = Object.values(State.cfg.categories)[0];
  return { id: uid('p'), name: '', category: cat ? cat.id : '', profile: profile || 'general', description: '', unit: 'mm', defaultW: 0, defaultH: 0, defaultQty: 1, defaultSides: 1, defaultPages: 1, method: 'per_item', basePrice: 0, setupFee: 0, tierBasis: 'item', baseIsSell: false, tiers: [], components: [], print: null, machines: [], labour: [], allowedFinishing: [], defaultFinishing: [], otherCosts: [], wastagePct: null, markupPct: null, minPrice: null, usePrintList: profile === 'dtf', defaultPrints: profile === 'dtf' ? [{ label: 'Front', w: 21, h: 29.7, count: 1 }] : [], active: true };
}
function openWizard(id, tag) {
  Wz = { step: 0, isNew: !id, p: id ? clone(State.cfg.products[id]) : newProduct(tag), orig: id ? clone(State.cfg.products[id]) : null, testQty: null };
  Wz.p.tiers = Wz.p.tiers || []; Wz.p.components = Wz.p.components || []; Wz.p.machines = Wz.p.machines || []; Wz.p.labour = Wz.p.labour || []; Wz.p.otherCosts = Wz.p.otherCosts || []; Wz.p.allowedFinishing = Wz.p.allowedFinishing || []; Wz.p.defaultFinishing = Wz.p.defaultFinishing || []; Wz.p.defaultPrints = Wz.p.defaultPrints || [];
  openModal({ title: id ? 'Edit product' : 'New product', wide: true, body: wzBody(), footer: wzFooter(), onClose: () => { Wz = null; } });
}
function wzGo(s) { Wz.step = Math.max(0, Math.min(WSTEPS.length - 1, s)); wzRender(); const mb = $('#mb'); if (mb) mb.scrollTop = 0; }
function wzRender() { const mb = $('#mb'), mf = $('#mf'); if (mb) mb.innerHTML = wzBody(); if (mf) mf.innerHTML = wzFooter(); }
function wzFooter() { const s = Wz.step; return `<button class="btn" data-act="modal-close">Cancel</button>${s > 0 ? '<button class="btn" data-act="wz-back">Back</button>' : ''}${s < WSTEPS.length - 1 ? '<button class="btn primary" data-act="wz-next">Next</button>' : ''}<button class="btn ${s === WSTEPS.length - 1 ? 'primary' : ''}" data-act="wz-save">Save product</button>`; }
const W = (path, type, extra) => `data-w="${path}" data-t="${type}" ${extra || ''}`;
const wsel = (path, opts, val, re) => `<select ${W(path, 's', re ? 'data-re="1"' : '')}>${opts.map(o => `<option value="${e(o[0])}" ${String(o[0]) === String(val) ? 'selected' : ''}>${e(o[1])}</option>`).join('')}</select>`;
const wnum = (path, v, o) => `<input type="number" inputmode="decimal" step="any" min="${o && o.min !== undefined ? o.min : 0}" ${W(path, o && o.nullable ? 'nn' : 'n')} value="${v === null || v === undefined ? '' : e(v)}" ${o && o.ph ? `placeholder="${e(o.ph)}"` : ''}>`;
function rowFields(list, i, fields, extraBtn) {
  const r = Wz.p[list][i];
  return `<div class="listrow" style="grid-template-columns:repeat(${fields.length},minmax(0,1fr)) auto">${fields.map(f => `<div class="field"><label>${f.l}</label>${f.sel ? `<select data-wl="${list}" data-idx="${i}" data-k="${f.k}" data-t="s" ${f.re ? 'data-re="1"' : ''}>${f.sel.map(o => `<option value="${e(o[0])}" ${String(o[0]) === String(r[f.k]) ? 'selected' : ''}>${e(o[1])}</option>`).join('')}</select>` : `<input ${f.t === 's' ? '' : 'type="number" step="any" min="0"'} data-wl="${list}" data-idx="${i}" data-k="${f.k}" data-t="${f.t}" value="${e(r[f.k] ?? '')}">`}</div>`).join('')}<button class="btn icon danger" data-act="wz-del" data-l="${list}" data-i="${i}" aria-label="Remove">✕</button></div>`;
}
const matOpts = () => Object.values(State.cfg.materials).sort((a, b) => a.name.localeCompare(b.name)).map(m => [m.id, m.name + (m.active === false ? ' (disabled)' : '')]);
const basisOpts = keys => keys.map(k => [k, PQ.BASES[k]]);
function wzBody() {
  const p = Wz.p, s = Wz.step, cats = Object.values(State.cfg.categories);
  const head = `<div class="steps">${WSTEPS.map((t, i) => `<button class="${i === s ? 'on' : i < s ? 'done' : ''}" data-act="wz-go" data-s="${i}">${i + 1}. ${t}</button>`).join('')}</div>`;
  let h = '';
  if (s === 0) h = `<div class="grid g2">${fld('Product name *', `<input ${W('name', 's')} value="${e(p.name)}">`)}${fld('Category', wsel('category', cats.map(c => [c.id, c.name]), p.category))}
    ${fld('Calculator type', wsel('profile', PROFILES, p.profile, 1), 'Decides which input fields appear on a quote line')}${fld('Status', `<label class="chk"><input type="checkbox" ${W('active', 'b')} ${p.active !== false ? 'checked' : ''}> Active</label>`)}
    ${fld('Default width', wnum('defaultW', p.defaultW))}${fld('Default height', wnum('defaultH', p.defaultH))}${fld('Size unit', wsel('unit', [['mm', 'mm'], ['cm', 'cm'], ['m', 'm']], p.unit))}${fld('Default quantity', wnum('defaultQty', p.defaultQty, { min: 1 }))}
    ${fld('Default print sides', wsel('defaultSides', [[1, 'Single-sided'], [2, 'Double-sided']], p.defaultSides))}${fld('Default pages', wnum('defaultPages', p.defaultPages, { min: 1 }))}
    ${fld('Uses a list of print positions', `<label class="chk"><input type="checkbox" ${W('usePrintList', 'b', 'data-re="1"')} ${p.usePrintList ? 'checked' : ''}> Yes (DTF-style: several prints per item)</label>`)}</div>
    ${fld('Description', `<textarea ${W('description', 's')}>${e(p.description || '')}</textarea>`)}
    ${p.usePrintList ? `<div class="lbl" style="margin:12px 0 6px">Default print positions (cm)</div>${p.defaultPrints.map((_, i) => rowFields('defaultPrints', i, [{ k: 'label', l: 'Position', t: 's' }, { k: 'w', l: 'Width', t: 'n' }, { k: 'h', l: 'Height', t: 'n' }, { k: 'count', l: 'Count', t: 'n' }])).join('')}<button class="btn sm" data-act="wz-add" data-l="defaultPrints">+ Add position</button>` : ''}`;
  else if (s === 1) {
    const m = p.method, basisLbl = { per_item: 'item', per_sqm: 'm²', per_metre: 'metre', per_sheet: 'sheet', per_page: 'page', per_print: 'print', per_garment: 'garment', fixed: 'job', tiered: 'unit' }[m];
    h = `<div class="alert info">Most products are priced from their component costs (next steps). Use a base price for simple per-unit, fixed or tiered pricing — alone or on top of components.</div><div class="grid g2">${fld('Pricing method', wsel('method', Object.entries(PQ.METHODS).map(([k, v]) => [k, v.label]), m, 1))}
    ${m !== 'tiered' ? fld(`Base price per ${basisLbl} (R)`, wnum('basePrice', p.basePrice), m === 'fixed' ? 'Fixed price for the whole job' : 'Leave 0 to price from components only') : fld('Tier quantity is counted in', wsel('tierBasis', basisOpts(['item', 'print', 'sqm', 'sheet', 'page', 'metre']), p.tierBasis || 'item'))}
    ${fld('Job setup fee (R, cost)', wnum('setupFee', p.setupFee))}${fld('Price type', `<label class="chk"><input type="checkbox" ${W('baseIsSell', 'b')} ${p.baseIsSell ? 'checked' : ''}> Base / tier price is a <b>selling</b> price (no markup; covers materials, print, machines & labour)</label>`)}</div>`;
    if (m === 'tiered' || p.tiers.length) h += `<div class="lbl" style="margin:12px 0 6px">Quantity tiers ${m === 'tiered' ? '' : '(optional)'} — price per ${basisLbl}${p.baseIsSell ? ' (selling)' : ' (cost)'}</div>${p.tiers.map((_, i) => rowFields('tiers', i, [{ k: 'from', l: 'From quantity', t: 'n' }, { k: 'price', l: 'Price (R)', t: 'n' }])).join('')}<button class="btn sm" data-act="wz-add" data-l="tiers">+ Add tier</button>`;
    else h += `<button class="btn sm" style="margin-top:10px" data-act="wz-add" data-l="tiers">+ Add quantity tiers</button>`;
  } else if (s === 2) {
    h = `<div class="lbl" style="margin-bottom:6px">Materials & component costs</div><div class="muted" style="font-size:12px;margin-bottom:8px">Quantities for sheet, m² and roll materials are worked out from the size; for unit/kg materials set the amount per basis. The first ✓ primary material can be swapped on each quote.</div>`;
    p.components.forEach((c, i) => {
      if (c.materialId !== undefined) { const mm = State.cfg.materials[c.materialId], unitMat = mm && ['unit', 'kg'].includes(mm.costBasis);
        h += `<div class="listrow" style="grid-template-columns:1fr 1.6fr auto ${unitMat ? '1fr 1fr' : ''} 1fr auto"><div class="field"><label>Label</label><input data-wl="components" data-idx="${i}" data-k="label" data-t="s" value="${e(c.label || '')}"></div><div class="field"><label>Material</label><select data-wl="components" data-idx="${i}" data-k="materialId" data-t="s" data-re="1">${matOpts().map(o => `<option value="${e(o[0])}" ${o[0] === c.materialId ? 'selected' : ''}>${e(o[1])}</option>`).join('')}</select></div>
        <div class="field"><label>Primary</label><input type="checkbox" data-wl="components" data-idx="${i}" data-k="primary" data-t="b" data-re="1" ${c.primary ? 'checked' : ''}></div>${unitMat ? `<div class="field"><label>Amount</label><input type="number" step="any" min="0" data-wl="components" data-idx="${i}" data-k="qtyPer" data-t="n" value="${e(c.qtyPer ?? 1)}"></div><div class="field"><label>per</label><select data-wl="components" data-idx="${i}" data-k="perBasis" data-t="s">${basisOpts(['item', 'print', 'printSqm', 'sqm', 'sheet', 'page']).map(o => `<option value="${o[0]}" ${o[0] === (c.perBasis || 'item') ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label>Cost group</label><select data-wl="components" data-idx="${i}" data-k="group" data-t="s">${[['material', 'Material'], ['packaging', 'Packaging'], ['other', 'Other']].map(o => `<option value="${o[0]}" ${o[0] === (c.group || 'material') ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div><button class="btn icon danger" data-act="wz-del" data-l="comp" data-i="${i}">✕</button></div>`; }
      else h += `<div class="listrow" style="grid-template-columns:1.4fr 1fr 1.2fr 1fr auto"><div class="field"><label>Cost label (e.g. Ink)</label><input data-wl="components" data-idx="${i}" data-k="label" data-t="s" value="${e(c.label || '')}"></div><div class="field"><label>Rate (R)</label><input type="number" step="any" min="0" data-wl="components" data-idx="${i}" data-k="rate" data-t="n" value="${e(c.rate ?? 0)}"></div><div class="field"><label>per</label><select data-wl="components" data-idx="${i}" data-k="basis" data-t="s">${basisOpts(['item', 'print', 'printSqm', 'sqm', 'sheet', 'page', 'metre', 'fixed']).map(o => `<option value="${o[0]}" ${o[0] === (c.basis || 'item') ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div><div class="field"><label>Cost group</label><select data-wl="components" data-idx="${i}" data-k="group" data-t="s">${[['print', 'Ink / print'], ['packaging', 'Packaging'], ['other', 'Other'], ['material', 'Material']].map(o => `<option value="${o[0]}" ${o[0] === (c.group || 'other') ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div><button class="btn icon danger" data-act="wz-del" data-l="comp" data-i="${i}">✕</button></div>`;
    });
    h += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px"><button class="btn sm" data-act="wz-add" data-l="mat">+ Material</button><button class="btn sm" data-act="wz-add" data-l="cost">+ Other cost (ink, packaging…)</button></div>`;
    h += `<div class="lbl" style="margin-bottom:6px">Printing cost (per click / per m²)</div>${p.print ? `<div class="listrow" style="grid-template-columns:1.2fr 1fr 1.4fr 1fr auto"><div class="field"><label>Label</label><input ${W('print.label', 's')} value="${e(p.print.label || '')}"></div><div class="field"><label>Rate (R)</label>${wnum('print.rate', p.print.rate)}</div><div class="field"><label>per</label>${wsel('print.basis', [['sheetSide', 'sheet side (click)'], ['sqm', 'm²'], ['printSqm', 'm² of print area'], ['print', 'print'], ['item', 'item'], ['page', 'page']], p.print.basis)}</div><div class="field"><label>B&W factor</label>${wnum('print.bwFactor', p.print.bwFactor, { ph: '1' })}</div><button class="btn icon danger" data-act="wz-del" data-l="print">✕</button></div>` : '<button class="btn sm" data-act="wz-add" data-l="print">+ Add printing cost</button>'}`;
    h += `<div class="lbl" style="margin:16px 0 6px">Other fixed / per-unit costs</div>${p.otherCosts.map((_, i) => rowFields('otherCosts', i, [{ k: 'label', l: 'Label', t: 's' }, { k: 'amount', l: 'Amount (R)', t: 'n' }, { k: 'basis', l: 'per', t: 's', sel: basisOpts(['fixed', 'item', 'print', 'sqm', 'sheet', 'page']) }])).join('')}<button class="btn sm" data-act="wz-add" data-l="otherCosts">+ Add cost</button>`;
  } else if (s === 3) {
    h = `<p class="muted">Machines used. Time cost = minutes × (hourly + maintenance + depreciation) ÷ 60, plus per-print, per-m² and setup costs from the machine record.</p>${p.machines.map((_, i) => rowFields('machines', i, [{ k: 'machineId', l: 'Machine', t: 's', sel: Object.values(State.cfg.machines).map(m => [m.id, m.name]) }, { k: 'minutesPerUnit', l: 'Minutes per…', t: 'n' }, { k: 'unitBasis', l: '…unit of', t: 's', sel: basisOpts(['item', 'print', 'sqm', 'sheet', 'page', 'metre', 'fixed']) }, { k: 'fixedMinutes', l: 'Setup minutes', t: 'n' }])).join('')}<button class="btn sm" data-act="wz-add" data-l="machines">+ Add machine</button>`;
  } else if (s === 4) {
    h = `<p class="muted">Labour time. Cost = hours × hourly rate (minimum charge and labour markup from the labour record).</p>${p.labour.map((_, i) => rowFields('labour', i, [{ k: 'labourId', l: 'Labour type', t: 's', sel: Object.values(State.cfg.labour).map(m => [m.id, m.name]) }, { k: 'minutesPerUnit', l: 'Minutes per…', t: 'n' }, { k: 'unitBasis', l: '…unit of', t: 's', sel: basisOpts(['item', 'print', 'sqm', 'sheet', 'page', 'metre', 'fixed']) }, { k: 'setupMinutes', l: 'Setup minutes', t: 'n' }])).join('')}<button class="btn sm" data-act="wz-add" data-l="labour">+ Add labour</button>`;
  } else if (s === 5) {
    h = `<p class="muted">Tick what can be added on a quote; “Default” pre-selects it.</p>${Object.values(State.cfg.finishing).sort((a, b) => a.name.localeCompare(b.name)).map(f => `<div class="fin" style="grid-template-columns:auto 1fr auto"><input type="checkbox" data-wfin="${e(f.id)}" data-k="allowed" ${p.allowedFinishing.includes(f.id) ? 'checked' : ''}><label>${e(f.name)} <span class="muted">(${e(PQ.FIN_METHODS[f.method] || '')})</span></label><label class="chk"><input type="checkbox" data-wfin="${e(f.id)}" data-k="default" ${p.defaultFinishing.includes(f.id) ? 'checked' : ''}> Default</label></div>`).join('') || '<p class="muted">No finishing options defined.</p>'}`;
  } else if (s === 6) h = `<div class="grid g2">${fld('Product wastage %', wnum('wastagePct', p.wastagePct, { nullable: 1, ph: 'use global default' }), 'Extra allowance for spoilage. Applied to the cost groups chosen in Settings → Pricing.')}</div>`;
  else if (s === 7) { const cat = State.cfg.categories[p.category], S = State.cfg.settings; h = `<div class="grid g2">${fld('Markup % for this product', wnum('markupPct', p.markupPct, { nullable: 1, ph: 'inherit' }), `Blank = inherit: category ${cat && PQ.has(cat.markupPct) ? pctf(cat.markupPct) : '(none)'} → global ${pctf(S.pricing.defaultMarkup)}`)}</div>`; }
  else if (s === 8) h = `<div class="grid g2">${fld('Minimum selling price per line (R)', wnum('minPrice', p.minPrice, { nullable: 1, ph: 'inherit category / global' }), 'A line is never priced below this (before discounts).')}${p.profile === 'paper' ? fld('Gap between items on sheet (mm)', wnum('gutterMm', p.gutterMm, { nullable: 1, ph: 'global' })) : ''}</div>`;
  else h = wzReview();
  return head + h;
}
function wzCfg() { return { ...engineCfg(), products: { ...State.cfg.products, [Wz.p.id]: Wz.p } }; }
function wzTestLine() { const p = Wz.p; return { productId: p.id, qty: Wz.testQty || p.defaultQty || 1, unit: p.unit, w: p.defaultW, h: p.defaultH, sides: p.defaultSides, pages: p.defaultPages, prints: p.defaultPrints, materialId: primaryMaterialId(p), finishing: (p.defaultFinishing || []).map(id => ({ id, qty: finDefaultQty(id) })), colour: 'colour' }; }
function wzReview() {
  return `<div class="alert info">Live test using the default size and finishing. Change the quantity to check tiers and minimums.</div><div class="grid g3" style="margin-bottom:10px">${fld('Test quantity', `<input type="number" min="1" data-w="_testQty" data-t="n" value="${e(Wz.testQty || Wz.p.defaultQty || 1)}">`)}</div><div id="wz-res">${wzResult()}</div>`;
}
function wzResult() {
  const c = PQ.calcLine(wzTestLine(), wzCfg()), q = PQ.num(wzTestLine().qty) || 1;
  let h = c.errors.map(x => `<div class="alert bad">${e(x)}</div>`).join('') + c.warnings.map(x => `<div class="alert warn">${e(x)}</div>`).join('');
  h += `<div class="tblwrap"><table class="tbl"><tbody>${GROUPS.map(([g, l]) => { const ls = c.lines.filter(x => x.group === g); return ls.length ? `<tr><td colspan="3" style="background:var(--soft);font-weight:600">${l}</td></tr>` + ls.map(x => `<tr><td>${e(x.label)}</td><td class="muted">${e(x.detail)}</td><td class="r">${money(x.amount)}</td></tr>`).join('') : ''; }).join('')}
  <tr><td colspan="2"><b>Production cost</b></td><td class="r"><b>${money(c.productionCost)}</b></td></tr><tr><td colspan="2">${c.markupMode === 'margin' ? 'Margin' : 'Markup'} ${pctf(c.markupPct)} (${e(c.markupSource)})${c.minApplied ? ' — minimum charge applied' : ''}</td><td class="r">${money(c.calculatedPrice - c.productionCost)}</td></tr>
  <tr><td colspan="2"><b>Selling price</b> (${money(c.calculatedPrice / q)} each)</td><td class="r"><b>${money(c.calculatedPrice)}</b></td></tr><tr><td colspan="2">Gross margin</td><td class="r">${pctf(c.calculatedPrice > 0 ? (c.calculatedPrice - c.productionCost) / c.calculatedPrice * 100 : 0)}</td></tr></tbody></table></div>`;
  return h;
}
function onWizardInput(t, ev, isChange) {
  if (!Wz) return; const T = t.dataset.t;
  const val = T === 'b' ? t.checked : T === 'n' ? (t.value === '' ? 0 : Number(t.value)) : T === 'nn' ? (t.value === '' ? null : Number(t.value)) : t.value;
  if (t.dataset.wfin !== undefined) { const id = t.dataset.wfin, p = Wz.p, key = t.dataset.k === 'allowed' ? 'allowedFinishing' : 'defaultFinishing'; p[key] = p[key].filter(x => x !== id); if (t.checked) p[key].push(id); if (key === 'defaultFinishing' && t.checked && !p.allowedFinishing.includes(id)) { p.allowedFinishing.push(id); wzRender(); } if (key === 'allowedFinishing' && !t.checked) { p.defaultFinishing = p.defaultFinishing.filter(x => x !== id); wzRender(); } return; }
  if (t.dataset.wl) { const row = Wz.p[t.dataset.wl][+t.dataset.idx]; row[t.dataset.k] = val; if (t.dataset.k === 'primary' && val) Wz.p.components.forEach((c, i) => { if (i !== +t.dataset.idx) c.primary = false; }); }
  else if (t.dataset.w) { const path = t.dataset.w; if (path[0] === '_') { Wz[path.slice(1)] = val; const r = $('#wz-res'); if (r) r.innerHTML = wzResult(); return; } setDeepLoose(Wz.p, path, T === 's' && ['defaultSides'].includes(path) ? Number(val) : val); }
  if (isChange && t.dataset.re) wzRender();
}
function setDeepLoose(o, path, v) { const ks = path.split('.'); let x = o; ks.slice(0, -1).forEach(k => { if (!x[k]) x[k] = {}; x = x[k]; }); x[ks[ks.length - 1]] = v; }
const CRIT_P = { method: 'Pricing method', basePrice: 'Base price', setupFee: 'Setup fee', tiers: 'Tiers', tierBasis: 'Tier basis', baseIsSell: 'Base price is selling price', components: 'Materials & costs', print: 'Printing cost', machines: 'Machines', labour: 'Labour', otherCosts: 'Other costs', wastagePct: 'Wastage %', markupPct: 'Markup %', minPrice: 'Minimum price' };
const PLABEL = { ...CRIT_P, name: 'Name', category: 'Category', profile: 'Calculator type', description: 'Description', unit: 'Unit', defaultW: 'Default width', defaultH: 'Default height', defaultQty: 'Default quantity', defaultSides: 'Default sides', defaultPages: 'Default pages', usePrintList: 'Print positions', defaultPrints: 'Default prints', allowedFinishing: 'Allowed finishing', defaultFinishing: 'Default finishing', active: 'Active', gutterMm: 'Sheet gap' };
const short = v => { if (v === null || v === undefined || v === '') return '(inherit / none)'; if (Array.isArray(v)) return v.length + ' entr' + (v.length === 1 ? 'y' : 'ies') + ': ' + JSON.stringify(v).slice(0, 110); if (typeof v === 'object') return JSON.stringify(v).slice(0, 110); return String(v); };
function validateProduct(p) {
  const errs = [], S = State.cfg.settings, C = State.cfg;
  if (!p.name.trim()) errs.push('Product name is required');
  if (Object.values(C.products).some(x => x.id !== p.id && x.name.trim().toLowerCase() === p.name.trim().toLowerCase())) errs.push('Another product already has this name');
  if (!C.categories[p.category]) errs.push('Choose a category');
  ['defaultW', 'defaultH', 'basePrice', 'setupFee'].forEach(k => { if (PQ.num(p[k]) < 0) errs.push(PLABEL[k] + ' cannot be negative'); });
  if (!(PQ.num(p.defaultQty) >= 1)) errs.push('Default quantity must be at least 1');
  if (p.method === 'tiered' && !p.tiers.length) errs.push('Add at least one quantity tier for a tiered product');
  const froms = p.tiers.map(t => PQ.num(t.from)); if (p.tiers.some(t => PQ.num(t.from) < 1 || PQ.num(t.price) < 0)) errs.push('Tiers need a start of 1 or more and a price of 0 or more'); if (new Set(froms).size !== froms.length) errs.push('Two tiers start at the same quantity');
  p.components.forEach((c, i) => { if (c.materialId !== undefined) { if (!C.materials[c.materialId]) errs.push(`Material row ${i + 1}: choose a material`); } else if (PQ.num(c.rate) < 0) errs.push(`Cost row ${i + 1}: rate cannot be negative`); });
  p.machines.forEach((m, i) => { if (!C.machines[m.machineId]) errs.push(`Machine row ${i + 1}: choose a machine`); if (PQ.num(m.minutesPerUnit) < 0 || PQ.num(m.fixedMinutes) < 0) errs.push(`Machine row ${i + 1}: minutes cannot be negative`); });
  p.labour.forEach((m, i) => { if (!C.labour[m.labourId]) errs.push(`Labour row ${i + 1}: choose a labour type`); if (PQ.num(m.minutesPerUnit) < 0 || PQ.num(m.setupMinutes) < 0) errs.push(`Labour row ${i + 1}: minutes cannot be negative`); });
  if (p.print && PQ.num(p.print.rate) < 0) errs.push('Printing rate cannot be negative');
  if (p.otherCosts.some(o => PQ.num(o.amount) < 0)) errs.push('Other costs cannot be negative');
  if (PQ.has(p.wastagePct) && (p.wastagePct < 0 || p.wastagePct > 100)) errs.push('Wastage must be between 0% and 100%');
  if (PQ.has(p.markupPct) && (p.markupPct < 0 || p.markupPct > PQ.num(S.pricing.maxMarkup, 1000))) errs.push('Markup is outside the allowed range');
  if (PQ.has(p.minPrice) && p.minPrice < 0) errs.push('Minimum price cannot be negative');
  if (p.usePrintList && (!p.defaultPrints.length || p.defaultPrints.some(x => !(PQ.num(x.w) > 0 && PQ.num(x.h) > 0)))) errs.push('Add at least one default print position with a size');
  return errs;
}
async function wzSave() {
  const p = clone(Wz.p), old = Wz.orig; ['wastagePct', 'markupPct', 'minPrice', 'gutterMm'].forEach(k => { if (!PQ.has(p[k])) p[k] = null; });
  p.components.forEach(c => { if (c.materialId === undefined) delete c.materialId; });
  const errs = validateProduct(p);
  if (errs.length) { openModal({ stack: true, title: 'Please fix before saving', body: `<ul>${errs.map(x => `<li>${e(x)}</li>`).join('')}</ul>`, footer: '<button class="btn primary" data-act="modal-close">OK</button>' }); return; }
  delete p.demo; if (old && old.demo) p.demo = false;
  const diffs = old ? PQ.diffObjects(old, p, ['demo', 'id']) : [];
  if (old && !diffs.length) { closeModal(); toast('No changes'); return; }
  const crit = diffs.filter(d => CRIT_P[d.key]);
  if (crit.length && !await confirmDialog({ title: 'Confirm pricing change', body: `<p><b>${e(p.name)}</b></p>${diffHTML(crit.map(d => ({ l: CRIT_P[d.key], o: short(d.old), n: short(d.new) })))}${affectedHTML([p])}`, okLabel: 'Save product' })) return;
  if (!await safe(() => DB.set('products', p.id, p))) return;
  if (old) for (const d of diffs) await DB.audit(`Changed product "${p.name}" — ${PLABEL[d.key] || d.key}`, 'products', short(d.old), short(d.new)); else await DB.audit(`Added product "${p.name}"`, 'products');
  Wz = null; closeModal(true); toast('Product saved'); render(true);
}

/* ---------- users & roles ---------- */
function usersTab() {
  const S = State.cfg.settings, team = Object.values(State.cfg.team);
  const perms = PQ.PERMS;
  return `<div class="alert info"><b>How access works.</b> Sign-in and sharing are handled by claude.ai. <b>Staff</b> should be shared as <i>Contributors</i> (they can create quotes). <b>Managers who need to edit prices, products or settings must be shared as Editors</b> — the database only accepts pricing changes from Editors. The roles below control what each person <i>sees and can do inside the app</i>. Anyone not listed gets the default role. The person who owns the artifact is always the Owner.</div>
  <div class="card"><h2>Default role for people not listed</h2><div style="max-width:260px"><select data-cfg="defaultRole">${['staff', 'manager'].map(r => `<option value="${r}" ${S.defaultRole === r ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></div></div>
  <div class="card"><h2>Team</h2>${team.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th></th></tr></thead><tbody>${team.map(t => `<tr><td>${e(nameOf(t.id))}</td><td><select data-cfg="teamrole" data-id="${e(t.id)}">${['staff', 'manager'].map(r => `<option value="${r}" ${t.role === r ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></td><td class="r"><button class="btn sm danger" data-act="team-del" data-id="${e(t.id)}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nobody assigned yet.</p>'}
   <div class="field" style="margin-top:12px"><label>Add a colleague (search by name)</label><input id="usearch" placeholder="Start typing a name…" autocomplete="off"></div><div id="uresults"></div></div>
  <div class="card"><h2>Permissions</h2><div class="tblwrap"><table class="tbl"><thead><tr><th>Permission</th><th>Owner</th><th>Manager</th><th>Staff</th></tr></thead><tbody>${perms.map(([k, l]) => `<tr><td>${e(l)}</td><td><input type="checkbox" checked disabled></td>${['manager', 'staff'].map(r => `<td>${k === 'manageUsers' ? '<input type="checkbox" disabled>' : `<input type="checkbox" data-perm="${k}" data-role="${r}" ${(S.permissions[r] || {})[k] ? 'checked' : ''}>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
   <div style="margin-top:12px"><button class="btn primary" data-act="perm-save">Save permissions</button></div></div>
  <div class="card"><h2>Preview the app as another role</h2><p class="muted">See exactly what a manager or staff member sees (costs hidden, settings locked…). This only changes your view.</p><div style="display:flex;gap:8px"><button class="btn" data-act="preview" data-r="manager">Preview as Manager</button><button class="btn" data-act="preview" data-r="staff">Preview as Staff</button></div></div>`;
}
const _osc = onSettingsChange;
onSettingsChange = async function (t) {
  if (t.dataset.cfg === 'defaultRole') { const S = clone(State.cfg.settings), o = S.defaultRole; S.defaultRole = t.value; if (await safe(() => DB.setSettings(S), 'Saved')) await DB.audit('Changed default role', 'Users', o, t.value); return; }
  if (t.dataset.cfg === 'teamrole') { const id = t.dataset.id, o = State.cfg.team[id].role; if (await safe(() => DB.set('team', id, { id, role: t.value }), 'Role updated')) await DB.audit(`Changed role of ${nameOf(id)}`, 'Users', o, t.value); return; }
  return _osc(t);
};
Object.assign(ACT, {
  preview: el => { State.previewRole = el.dataset.r; go('dashboard', {}, true); },
  'team-del': async el => { const id = el.dataset.id; if (!await confirmDialog({ title: 'Remove from team list?', body: `<p>${e(nameOf(id))} will get the default role.</p>`, okLabel: 'Remove', danger: true })) return; if (await safe(() => DB.del('team', id), 'Removed')) { await DB.audit('Removed team member', 'Users', nameOf(id)); render(true); } },
  'team-add': async el => { const id = el.dataset.id, nm = el.dataset.name; if (State.cfg.team[id]) { toast('Already on the list'); return; } if (await safe(() => DB.set('team', id, { id, role: 'staff' }), 'Added as Staff')) { State.names[id] = nm; await DB.audit('Added team member', 'Users', '', nm + ' (staff)'); render(true); } },
  'perm-save': async () => {
    const S0 = State.cfg.settings, S1 = clone(S0), diffs = [];
    $$('[data-perm]').forEach(c => { const r = c.dataset.role, k = c.dataset.perm; if (!!S0.permissions[r][k] !== c.checked) { S1.permissions[r][k] = c.checked; diffs.push({ l: `${r[0].toUpperCase() + r.slice(1)} — ${(PQ.PERMS.find(x => x[0] === k) || [0, k])[1]}`, o: S0.permissions[r][k] ? 'Allowed' : 'Not allowed', n: c.checked ? 'Allowed' : 'Not allowed' }); } });
    if (!diffs.length) { toast('No changes'); return; }
    if (!await confirmDialog({ title: 'Confirm permission changes', body: diffHTML(diffs), okLabel: 'Save permissions' })) return;
    if (await safe(() => DB.setSettings(S1), 'Permissions saved')) { for (const d of diffs) await DB.audit('Changed permission: ' + d.l, 'Users', d.o, d.n); render(true); }
  }
});
let usTimer;
document.addEventListener('input', ev => {
  if (ev.target.id !== 'usearch') return; clearTimeout(usTimer);
  usTimer = setTimeout(async () => { const q = ev.target.value.trim(), box = $('#uresults'); if (!State.userCap || !box) { if (box) box.innerHTML = '<p class="muted">Directory search is not available here.</p>'; return; } const hits = q ? await State.userCap.search(q) : []; box.innerHTML = hits.length ? hits.map(h => `<div class="rowline"><span>${e(h.name)}</span><button class="btn sm" data-act="team-add" data-id="${e(h.id)}" data-name="${e(h.name)}">Add</button></div>`).join('') : (q ? '<p class="muted">No matches (or the directory is not available to you).</p>' : ''); }, 250);
});

/* ---------- audit ---------- */
function auditTab() {
  const f = State.auditFilter.toLowerCase(), list = State.audit.filter(a => !f || [a.action, a.entity, a.old, a.new, a.role, nameOf(a.uid)].join(' ').toLowerCase().includes(f)).slice(0, 300);
  return `<div class="card"><div class="field" style="max-width:340px;margin-bottom:10px"><label>Filter</label><input type="search" id="aufilter" value="${e(State.auditFilter)}" placeholder="user, action, item…"></div><div id="aulist">${auditRows(list)}</div><p class="muted" style="font-size:12px">Showing the latest ${list.length} entries (up to 300 are loaded).</p></div>`;
}
function auditRows(list) {
  return list.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>From</th><th>To</th></tr></thead><tbody>${list.map(a => `<tr><td class="muted" style="white-space:nowrap">${fmtTime(a.ts)}</td><td>${e(nameOf(a.uid))} <span class="badge">${e(a.role)}</span></td><td>${e(a.action)}${a.entity ? `<div class="muted">${e(a.entity)}</div>` : ''}</td><td class="old" style="text-decoration:none;color:var(--muted)">${e(a.old)}</td><td>${e(a.new)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No entries.</p>';
}
document.addEventListener('input', ev => { if (ev.target.id === 'aufilter') { State.auditFilter = ev.target.value; const f = State.auditFilter.toLowerCase(); $('#aulist').innerHTML = auditRows(State.audit.filter(a => !f || [a.action, a.entity, a.old, a.new, a.role, nameOf(a.uid)].join(' ').toLowerCase().includes(f)).slice(0, 300)); } });

/* ---------- import / export ---------- */
const CSV = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => CSV(r[c])).join(','))].join('\r\n');
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c; }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); } return rows.filter(r => r.some(x => x.trim() !== ''));
}
async function saveFile(name, data) { const dl = await useCap('downloads'); if (!dl) { toast('Downloads are not available in this view', 'bad'); return; } try { await dl.save({ filename: name, data }); toast('Export ready'); } catch (er) { if (er.code !== 'declined') toast('Could not save: ' + (er.message || er.code), 'bad'); } }
function dataTab() {
  return `<div class="card"><h2>Export</h2><p class="muted">Take a backup, or move pricing to another system. Exports contain your cost prices — keep them private.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="exp-json">All settings & catalogues (JSON)</button><button class="btn" data-act="exp-products">Products (CSV)</button><button class="btn" data-act="exp-materials">Materials (CSV)</button><button class="btn" data-act="exp-quotes">Quotes (CSV)</button></div></div>
  <div class="card"><h2>Import</h2><p class="muted">Import a JSON backup (settings + catalogues) or a materials CSV. You'll see a preview and any errors before anything changes; existing records with the same id are updated.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="file" id="imp-file" accept=".json,.csv,application/json,text/csv"></div><div class="field" style="margin-top:10px"><label>…or paste JSON / CSV</label><textarea id="imp-text" placeholder="Paste here"></textarea></div><button class="btn" data-act="imp-preview">Preview import</button></div>`;
}
const EXPORT_KINDS = ['categories', 'materials', 'machines', 'labour', 'finishing', 'products'];
Object.assign(ACT, {
  'exp-json': async () => { const o = { app: 'printquote', version: 1, exportedAt: new Date().toISOString(), settings: State.cfg.settings }; EXPORT_KINDS.forEach(k => o[k] = Object.values(State.cfg[k])); await saveFile('printquote-config-' + todayISO() + '.json', JSON.stringify(o, null, 2)); await DB.audit('Exported configuration', 'Import/Export'); },
  'exp-products': async () => { const r = Object.values(State.cfg.products).map(p => ({ id: p.id, name: p.name, category: (State.cfg.categories[p.category] || {}).name, profile: p.profile, method: p.method, basePrice: p.basePrice, markupPct: p.markupPct ?? '', minPrice: p.minPrice ?? '', wastagePct: p.wastagePct ?? '', active: p.active !== false })); await saveFile('products-' + todayISO() + '.csv', toCSV(r, ['id', 'name', 'category', 'profile', 'method', 'basePrice', 'markupPct', 'minPrice', 'wastagePct', 'active'])); await DB.audit('Exported products CSV', 'Import/Export'); },
  'exp-materials': async () => { await saveFile('materials-' + todayISO() + '.csv', toCSV(Object.values(State.cfg.materials), ['id', 'name', 'type', 'costBasis', 'cost', 'sheetW', 'sheetH', 'rollWidth', 'wastagePct', 'supplier', 'stock'])); await DB.audit('Exported materials CSV', 'Import/Export'); },
  'exp-quotes': async () => { const cp = can('viewProfit'); const r = visibleQuotes().map(q => ({ number: q.number, date: q.date, customer: q.customer.name, company: q.customer.company, status: effStatus(q), subtotal: (q.totals || {}).subtotal, vat: (q.totals || {}).vat, total: (q.totals || {}).total, prepared_by: q.staffName, ...(cp ? { gross_profit: (q.totals || {}).grossProfit } : {}) })); await saveFile('quotes-' + todayISO() + '.csv', toCSV(r, ['number', 'date', 'customer', 'company', 'status', 'subtotal', 'vat', 'total', 'prepared_by', ...(cp ? ['gross_profit'] : [])])); },
  'imp-preview': () => importPreview($('#imp-text').value),
  'imp-apply': () => importApply()
});
document.addEventListener('change', ev => { if (ev.target.id === 'imp-file' && ev.target.files[0]) { const r = new FileReader(); r.onload = () => { $('#imp-text').value = r.result; importPreview(r.result); }; r.readAsText(ev.target.files[0]); } });
let Imp = null;
function importPreview(text) {
  text = (text || '').trim(); if (!text) { toast('Nothing to import', 'bad'); return; }
  const errs = [], plan = {}; let settings = null;
  if (text[0] === '{') {
    let d; try { d = JSON.parse(text); } catch (er) { errs.push('Not valid JSON: ' + er.message); }
    if (d) {
      if (d.app !== 'printquote') errs.push('This file was not exported from this app');
      settings = d.settings || null;
      EXPORT_KINDS.forEach(k => { if (!d[k]) return; if (!Array.isArray(d[k])) { errs.push(k + ' must be a list'); return; } plan[k] = d[k]; });
      const ids = k => new Set([...(plan[k] || []).map(x => x.id), ...Object.keys(State.cfg[k])]);
      Object.entries(plan).forEach(([k, arr]) => arr.forEach((x, i) => {
        const tag = `${KIND_LABEL[k]} #${i + 1}${x && x.name ? ' "' + x.name + '"' : ''}`;
        if (!x || typeof x.id !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(x.id)) { errs.push(tag + ': invalid id'); return; } if (typeof x.name !== 'string' || !x.name.trim()) errs.push(tag + ': name missing');
        ['cost', 'hourly', 'costPerHour', 'price', 'basePrice', 'wastagePct', 'markupPct', 'minPrice', 'minCharge', 'setupFee'].forEach(f => { if (x[f] !== undefined && x[f] !== null && !(typeof x[f] === 'number' && x[f] >= 0)) errs.push(`${tag}: ${f} must be a number of 0 or more`); });
        if (k === 'products') { if (!ids('categories').has(x.category)) errs.push(tag + ': unknown category'); (x.components || []).forEach(c => { if (c.materialId && !ids('materials').has(c.materialId)) errs.push(tag + ': unknown material ' + c.materialId); }); (x.machines || []).forEach(c => { if (!ids('machines').has(c.machineId)) errs.push(tag + ': unknown machine'); }); (x.labour || []).forEach(c => { if (!ids('labour').has(c.labourId)) errs.push(tag + ': unknown labour type'); }); if (!PQ.METHODS[x.method]) errs.push(tag + ': unknown pricing method'); }
        if (k === 'materials' && !['sheet', 'sqm', 'metre', 'kg', 'unit'].includes(x.costBasis)) errs.push(tag + ': invalid costBasis');
      }));
      if (settings && (!settings.vat || !settings.pricing || !settings.quotes || !settings.permissions)) errs.push('Settings block is incomplete');
    }
  } else {
    const rows = parseCSV(text), head = (rows[0] || []).map(x => x.trim()); const need = ['name', 'costBasis', 'cost'];
    if (!need.every(n => head.includes(n))) errs.push('CSV must be a materials file with columns: ' + need.join(', ') + ' (optional: id, type, sheetW, sheetH, rollWidth, wastagePct, supplier, stock)');
    else { plan.materials = []; rows.slice(1).forEach((r, i) => { const o = {}; head.forEach((h, j) => o[h] = (r[j] || '').trim()); const tag = `Row ${i + 2}`;
      const n = k => o[k] === undefined || o[k] === '' ? null : Number(o[k]); const cost = Number(o.cost);
      if (!o.name) errs.push(tag + ': name missing'); if (!isFinite(cost) || cost < 0) errs.push(tag + ': cost must be a number of 0 or more'); if (!['sheet', 'sqm', 'metre', 'kg', 'unit'].includes(o.costBasis)) errs.push(tag + ': costBasis must be sheet, sqm, metre, kg or unit'); if (o.costBasis === 'metre' && !(n('rollWidth') > 0)) errs.push(tag + ': rollWidth required for metre materials');
      const ex = Object.values(State.cfg.materials).find(m => m.name.toLowerCase() === o.name.toLowerCase());
      plan.materials.push({ id: o.id || (ex ? ex.id : uid('mat')), name: o.name, type: o.type || 'other', costBasis: o.costBasis, cost, sheetW: n('sheetW'), sheetH: n('sheetH'), rollWidth: n('rollWidth'), wastagePct: n('wastagePct') || 0, supplier: o.supplier || '', stock: n('stock'), tags: ex ? ex.tags || [] : [], active: true }); }); }
  }
  Imp = { plan, settings, errs };
  const counts = Object.entries(plan).map(([k, arr]) => { const nw = arr.filter(x => !State.cfg[k][x.id]).length; return `<div class="rowline"><span>${KIND_LABEL[k]}s</span><span>${nw} new · ${arr.length - nw} updated</span></div>`; }).join('') + (settings ? '<div class="rowline"><span>Settings</span><span>replace</span></div>' : '');
  openModal({ title: 'Import preview', wide: true, body: `${errs.length ? `<div class="alert bad"><b>${errs.length} problem${errs.length > 1 ? 's' : ''} found — nothing can be imported until fixed.</b><ul>${errs.slice(0, 25).map(x => `<li>${e(x)}</li>`).join('')}</ul>${errs.length > 25 ? '…' : ''}</div>` : '<div class="alert ok">No problems found.</div>'}${counts || '<p class="muted">No records.</p>'}<p class="muted">Existing records with the same id are overwritten. Saved quotes are not affected.</p>`, footer: `<button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" data-act="imp-apply" ${errs.length || !counts ? 'disabled' : ''}>Import</button>` });
}
async function importApply() {
  if (!Imp || Imp.errs.length) return;
  if (!await confirmDialog({ title: 'Apply import?', body: '<p>This overwrites matching records and cannot be undone (export a backup first if unsure).</p>', okLabel: 'Import now' })) return;
  let n = 0; const { plan, settings } = Imp;
  try { for (const k of EXPORT_KINDS) for (const x of plan[k] || []) { await DB.set(k, x.id, { ...x, demo: false }); n++; } if (settings) await DB.setSettings({ ...settings, demo: false }); } catch (er) { toast(explainError(er), 'bad'); return; }
  await DB.audit('Imported configuration', 'Import/Export', '', n + ' records' + (settings ? ' + settings' : '')); Imp = null; closeModal(true); toast('Import complete'); render(true);
}

/* ---------- boot ---------- */
async function boot() {
  State.mode = 'loading'; render();
  const [user, db] = await Promise.all([useCap('user'), useCap('db')]);
  if (user) { try { const m = await user.me(); State.userCap = user; State.me = { id: m.id, name: m.name || '', isOwner: !!m.isOwner, canEdit: !!m.canEdit, canData: await user.can('data.write') }; } catch (er) { /* ignore */ } }
  if (!db) { State.mode = 'memory'; State.loaded.settings = true; State.me.isOwner = true; await seedDemo(); render(true); return; }
  DB.db = db; State.mode = 'db';
  const fail = er => { console.error(er); State.err = 'Database error: ' + ((er && er.message) || er); renderSoon(); };
  db.doc('cfg/settings').onSnapshot(s => { State.cfg.settings = s.exists ? s.data() : null; State.loaded.settings = true; renderSoon(); }, fail);
  KINDS.forEach(k => db.doc('cfg/' + k).collection('items').onSnapshot(qs => { State.cfg[k] = Object.fromEntries(qs.docs.map(d => [d.id, { ...d.data(), id: d.id }])); renderSoon(); }, fail));
  db.collection('quotes').orderBy('createdAt', 'desc').limit(1000).onSnapshot(qs => { State.quotes = Object.fromEntries(qs.docs.map(d => [d.id, d.data()])); renderSoon(); }, fail);
  db.collection('audit').orderBy('ts', 'desc').limit(300).onSnapshot(qs => { State.audit = qs.docs.map(d => ({ ...d.data(), id: d.id })); renderSoon(); }, fail);
  db.collection('jobs').limit(300).onSnapshot(qs => { State.jobs = Object.fromEntries(qs.docs.map(d => [d.id, d.data()])); }, fail);
  db.collection('customers').limit(1000).onSnapshot(qs => { State.customers = Object.fromEntries(qs.docs.map(d => [d.id, d.data()])); }, fail);
}
/* boot() removed: the host page initialises this embed */
