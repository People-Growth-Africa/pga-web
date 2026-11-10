import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyTrafficHit, trafficClassificationCtes } from '../api/_lib/traffic-bots.ts';

const classify = (userAgent, javascriptExecuted = true, path = '/') =>
  classifyTrafficHit({ path, userAgent, javascriptExecuted });

for (const userAgent of [
  'Googlebot/2.1',
  'Twitterbot',
  'HeadlessChrome/124.0',
  'curl/8.4.0',
  'python-requests/2.31.0',
  'Go-http-client/1.1',
]) {
  assert.equal(classify(userAgent).isSuspectedBot, true, `${userAgent} should be suspected bot traffic`);
}

assert.equal(
  classify('Mozilla/5.0', true).isSuspectedBot,
  false,
  'a browser with a JS beacon should not be classified as a bot by default',
);
assert.equal(
  classify('Mozilla/5.0', false).isSuspectedBot,
  true,
  'a server-only hit without a JS beacon should be suspected',
);
assert.ok(
  classifyTrafficHit({ path: '/', userAgent: 'Mozilla/5.0', javascriptExecuted: true, requestsPerMinute: 61 })
    .reasons.includes('high_request_rate'),
  'high request rates should be reported as a classification reason',
);
assert.ok(
  classify('Mozilla/5.0', true, '/.env').reasons.includes('scanner_path'),
  'scanner paths should be reported as a classification reason',
);
assert.equal(
  classifyTrafficHit(
    { path: '/.env', userAgent: 'curl/8.4.0', javascriptExecuted: false },
    [{ rule_type: 'user_agent', pattern: '%curl%', classification: 'human' }],
  ).isSuspectedBot,
  false,
  'an explicit human rule should override automatic scoring',
);

const sql = trafficClassificationCtes();
assert.match(sql, /coalesce\(ip_hash, hit_id::text\)/i, 'unhashed IPs must not share one rate bucket');
assert.match(sql, /requests_per_minute > \d+/i, 'the SQL classifier must apply the request-rate signal');
assert.match(sql, /manual_classification/i, 'the SQL classifier must apply manual rules');

const middleware = await readFile(new URL('../middleware.ts', import.meta.url), 'utf8');
assert.match(middleware, /context\.waitUntil/, 'server capture must run after the response');
assert.match(middleware, /STATIC_ASSET_PATH/, 'static assets must not create raw hit rows');
assert.match(middleware, /\(\?!api\//, 'API routes must be excluded from middleware');
assert.match(middleware, /\.catch\(\(\) => undefined\)/, 'capture errors must not affect the response');

console.log('Traffic bot classifier checks passed.');
