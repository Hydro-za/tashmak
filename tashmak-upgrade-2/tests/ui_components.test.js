// Renders the real React components in jsdom (bundled with esbuild; Next/Supabase replaced by controllable mocks).
const { JSDOM } = require('jsdom'); const path = require('path'); const fs = require('fs'); const esbuild = require('esbuild');
const dom = new JSDOM('<!doctype html><body><div id="root"></div><button id="other">other</button></body>', { url: 'https://x.test/', pretendToBeVisual: true });
const w = dom.window; for (const [k, v] of Object.entries({ window: w, document: w.document, navigator: w.navigator, sessionStorage: w.sessionStorage, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Node: w.Node, Event: w.Event, KeyboardEvent: w.KeyboardEvent, MouseEvent: w.MouseEvent, FocusEvent: w.FocusEvent, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
Object.defineProperty(w.document, 'visibilityState', { value: 'visible' }); w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
fs.writeFileSync(path.join(__dirname, 'mocks/link.js'), "const R=require('react');module.exports=function Link(p){return R.createElement('a',{href:p.href,onClick:p.onClick},p.children)};module.exports.default=module.exports;");
fs.writeFileSync(path.join(__dirname, 'mocks/actions.js'), "module.exports={setQcResult:async(...a)=>{(module.exports.calls=module.exports.calls||[]).push(a);return{ok:true}}};");
const out = path.join(__dirname, '../.tsout/ui_bundle.js');
esbuild.buildSync({ entryPoints: [path.join(__dirname, '_entry.tsx')], bundle: true, platform: 'node', format: 'cjs', outfile: out, jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime', ...['navigation', 'supabase', 'actions', 'link'].map(n => path.join(__dirname, 'mocks/' + n + '.js'))], logLevel: 'silent',
  alias: { 'next/navigation': path.join(__dirname, 'mocks/navigation.js'), '@/lib/supabase/client': path.join(__dirname, 'mocks/supabase.js'), '@/lib/actions': path.join(__dirname, 'mocks/actions.js'), 'next/link': path.join(__dirname, 'mocks/link.js'), '@': path.join(__dirname, '..') } });
const React = require('react'); const { createRoot } = require('react-dom/client'); const { act } = require('react-dom/test-utils');
const C = require(out); const nav = require('./mocks/navigation.js'); const sb = require('./mocks/supabase.js').__state;
const sleep = ms => new Promise(r => setTimeout(r, ms)); let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const mount = async el => { const root = createRoot($('#root')); await act(async () => { root.render(el); }); return root; };
const fire = async (target, type, init) => act(async () => { target.dispatchEvent(new w.Event(type, { bubbles: true, ...init })); });
const key = async (target, k) => act(async () => { target.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true })); });
const type = async (input, v) => act(async () => { const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set; set.call(input, v); input.dispatchEvent(new w.Event('input', { bubbles: true })); });
const wait = async ms => act(async () => { await sleep(ms); });
(async () => {
  // ---------- Logo: exactly one element, no <img> pair ----------
  let root = await mount(React.createElement(C.Logo, { width: 168 }));
  ok($$('[role="img"]').length === 1 && $$('img').length === 0, 'logo renders ONE element (no duplicate images)');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  ok(!/\.logo-l|\.logo-d|\.brand img/.test(css) && css.includes('.brandlogo{') && css.includes('logo-dark.png'), 'stylesheet has a single theme-switched logo rule and no conflicting image rules');
  await act(async () => root.unmount());

  // ---------- Search ----------
  sb.searchResult['ab'] = { jobs: [{ id: 'j1', number: 'J-1001', title: 'Flyers', customer: 'Acme' }], quotes: [], customers: [{ id: 'c1', name: 'Acme', company: null }], employees: [] };
  sb.searchResult['aa'] = { jobs: [{ id: 'jA', number: 'J-AAA', title: 'Old', customer: 'Slow' }], quotes: [], customers: [], employees: [] };
  sb.searchResult['bb'] = { jobs: [{ id: 'jB', number: 'J-BBB', title: 'Fresh', customer: 'Fast' }], quotes: [], customers: [], employees: [] };
  nav.__setPath('/dashboard'); root = await mount(React.createElement(C.GlobalSearch, { jobBase: '/jobs' }));
  const input = () => $('.search input'); const results = () => $('.search .results');
  await act(async () => input().focus()); await type(input(), 'ab'); await wait(400);
  ok(!!results() && results().textContent.includes('J-1001') && results().textContent.includes('Acme'), 'typing shows results (jobs + customers)');
  await act(async () => document.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true }))); ok(!results(), 'clicking outside closes the dropdown');
  await act(async () => { input().dispatchEvent(new w.FocusEvent('focusin', { bubbles: true })); }); await wait(30); ok(!!results(), 'focusing the box again reopens the results');
  await key($('.search'), 'Escape'); ok(!results(), 'Escape closes the dropdown');
  await type(input(), 'abc'); await type(input(), 'ab'); await wait(400); ok(!!results(), 'results back after editing the query');
  await type(input(), ''); ok(!results(), 'clearing the query hides the dropdown and drops old results');
  await type(input(), 'ab'); await wait(400);
  await act(async () => { [...results().querySelectorAll('button')].find(b => b.textContent.includes('J-1001')).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
  ok(nav.__calls.pop() === '/jobs/j1' && !results() && input().value === '', 'selecting a result opens the right page, closes the dropdown and clears the box');
  await type(input(), 'ab'); await wait(400); ok(!!results(), 'results visible before navigating');
  await act(async () => nav.__setPath('/customers')); ok(!results() && input().value === '', 'navigating to another page closes the dropdown and clears stale results');
  sb.searchDelay['aa'] = 500; sb.searchDelay['bb'] = 20; await type(input(), 'aa'); await wait(300); await type(input(), 'bb'); await wait(800);
  ok(results() && results().textContent.includes('J-BBB') && !results().textContent.includes('J-AAA'), 'a slow, out-of-date response never overwrites newer results');
  const blocker = $('#other'); let clicked = 0; blocker.addEventListener('click', () => clicked++);
  await act(async () => document.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true }))); await act(async () => blocker.click()); ok(!results() && clicked === 1, 'closed dropdown does not block other controls');
  await act(async () => root.unmount());

  // ---------- Notification bell ----------
  sb.notifications = [{ id: 'n1', type: 'assigned', title: 'New job J-1001 for production', body: 'Acme', job_id: 'j1', quote_id: null, read_at: null, created_at: '2026-10-20T08:00:00Z' },
    { id: 'n2', type: 'due_soon', title: 'Job J-1002 is due today', body: 'Beta', job_id: 'j2', quote_id: null, read_at: null, created_at: '2026-10-20T09:00:00Z' },
    { id: 'n3', type: 'x', title: 'Old news', body: null, job_id: null, quote_id: null, read_at: '2026-10-19T00:00:00Z', created_at: '2026-10-19T09:00:00Z' }];
  nav.__setPath('/my-jobs'); sb.rpcCalls.length = 0;
  root = await mount(React.createElement(C.NotificationBell, { initialUnread: 0, jobBase: '/my-jobs', canQuotes: false })); await wait(30);
  ok($('.bell b') && $('.bell b').textContent === '2', 'unread badge shows the real count (2) from the database');
  ok(sb.rpcCalls.some(c => c[0] === 'refresh_deadline_notifications'), 'deadline reminders are requested once on load');
  await act(async () => $('.bell').click()); await wait(30);
  ok(!!$('.notifpanel') && $$('.npitem').length === 3 && $$('.npitem.unread').length === 2, 'clicking the bell opens a panel listing notifications with unread highlighted');
  await act(async () => $$('.npitem')[0].click()); await wait(20);
  ok(sb.rpcCalls.some(c => c[0] === 'mark_notifications_read' && c[1].p_ids && c[1].p_ids[0] === 'n1') && nav.__calls.pop() === '/my-jobs/j1', 'opening an item marks it read in the database and goes to the job');
  ok($('.bell b') && $('.bell b').textContent === '1', 'unread count drops to 1');
  await act(async () => nav.__setPath('/my-jobs')); await act(async () => $('.bell').click()); await wait(30);
  await act(async () => { [...$$('.nphead button')].find(b => b.textContent.includes('Mark all')).click(); }); await wait(20);
  ok(!$('.bell b') && $$('.npitem.unread').length === 0, 'Mark all read clears the badge and highlights (persisted via the database call)');
  await key(document, 'Escape'); await act(async () => document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); ok(!$('.notifpanel'), 'Escape closes the panel');
  await act(async () => $('.bell').click()); await wait(20); await act(async () => document.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true }))); ok(!$('.notifpanel'), 'clicking outside closes the panel');
  await act(async () => $('.bell').click()); await wait(20); await act(async () => nav.__setPath('/profile')); ok(!$('.notifpanel'), 'navigating closes the panel');
  await act(async () => root.unmount());
  sb.notifications = []; root = await mount(React.createElement(C.NotificationBell, { initialUnread: 0, jobBase: '/my-jobs', canQuotes: false })); await act(async () => $('.bell').click()); await wait(30);
  ok($('.np-empty') && $('.np-empty').textContent.includes('all caught up'), 'empty state is shown when there are no notifications');
  await act(async () => root.unmount());
  sb.failList = true; root = await mount(React.createElement(C.NotificationBell, { initialUnread: 0, jobBase: '/my-jobs', canQuotes: false })); await act(async () => $('.bell').click()); await wait(30);
  ok($('.notifpanel .alert') && $('.notifpanel').textContent.includes('Could not load'), 'a failed load shows an error with Retry (no fake data)'); sb.failList = false;
  await act(async () => root.unmount());

  // ---------- QC panel: three states, never auto-set ----------
  const props = { jobId: 'j1', status: 'qc', qcStatus: 'not_checked', checkedBy: null, checkedAt: null, note: null, canCheck: true, awaiting: true };
  root = await mount(React.createElement(C.QcPanel, props));
  ok($('.badge').textContent === 'Not Checked' && $$('#root button').length === 2 && $$('#root button').map(b => b.textContent).join() === 'PASSED,NOT PASSED', 'QC shows Not Checked with exactly two choices');
  await act(async () => root.unmount());
  root = await mount(React.createElement(C.QcPanel, { ...props, canCheck: false })); ok($$('#root button').length === 0 && document.body.textContent.includes('permission'), 'users without QC permission see no buttons');
  await act(async () => root.unmount());
  root = await mount(React.createElement(C.QcPanel, { ...props, status: 'rework', qcStatus: 'not_passed', checkedBy: 'Maya', checkedAt: '2026-10-20T10:00:00Z', note: 'Edges uneven', awaiting: false }));
  ok($('.badge').textContent === 'Not Passed' && document.body.textContent.includes('Edges uneven') && document.body.textContent.includes('Maya'), 'Not Passed shows who checked, when and the note');
  await act(async () => root.unmount());
  console.log(`\nUI components: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR', e); process.exit(1); });
