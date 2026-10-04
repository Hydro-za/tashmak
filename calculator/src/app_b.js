/* ===== shell, routing, dashboard, quote list ===== */
const ACT = {};
let raf = 0;
function renderSoon() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
const isLocked = () => !!State.modal || State.view === 'editor' || State.view === 'calc';

function visibleQuotes() {
  const all = Object.values(State.quotes);
  return (can('viewAllQuotes') ? all : all.filter(q => q.createdBy === State.me.id)).sort((a, b) => b.createdAt - a.createdAt);
}
function effStatus(q) { return (['draft', 'sent'].includes(q.status) && q.expiry && q.expiry < todayISO()) ? 'expired' : q.status; }
const badge = s => `<span class="badge b-${s}">${e(statusLabel(s))}</span>`;

function go(view, params, force) {
  const leave = () => { State.view = view; State.params = params || {}; State.dirty = false; State.ed = null; render(true); window.scrollTo(0, 0); };
  if (!force && State.dirty && (State.view === 'editor')) {
    confirmDialog({ title: 'Discard unsaved changes?', body: '<p>This quote has changes that have not been saved.</p>', okLabel: 'Discard changes', danger: true }).then(ok => { if (ok) leave(); });
  } else leave();
}

function navItems() {
  const items = [['dashboard', 'Dashboard', ICON.dash], ['quotes', 'Quotes', ICON.quotes]];
  if (can('createQuotes')) items.push(['new', 'New quote', ICON.plus]);
  items.push(['calc', 'Calculators', ICON.calc], ['settings', 'Settings', ICON.gear]);
  return items;
}
function activeNav() { const v = State.view; return v === 'editor' ? (State.params.id ? 'quotes' : 'new') : v === 'quote' ? 'quotes' : v; }

function render(force) {
  const root = $('#app'); if (!root) return;
  if (State.mode === 'loading' || !State.loaded.settings) { root.innerHTML = `<div class="setup"><h1>Loading…</h1><p class="muted">${State.err ? e(State.err) : 'Connecting to the database'}</p></div>`; return; }
  if (!State.cfg.settings) { root.innerHTML = setupView(); return; }
  if (!force && isLocked() && $('#shell')) { refreshChrome(); return; }
  const S = State.cfg.settings, biz = S.business || {};
  const nav = navItems(), on = activeNav();
  const navBtn = (n, cls) => `<button class="${on === n[0] ? 'on' : ''}" data-act="nav" data-v="${n[0]}">${n[2]}<span>${e(n[1])}</span></button>`;
  let body = '';
  try {
    body = State.view === 'dashboard' ? viewDashboard() : State.view === 'quotes' ? viewQuotes() : State.view === 'quote' ? viewQuote() :
      State.view === 'editor' ? viewEditor() : State.view === 'calc' ? viewCalc() : State.view === 'settings' ? viewSettings() : '';
  } catch (er) { console.error(er); body = `<div class="alert bad">Something went wrong showing this page: ${e(er.message)}</div>`; }
  root.innerHTML = `<div class="app" id="shell"><aside class="side"><div class="brand">${biz.logo ? `<img src="${e(biz.logo)}" alt="">` : ''}<span>${e(biz.name || 'PrintQuote')}</span></div><nav class="nav">${nav.map(n => navBtn(n)).join('')}</nav>
    <div class="who">${e(State.me.name || (State.mode === 'memory' ? 'Local session' : 'Signed in'))}<br><b>${e(role())}</b>${State.previewRole ? ' <span class="badge b-demo">preview</span>' : ''}</div></aside>
    <main class="main" id="main">${banners()}${body}</main></div>
    <nav class="bottom">${nav.map(n => navBtn(n)).join('')}</nav>`;
  afterRender();
}
function refreshChrome() { const b = $('#banners'); if (b) b.innerHTML = bannersInner(); }
function bannersInner() {
  let h = '';
  if (State.mode === 'memory') h += `<div class="alert warn"><b>Not connected to a database.</b> You are in a local session — quotes and settings will be lost when this page closes. Open the published artifact to use the shared database.</div>`;
  if (State.previewRole) h += `<div class="alert info">Previewing the app as <b>${e(State.previewRole)}</b>. <button class="btn sm" data-act="preview-off">Exit preview</button></div>`;
  if (State.mode === 'db' && State.me.canData === false) h += `<div class="alert warn">You have read-only access to this app, so changes can't be saved. Ask the owner to share it with you as a Contributor.</div>`;
  const S = State.cfg.settings;
  if (S && S.demo && can('editPricing')) h += `<div class="alert warn"><b>Demo pricing is loaded.</b> All prices, materials and products shown are placeholder examples — not real market prices. Replace them in <a href="#" data-act="nav" data-v="settings">Settings</a> before quoting real customers. <button class="btn sm" data-act="demo-ack">I've replaced them — hide this</button></div>`;
  return h;
}
const banners = () => `<div id="banners">${bannersInner()}</div>`;
function afterRender() { if (State.view === 'quotes' || State.view === 'dashboard') resolveNames(Object.values(State.quotes).map(q => q.createdBy)); if (State.view === 'settings') afterSettingsRender && afterSettingsRender(); if (State.view === 'editor' || State.view === 'calc') afterEditorRender && afterEditorRender(); }

