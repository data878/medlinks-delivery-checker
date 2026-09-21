import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { policyDate, replaceDate, updatePolicy } from '../api/update-policy-date.js';

test('India midnight, month/year rollover and ordinal dates', () => {
  for (const [input, expected] of [
    ['2026-09-21T06:00:00Z', '19th September 2026'],
    ['2026-09-21T18:29:59Z', '19th September 2026'],
    ['2026-09-21T18:30:00Z', '20th September 2026'],
    ['2026-01-01T00:00:00Z', '30th December 2025'],
    ['2024-03-02T00:00:00Z', '29th February 2024'],
    ['2026-09-13T00:00:00Z', '11th September 2026'],
    ['2026-09-23T00:00:00Z', '21st September 2026']
  ]) assert.equal(policyDate(new Date(input)), expected);
});
test('changes only date and refuses missing or ambiguous matches', () => {
  const html = '<p style="color:gold">Last Updated: 12th July 2026<br>Unchanged</p>';
  assert.equal(replaceDate(html, '19th September 2026'), html.replace('12th July', '19th September'));
  assert.throws(() => replaceDate('no date', 'x'));
  assert.throws(() => replaceDate(html + html, 'x'));
});
test('authenticated integration preserves full policy and is idempotent', async () => {
  let body = '<p>Last Updated: 12th July 2026<br>Keep all text</p>', writes = 0;
  const env = { SHOPIFY_STORE_DOMAIN: 'xdthfp-z0.myshopify.com', SHOPIFY_CLIENT_ID: 'test', SHOPIFY_CLIENT_SECRET: 'test' };
  const fetcher = async (url, options) => {
    if (url.endsWith('access_token')) return { ok: true, json: async () => ({ access_token: 'test' }) };
    const request = JSON.parse(options.body);
    if (request.query.startsWith('mutation')) {
      writes++; body = request.variables.shopPolicy.body;
      return { ok: true, json: async () => ({ data: { shopPolicyUpdate: { userErrors: [], shopPolicy: { body } } } }) };
    }
    return { ok: true, json: async () => ({ data: { shop: { id: 'gid://shopify/Shop/100429201779', shopPolicies: [{ id:'gid://shopify/ShopPolicy/53831139699', type:'PRIVACY_POLICY', body }] } } }) };
  };
  const now = new Date('2026-09-21T06:00:00Z');
  assert.equal((await updatePolicy(env, fetcher, now)).status, 'updated');
  assert.equal((await updatePolicy(env, fetcher, now)).status, 'already_current');
  assert.equal(writes, 1);
  assert.equal(body, '<p>Last Updated: 19th September 2026<br>Keep all text</p>');
});
test('public requests cannot trigger writes', async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'x'.repeat(32);
  const res = { setHeader() {}, status(n) { this.code = n; return this; }, json() {} };
  try { await handler({ method: 'GET', headers: {} }, res); assert.equal(res.code, 401); }
  finally { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old; }
});
