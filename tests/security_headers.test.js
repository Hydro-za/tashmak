const assert = require('node:assert/strict');

(async () => {
  const config = (await import('../next.config.mjs')).default;
  const rules = await config.headers();
  const appHeaders = rules.find(rule => rule.source === '/(.*)')?.headers || [];
  const headers = Object.fromEntries(appHeaders.map(({ key, value }) => [key.toLowerCase(), value]));

  assert.equal(headers['x-frame-options'], 'SAMEORIGIN', 'the app can frame its own embedded screens');
  assert.equal(headers['content-security-policy'], "frame-ancestors 'self'", 'other sites cannot frame the app');
  console.log('Security headers: same-origin iframe allowed; external framing denied');
})().catch(error => { console.error(error); process.exitCode = 1; });
