/* ===== settings: forms, catalogues, audit-aware saves ===== */
const useCap = async n => { try { return window.claude && window.claude.use ? await window.claude.use(n) : null; } catch (er) { return null; } };
const getDeep = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const PROFILES = [['dtf', 'DTF'], ['paper', 'Paper'], ['large', 'Large format'], ['general', 'General']];
const BASIS_OPTS = Object.entries(PQ.BASES);
const KIND_LABEL = { materials: 'Material', machines: 'Machine', labour: 'Labour type', finishing: 'Finishing option', categories: 'Category', products: 'Product' };

/* schema field: k|p key, l label, t type (text|area|n|money|pct|int|select|check|tags), opts, crit, opt(ional), min, max, help */
const SCHEMA = {
  materials: [
    { k: 'name', l: 'Material name', t: 'text', req: 1 }, { k: 'supplier', l: 'Supplier', t: 'text' },
    { k: 'type', l: 'Type', t: 'select', opts: [['paper', 'Paper'], ['card', 'Card'], ['sticker', 'Sticker'], ['vinyl', 'Vinyl'], ['banner', 'Banner'], ['board', 'Board'], ['dtf', 'DTF consumable'], ['garment', 'Garment'], ['other', 'Other']] },
    { k: 'costBasis', l: 'Cost is per', t: 'select', crit: 1, opts: [['sheet', 'Sheet'], ['sqm', 'Square metre'], ['metre', 'Running metre (roll)'], ['kg', 'Kilogram'], ['unit', 'Unit / each']] },
    { k: 'cost', l: 'Cost (R)', t: 'money', crit: 1 },
    { k: 'sheetW', l: 'Sheet width (mm)', t: 'n', opt: 1, min: 0, help: 'Only for per-sheet materials — used for imposition' }, { k: 'sheetH', l: 'Sheet height (mm)', t: 'n', opt: 1, min: 0 },
    { k: 'rollWidth', l: 'Roll width (mm)', t: 'n', opt: 1, min: 0, crit: 1, help: 'Required for per-metre materials' },
    { k: 'wastagePct', l: 'Material wastage %', t: 'pct', crit: 1 }, { k: 'stock', l: 'Available stock (same unit)', t: 'n', opt: 1, min: 0 }, { k: 'minStock', l: 'Low-stock level', t: 'n', opt: 1, min: 0 },
    { k: 'tags', l: 'Used by calculators', t: 'tags' }, { k: 'notes', l: 'Notes', t: 'area' }, { k: 'active', l: 'Status', t: 'check', cl: 'Active (available for quoting)' }],
  machines: [
    { k: 'name', l: 'Machine name', t: 'text', req: 1 }, { k: 'costPerHour', l: 'Running cost per hour (R)', t: 'money', crit: 1 }, { k: 'maintenancePerHour', l: 'Maintenance per hour (R)', t: 'money', crit: 1 }, { k: 'depreciationPerHour', l: 'Depreciation per hour (R)', t: 'money', crit: 1 },
    { k: 'costPerPrint', l: 'Cost per print / click (R)', t: 'money', crit: 1 }, { k: 'costPerSqm', l: 'Cost per m² (R)', t: 'money', crit: 1 }, { k: 'setupCost', l: 'Setup cost per job (R)', t: 'money', crit: 1 },
    { k: 'tags', l: 'Used by calculators', t: 'tags' }, { k: 'notes', l: 'Notes', t: 'area' }, { k: 'active', l: 'Status', t: 'check', cl: 'Active' }],
  labour: [
    { k: 'name', l: 'Labour type', t: 'text', req: 1 }, { k: 'hourly', l: 'Hourly rate (R)', t: 'money', crit: 1 }, { k: 'minCharge', l: 'Minimum charge (R)', t: 'money', crit: 1, help: 'Applied when labour time is used' },
    { k: 'markupPct', l: 'Labour markup %', t: 'pct', crit: 1 }, { k: 'defaultMinutes', l: 'Typical minutes (reference)', t: 'n', opt: 1, min: 0 }, { k: 'tags', l: 'Used by calculators', t: 'tags' }, { k: 'active', l: 'Status', t: 'check', cl: 'Active' }],
  finishing: [
    { k: 'name', l: 'Finishing name', t: 'text', req: 1 }, { k: 'method', l: 'Pricing method', t: 'select', crit: 1, opts: Object.entries(PQ.FIN_METHODS) },
    { k: 'price', l: 'Price (R, or % for percentage)', t: 'money', crit: 1, help: 'Per item / per metre / per m² / per page / fixed / % — depends on the method' },
    { k: 'minCharge', l: 'Minimum charge (R)', t: 'money', crit: 1 }, { k: 'setup', l: 'Setup fee (R)', t: 'money', crit: 1 },
    { k: 'metreBasis', l: 'Per-metre uses', t: 'select', opts: [['perimeter', 'Perimeter'], ['width', 'Width'], ['height', 'Height']] },
    { k: 'labourId', l: 'Labour type (labour-based)', t: 'select', opts: () => [['', '—'], ...Object.values(State.cfg.labour).map(l => [l.id, l.name])] }, { k: 'minutes', l: 'Minutes per item (labour-based)', t: 'n', min: 0, crit: 1 },
    { k: 'askQty', l: 'Ask quantity on quote', t: 'check', cl: 'Ask for a count on each quote (e.g. eyelets per piece)' }, { k: 'qtyLabel', l: 'Quantity label', t: 'text' }, { k: 'defaultQty', l: 'Default count', t: 'n', min: 0 },
    { k: 'tags', l: 'Used by calculators', t: 'tags' }, { k: 'active', l: 'Status', t: 'check', cl: 'Active' }],
  categories: [
    { k: 'name', l: 'Category name', t: 'text', req: 1 }, { k: 'markupPct', l: 'Category markup % (blank = global default)', t: 'pct', opt: 1, crit: 1 }, { k: 'minPrice', l: 'Category minimum line price (R)', t: 'money', opt: 1, crit: 1 }]
};
const SETTINGS_SCHEMA = {
  business: [{ p: 'business.name', l: 'Business name', t: 'text', req: 1 }, { p: 'business.address', l: 'Address', t: 'area' }, { p: 'business.phone', l: 'Phone', t: 'text' }, { p: 'business.email', l: 'Email', t: 'text' }, { p: 'business.website', l: 'Website', t: 'text' }, { p: 'business.regNo', l: 'Company reg. no.', t: 'text' }, { p: 'business.vatNo', l: 'VAT number', t: 'text' }],
  pricing: [
    { p: 'pricing.defaultMarkup', l: 'Default markup %', t: 'pct', crit: 1, max: 1000, help: 'Used when neither product, category nor quote sets one' }, { p: 'pricing.maxMarkup', l: 'Highest markup allowed on a quote %', t: 'pct', crit: 1, max: 10000 },
    { p: 'calc.markupMode', l: 'Markup method', t: 'select', crit: 1, opts: [['markup', 'Markup on cost (cost × (1 + %))'], ['margin', 'Target margin (cost ÷ (1 − %))']] },
    { p: 'pricing.minCharge', l: 'Global minimum line price (R)', t: 'money', crit: 1 }, { p: 'pricing.minOrder', l: 'Minimum order value (R, excl. VAT)', t: 'money', crit: 1, help: 'Quotes below this are topped up' },
    { p: 'pricing.rounding.step', l: 'Round selling prices to', t: 'select', crit: 1, opts: [[0, 'Nearest cent (no rounding)'], [1, 'R1'], [2, 'R2'], [5, 'R5'], [10, 'R10'], [50, 'R50'], [100, 'R100']], num: 1 },
    { p: 'pricing.rounding.mode', l: 'Rounding direction', t: 'select', crit: 1, opts: [['nearest', 'Nearest'], ['up', 'Always up'], ['down', 'Always down']] },
    { p: 'pricing.defaultWastagePct', l: 'Default wastage % (when a product has none)', t: 'pct', crit: 1 },
    { p: 'calc.wastageAppliesTo', l: 'Wastage applies to', t: 'select', crit: 1, opts: [['materials', 'Materials only'], ['materials_print', 'Materials + print'], ['direct', 'All direct costs']] }, { p: 'calc.gutterMm', l: 'Gap between items on a sheet (mm)', t: 'n', min: 0, max: 50 },
    { p: 'calc.includeMachine', l: 'Include in cost', t: 'check', crit: 1, cl: 'Machine costs' }, { p: 'calc.includeLabour', l: '', t: 'check', crit: 1, cl: 'Labour' }, { p: 'calc.includeFinishing', l: '', t: 'check', crit: 1, cl: 'Finishing' },
    { p: 'calc.includePackaging', l: '', t: 'check', crit: 1, cl: 'Packaging' }, { p: 'calc.includeWastage', l: '', t: 'check', crit: 1, cl: 'Wastage' }, { p: 'calc.includeOther', l: '', t: 'check', crit: 1, cl: 'Other costs' }],
  vat: [{ p: 'vat.enabled', l: 'VAT', t: 'check', crit: 1, cl: 'Charge VAT on quotes' }, { p: 'vat.rate', l: 'VAT rate %', t: 'pct', crit: 1, max: 100 },
    { p: 'vat.mode', l: 'Entered prices are', t: 'select', crit: 1, opts: [['exclusive', 'Exclusive of VAT (VAT added on top)'], ['inclusive', 'Inclusive of VAT (VAT extracted)']] },
    { p: 'discount.discountReducesVat', l: 'Discounts', t: 'check', crit: 1, cl: 'Discounts reduce the VAT-able amount' }],
  discounts: [{ p: 'discount.allowStaff', l: 'Staff discounts', t: 'check', crit: 1, cl: 'Staff may apply discounts' }, { p: 'discount.staffMaxPct', l: 'Staff limit % (without approval)', t: 'pct', crit: 1 }, { p: 'discount.managerMaxPct', l: 'Manager limit %', t: 'pct', crit: 1 },
    { p: 'discount.requireApproval', l: 'Approval', t: 'check', crit: 1, cl: 'Discounts above a person\'s limit need manager/owner approval (otherwise they are blocked)' }],
  quotes: [{ p: 'quotes.prefix', l: 'Number prefix', t: 'text', crit: 1 }, { p: 'quotes.yearFormat', l: 'Year in number', t: 'select', crit: 1, opts: [['YYYY', '2026'], ['YY', '26'], ['none', 'None']] }, { p: 'quotes.separator', l: 'Separator', t: 'text', crit: 1 },
    { p: 'quotes.length', l: 'Number of digits', t: 'int', min: 1, max: 10, crit: 1 }, { p: 'quotes.startNumber', l: 'Start numbering at', t: 'int', min: 1, crit: 1 }, { p: 'quotes.resetYearly', l: 'Yearly reset', t: 'check', crit: 1, cl: 'Restart numbering each year' },
    { p: 'quotes.expiryDays', l: 'Quotes expire after (days)', t: 'int', min: 1, max: 365 }, { p: 'quotes.paymentTerms', l: 'Default payment terms', t: 'area' }, { p: 'quotes.terms', l: 'Default terms & conditions', t: 'area' }, { p: 'quotes.defaultNotes', l: 'Default customer notes', t: 'area' }]
};
const keyOf = d => d.k || d.p;
function inputFor(d, v) {
  const a = `data-cfg="${e(keyOf(d))}"`;
  switch (d.t) {
    case 'text': return `<input ${a} value="${e(v ?? '')}">`;
    case 'area': return `<textarea ${a}>${e(v ?? '')}</textarea>`;
    case 'select': { const o = typeof d.opts === 'function' ? d.opts() : d.opts; return `<select ${a}>${o.map(x => `<option value="${e(x[0])}" ${String(x[0]) === String(v) ? 'selected' : ''}>${e(x[1])}</option>`).join('')}</select>`; }
    case 'check': return `<label class="chk"><input type="checkbox" ${a} ${v ? 'checked' : ''}> ${e(d.cl || '')}</label>`;
    case 'tags': return `<div class="pillrow" ${a}>${PROFILES.map(p => `<label class="chk"><input type="checkbox" data-tagv="${p[0]}" ${(v || []).includes(p[0]) ? 'checked' : ''}> ${p[1]}</label>`).join('')}</div>`;
    default: { const mn = d.min !== undefined ? d.min : 0, mx = d.t === 'pct' ? (d.max !== undefined ? d.max : 100) : d.max; return `<input type="number" inputmode="decimal" step="${d.t === 'int' ? 1 : 'any'}" min="${mn}" ${mx !== undefined ? `max="${mx}"` : ''} ${a} value="${v === null || v === undefined ? '' : e(v)}">`; }
  }
}
const fieldHTML = (d, v) => d.t === 'check' && !d.l ? `<div class="field">${inputFor(d, v)}</div>` : `<div class="field"><label>${e(d.l)}${d.req ? ' *' : ''}</label>${inputFor(d, v)}${d.help ? `<div class="help">${e(d.help)}</div>` : ''}</div>`;
function readDef(d, root) {
  const el = $(`[data-cfg="${keyOf(d)}"]`, root); if (!el) return { skip: 1 };
  if (d.t === 'check') return { v: el.checked };
  if (d.t === 'tags') return { v: $$('[data-tagv]', el).filter(x => x.checked).map(x => x.dataset.tagv) };
  if (['n', 'money', 'pct', 'int'].includes(d.t)) {
    const s = el.value.trim();
    if (s === '') return d.opt ? { v: null } : { err: d.l + ' is required' };
    const n = Number(s); if (!isFinite(n)) return { err: d.l + ' must be a number' };
    const mn = d.min !== undefined ? d.min : 0, mx = d.t === 'pct' ? (d.max !== undefined ? d.max : 100) : d.max;
    if (n < mn) return { err: `${d.l} cannot be below ${mn}` }; if (mx !== undefined && n > mx) return { err: `${d.l} cannot exceed ${mx}` };
    if (d.t === 'int' && !Number.isInteger(n)) return { err: d.l + ' must be a whole number' };
    return { v: n };
  }
  const s = el.value; if (d.req && !s.trim()) return { err: d.l + ' is required' };
  if (d.num) return { v: Number(s) }; return { v: d.t === 'select' ? s : s };
}
function fmtVal(d, v) {
  if (v === null || v === undefined || v === '') return '(blank)';
  if (d.t === 'money') return money(v); if (d.t === 'pct') return v + '%'; if (d.t === 'check') return v ? 'Yes' : 'No'; if (d.t === 'tags') return (v || []).join(', ') || '(none)';
  if (d.t === 'select') { const o = (typeof d.opts === 'function' ? d.opts() : d.opts).find(x => String(x[0]) === String(v)); return o ? o[1] : v; } return String(v);
}
function affectedProducts(kind, id) {
  const P = Object.values(State.cfg.products);
  const finUsing = lab => Object.values(State.cfg.finishing).filter(f => f.labourId === lab).map(f => f.id);
  switch (kind) {
    case 'materials': return P.filter(p => (p.components || []).some(c => c.materialId === id));
    case 'machines': return P.filter(p => (p.machines || []).some(m => m.machineId === id));
    case 'labour': { const fin = finUsing(id); return P.filter(p => (p.labour || []).some(l => l.labourId === id) || (p.allowedFinishing || []).some(f => fin.includes(f))); }
    case 'finishing': return P.filter(p => (p.allowedFinishing || []).includes(id));
    case 'categories': return P.filter(p => p.category === id);
    case 'products': return P.filter(p => p.id === id);
    default: return P;
  }
}
const affectedHTML = list => list.length ? `<p class="muted" style="margin:10px 0 4px">Affects ${list.length} product${list.length > 1 ? 's' : ''} (future quotes only — saved quotes keep their prices):</p><div class="pillrow">${list.slice(0, 14).map(p => `<span class="badge">${e(p.name)}</span>`).join('')}${list.length > 14 ? `<span class="badge">+${list.length - 14} more</span>` : ''}</div>` : '<p class="muted">No products currently use this.</p>';
const diffHTML = rows => rows.map(r => `<div class="diff"><span>${e(r.l)}</span><span class="old">${e(r.o)}</span><span>→</span><span class="new">${e(r.n)}</span></div>`).join('');

