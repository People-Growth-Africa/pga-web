/**
 * IndexNow, checked at both ends: what the module decides to send, and whether
 * the admin endpoints actually trigger it.
 *
 *   npm run test:indexnow
 *
 * The network is stubbed: nothing here contacts api.indexnow.org. The suite
 * starts the real API against the real database, creates a manager and a few
 * posts, and watches the payloads the handlers try to send. That is the only way
 * to prove "a draft announces nothing" and "a failed ping does not fail the
 * publish" against the code that ships, rather than against a copy of its rules.
 *
 * Needs DATABASE_URL, and removes everything it creates.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadEnvFiles, startApiServer } from './api-server.mjs';
import {
  INDEXNOW_HOST,
  INDEXNOW_SITE,
  indexNowKey,
  indexNowPaths,
  pingIndexNow,
} from '../api/_lib/indexnow.ts';

const run = promisify(execFile);
const STAMP = Date.now().toString(36);
const EMAIL = `test-indexnow-${STAMP}@example.com`;
const PASSWORD = `Str0ng-${randomBytes(9).toString('base64url')}`;
const SLUG = `test-indexnow-${STAMP}`;
const EVENT_SLUG = `test-indexnow-event-${STAMP}`;
const SECTION_SLUG = `test-indexnow-second-${STAMP}`;

let checks = 0;
let failures = 0;
let unhandled = 0;

process.on('unhandledRejection', (reason) => {
  unhandled += 1;
  console.error('UNHANDLED REJECTION', reason);
});

function check(description, passed, detail = '') {
  checks += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${String(checks).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
  if (!passed) failures += 1;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 80));

/* ── The network stub ─────────────────────────────────────────────────────── */

const realFetch = globalThis.fetch;
const calls = [];
let shouldFail = false;

globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === 'https://api.indexnow.org/indexnow') {
    calls.push(JSON.parse(init.body));
    return shouldFail
      ? Promise.reject(new Error('simulated network failure'))
      : Promise.resolve(new Response('', { status: 200 }));
  }
  return realFetch(input, init);
};

const urlsOf = (call) => [...call.urlList].sort();
const lastCall = () => calls[calls.length - 1];

