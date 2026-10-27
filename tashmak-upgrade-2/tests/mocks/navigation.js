const React = require('react');
let path = '/dashboard'; const subs = new Set(); const calls = [];
const set = p => { path = p; subs.forEach(f => f()); };
module.exports = {
  __calls: calls, __setPath: set, __getPath: () => path,
  usePathname: () => React.useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => path, () => path),
  useRouter: () => ({ push: h => { calls.push(h); set(h); }, replace: h => { calls.push(h); set(h); }, refresh: () => {} })
};
