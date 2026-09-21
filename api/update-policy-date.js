import { timingSafeEqual } from 'node:crypto';

export function policyDate(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const date = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - 2));
  const d = date.getUTCDate();
  const suffix = d % 100 >= 11 && d % 100 <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[d % 10] || 'th');
  return `${d}${suffix} ${date.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${date.getUTCFullYear()}`;
}

export function replaceDate(body, date) {
  const pattern = /(Last Updated:\s*)\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}/gi;
  const matches = [...body.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('Expected exactly one Last Updated date; policy left unchanged');
  return body.replace(pattern, (_, label) => label + date);
}

export async function updatePolicy(env, fetcher = fetch, now = new Date()) {
  const domain = env.SHOPIFY_STORE_DOMAIN;
  if (domain !== 'xdthfp-z0.myshopify.com') throw new Error('Unexpected Shopify store domain');
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) throw new Error('Missing Shopify credentials');
  async function request(url, options) {
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Shopify request failed (HTTP ${response.status})`);
    return response.json();
  }
  // Obtain a fresh short-lived token for each run; never log credentials or tokens.
  const token = await request(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET })
  });
  if (!token.access_token) throw new Error('Shopify did not return an access token');
  async function graphql(query, variables = {}) {
    const result = await request(`https://${domain}/admin/api/2026-07/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token.access_token },
      body: JSON.stringify({ query, variables })
    });
    if (result.errors?.length) throw new Error('Shopify GraphQL request failed; check app policy scopes');
    return result.data;
  }
  async function read() {
    const data = await graphql('query { shop { id shopPolicies { id type body } } }');
    if (data.shop.id !== 'gid://shopify/Shop/100429201779') throw new Error('Unexpected Shopify store');
    const policies = data.shop.shopPolicies.filter(p => p.type === 'PRIVACY_POLICY');
    if (policies.length !== 1 || policies[0].id !== 'gid://shopify/ShopPolicy/53831139699') throw new Error('Unexpected privacy policy');
    return policies[0];
  }
  const original = await read();
  const date = policyDate(now);
  const body = replaceDate(original.body, date);
  if (body === original.body) return { success: true, status: 'already_current', date };
  // Re-read immediately before writing to avoid overwriting an intervening edit.
  if ((await read()).body !== original.body) throw new Error('Policy changed during run; retry later');
  const result = await graphql('mutation UpdatePrivacyDate($shopPolicy: ShopPolicyInput!) { shopPolicyUpdate(shopPolicy: $shopPolicy) { shopPolicy { id body } userErrors { field message } } }', {
    shopPolicy: { type: 'PRIVACY_POLICY', body }
  });
  if (result.shopPolicyUpdate?.userErrors?.length || !result.shopPolicyUpdate?.shopPolicy) throw new Error('Shopify rejected the policy update');
  if (result.shopPolicyUpdate.shopPolicy.body !== body || (await read()).body !== body) throw new Error('Policy verification failed; review saved policy');
  return { success: true, status: 'updated', date };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return res.status(503).json({ success: false, error: 'Configure CRON_SECRET (at least 32 characters)' });
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    return res.status(200).json(await updatePolicy(process.env));
  } catch (error) {
    // Only expose our controlled error messages, never raw upstream responses.
    console.error('Policy date updater failed');
    return res.status(500).json({ success: false, error: error.message });
  }
}
