const { JSDOM, VirtualConsole } = require('jsdom'); const fs = require('fs'); const path = require('path');
const { makeSeed } = require('../calculator/seed.js');
const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.detail || e.message))); vc.on('error', e => errors.push('console.error: ' + e));
const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/pricing.html'), 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://x.test/' });
const w = dom.window; w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
const out = []; w.addEventListener('message', e => { if (e.data && e.data.source === 'printops-calc') out.push(e.data); });
const $ = s => w.document.querySelector(s), ev = c => w.eval(c), sleep = ms => new Promise(r => setTimeout(r, ms));
const host = (type, payload) => w.dispatchEvent(new w.MessageEvent('message', { data: { source: 'printops-host', type, payload }, origin: 'https://x.test' }));
const click = s => $(s).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); const setv = (s, v, t = 'input') => { const el = $(s); el.value = v; el.dispatchEvent(new w.Event(t, { bubbles: true })); };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const by = a => Object.fromEntries(a.map(x => [x.id, x])); const seed = makeSeed(); const s = seed.settings;
const ack = async (okv = true, err) => { await sleep(10); const m = out.filter(x => x.type === 'persist').pop(); host('ack', { rid: m.payload.rid, ok: okv, error: err }); return m.payload; };
(async () => {
  await sleep(100); ok(out.some(m => m.type === 'ready'), 'pricing embed signals ready');
  host('init', { userId: 'u1', userName: 'Damian', settings: { demo: true, pricing: s.pricing, calc: s.calc, vat: s.vat, discount: s.discount, quotes: s.quotes, business: s.business, permissions: s.permissions }, products: by(seed.products), materials: by(seed.materials), machines: by(seed.machines), labour: by(seed.labour), finishing: by(seed.finishing), categories: by(seed.categories) });
  await sleep(40); ok($$ = [...w.document.querySelectorAll('.tabs button')].map(b => b.textContent).join() === 'Pricing,VAT,Discounts,Products,Materials,Labour,Machines,Finishing,DTF,Paper,Large format', 'only pricing-related tabs shown');
  ok($('#main').textContent.includes('Demo pricing is loaded'), 'demo banner shown while demo data is present');
  ok($('#main').textContent.includes('Phone') === false && $('#main').textContent.includes('PVC Banner'), 'products tab lists catalogue');
  // edit a material -> confirm -> host persists
  ev("State.settingsTab='materials'; render(true)"); click('[data-act="ent-edit"][data-id="mat_130"]'); await sleep(10); setv('[data-cfg="cost"]', '1.25'); click('[data-act="ent-save"]'); await sleep(30);
  ok($('#ov2') && $('#ov2').textContent.includes('1.25'), 'price-change confirmation appears'); click('[data-act="cf-yes"]'); const p1 = await ack(); await sleep(30);
  ok(p1.op === 'set' && p1.kind === 'materials' && p1.data.cost === 1.25 && p1.data.id === 'mat_130', 'material change is sent to the host for the database');
  ok(ev('State.cfg.materials.mat_130.cost') === 1.25, 'local state updated only after the host acknowledged');
  // failure path: host rejects -> UI shows error and does NOT change state
  click('[data-act="ent-edit"][data-id="mat_130"]'); await sleep(10); setv('[data-cfg="cost"]', '9.99'); click('[data-act="ent-save"]'); await sleep(30); click('[data-act="cf-yes"]'); await ack(false, 'You do not have permission'); await sleep(30);
  ok(ev('State.cfg.materials.mat_130.cost') === 1.25 && !!$('#toast') && $('#toast').textContent.includes('permission'), 'failed save shows the error and keeps old value');
  ev('closeModal(true)');
  // settings save (VAT) goes to pricing_settings payload
  ev("State.settingsTab='vat'; render(true)"); setv('[data-cfg="vat.rate"]', '16'); click('[data-act="sform-save"]'); await sleep(30); click('[data-act="cf-yes"]'); const p2 = await ack(); await sleep(20);
  ok(p2.op === 'settings' && p2.data.vat.rate === 16 && !('business' in p2.data) && !('permissions' in p2.data), 'VAT change persisted as pricing settings only');
  // delete of a referenced material is still blocked by the existing UI rules
  ev("State.settingsTab='materials'; render(true)"); click('[data-act="ent-del"][data-k="materials"][data-id="mat_130"]'); await sleep(20); ok($('#ov') && $('#ov').textContent.includes('Cannot delete'), 'in-use material cannot be deleted');
  ev('closeModal(true)');
  // new product through the wizard
  ev("State.settingsTab='products'; render(true)"); click('[data-act="prod-new"]'); await sleep(10); setv('[data-w="name"]', 'Mug print'); click('[data-act="wz-save"]'); await sleep(40);
  const p3 = await ack(); ok(p3.op === 'set' && p3.kind === 'products' && p3.data.name === 'Mug print', 'wizard saves a new product via the host');
  const real = errors.filter(x => !x.includes('You do not have permission')); console.log(real.length ? 'RUNTIME ERRORS:\n' + real.join('\n') : 'no runtime errors (the simulated permission failure was logged as expected)'); console.log(`\nPricing embed: ${pass} passed, ${fail} failed`); process.exit(fail || real.length ? 1 : 0);
})().catch(e => { console.log('HARNESS', e); console.log(errors.join('\n')); process.exit(1); });