/* ---------- settings shell ---------- */
function settingsTabs() {
  const t = [['products', 'Products']]; const view = can('viewCosts') || can('editPricing');
  if (view) t.unshift(['business', 'Business'], ['pricing', 'Pricing'], ['vat', 'VAT'], ['discounts', 'Discounts'], ['quotes', 'Quotes']), t.push(['materials', 'Materials'], ['labour', 'Labour'], ['machines', 'Machines'], ['finishing', 'Finishing'], ['dtf', 'DTF'], ['paper', 'Paper'], ['large', 'Large format']);
  if (can('manageUsers')) t.push(['users', 'Users & roles']); if (can('viewAudit')) t.push(['audit', 'Audit log']); if (can('importExport')) t.push(['data', 'Import / export']);
  return t;
}
function viewSettings() {
  const tabs = settingsTabs(); if (!tabs.some(t => t[0] === State.settingsTab)) State.settingsTab = tabs[0][0];
  const tab = State.settingsTab; let body = '';
  try { body = SETTINGS_SCHEMA[tab] ? settingsFormTab(tab) : ['materials', 'labour', 'machines', 'finishing'].includes(tab) ? catalogCard(tab) : tab === 'products' ? productsTab() : ['dtf', 'paper', 'large'].includes(tab) ? profileTab(tab) : tab === 'users' ? usersTab() : tab === 'audit' ? auditTab() : tab === 'data' ? dataTab() : ''; }
  catch (er) { console.error(er); body = `<div class="alert bad">${e(er.message)}</div>`; }
  return `<div class="top"><h1>Settings</h1></div><div class="tabs">${tabs.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-act="stab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>${body}`;
}
function afterSettingsRender() { if (State.settingsTab === 'audit') resolveNames(State.audit.map(a => a.uid)); if (State.settingsTab === 'users') resolveNames(Object.keys(State.cfg.team)); if (State.settingsTab === 'quotes') updateNumPreview(); }
function onSettingsChange(t) { if (State.settingsTab === 'quotes') updateNumPreview(); }
function updateNumPreview() {
  const p = $('#numprev'); if (!p) return; const S = clone(State.cfg.settings); SETTINGS_SCHEMA.quotes.forEach(d => { const r = readDef(d, $('#sform')); if (r.v !== undefined) setDeep(S, d.p, r.v); });
  const yr = new Date().getFullYear(); p.textContent = PQ.formatQuoteNumber(S, yr, PQ.nextSeq(null, S, yr)) + '  ·  ' + PQ.formatQuoteNumber(S, yr, PQ.nextSeq(null, S, yr) + 1);
}
function settingsFormTab(tab) {
  const S = State.cfg.settings, defs = SETTINGS_SCHEMA[tab], edit = can('editPricing');
  let extra = '';
  if (tab === 'business') { const b = S.business; extra = `<div class="field"><label>Logo (shown on quotes & PDFs)</label><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${b.logo ? `<img src="${e(b.logo)}" style="max-height:56px;max-width:200px;background:#fff;border:1px solid var(--line);border-radius:6px;padding:4px">` : '<span class="muted">No logo</span>'}${edit ? `<button class="btn sm" data-act="logo-pick">Upload logo</button>${b.logo ? '<button class="btn sm danger" data-act="logo-clear">Remove</button>' : ''}<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" hidden>` : ''}</div></div>`; }
  if (tab === 'quotes') extra = `<div class="alert info">Next numbers will look like: <b id="numprev"></b></div>`;
  if (tab === 'pricing') extra = `<div class="alert info">Selling price = production cost + markup → minimum charge → rounding → (manual override) → discount → VAT. Change any step here; nothing is hard-coded.</div>`;
  const cols = tab === 'pricing' || tab === 'quotes' ? 'g2' : 'g2';
  return `<div class="card" id="sform">${extra}<div class="grid ${cols}">${defs.map(d => `<div style="${d.t === 'area' ? 'grid-column:1/-1' : ''}">${fieldHTML(d, getDeep(S, d.p))}</div>`).join('')}</div>
  ${edit ? `<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="sform-save" data-tab="${tab}">Save changes</button>${tab === 'pricing' && S.demo !== undefined || tab === 'pricing' ? '<button class="btn danger" data-act="clear-demo">Remove all demo items…</button>' : ''}</div>` : '<p class="muted">You can view but not change these settings.</p>'}</div>`;
}
Object.assign(ACT, {
  stab: el => { State.settingsTab = el.dataset.t; render(true); },
  'logo-pick': () => $('#logo-file').click(),
  'logo-clear': async () => { const S = clone(State.cfg.settings); S.business.logo = ''; delete S.business.logoW; delete S.business.logoH; if (await safe(() => DB.setSettings(S), 'Logo removed')) { await DB.audit('Removed business logo', 'Business'); render(true); } },
  'sform-save': async el => {
    const tab = el.dataset.tab, defs = SETTINGS_SCHEMA[tab], root = $('#sform'), S0 = State.cfg.settings, S1 = clone(S0), errs = [], diffs = [];
    defs.forEach(d => { const r = readDef(d, root); if (r.err) errs.push(r.err); else if (!r.skip) { setDeep(S1, d.p, r.v); if (JSON.stringify(getDeep(S0, d.p)) !== JSON.stringify(r.v)) diffs.push({ d, o: getDeep(S0, d.p), n: r.v }); } });
    if (S1.pricing && S1.pricing.minOrder < 0) errs.push('Minimum order cannot be negative');
    if (tab === 'discounts' && S1.discount.staffMaxPct > S1.discount.managerMaxPct) errs.push('Staff limit cannot be higher than the manager limit');
    if (tab === 'pricing' && S1.calc.markupMode === 'margin' && S1.pricing.defaultMarkup >= 100) errs.push('In margin mode the default must be below 100%');
    if (errs.length) { openModal({ title: 'Please fix', body: `<ul>${errs.map(x => `<li>${e(x)}</li>`).join('')}</ul>`, footer: '<button class="btn primary" data-act="modal-close">OK</button>' }); return; }
    if (!diffs.length) { toast('No changes to save'); return; }
    const crit = diffs.filter(x => x.d.crit);
    if (crit.length && !await confirmDialog({ title: 'Confirm critical change', body: `<p>You are changing settings that affect <b>every new quote</b>. Existing saved quotes keep their prices.</p>${diffHTML(crit.map(x => ({ l: x.d.l || x.d.cl, o: fmtVal(x.d, x.o), n: fmtVal(x.d, x.n) })))}`, okLabel: 'Apply changes' })) return;
    if (await safe(() => DB.setSettings(S1), 'Settings saved')) { for (const x of diffs) await DB.audit(`Changed setting "${x.d.l || x.d.cl}"`, tab, fmtVal(x.d, x.o), fmtVal(x.d, x.n)); render(true); }
  },
  'clear-demo': async () => {
    const demo = []; ['products', 'materials', 'machines', 'labour', 'finishing', 'categories'].forEach(k => Object.values(State.cfg[k]).forEach(x => x.demo && demo.push([k, x])));
    if (!demo.length) { toast('No demo items left'); return; }
    if (!await confirmDialog({ title: 'Remove all demo items?', body: `<p>This deletes <b>${demo.length}</b> demo records (products, materials, machines, labour, finishing, categories) that you have not edited. Items you changed are kept. You will need to add your own before quoting.</p>`, okLabel: 'Delete demo items', danger: true })) return;
    for (const [k, x] of demo) await safe(() => DB.del(k, x.id)); await DB.audit('Removed demo items', 'Settings', '', demo.length + ' records'); toast('Demo items removed'); render(true);
  }
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.id === 'logo-file' && t.files[0]) {
    const f = t.files[0]; if (f.size > 4e6) { toast('Image too large (max 4 MB)', 'bad'); return; }
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = async () => {
      const sc = Math.min(1, 360 / img.width), w = Math.round(img.width * sc), h = Math.round(img.height * sc), cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      let data = cv.toDataURL('image/png'); if (data.length > 220000) data = cv.toDataURL('image/jpeg', .85);
      const S = clone(State.cfg.settings); S.business.logo = data; S.business.logoW = w; S.business.logoH = h;
      if (await safe(() => DB.setSettings(S), 'Logo saved')) { await DB.audit('Changed business logo', 'Business'); render(true); }
    };
    img.onerror = () => toast('Could not read that image', 'bad'); img.src = url;
  }
});