function setupView() {
  const owner = State.me.isOwner || State.mode === 'memory';
  return `<div class="setup card"><h1>Printing Quote System</h1><p class="muted">This workspace has no pricing configured yet.</p>
  ${owner ? `<p>Load a set of <b>demo defaults</b> (placeholder materials, machines, labour, finishing and products) so the calculator works immediately. Every demo record is labelled and can be replaced from Settings — none of it is real market pricing.</p><button class="btn primary" data-act="seed">Load demo defaults</button><div id="seedmsg" class="muted" style="margin-top:10px"></div>` : `<p>Ask the owner to open this app once and load the initial settings.</p>`}</div>`;
}

/* ---------- dashboard ---------- */
function viewDashboard() {
  const qs = visibleQuotes(), today = todayISO(), month = today.slice(0, 7);
  const cr = q => iso(new Date(q.createdAt));
  const tq = qs.filter(q => cr(q) === today), mq = qs.filter(q => cr(q).startsWith(month));
  const sum = (a, f) => a.reduce((x, q) => x + PQ.num(f(q)), 0);
  const val = q => (q.totals || {}).total;
  const eff = qs.map(q => [q, effStatus(q)]);
  const acc = eff.filter(x => x[1] === 'accepted' || x[1] === 'converted').map(x => x[0]);
  const pend = eff.filter(x => ['draft', 'sent'].includes(x[1])).map(x => x[0]);
  const rej = eff.filter(x => x[1] === 'rejected').map(x => x[0]);
  const showVal = can('viewReports') || true;
  const stat = (k, v, sub) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="muted" style="font-size:12px">${sub}</div>` : ''}</div>`;
  const cards = [
    stat('Quotes created today', tq.length), stat('Quotes this month', mq.length), stat('Quote value this month', money(sum(mq, val)), 'incl. VAT where applicable'),
    stat('Average quote value', money(qs.length ? sum(qs, val) / qs.length : 0)),
    stat('Accepted', acc.length, money(sum(acc, val))), stat('Pending (draft + sent)', pend.length, money(sum(pend, val))), stat('Rejected', rej.length, money(sum(rej, val)))
  ];
  if (can('viewProfit')) cards.push(stat('Est. gross profit (this month)', money(sum(mq, q => (q.totals || {}).grossProfit)), 'ex VAT, from saved costs'));
  else cards.push(stat('Total quotes', qs.length));
  const recent = qs.slice(0, 8);
  return `<div class="top"><h1>Dashboard</h1><div class="actions">${can('createQuotes') ? `<button class="btn primary" data-act="nav" data-v="new">+ New quote</button>` : ''}</div></div>
  ${can('viewAllQuotes') ? '' : '<div class="alert info">You are seeing your own quotes only.</div>'}
  <div class="stats">${cards.join('')}</div>
  <div class="card"><div class="hd"><h2>Recent quotes</h2><button class="btn sm" data-act="nav" data-v="quotes">View all</button></div>${quoteTable(recent)}</div>`;
}
function quoteTable(list) {
  if (!list.length) return '<p class="muted">No quotes yet.</p>';
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>Quote</th><th>Customer</th><th>Date</th><th>Status</th><th class="r">Total</th><th>Staff</th></tr></thead><tbody>${list.map(q => `<tr class="click" data-act="open-quote" data-id="${e(q.id)}"><td><b>${e(q.number)}</b></td><td>${e(q.customer.name)}${q.customer.company ? `<div class="muted">${e(q.customer.company)}</div>` : ''}</td><td>${fmtDate(q.date)}</td><td>${badge(effStatus(q))}</td><td class="r">${money((q.totals || {}).total)}</td><td class="muted">${e(q.staffName || nameOf(q.createdBy))}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- quote list & search ---------- */
function quoteSearchText(q) {
  return [q.number, q.ref, q.customer.name, q.customer.company, q.customer.email, q.customer.phone, q.staffName, nameOf(q.createdBy), statusLabel(effStatus(q)), q.date, q.expiry, fmtDate(q.date), ...(q.items || []).map(i => (i.productName || '') + ' ' + (i.desc || ''))].join(' ').toLowerCase();
}
function viewQuotes() {
  const f = State.qFilter;
  return `<div class="top"><h1>Quotes</h1><div class="actions">${can('createQuotes') ? `<button class="btn primary" data-act="nav" data-v="new">+ New quote</button>` : ''}</div></div>
  <div class="card"><div class="grid g3" style="margin-bottom:12px"><div class="field" style="grid-column:span 2"><label>Search quote no., customer, product, staff, date, status</label><input type="search" id="qsearch" value="${e(f.text)}" placeholder="e.g. QT-2026, Acme, banner, accepted, 2026-09"></div>
  <div class="field"><label>Status</label><select id="qstatus"><option value="">All statuses</option>${STATUSES.map(s => `<option value="${s[0]}" ${f.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}</select></div></div>
  <div id="qlist">${quoteListHTML()}</div></div>`;
}
function quoteListHTML() {
  const f = State.qFilter, t = f.text.trim().toLowerCase();
  const list = visibleQuotes().filter(q => (!f.status || effStatus(q) === f.status) && (!t || t.split(/\s+/).every(w => quoteSearchText(q).includes(w))));
  if (!list.length) return '<p class="muted">No quotes match.</p>';
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>Quote</th><th>Customer</th><th>Date</th><th>Expires</th><th>Status</th><th class="r">Total</th><th></th></tr></thead><tbody>${list.map(q => `<tr class="click" data-act="open-quote" data-id="${e(q.id)}"><td><b>${e(q.number)}</b>${q.ref ? `<div class="muted">${e(q.ref)}</div>` : ''}</td><td>${e(q.customer.name)}${q.customer.company ? `<div class="muted">${e(q.customer.company)}</div>` : ''}</td><td>${fmtDate(q.date)}</td><td>${fmtDate(q.expiry)}</td><td>${badge(effStatus(q))}</td><td class="r">${money((q.totals || {}).total)}</td><td class="r noprint">${can('editQuotes') ? `<button class="btn sm" data-act="edit-quote" data-id="${e(q.id)}">Edit</button> ` : ''}${can('createQuotes') ? `<button class="btn sm" data-act="dup-quote" data-id="${e(q.id)}">Duplicate</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- global events ---------- */
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (fn) { if (el.tagName === 'A') ev.preventDefault(); ev.stopPropagation(); fn(el, ev); }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'qsearch') { State.qFilter.text = t.value; const l = $('#qlist'); if (l) l.innerHTML = quoteListHTML(); }
  else if (t.dataset && (t.dataset.i || t.dataset.q || t.dataset.calc)) onEditorInput && onEditorInput(t, ev);
  else if (t.dataset && t.dataset.w !== undefined) onWizardInput && onWizardInput(t, ev);
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'qstatus') { State.qFilter.status = t.value; const l = $('#qlist'); if (l) l.innerHTML = quoteListHTML(); }
  else if (t.dataset && (t.dataset.i || t.dataset.q || t.dataset.calc)) onEditorInput && onEditorInput(t, ev);
  else if (t.dataset && t.dataset.w !== undefined) onWizardInput && onWizardInput(t, ev, true);
  else if (t.dataset && t.dataset.cfg !== undefined) onSettingsChange && onSettingsChange(t, ev);
});

Object.assign(ACT, {
  nav: el => { const v = el.dataset.v; closeModal(true); if (v === 'new') go('editor', {}); else if (v === 'calc') go('calc', { profile: (State.params && State.params.profile) || 'dtf' }); else go(v, {}); },
  'modal-close': el => { if ($('#ov2') && State.stackModal && el.closest('#ov2')) { State.stackModal.onClose && State.stackModal.onClose(); closeStack(); } else closeModal(); },
  'cf-yes': () => State.cf && State.cf(true), 'cf-no': () => State.cf && State.cf(false),
  'pd-yes': () => State.pd && State.pd($('#pd-in').value), 'pd-no': () => State.pd && State.pd(null),
  'open-quote': el => go('quote', { id: el.dataset.id }),
  'edit-quote': el => go('editor', { id: el.dataset.id }),
  'dup-quote': el => duplicateQuote(el.dataset.id),
  'preview-off': () => { State.previewRole = null; render(true); },
  'demo-ack': async () => { const S = clean(State.cfg.settings); delete S.demo; await safe(() => DB.setSettings(S)); await DB.audit('Marked demo pricing as reviewed', 'Settings'); render(); },
  seed: async el => { el.disabled = true; await seedDemo(msg => { const m = $('#seedmsg'); if (m) m.textContent = msg; }); render(); }
});

/* ---------- demo seeding ---------- */
async function seedDemo(progress) {
  const seed = PQSeed.makeSeed();
  const groups = { categories: seed.categories, materials: seed.materials, machines: seed.machines, labour: seed.labour, finishing: seed.finishing, products: seed.products };
  const total = Object.values(groups).reduce((a, g) => a + g.length, 0); let n = 0;
  try {
    for (const [kind, arr] of Object.entries(groups)) for (const it of arr) { await DB.set(kind, it.id, it); progress && progress('Loading demo data… ' + (++n) + ' / ' + total); }
    await DB.setSettings(seed.settings);
    await DB.audit('Loaded demo defaults', 'Settings');
  } catch (er) { toast(explainError(er), 'bad'); }
}

async function duplicateQuote(id) {
  const q = State.quotes[id]; if (!q) return;
  const copy = JSON.parse(JSON.stringify(q));
  go('editor', { dupOf: id }, true);
}
