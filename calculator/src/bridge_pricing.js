/* ===== PrintOps bridge for the existing Settings / catalogue / product-wizard screens =====
   UI code is unchanged. Only persistence is redirected: every DB.set/DB.del/DB.setSettings call is sent to the host page,
   which writes it to PostgreSQL (row-level security: owner only) and acknowledges. */
(function () {
  const ORIGIN = window.location.origin;
  const post = (type, payload) => window.parent.postMessage({ source: 'printops-calc', type, payload }, ORIGIN);
  const pending = new Map(); let seq = 0;
  function rpc(op, payload) {
    return new Promise((res, rej) => {
      const id = ++seq; pending.set(id, { res, rej }); post('persist', { rid: id, op, ...payload });
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('Timed out — nothing was saved. Please try again.')); } }, 25000);
    });
  }
  window.addEventListener('message', ev => {
    if (ev.origin !== ORIGIN) return; const m = ev.data; if (!m || m.source !== 'printops-host') return;
    if (m.type === 'init') init(m.payload);
    else if (m.type === 'ack') { const p = pending.get(m.payload.rid); if (!p) return; pending.delete(m.payload.rid); m.payload.ok ? p.res() : p.rej(new Error(m.payload.error || 'Could not save')); }
  });
  DB.set = async (kind, id, data) => { data = clean({ ...data, id }); await rpc('set', { kind, id, data }); State.cfg[kind][id] = data; return data; };
  DB.del = async (kind, id) => { await rpc('del', { kind, id }); delete State.cfg[kind][id]; };
  DB.setSettings = async s => { s = clean(s); await rpc('settings', { data: { demo: !!s.demo, pricing: s.pricing, calc: s.calc, vat: s.vat, discount: s.discount } }); State.cfg.settings = s; };
  DB.audit = async () => { /* the database records every configuration change itself (config_audit) */ };
  explainError = function (er) { return (er && er.message) || 'Could not save'; };
  settingsTabs = function () { return [['pricing', 'Pricing'], ['vat', 'VAT'], ['discounts', 'Discounts'], ['products', 'Products'], ['materials', 'Materials'], ['labour', 'Labour'], ['machines', 'Machines'], ['finishing', 'Finishing'], ['dtf', 'DTF'], ['paper', 'Paper'], ['large', 'Large format']]; };
  function init(p) {
    State.mode = 'embedded'; State.me = { id: p.userId, name: p.userName, isOwner: true, canEdit: true, canData: true };
    State.cfg.settings = p.settings;
    ['products', 'materials', 'machines', 'labour', 'finishing', 'categories'].forEach(k => { State.cfg[k] = p[k] || {}; });
    State.loaded.settings = true; State.embedded = true; State.audit = []; document.body.classList.add('embedded');
    State.view = 'settings'; State.settingsTab = 'products'; render(true);
  }
  if (window.ResizeObserver) new ResizeObserver(() => post('height', document.documentElement.scrollHeight)).observe(document.body);
  post('ready', true);
})();