/* ---------- catalogues ---------- */
const COLS = {
  materials: [['Name', m => e(m.name)], ['Cost', m => money(m.cost) + ' / ' + ({ sheet: 'sheet', sqm: 'm²', metre: 'm', kg: 'kg', unit: 'unit' }[m.costBasis] || '')], ['Size', m => m.costBasis === 'sheet' ? `${m.sheetW || '–'}×${m.sheetH || '–'} mm` : m.costBasis === 'metre' ? `${m.rollWidth || '–'} mm roll` : ''], ['Waste', m => pctf(m.wastagePct)]],
  machines: [['Name', m => e(m.name)], ['Per hour', m => money(PQ.num(m.costPerHour) + PQ.num(m.maintenancePerHour) + PQ.num(m.depreciationPerHour))], ['Per print', m => money(m.costPerPrint)], ['Per m²', m => money(m.costPerSqm)], ['Setup', m => money(m.setupCost)]],
  labour: [['Name', l => e(l.name)], ['Hourly', l => money(l.hourly)], ['Min charge', l => money(l.minCharge)], ['Markup', l => pctf(l.markupPct)]],
  categories: [['Name', c => e(c.name)], ['Markup', c => PQ.has(c.markupPct) ? pctf(c.markupPct) : 'global default'], ['Min line price', c => PQ.num(c.minPrice) ? money(c.minPrice) : '—']],
  finishing: [['Name', f => e(f.name)], ['Method', f => e(PQ.FIN_METHODS[f.method] || f.method)], ['Price', f => f.method === 'percent' ? pctf(f.price) : f.method === 'labour' ? f.minutes + ' min' : money(f.price)], ['Minimum', f => money(f.minCharge)]]
};
function catalogCard(kind, filter, title, addTags) {
  const edit = can('editPricing'), list = Object.values(State.cfg[kind]).filter(filter || (() => true)).sort((a, b) => a.name.localeCompare(b.name));
  const cols = COLS[kind];
  return `<div class="card"><div class="hd"><h2>${title || KIND_LABEL[kind] + 's'} <span class="muted" style="font-weight:400">(${list.length})</span></h2>${edit ? `<button class="btn sm primary" data-act="ent-new" data-k="${kind}" data-tag="${addTags || ''}">+ Add</button>` : ''}</div>
  ${list.length ? `<div class="tblwrap"><table class="tbl"><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>${list.map(x => `<tr class="${x.active === false ? 'muted' : ''}">${cols.map((c, i) => `<td>${c[1](x)}${i === 0 ? (x.demo ? ' <span class="badge b-demo">DEMO</span>' : '') + (x.active === false ? ' <span class="badge">disabled</span>' : '') : ''}</td>`).join('')}<td class="r" style="white-space:nowrap">${edit ? `<button class="btn sm" data-act="ent-edit" data-k="${kind}" data-id="${e(x.id)}">Edit</button> <button class="btn sm" data-act="ent-dup" data-k="${kind}" data-id="${e(x.id)}">Duplicate</button> <button class="btn sm" data-act="ent-toggle" data-k="${kind}" data-id="${e(x.id)}">${x.active === false ? 'Enable' : 'Disable'}</button> <button class="btn sm danger" data-act="ent-del" data-k="${kind}" data-id="${e(x.id)}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing here yet.</p>'}</div>`;
}
function profileTab(profile) {
  const tag = x => (x.tags || []).includes(profile), label = PROFILES.find(p => p[0] === profile)[1];
  return `<div class="alert info">Everything the ${e(label)} calculator uses. These are the same catalogues as the other tabs, filtered by the “${e(label)}” tag — one source of truth.</div>
  ${productsCard(p => p.profile === profile, label + ' products', profile)}${catalogCard('materials', tag, label + ' materials', profile)}${catalogCard('machines', tag, label + ' machines', profile)}${catalogCard('labour', tag, label + ' labour', profile)}${catalogCard('finishing', tag, label + ' finishing', profile)}`;
}
function entityFormHTML(kind, rec) { return `<div class="grid g2">${SCHEMA[kind].map(d => `<div style="${['area', 'tags'].includes(d.t) ? 'grid-column:1/-1' : ''}">${fieldHTML(d, rec[d.k])}</div>`).join('')}</div>`; }
function entityDefaults(kind, tag) {
  const base = { materials: { cost: 0, costBasis: 'sheet', type: 'paper', wastagePct: 0, tags: [] }, machines: { costPerHour: 0, costPerPrint: 0, costPerSqm: 0, setupCost: 0, maintenancePerHour: 0, depreciationPerHour: 0, tags: [] }, labour: { hourly: 0, minCharge: 0, markupPct: 0, tags: [] }, finishing: { method: 'per_item', price: 0, minCharge: 0, setup: 0, minutes: 0, metreBasis: 'perimeter', askQty: false, defaultQty: 1, tags: [] }, categories: { markupPct: null, minPrice: null } }[kind];
  const r = { ...clone(base), active: true }; if (tag && r.tags) r.tags = [tag]; return r;
}
function openEntity(kind, id, tag, over) {
  const isNew = !id, rec = over || (isNew ? entityDefaults(kind, tag) : clone(State.cfg[kind][id]));
  openModal({ title: (isNew ? 'Add ' : 'Edit ') + KIND_LABEL[kind].toLowerCase(), wide: true, body: `<div id="eform">${entityFormHTML(kind, rec)}</div>${isNew ? '' : affectedHTML(affectedProducts(kind, id))}`, footer: `<button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" data-act="ent-save" data-k="${kind}" data-id="${e(id || '')}">Save</button>` });
}
function validateEntity(kind, v) {
  const errs = [];
  if (kind === 'materials') { if (v.costBasis === 'metre' && !(v.rollWidth > 0)) errs.push('Roll width is required for per-metre materials'); if (v.costBasis === 'sheet' && (!!v.sheetW !== !!v.sheetH)) errs.push('Enter both sheet width and height (or neither)'); }
  if (kind === 'finishing') { if (v.method === 'labour' && !State.cfg.labour[v.labourId]) errs.push('Choose a labour type for labour-based finishing'); if (v.method === 'percent' && v.price > 1000) errs.push('Percentage looks too high'); }
  return errs;
}
Object.assign(ACT, {
  'ent-new': el => openEntity(el.dataset.k, null, el.dataset.tag), 'ent-edit': el => openEntity(el.dataset.k, el.dataset.id),
  'ent-save': async el => {
    const kind = el.dataset.k, id = el.dataset.id, old = id ? State.cfg[kind][id] : null, root = $('#eform'), v = {}, errs = [];
    SCHEMA[kind].forEach(d => { const r = readDef(d, root); if (r.err) errs.push(r.err); else if (!r.skip) v[d.k] = r.v; });
    if (!errs.length) errs.push(...validateEntity(kind, v));
    if (kind !== 'categories' && Object.values(State.cfg[kind]).some(x => x.id !== id && x.name.trim().toLowerCase() === (v.name || '').trim().toLowerCase())) errs.push('Another ' + KIND_LABEL[kind].toLowerCase() + ' already has this name');
    if (errs.length) { toast(errs[0], 'bad'); return; }
    const rec = { ...(old || {}), ...v }; if (!old) rec.id = uid(kind.slice(0, 3)); delete rec.demo; if (old && old.demo) rec.demo = false;
    const diffs = old ? SCHEMA[kind].filter(d => JSON.stringify(old[d.k] ?? null) !== JSON.stringify(rec[d.k] ?? null)) : [];
    if (old && !diffs.length) { closeModal(); toast('No changes'); return; }
    const crit = diffs.filter(d => d.crit);
    if (crit.length) {
      if (!await confirmDialog({ title: 'Confirm price change', body: `<p><b>${e(rec.name)}</b></p>${diffHTML(crit.map(d => ({ l: d.l, o: fmtVal(d, old[d.k]), n: fmtVal(d, rec[d.k]) })))}${affectedHTML(affectedProducts(kind, id))}`, okLabel: 'Save change' })) { openEntity(kind, id, '', { ...rec }); return; }
      openModalKeep = true;
    }
    const saved = await safe(() => DB.set(kind, rec.id, rec)); if (!saved) return;
    if (old) for (const d of diffs) await DB.audit(`Changed ${KIND_LABEL[kind].toLowerCase()} "${rec.name}" — ${d.l}`, kind, fmtVal(d, old[d.k]), fmtVal(d, rec[d.k])); else await DB.audit(`Added ${KIND_LABEL[kind].toLowerCase()} "${rec.name}"`, kind);
    closeModal(true); toast('Saved'); render(true);
  },
  'ent-dup': async el => { const k = el.dataset.k, src = State.cfg[k][el.dataset.id], c = clone(src); c.id = uid(k.slice(0, 3)); c.name = src.name + ' (copy)'; c.demo = false; if (await safe(() => DB.set(k, c.id, c), 'Duplicated')) { await DB.audit(`Duplicated ${KIND_LABEL[k].toLowerCase()} "${src.name}"`, k); render(true); } },
  'ent-toggle': async el => { const k = el.dataset.k, x = clone(State.cfg[k][el.dataset.id]), was = x.active !== false; x.active = !was; if (await safe(() => DB.set(k, x.id, x), was ? 'Disabled' : 'Enabled')) { await DB.audit(`${was ? 'Disabled' : 'Enabled'} ${KIND_LABEL[k].toLowerCase()} "${x.name}"`, k); render(true); } },
  'ent-del': async el => {
    const k = el.dataset.k, x = State.cfg[k][el.dataset.id], used = affectedProducts(k, x.id);
    if (used.length && k !== 'products') { openModal({ title: 'Cannot delete', body: `<p><b>${e(x.name)}</b> is used by ${used.length} product${used.length > 1 ? 's' : ''}. Deleting it would break their pricing.</p>${affectedHTML(used)}<p>You can <b>disable</b> it instead so it can no longer be chosen.</p>`, footer: `<button class="btn" data-act="modal-close">Close</button><button class="btn primary" data-act="ent-toggle-close" data-k="${k}" data-id="${e(x.id)}">Disable instead</button>` }); return; }
    if (!await confirmDialog({ title: `Delete ${KIND_LABEL[k].toLowerCase()}?`, body: `<p>Delete <b>${e(x.name)}</b> permanently? Saved quotes keep their prices.</p>`, okLabel: 'Delete', danger: true })) return;
    if (await safe(() => DB.del(k, x.id), 'Deleted')) { await DB.audit(`Deleted ${KIND_LABEL[k].toLowerCase()} "${x.name}"`, k); render(true); }
  },
  'ent-toggle-close': async el => { closeModal(true); await ACT['ent-toggle'](el); }
});
let openModalKeep = false;
