/* ===== PrintQuote app — core: state, data layer, permissions, helpers ===== */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = v => { const n = PQ.num(v); return (n < 0 ? '-' : '') + 'R' + nf.format(Math.abs(n)); };
const pctf = v => (Math.round(PQ.num(v) * 100) / 100) + '%';
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' && !isFinite(v)) ? null : v));
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayISO = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const fmtDate = s => s ? new Date(s.length > 10 ? s : s + 'T12:00:00').toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtTime = ms => new Date(ms).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const KINDS = ['materials', 'machines', 'labour', 'finishing', 'categories', 'products', 'team'];
const STATUSES = [['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['rejected', 'Rejected'], ['expired', 'Expired'], ['converted', 'Converted to Job']];
const statusLabel = s => (STATUSES.find(x => x[0] === s) || [0, s])[1];

const State = {
  mode: 'loading', me: { id: null, name: '', isOwner: false, canEdit: false, canData: null },
  cfg: { settings: null, products: {}, materials: {}, machines: {}, labour: {}, finishing: {}, categories: {}, team: {} },
  quotes: {}, audit: [], jobs: {}, customers: {}, names: {}, loaded: {}, err: null,
  view: 'dashboard', params: {}, previewRole: null, modal: null, dirty: false, qFilter: { text: '', status: '' }, settingsTab: 'business', auditFilter: ''
};
const engineCfg = () => ({ settings: State.cfg.settings || {}, products: State.cfg.products, materials: State.cfg.materials, machines: State.cfg.machines, labour: State.cfg.labour, finishing: State.cfg.finishing, categories: State.cfg.categories });

/* ---------- permissions ---------- */
function role() {
  if (State.previewRole) return State.previewRole;
  if (State.mode === 'memory' || State.me.isOwner) return 'owner';
  const t = State.cfg.team[State.me.id];
  const r = t && t.role ? t.role : ((State.cfg.settings || {}).defaultRole || 'staff');
  return ['owner', 'manager', 'staff'].includes(r) ? r : 'staff';
}
const can = p => PQ.hasPerm(State.cfg.settings || {}, role(), p);
const isOwnerRole = () => role() === 'owner';

/* ---------- data layer (database first; memory fallback) ---------- */
const DB = {
  db: null,
  col(kind) { return this.db.doc('cfg/' + kind).collection('items'); },
  async set(kind, id, data) { data = clean({ ...data, id }); State.cfg[kind][id] = data; if (this.db) await this.col(kind).doc(id).set(data); return data; },
  async del(kind, id) { delete State.cfg[kind][id]; if (this.db) await this.col(kind).doc(id).delete(); },
  async setSettings(s) { State.cfg.settings = clean(s); if (this.db) await this.db.doc('cfg/settings').set(State.cfg.settings); },
  async setQuote(q) { q = clean(q); State.quotes[q.id] = q; if (this.db) await this.db.collection('quotes').doc(q.id).set(q); return q; },
  async delQuote(id) { delete State.quotes[id]; if (this.db) await this.db.collection('quotes').doc(id).delete(); },
  async setCustomer(c) { State.customers[c.id] = c; if (this.db) await this.db.collection('customers').doc(c.id).set(clean(c)); },
  async setJob(j) { State.jobs[j.id] = j; if (this.db) await this.db.collection('jobs').doc(j.id).set(clean(j)); },
  async audit(action, entity, oldV, newV) {
    const entry = { ts: Date.now(), uid: State.me.id || 'local', role: role(), action, entity: entity || '', old: oldV === undefined ? '' : String(oldV), new: newV === undefined ? '' : String(newV) };
    const id = uid('a'); State.audit.unshift({ ...entry, id });
    if (this.db) { try { await this.db.collection('audit').doc(id).set(entry); } catch (er) { console.warn('audit write failed', er); } }
  }
};

function explainError(er) {
  const c = er && er.code;
  if (c === 'invalid_argument') return 'Not saved: your account can\'t change this. Pricing, products and settings need Editor access on the shared artifact.';
  if (c === 'quota_exceeded') return 'Storage limit reached — delete old records or export and archive first.';
  if (c === 'resource_exhausted') return 'Too many requests — wait a moment and try again.';
  return 'Could not save: ' + ((er && er.message) || 'unknown error');
}
async function safe(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (er) { console.error(er); toast(explainError(er), 'bad'); return undefined; }
}

async function nextQuoteNumber() {
  const S = State.cfg.settings, yr = new Date().getFullYear();
  const qid = n => n.replace(/[^A-Za-z0-9_.-]/g, '-');
  if (!DB.db) {
    let seq = PQ.nextSeq(State.localCounter, S, yr);
    while (State.quotes[qid(PQ.formatQuoteNumber(S, yr, seq))]) seq++;
    State.localCounter = { year: yr, seq };
    return PQ.formatQuoteNumber(S, yr, seq);
  }
  const ref = DB.db.doc('counters/quote'), holder = (State.me.id || 'anon') + '-' + Math.random().toString(36).slice(2);
  for (let t = 0; t < 16; t++) {
    const r = await ref.acquire({ holder, ttlMs: 1500 });
    if (!r.acquired) { await sleep(250 + Math.random() * 500); continue; }
    const snap = await ref.get();
    let seq = PQ.nextSeq(snap.exists ? snap.data() : null, S, yr);
    for (let g = 0; g < 200; g++) {
      const n = PQ.formatQuoteNumber(S, yr, seq);
      const ex = await DB.db.doc('quotes/' + qid(n)).get();
      if (!ex.exists && !State.quotes[qid(n)]) break; seq++;
    }
    await ref.set({ year: yr, seq });
    return PQ.formatQuoteNumber(S, yr, seq);
  }
  throw new Error('Could not reserve a quote number — please try again');
}
const quoteDocId = n => n.replace(/[^A-Za-z0-9_.-]/g, '-');

/* ---------- names (ids only are stored) ---------- */
async function resolveNames(ids) {
  ids = [...new Set(ids.filter(x => x && x !== 'local' && !State.names[x]))]; if (!ids.length || !State.userCap) return;
  try { const ps = await State.userCap.profiles(ids); ids.forEach(i => { State.names[i] = (ps[i] && ps[i].name) || ''; }); renderSoon(); } catch (er) { /* ignore */ }
}
const nameOf = id => id === State.me.id ? (State.me.name || 'You') : (State.names[id] || (id === 'local' ? 'Local user' : 'Someone'));

/* ---------- toast / modal ---------- */
let toastT;
function toast(msg, kind) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = 'toast ' + (kind || ''); t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), kind === 'bad' ? 6500 : 2600);
}
function openModal(o) {
  if (!o.stack) closeModal(true);
  const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = o.stack ? 'ov2' : 'ov'; if (o.stack) ov.style.zIndex = 70;
  ov.innerHTML = `<div class="modal ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="mh"><h2>${e(o.title)}</h2><button class="btn ghost icon" data-act="modal-close" aria-label="Close">✕</button></div><div class="mb" id="mb">${o.body}</div><div class="mf" id="mf">${o.footer || ''}</div></div>`;
  document.body.appendChild(ov); if (o.stack) State.stackModal = o; else State.modal = o; if (o.onMount) o.onMount(ov);
  return ov;
}
function closeStack() { const s = $('#ov2'); if (s) s.remove(); State.stackModal = null; }
function closeModal(silent) { closeStack(); const ov = $('#ov'); if (ov) ov.remove(); const m = State.modal; State.modal = null; if (!silent && m && m.onClose) m.onClose(); if (!silent) renderSoon(); }
function confirmDialog(o) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; closeStack(); res(v); };
    openModal({ stack: true, title: o.title, body: o.body, footer: `<button class="btn" data-act="cf-no">${e(o.cancelLabel || 'Cancel')}</button><button class="btn ${o.danger ? 'danger solid' : 'primary'}" data-act="cf-yes">${e(o.okLabel || 'Confirm')}</button>`, onClose: () => fin(false) });
    State.cf = fin;
  });
}
function promptDialog(o) {
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; closeStack(); res(v); };
    openModal({ stack: true, title: o.title, body: `<div class="field"><label>${e(o.label)}</label><input id="pd-in" value="${e(o.value || '')}" ${o.type ? 'type="' + o.type + '"' : ''}></div>`, footer: `<button class="btn" data-act="pd-no">Cancel</button><button class="btn primary" data-act="pd-yes">${e(o.okLabel || 'OK')}</button>`, onClose: () => fin(null), onMount: () => setTimeout(() => { const i = $('#pd-in'); i && i.focus(); }, 30) });
    State.pd = fin;
  });
}

/* ---------- icons ---------- */
const ICON = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  quotes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
  calc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};
