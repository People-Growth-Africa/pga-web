/**
 * Probe every /api/admin route without a session and check that none of them
 * answers anything but 401. Then send one cross-origin POST and check that the
 * CSRF guard refuses it.
 *
 *   node scripts/test-admin-auth.mjs https://www.peoplegrowthafrica.com
 *
 * This is not a read-only probe: it sends the methods that write. Every
 * unauthenticated request should be stopped by the session check before a
 * handler runs, but if one is not, it would act on that deployment. Run it
 * against a preview first, and against production only when you mean to.
 *
 * No cookie is sent and no credentials are supplied, so a 200 here is a real
 * finding: it means the handler ran without a manager.
 */
const base = process.argv[2]?.replace(/\/+$/, '');

if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/test-admin-auth.mjs <base-url>');
  process.exit(1);
}

/** Every admin endpoint, with the method that would reach its handler. */
const ROUTES = [
  ['GET', '/api/admin/posts'],
  ['PUT', '/api/admin/posts'],
  ['PUT', '/api/admin/post'],
  ['DELETE', '/api/admin/post?id=00000000-0000-0000-0000-000000000000'],
  ['POST', '/api/admin/post-status'],
  ['GET', '/api/admin/categories'],
  ['POST', '/api/admin/categories'],
  ['PUT', '/api/admin/category'],
  ['DELETE', '/api/admin/category?id=00000000-0000-0000-0000-000000000000'],
  ['POST', '/api/admin/upload'],
  ['GET', '/api/admin/ping'],
];

let failures = 0;

function report(ok, line) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

async function probe(method, path) {
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      redirect: 'manual',
    });
    report(
      response.status === 401,
      `unauthenticated ${method} ${path} -> ${response.status} (want 401)`,
    );
  } catch (error) {
    report(false, `unauthenticated ${method} ${path} -> ${error.message} (want 401)`);
  }
}

for (const [method, path] of ROUTES) {
  await probe(method, path);
}

// A browser on another site cannot make this request succeed: the Origin is not
// this host, so the guard has to answer 403 before a handler sees it.
try {
  const response = await fetch(`${base}/api/admin/posts`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://attacker.example',
    },
    body: JSON.stringify({}),
    redirect: 'manual',
  });
  report(
    response.status === 403,
    `cross-origin PUT /api/admin/posts -> ${response.status} (want 403)`,
  );
} catch (error) {
  report(false, `cross-origin PUT /api/admin/posts -> ${error.message} (want 403)`);
}

if (failures > 0) {
  console.error(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}

console.log('\nAll admin routes refused the sessionless request.');
