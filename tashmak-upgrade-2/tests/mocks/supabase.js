const state = { notifications: [], searchDelay: {}, searchResult: {}, rpcCalls: [], failList: false };
function table(name) {
  let head = false;
  const chain = { select(_c, o) { head = !!(o && o.head); return chain; }, order() { return chain; }, limit() { return chain; }, is() { return chain; }, eq() { return chain; },
    then(res) {
      if (state.failList && !head) return res({ data: null, error: { message: 'boom' } });
      const rows = state.notifications; return res(head ? { count: rows.filter(n => !n.read_at).length, error: null } : { data: rows, error: null });
    } };
  return chain;
}
module.exports = { __state: state, createClient: () => ({
  from: table,
  rpc: (fn, args) => {
    state.rpcCalls.push([fn, args]);
    if (fn === 'global_search') { const q = args.p_q; return new Promise(r => setTimeout(() => r({ data: state.searchResult[q] || { jobs: [], quotes: [], customers: [], employees: [] }, error: null }), state.searchDelay[q] || 10)); }
    if (fn === 'mark_notifications_read') { const ids = args.p_ids; state.notifications.forEach(n => { if (!n.read_at && (!ids || ids.includes(n.id))) n.read_at = 'now'; }); return Promise.resolve({ data: 1, error: null }); }
    return Promise.resolve({ data: 0, error: null });
  } }) };