/** One caller with its own cookie jar, as the other admin suites use. */
function makeClient(origin) {
  let cookie = null;

  return async function call(pathname, options = {}) {
    const { method = 'POST', body } = options;
    const response = await fetch(`${origin}${pathname}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    for (const entry of response.headers.getSetCookie?.() ?? []) {
      const pair = entry.split(';')[0];
      if (pair && pair.includes('=')) cookie = pair;
    }

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text };
  };
}

async function hashPassword(plain) {
  const bcrypt = (await import('bcryptjs')).default;
  const preHashed = createHash('sha256').update(plain, 'utf8').digest('base64');
  return bcrypt.hash(preHashed, 12);
}

/* ── The decision, before any request is made ─────────────────────────────── */

function unitChecks() {
  console.log('\nWhat a change affects\n');

  const paths = (change) => indexNowPaths(change).sort();

  check(
    'a newly published post announces its page and the blog index',
    paths({ type: 'blog', slug: 'a-post', status: 'published', previous: null }).join(',') ===
      '/blog,/blog/a-post',
  );
  check(
    'a newly published event announces its page and the events index',
    paths({ type: 'event', slug: 'an-event', status: 'published', previous: null }).join(',') ===
      '/events,/events/an-event',
  );
  check(
    'a draft that stays a draft announces nothing',
    indexNowPaths({ type: 'blog', slug: 'a-draft', status: 'draft', previous: null }).length === 0,
  );
  check(
    'editing a draft announces nothing',
    indexNowPaths({ type: 'blog', slug: 'a-draft', status: 'draft', previous: 'draft' }).length === 0,
  );
  check(
    'unpublishing announces the page and the index',
    paths({ type: 'blog', slug: 'a-post', status: 'draft', previous: 'published' }).join(',') ===
      '/blog,/blog/a-post',
  );
  check(
    'editing a published post announces it again',
    paths({ type: 'blog', slug: 'a-post', status: 'published', previous: 'published' }).length === 2,
  );

  process.env.VERCEL_ENV = 'production';
  process.env.INDEXNOW_DEDUPE_MS = '0';

  calls.length = 0;
  pingIndexNow(['/admin/content', '/api/posts', '/blog/Not-A-Slug']);
  return tick().then(() => {
    check('admin, API and malformed paths are never sent', calls.length === 0, `${calls.length} calls`);

    calls.length = 0;
    pingIndexNow(['/blog/sent-once']);
    return tick().then(() => {
      const sent = lastCall();
      check('a ping carries the canonical host', sent?.host === INDEXNOW_HOST, sent?.host ?? 'none');
      check(
        'a ping points at the key file on the canonical host',
        sent?.keyLocation === `${INDEXNOW_SITE}/${indexNowKey()}.txt`,
      );
      check(
        'a ping only contains canonical https URLs',
        (sent?.urlList ?? []).every((url) => url.startsWith(`${INDEXNOW_SITE}/`)),
      );

      // Dedupe: with a window, the same path is not sent twice.
      process.env.INDEXNOW_DEDUPE_MS = '600000';
      calls.length = 0;
      pingIndexNow(['/blog/dedupe-check']);
      pingIndexNow(['/blog/dedupe-check']);
      return tick().then(() => {
        check('the same URL is not sent twice inside the window', calls.length === 1, `${calls.length} calls`);

        process.env.INDEXNOW_DEDUPE_MS = '0';
        pingIndexNow(['/blog/dedupe-check']);
        return tick().then(() => {
          check('once the window has passed it can be sent again', calls.length === 2, `${calls.length} calls`);

          // The production guard.
          process.env.VERCEL_ENV = 'preview';
          calls.length = 0;
          pingIndexNow(['/blog/preview-only']);
          return tick().then(() => {
            check('nothing is announced outside production', calls.length === 0);

            // A rejected request cannot escape as an unhandled rejection.
            process.env.VERCEL_ENV = 'production';
            calls.length = 0;
            shouldFail = true;
            const warnings = [];
            const originalWarn = console.warn;
            console.warn = (...args) => warnings.push(args.join(' '));

            pingIndexNow(['/blog/failing-ping']);
            return tick().then(() => {
              console.warn = originalWarn;
              shouldFail = false;
              check(
                'a failed ping is logged, not thrown',
                warnings.some((line) => line.includes('[indexnow]')) && unhandled === 0,
                `${warnings.length} warning(s), ${unhandled} unhandled`,
              );
            });
          });
        });
      });
    });
  });
}

/* ── The real handlers ────────────────────────────────────────────────────── */

async function integrationChecks() {
  loadEnvFiles({ quiet: true });
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set, so the admin triggers cannot be tested.');
    process.exit(1);
  }

  process.env.AUTH_ENABLED = 'true';
  process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
  process.env.VERCEL_ENV = 'production';
  process.env.INDEXNOW_DEDUPE_MS = '0';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

  const categories = await sql.query('SELECT id FROM categories ORDER BY name LIMIT 1');
  const categoryId = categories[0]?.id;
  if (!categoryId) {
    console.error('No category exists, and a blog post requires one.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(PASSWORD);
  await sql.transaction([
    sql`SELECT set_config('pga.promote_manager', 'on', true)`,
    sql`INSERT INTO users (email, password_hash, role, email_verified)
            VALUES (${EMAIL}, ${passwordHash}, 'manager', true)
          ON CONFLICT (email) DO UPDATE SET role = 'manager', email_verified = true`,
  ]);

  const server = await startApiServer({ quiet: true });
  const admin = makeClient(server.origin);
  let ids = {};

  console.log('\nWhat the admin endpoints trigger\n');

  try {
    const login = await admin('/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
    check('the manager signs in', login.status === 200, `status ${login.status}`);

    // Signing in does not announce anything either; start from an empty record.
    calls.length = 0;

    const draft = await admin('/api/admin/posts', {
      method: 'PUT',
      body: {
        type: 'blog',
        slug: SLUG,
        title: 'IndexNow test post',
        excerpt: 'A post used to check announcements.',
        body: 'A paragraph.',
        categoryId,
        status: 'draft',
      },
    });
    ids.post = draft.json?.post?.id;
    check('a draft is created', draft.status === 201, `status ${draft.status}`);
    await tick();
    check('creating a draft announces nothing', calls.length === 0, `${calls.length} calls`);

    const publish = await admin('/api/admin/post-status', {
      body: { id: ids.post, status: 'published' },
    });
    await tick();
    check('publishing answers 200', publish.status === 200, `status ${publish.status}`);
    check(
      'publishing announces the post and the blog index',
      JSON.stringify(urlsOf(lastCall() ?? { urlList: [] })) ===
        JSON.stringify([`${INDEXNOW_SITE}/blog`, `${INDEXNOW_SITE}/blog/${SLUG}`].sort()),
      JSON.stringify(lastCall()?.urlList ?? []),
    );

    calls.length = 0;
    const update = await admin('/api/admin/post', {
      body: {
        id: ids.post,
        type: 'blog',
        slug: SLUG,
        title: 'IndexNow test post, edited',
        excerpt: 'A post used to check announcements.',
        body: 'An edited paragraph.',
        categoryId,
        status: 'published',
      },
    });
    await tick();
    check('editing a published post answers 200', update.status === 200, `status ${update.status}`);
    check('editing a published post announces it again', calls.length === 1, `${calls.length} calls`);

    calls.length = 0;
    const unpublish = await admin('/api/admin/post-status', {
      body: { id: ids.post, status: 'draft' },
    });
    await tick();
    check('unpublishing answers 200', unpublish.status === 200, `status ${unpublish.status}`);
    check('unpublishing announces the page and the index', calls.length === 1, `${calls.length} calls`);

    calls.length = 0;
    const deleted = await admin(`/api/admin/post?id=${ids.post}`, { method: 'DELETE' });
    await tick();
    check('deleting answers 200', deleted.status === 200, `status ${deleted.status}`);
    check('deleting a draft announces nothing', calls.length === 0, `${calls.length} calls`);
    ids.post = null;

    // A second post, published then deleted: both the publish and the removal
    // are announced, which is the pair that matters for a URL that should 404.
    calls.length = 0;
    const second = await admin('/api/admin/posts', {
      method: 'PUT',
      body: {
        type: 'blog',
        slug: SECTION_SLUG,
        title: 'IndexNow test post two',
        excerpt: 'A second post.',
        body: 'A paragraph.',
        categoryId,
        status: 'published',
      },
    });
    ids.second = second.json?.post?.id;
    await tick();
    check('creating a published post announces it immediately', calls.length === 1, `${calls.length} calls`);

    calls.length = 0;
    await admin(`/api/admin/post?id=${ids.second}`, { method: 'DELETE' });
    await tick();
    check('deleting a published post announces the removal', calls.length === 1, `${calls.length} calls`);
    ids.second = null;

    // An event's index is the events one.
    calls.length = 0;
    const event = await admin('/api/admin/posts', {
      method: 'PUT',
      body: {
        type: 'event',
        slug: EVENT_SLUG,
        title: 'IndexNow test event',
        excerpt: 'An event.',
        body: 'Come along.',
        isOnline: true,
        eventStart: '2027-03-18T09:00:00.000Z',
        eventEnd: null,
        locationText: null,
        registrationUrl: null,
        status: 'published',
      },
    });
    ids.event = event.json?.post?.id;
    await tick();
    check(
      'an event announces its page and the events index',
      JSON.stringify(urlsOf(lastCall() ?? { urlList: [] })) ===
        JSON.stringify([`${INDEXNOW_SITE}/events`, `${INDEXNOW_SITE}/events/${EVENT_SLUG}`].sort()),
      JSON.stringify(lastCall()?.urlList ?? []),
    );

    // Failure must not reach the manager.
    shouldFail = true;
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    const stillOn = await admin('/api/admin/post-status', {
      body: { id: ids.event, status: 'published' },
    });
    await tick();
    console.warn = originalWarn;
    shouldFail = false;

    check('a publish still answers 200 when IndexNow is down', stillOn.status === 200, `status ${stillOn.status}`);
    const feed = await realFetch(`${server.origin}/api/posts`);
    check('the API keeps serving after a failed ping', feed.status === 200, `status ${feed.status}`);
    check(
      'the failure is logged',
      warnings.some((line) => line.includes('[indexnow]')),
      `${warnings.length} warning(s)`,
    );
  } finally {
    await server.close();
    for (const id of [ids.post, ids.second, ids.event].filter(Boolean)) {
      await sql.query('DELETE FROM posts WHERE id = $1', [id]).catch(() => {});
    }
    await sql.query('DELETE FROM posts WHERE slug LIKE $1', [`test-indexnow-${STAMP}%`]).catch(() => {});
    await sql.query('DELETE FROM users WHERE email = $1', [EMAIL]).catch(() => {});
  }
}

/* ── The CLI refuses what it must ─────────────────────────────────────────── */

async function cliChecks() {
  console.log('\nThe command line tool\n');

  const script = path.join(import.meta.dirname, 'indexnow-test.mjs');
  const key = indexNowKey();

  const noArgument = await run(process.execPath, [script], { reject: false }).catch((error) => error);
  check('it asks for a URL when given none', /Usage:/.test(`${noArgument.stderr ?? ''}${noArgument.stdout ?? ''}`));

  const foreignHost = await run(process.execPath, [script, 'https://example.com/blog/a-post']).catch(
    (error) => error,
  );
  const foreignOutput = `${foreignHost.stderr ?? ''}${foreignHost.stdout ?? ''}`;
  check('it refuses a URL that is not the canonical host', /Only https:\/\/www\.peoplegrowthafrica\.com/.test(foreignOutput));
  check('it never prints the key', !foreignOutput.includes(key));

  const badPath = await run(process.execPath, [script, '/admin/content']).catch((error) => error);
  check(
    'it refuses an admin path',
    /not a public blog or event path/.test(`${badPath.stderr ?? ''}${badPath.stdout ?? ''}`),
  );
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

try {
  await unitChecks();
  await integrationChecks();
  await cliChecks();
} catch (error) {
  console.error('\nThe IndexNow suite crashed:', error);
  failures += 1;
} finally {
  if (unhandled > 0) {
    failures += unhandled;
    console.error(`${unhandled} unhandled rejection(s).`);
  }
  if (failures > 0) {
    console.error(`\n${failures} of ${checks} checks failed.`);
    process.exit(1);
  }
  console.log(`\n${checks} checks passed.`);
}
