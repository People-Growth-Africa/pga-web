/**
 * Content admin test suite. Runs the real API over HTTP against a real
 * database and checks the things that would be dangerous to assume:
 *
 *   - a manager account cannot be produced by public signup
 *   - every admin endpoint refuses a missing session and a non-manager session
 *   - a manager can create, edit, publish, unpublish and delete blog posts and
 *     events, and the type and date rules are enforced by the server
 *   - a draft is reachable from neither /api/posts nor the sitemap, whichever
 *     type it is
 *   - /updates is gone: the old feed endpoint answers 404
 *   - a published post's page carries its own head tags and a real status code
 *   - categories can be created, renamed and deleted, and a category with posts
 *     is refused until its posts are moved
 *
 *   npm run test:content-admin
 *
 * Needs DATABASE_URL (and DATABASE_URL_UNPOOLED for clean up) in
 * .env.development.local, .env.local or .env. Every row this creates carries a
 * `test-content-` prefix and is removed at the end, including the throwaway
 * accounts.
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnvFiles, startApiServer } from './api-server.mjs';
import { checkApiImports } from './check-api-imports.mjs';

const STAMP = Date.now().toString(36);
const TALENT_EMAIL = `test-content-talent-${STAMP}@example.com`;
const MANAGER_EMAIL = `test-content-manager-${STAMP}@example.com`;
const PASSWORD = `Str0ng-${randomBytes(9).toString('base64url')}`;
const POST_PREFIX = `test-content-${STAMP}`;
const BLOG_SLUG = `${POST_PREFIX}-post`;
const EVENT_SLUG = `${POST_PREFIX}-event`;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const SITE = 'https://www.peoplegrowthafrica.com';

/** The page handler reads dist/spa-fallback.html; without a build it cannot run. */
const built = fs.existsSync(path.join(root, 'dist', 'spa-fallback.html'));

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
}

/** Documented as deliberately not run, rather than silently counted as passing. */
function skip(number, description, reason) {
  results.push({ number, description, passed: true, skipped: true, detail: reason });
  console.log(`SKIP  ${String(number).padStart(2)}. ${description} (${reason})`);
}

/* ── HTTP with a cookie jar ───────────────────────────────────────────────── */

/** One caller: its own cookie, so a manager and a talent never blur together. */
function makeClient(origin) {
  let cookie = null;

  return async function call(path, options = {}) {
    const { method = 'POST', body, headers = {} } = options;
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });

    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookie) {
      const pair = entry.split(';')[0];
      if (pair && pair.includes('=')) cookie = pair;
    }

    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: response.status, json, text, headers: response.headers };
  };
}

/* ── Database helpers ─────────────────────────────────────────────────────── */

/**
 * Password hashing exactly as api/_lib/security.ts does it: sha256 first (so
 * bcrypt sees a fixed width input), then 12 rounds. Duplicated because this is
 * a .mjs script and that module is TypeScript compiled for another project.
 */
async function hashPassword(plain) {
  const bcrypt = (await import('bcryptjs')).default;
  const preHashed = createHash('sha256').update(plain, 'utf8').digest('base64');
  return bcrypt.hash(preHashed, 12);
}

/** The bodies a blog post is written with, so each test only states its change. */
function blogBody(overrides = {}) {
  return {
    type: 'blog',
    slug: BLOG_SLUG,
    title: 'A test post',
    excerpt: 'Short summary for the test.',
    body: 'First paragraph.\n\nSecond paragraph with **bold**.',
    categoryId: null,
    coverImageUrl: null,
    linkLabel: null,
    linkUrl: null,
    status: 'draft',
    ...overrides,
  };
}

function eventBody(overrides = {}) {
  return {
    type: 'event',
    slug: EVENT_SLUG,
    title: 'A test event',
    excerpt: 'One evening with the team.',
    body: 'Come along.',
    isOnline: true,
    eventStart: '2027-03-18T08:00:00.000Z',
    eventEnd: null,
    locationText: null,
    registrationUrl: null,
    status: 'draft',
    ...overrides,
  };
}

async function main() {
  loadEnvFiles({ quiet: true });

  const isLocal = !process.argv.find((arg) => arg.startsWith('--base-url='));

  if (isLocal) {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
      console.error(
        [
          '',
          'DATABASE_URL is not set.',
          '',
          'Either pull the Vercel environment (vercel env pull .env.development.local --yes)',
          'or point the suite at a deployment:',
          '  npm run test:content-admin -- --base-url=https://your-preview.vercel.app',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
    // The accounts API answers 410 unless this is on; the whole suite is about
    // what it does when it is on.
    process.env.AUTH_ENABLED = 'true';
    // Count per instance locally, and never let a real send happen.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.RESEND_API_KEY;
  }

  // Every route has to import cleanly as a native ES module before any request
  // is worth making - the same check test:auth runs first.
  const imports = await checkApiImports({ quiet: true });
  if (!imports.ok) {
    console.error(`\n${imports.summary}\n\nRun \`node scripts/check-api-imports.mjs\` for the details.\n`);
    process.exit(1);
  }

  const configuredBaseUrl = process.argv.find((arg) => arg.startsWith('--base-url='))?.split('=')[1];
  const server = isLocal ? await startApiServer({ quiet: true }) : null;
  const origin = configuredBaseUrl ?? server.origin;

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

  const anonymous = makeClient(origin);
  const talent = makeClient(origin);
  const manager = makeClient(origin);

  let createdPostId = null;
  let createdEventId = null;
  let createdCategoryId = null;
  let secondCategoryId = null;

  try {
    /* ── Accounts ────────────────────────────────────────────────────────── */

    // 1. The signup schemas accept only 'talent' and 'employer'. A request that
    //    asks for 'manager' has to be refused before it reaches the database.
    const managerSignup = await anonymous('/api/auth/signup', {
      body: {
        role: 'manager',
        name: 'Not Allowed',
        email: MANAGER_EMAIL,
        password: PASSWORD,
        acceptedTerms: true,
      },
    });
    check(
      1,
      'public signup cannot create a manager',
      managerSignup.status === 400,
      `status ${managerSignup.status}`,
    );

    const talentSignup = await talent('/api/auth/signup', {
      body: {
        role: 'talent',
        name: 'Test Talent',
        email: TALENT_EMAIL,
        password: PASSWORD,
        field: 'Engineering',
        acceptedTerms: true,
      },
    });
    check(
      2,
      'a talent account can sign up',
      talentSignup.status >= 200 && talentSignup.status < 300,
      `status ${talentSignup.status}`,
    );

    // The manager exists, created the only way one can be. The guard that
    // blocks public signups is relaxed for this transaction alone - Neon's HTTP
    // driver gives each query its own session, so the setting and the write have
    // to travel together to be seen by the trigger.
    const passwordHash = await hashPassword(PASSWORD);
    await sql.transaction([
      sql`SELECT set_config('pga.promote_manager', 'on', true)`,
      sql`INSERT INTO users (email, password_hash, role, email_verified)
              VALUES (${MANAGER_EMAIL}, ${passwordHash}, 'manager', true)
            ON CONFLICT (email) DO UPDATE SET role = 'manager', email_verified = true`,
    ]);

    const managerLogin = await manager('/api/auth/login', {
      body: { email: MANAGER_EMAIL, password: PASSWORD },
    });
    // The redirect matters as much as the status: it is what the page follows
    // after signing in. A manager who is sent to the employer dashboard lands on
    // a page their role cannot use, and a role branch that only knows talent and
    // employer does exactly that.
    check(
      3,
      'the manager can sign in and is sent to the content panel',
      managerLogin.status >= 200 &&
        managerLogin.status < 300 &&
        managerLogin.json?.redirect === '/admin/content',
      `status ${managerLogin.status}, redirect ${managerLogin.json?.redirect ?? 'none'}`,
    );

    /* ── The gate ────────────────────────────────────────────────────────── */

    const adminNoSession = await anonymous('/api/admin/posts', { method: 'GET' });
    check(
      4,
      'admin list refuses a request with no session',
      adminNoSession.status === 401,
      `status ${adminNoSession.status}`,
    );

    const adminTalent = await talent('/api/admin/posts', { method: 'GET' });
    check(
      5,
      'admin list refuses a talent session',
      adminTalent.status === 403,
      `status ${adminTalent.status} ${adminTalent.json?.code ?? ''}`,
    );

    const uploadTalent = await talent('/api/admin/upload', { body: { data: 'AAAA' } });
    check(
      6,
      'upload endpoint refuses a talent session',
      uploadTalent.status === 403,
      `status ${uploadTalent.status}`,
    );

    const categoriesTalent = await talent('/api/admin/categories', { method: 'GET' });
    check(
      7,
      'categories endpoint refuses a talent session',
      categoriesTalent.status === 403,
      `status ${categoriesTalent.status}`,
    );

    const adminManager = await manager('/api/admin/posts', { method: 'GET' });
    check(
      8,
      'admin list allows a manager session',
      adminManager.status === 200 && Array.isArray(adminManager.json?.posts),
      `status ${adminManager.status}`,
    );

    /* ── Posts ───────────────────────────────────────────────────────────── */

    const firstCategory = adminManager.json?.categories?.[0];
    check(
      9,
      'the six default categories are seeded',
      (adminManager.json?.categories?.length ?? 0) >= 6,
      `${adminManager.json?.categories?.length ?? 0} categories`,
    );

    const created = await manager('/api/admin/posts', {
      method: 'PUT',
      body: blogBody({ title: 'A test post', categoryId: firstCategory.id }),
    });
    createdPostId = created.json?.post?.id ?? null;
    check(
      10,
      'a manager can create a draft blog post',
      created.status === 201 && Boolean(createdPostId) && created.json?.post?.type === 'blog',
      `status ${created.status}`,
    );

    const duplicate = await manager('/api/admin/posts', {
      method: 'PUT',
      body: blogBody({ title: 'Collision', excerpt: '', body: '', categoryId: firstCategory.id }),
    });
    check(
      11,
      'a duplicate slug is refused rather than renamed',
      duplicate.status === 409 && duplicate.json?.code === 'slug_taken',
      `status ${duplicate.status}`,
    );

    const badCategory = await manager('/api/admin/posts', {
      method: 'PUT',
      body: blogBody({
        slug: `${POST_PREFIX}-nope`,
        title: 'Bad category',
        excerpt: '',
        body: '',
        categoryId: '00000000-0000-4000-8000-000000000000',
      }),
    });
    check(
      12,
      'an unknown category is refused',
      badCategory.status === 400,
      `status ${badCategory.status}`,
    );

    /* ── The type rules, enforced server side ───────────────────────────── */

    const noType = await manager('/api/admin/posts', {
      method: 'PUT',
      body: (() => {
        const body = blogBody({ slug: `${POST_PREFIX}-untyped`, categoryId: firstCategory.id });
        delete body.type;
        return body;
      })(),
    });
    check(
      13,
      'a post without a type is refused',
      noType.status === 400 && Boolean(noType.json?.fields?.type),
      `status ${noType.status} field ${noType.json?.fields?.type ?? 'none'}`,
    );

    const badType = await manager('/api/admin/posts', {
      method: 'PUT',
      body: blogBody({ slug: `${POST_PREFIX}-wrong-type`, type: 'update' }),
    });
    check(
      14,
      'an unknown type is refused',
      badType.status === 400,
      `status ${badType.status}`,
    );

    const noStart = await manager('/api/admin/posts', {
      method: 'PUT',
      body: eventBody({ slug: `${POST_PREFIX}-no-start`, eventStart: null }),
    });
    check(
      15,
      'an event without a start time is refused',
      noStart.status === 400 && Boolean(noStart.json?.fields?.eventStart),
      `status ${noStart.status} field ${noStart.json?.fields?.eventStart ?? 'none'}`,
    );

    const backwards = await manager('/api/admin/posts', {
      method: 'PUT',
      body: eventBody({
        slug: `${POST_PREFIX}-backwards`,
        eventStart: '2027-03-18T08:00:00.000Z',
        eventEnd: '2027-03-18T07:00:00.000Z',
      }),
    });
    check(
      16,
      'an event ending before it starts is refused',
      backwards.status === 400 && Boolean(backwards.json?.fields?.eventEnd),
      `status ${backwards.status} field ${backwards.json?.fields?.eventEnd ?? 'none'}`,
    );

    const noVenue = await manager('/api/admin/posts', {
      method: 'PUT',
      body: eventBody({ slug: `${POST_PREFIX}-no-venue`, isOnline: false, locationText: null }),
    });
    check(
      17,
      'an in-person event without a venue is refused',
      noVenue.status === 400 && Boolean(noVenue.json?.fields?.locationText),
      `status ${noVenue.status} field ${noVenue.json?.fields?.locationText ?? 'none'}`,
    );

    // An online event needs no venue, so the same body without one is accepted.
    const createdEvent = await manager('/api/admin/posts', {
      method: 'PUT',
      body: eventBody({ title: 'A test event' }),
    });
    createdEventId = createdEvent.json?.post?.id ?? null;
    check(
      18,
      'an online event with no venue is accepted',
      createdEvent.status === 201 &&
        Boolean(createdEventId) &&
        createdEvent.json?.post?.type === 'event' &&
        createdEvent.json?.post?.is_online === true,
      `status ${createdEvent.status}`,
    );
    check(
      19,
      'the event keeps its UTC instant',
      createdEvent.json?.post?.event_start === '2027-03-18T08:00:00.000Z',
      String(createdEvent.json?.post?.event_start ?? 'null'),
    );

    /* ── Drafts are private, on both routes ─────────────────────────────── */

    const feedWhileDraft = await anonymous('/api/posts', { method: 'GET' });
    const draftSlugs = new Set((feedWhileDraft.json?.posts ?? []).map((post) => post.slug));
    check(
      20,
      'a draft blog post is not in the public feed',
      feedWhileDraft.status === 200 && !draftSlugs.has(BLOG_SLUG),
      `status ${feedWhileDraft.status}`,
    );
    check(
      21,
      'a draft event is not in the public feed',
      feedWhileDraft.status === 200 && !draftSlugs.has(EVENT_SLUG),
      `status ${feedWhileDraft.status}`,
    );

    const sitemapWhileDraft = await anonymous('/api/sitemap', { method: 'GET' });
    check(
      22,
      'a draft is in neither section of the sitemap',
      sitemapWhileDraft.status === 200 &&
        !sitemapWhileDraft.text.includes(`/blog/${BLOG_SLUG}`) &&
        !sitemapWhileDraft.text.includes(`/events/${EVENT_SLUG}`),
      `status ${sitemapWhileDraft.status}`,
    );

    /* ── /updates is gone ────────────────────────────────────────────────── */

    const oldFeed = await anonymous('/api/updates', { method: 'GET' });
    check(
      23,
      'the retired /api/updates endpoint answers 404',
      oldFeed.status === 404,
      `status ${oldFeed.status}`,
    );

    /* ── Publish ─────────────────────────────────────────────────────────── */

    const published = await manager('/api/admin/post-status', {
      method: 'POST',
      body: { id: createdPostId, status: 'published' },
    });
    check(
      24,
      'a manager can publish a post',
      published.status === 200 && published.json?.post?.status === 'published',
      `status ${published.status}`,
    );
    check(
      25,
      'publishing stamps published_at',
      Boolean(published.json?.post?.published_at),
      String(published.json?.post?.published_at ?? 'null'),
    );

    const publishedEvent = await manager('/api/admin/post-status', {
      method: 'POST',
      body: { id: createdEventId, status: 'published' },
    });
    check(
      26,
      'a manager can publish an event',
      publishedEvent.status === 200 && publishedEvent.json?.post?.status === 'published',
      `status ${publishedEvent.status}`,
    );

    const feedWhilePublished = await anonymous('/api/posts', { method: 'GET' });
    const feedRows = feedWhilePublished.json?.posts ?? [];
    const blogRow = feedRows.find((post) => post.slug === BLOG_SLUG);
    const eventRow = feedRows.find((post) => post.slug === EVENT_SLUG);
    check(
      27,
      'the published blog post appears in the feed with its type',
      blogRow?.type === 'blog' && Boolean(blogRow?.body),
      `status ${feedWhilePublished.status}, type ${blogRow?.type ?? 'none'}`,
    );
    check(
      28,
      'the published event appears in the feed with its instant',
      eventRow?.type === 'event' && eventRow?.eventStart === '2027-03-18T08:00:00.000Z',
      `type ${eventRow?.type ?? 'none'}, start ${eventRow?.eventStart ?? 'none'}`,
    );

    const sitemapPublished = await anonymous('/api/sitemap', { method: 'GET' });
    check(
      29,
      'the published blog post is added to the sitemap under /blog',
      sitemapPublished.text.includes(`${SITE}/blog/${BLOG_SLUG}`),
      `status ${sitemapPublished.status}`,
    );
    check(
      30,
      'the published event is added to the sitemap under /events',
      sitemapPublished.text.includes(`${SITE}/events/${EVENT_SLUG}`),
      `status ${sitemapPublished.status}`,
    );
    check(
      31,
      'the sitemap keeps its static entries',
      sitemapPublished.text.includes(`${SITE}/blog`) &&
        sitemapPublished.text.includes(`${SITE}/events`),
    );
    check(
      32,
      'the sitemap carries no /updates URL any more',
      !sitemapPublished.text.includes('/updates'),
    );

    /* ── The page head, at request time ─────────────────────────────────── */

    // /blog/<slug> is rewritten to /api/post by vercel.json; locally the same
    // handler is reached by its own path, which is what the rewrite targets.
    const page = (type, slug) =>
      anonymous(`/api/post?path=post&type=${type}&slug=${encodeURIComponent(slug)}`, {
        method: 'GET',
        headers: { Accept: 'text/html' },
      });

    if (built) {
      const blogPage = await page('blog', BLOG_SLUG);
      const blogHead = blogPage.text.slice(0, blogPage.text.indexOf('</head>'));
      check(
        33,
        'a published blog post answers 200 with its own title in the HTML',
        blogPage.status === 200 && blogHead.includes('<title>A test post</title>'),
        `status ${blogPage.status}`,
      );
      check(
        34,
        'its canonical and Open Graph URL are the /blog URL',
        blogHead.includes(`<link rel="canonical" href="${SITE}/blog/${BLOG_SLUG}" />`) &&
          blogHead.includes(`property="og:url" content="${SITE}/blog/${BLOG_SLUG}"`),
      );
      check(
        35,
        'it carries the Twitter card tags',
        blogHead.includes('name="twitter:card"') &&
          blogHead.includes('name="twitter:title"') &&
          blogHead.includes('name="twitter:image"'),
      );
      check(
        36,
        'its structured data is a BlogPosting',
        /"@type":"BlogPosting"/.test(blogHead) || /"@type": "BlogPosting"/.test(blogHead),
      );

      const eventPage = await page('event', EVENT_SLUG);
      const eventHead = eventPage.text.slice(0, eventPage.text.indexOf('</head>'));
      check(
        37,
        'a published event answers 200 with Event structured data',
        eventPage.status === 200 &&
          (/"@type":"Event"/.test(eventHead) || /"@type": "Event"/.test(eventHead)),
        `status ${eventPage.status}`,
      );
      check(
        38,
        'the event schema carries startDate, attendance mode and a virtual location',
        eventHead.includes('"startDate":"2027-03-18T08:00:00.000Z"') &&
          eventHead.includes('OnlineEventAttendanceMode') &&
          eventHead.includes('VirtualLocation'),
      );

      const missing = await page('blog', `${POST_PREFIX}-missing`);
      const missingHead = missing.text.slice(0, missing.text.indexOf('</head>'));
      check(
        39,
        'an unknown slug answers a real 404 and asks not to be indexed',
        missing.status === 404 && missingHead.includes('name="robots" content="noindex'),
        `status ${missing.status}`,
      );

      const wrongSection = await page('blog', EVENT_SLUG);
      check(
        40,
        'an event slug requested as a blog post is a 404',
        wrongSection.status === 404,
        `status ${wrongSection.status}`,
      );

      // A draft must not be reachable by its page URL either. The event is
      // unpublished for this, then restored, so the later delete still has a row.
      await manager('/api/admin/post-status', {
        method: 'POST',
        body: { id: createdEventId, status: 'draft' },
      });
      const draftPage = await page('event', EVENT_SLUG);
      check(
        41,
        'a draft slug answers 404 on its page route',
        draftPage.status === 404,
        `status ${draftPage.status}`,
      );
      await manager('/api/admin/post-status', {
        method: 'POST',
        body: { id: createdEventId, status: 'published' },
      });
    } else {
      for (const [number, description] of [
        [33, 'a published blog post answers 200 with its own title in the HTML'],
        [34, 'its canonical and Open Graph URL are the /blog URL'],
        [35, 'it carries the Twitter card tags'],
        [36, 'its structured data is a BlogPosting'],
        [37, 'a published event answers 200 with Event structured data'],
        [38, 'the event schema carries startDate, attendance mode and a virtual location'],
        [39, 'an unknown slug answers a real 404 and asks not to be indexed'],
        [40, 'an event slug requested as a blog post is a 404'],
        [41, 'a draft slug answers 404 on its page route'],
      ]) {
        skip(number, description, 'dist/ is not built');
      }
    }

    /* ── Edit ────────────────────────────────────────────────────────────── */

    const edited = await manager('/api/admin/post', {
      method: 'PUT',
      body: blogBody({
        id: createdPostId,
        title: 'A test post, edited',
        excerpt: 'Updated summary.',
        body: 'Updated body.',
        categoryId: firstCategory.id,
        linkLabel: 'Read more',
        linkUrl: 'https://example.com',
        status: 'published',
      }),
    });
    check(
      42,
      'a manager can edit a post',
      edited.status === 200 && edited.json?.post?.title === 'A test post, edited',
      `status ${edited.status}`,
    );

    const unpublish = await manager('/api/admin/post-status', {
      method: 'POST',
      body: { id: createdPostId, status: 'draft' },
    });
    const feedAfterUnpublish = await anonymous('/api/posts', { method: 'GET' });
    check(
      43,
      'unpublishing removes it from the public feed again',
      unpublish.status === 200 &&
        !(feedAfterUnpublish.json?.posts ?? []).some((post) => post.slug === BLOG_SLUG),
      `status ${unpublish.status}`,
    );

    /* ── Categories ──────────────────────────────────────────────────────── */

    const newCategory = await manager('/api/admin/categories', {
      method: 'POST',
      body: { name: `Test Category ${STAMP}`, slug: `test-category-${STAMP}` },
    });
    createdCategoryId = newCategory.json?.category?.id ?? null;
    check(
      44,
      'a manager can add a category',
      newCategory.status === 201 && Boolean(createdCategoryId),
      `status ${newCategory.status}`,
    );

    const renamed = await manager('/api/admin/category', {
      method: 'PUT',
      body: { id: createdCategoryId, name: `Renamed ${STAMP}`, slug: `renamed-${STAMP}` },
    });
    check(
      45,
      'a manager can rename a category',
      renamed.status === 200 && renamed.json?.category?.name === `Renamed ${STAMP}`,
      `status ${renamed.status}`,
    );

    // Move the post across so the new category has something in it.
    await manager('/api/admin/post', {
      method: 'PUT',
      body: blogBody({
        id: createdPostId,
        title: 'A test post, edited',
        excerpt: 'Updated summary.',
        body: 'Updated body.',
        categoryId: createdCategoryId,
      }),
    });

    const blockedDelete = await manager(`/api/admin/category?id=${createdCategoryId}`, {
      method: 'DELETE',
    });
    check(
      46,
      'deleting a category with posts is refused',
      blockedDelete.status === 409 && blockedDelete.json?.code === 'category_in_use',
      `status ${blockedDelete.status} ${blockedDelete.json?.code ?? ''}`,
    );
    check(
      47,
      'the refusal offers somewhere to move the posts',
      Array.isArray(blockedDelete.json?.options) && blockedDelete.json.options.length > 0,
      `${blockedDelete.json?.options?.length ?? 0} options`,
    );

    secondCategoryId = firstCategory.id;
    const reassigned = await manager(
      `/api/admin/category?id=${createdCategoryId}&moveTo=${secondCategoryId}`,
      { method: 'DELETE' },
    );
    check(
      48,
      'the reassign flow moves the posts and deletes the category',
      reassigned.status === 200 && (reassigned.json?.movedPosts ?? 0) >= 1,
      `status ${reassigned.status} moved ${reassigned.json?.movedPosts ?? 0}`,
    );
    createdCategoryId = null;

    /* ── Delete ──────────────────────────────────────────────────────────── */

    const deletedPost = await manager(`/api/admin/post?id=${createdPostId}`, {
      method: 'DELETE',
    });
    check(
      49,
      'a manager can delete a post',
      deletedPost.status === 200,
      `status ${deletedPost.status}`,
    );
    createdPostId = null;

    const feedAfterDelete = await anonymous('/api/posts', { method: 'GET' });
    check(
      50,
      'a deleted post is gone from the public feed',
      !(feedAfterDelete.json?.posts ?? []).some((post) => post.slug === BLOG_SLUG),
    );

    const deletedEvent = await manager(`/api/admin/post?id=${createdEventId}`, {
      method: 'DELETE',
    });
    check(
      51,
      'a manager can delete an event',
      deletedEvent.status === 200,
      `status ${deletedEvent.status}`,
    );
    createdEventId = null;

    const sitemapAfterDelete = await anonymous('/api/sitemap', { method: 'GET' });
    check(
      52,
      'a deleted event leaves the sitemap',
      !sitemapAfterDelete.text.includes(EVENT_SLUG),
    );

    /* ── Which blobs may be deleted ──────────────────────────────────────── */

    // Replacing or deleting a post removes the cover files it no longer points
    // at. The guard is what stops that from becoming "delete any URL a manager
    // pasted into the cover field".
    const { ownCoverTargets } = await import('../api/_lib/cover-blobs.ts');
    const ours = 'https://store1.public.blob.vercel-storage.com/covers/full/cover-abc.webp';
    check(53, 'a cover blob in our store is ours to delete', ownCoverTargets([ours]).length === 1);
    check(
      54,
      'a pasted external image is never deleted',
      ownCoverTargets(['https://images.unsplash.com/photo-123.jpg']).length === 0,
    );
    check(
      55,
      'a blob outside the covers prefix is left alone',
      ownCoverTargets(['https://store1.public.blob.vercel-storage.com/other/file.webp']).length === 0,
    );
    check(
      56,
      'a host that only looks like the blob store is refused',
      ownCoverTargets([
        'https://store1.public.blob.vercel-storage.com.evil.example/covers/x.webp',
        'http://store1.public.blob.vercel-storage.com/covers/x.webp',
      ]).length === 0,
    );
    check(
      57,
      'a full and thumbnail pair collapses to two entries',
      ownCoverTargets([ours, ours, `${ours.replace('/full/', '/thumb/')}`, null]).length === 2,
    );

    /* ── Uploads ─────────────────────────────────────────────────────────── */

    const noBlobToken = !process.env.BLOB_READ_WRITE_TOKEN;
    const upload = await manager('/api/admin/upload', {
      body: {
        filename: 'x.png',
        contentType: 'image/png',
        variant: 'full',
        data: 'iVBORw0KGgo=',
      },
    });
    if (noBlobToken) {
      check(
        58,
        'upload reports that Blob is not configured',
        upload.status === 503 && upload.json?.code === 'uploads_disabled',
        `status ${upload.status}`,
      );
    } else {
      check(
        58,
        'a non-image upload is refused by its magic bytes',
        upload.status === 400,
        `status ${upload.status}`,
      );
    }

    const stillThere = await manager('/api/admin/posts', { method: 'GET' });
    check(
      59,
      'the admin list answers the manager after all of that',
      stillThere.status === 200,
      `status ${stillThere.status}`,
    );

    /* ── Delivery ────────────────────────────────────────────────────────── */

    const cachedFeed = await anonymous('/api/posts', { method: 'GET' });
    const cacheControl = cachedFeed.headers?.get('cache-control') ?? '';
    check(
      60,
      'the public feed is CDN-cached with a bounded stale window',
      cacheControl.includes('s-maxage=30') && cacheControl.includes('stale-while-revalidate=60'),
      cacheControl,
    );

    /* ── Session lifetime ────────────────────────────────────────────────── */

    // A manager session is deliberately short lived, in two different ways, and
    // both are enforced by the server rather than by the panel. These tokens are
    // minted here with the same secret the server is running with, so each one
    // states exactly one kind of lateness.
    const { SignJWT } = await import('jose');
    const [managerRow] = await sql`SELECT id, token_version FROM users WHERE email = ${MANAGER_EMAIL}`;
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const cookieName = process.env.VERCEL_ENV === 'production' ? '__Host-session' : 'session';

    async function mintManager({ issuedAt, expiresAt, absoluteStart }) {
      return new SignJWT({ role: 'manager', ver: managerRow.token_version, abs: absoluteStart })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(managerRow.id)
        .setIssuer('peoplegrowthafrica.com')
        .setAudience('pga-auth')
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(secret);
    }

    async function callWithToken(token, path = '/api/admin/posts') {
      const response = await fetch(`${origin}${path}`, {
        method: 'GET',
        headers: { Cookie: `${cookieName}=${token}` },
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, json, headers: response.headers };
    }

    const absoluteExpired = await callWithToken(
      await mintManager({ issuedAt: nowSeconds, expiresAt: nowSeconds + 3600, absoluteStart: nowSeconds - 13 * 3600 }),
    );
    check(
      61,
      'a manager signed in for more than 12 hours is refused, however active they were',
      absoluteExpired.status === 401 && absoluteExpired.json?.code === 'session_expired',
      `status ${absoluteExpired.status}, code ${absoluteExpired.json?.code ?? 'none'}`,
    );

    const idleExpired = await callWithToken(
      await mintManager({
        issuedAt: nowSeconds - 3700,
        expiresAt: nowSeconds - 100,
        absoluteStart: nowSeconds - 3700,
      }),
    );
    check(
      62,
      'a manager session left idle for over an hour is refused, and says it expired',
      idleExpired.status === 401 && idleExpired.json?.code === 'session_expired',
      `status ${idleExpired.status}, code ${idleExpired.json?.code ?? 'none'}`,
    );

    const activeToken = await mintManager({
      issuedAt: nowSeconds - 600,
      expiresAt: nowSeconds + 3000,
      absoluteStart: nowSeconds - 2 * 3600,
    });
    const stillActive = await callWithToken(activeToken);
    const renewedCookie = stillActive.headers?.get('set-cookie') ?? '';
    check(
      63,
      'a working manager is let through and their session is renewed',
      stillActive.status === 200 && /Max-Age=3600\b/.test(renewedCookie),
      `status ${stillActive.status}, set-cookie ${renewedCookie ? 'present' : 'missing'}`,
    );

    const ping = await manager('/api/admin/ping', { method: 'GET' });
    check(
      64,
      'the panel can keep its session alive while a manager writes',
      ping.status === 200 && ping.json?.ok === true,
      `status ${ping.status}`,
    );
    const anonymousPing = await anonymous('/api/admin/ping', { method: 'GET' });
    check(
      65,
      'the keep-alive is not a way in for anyone else',
      anonymousPing.status === 401 && anonymousPing.json?.code === 'sign_in_required',
      `status ${anonymousPing.status}, code ${anonymousPing.json?.code ?? 'none'}`,
    );

    const loginCookie = managerLogin.headers?.get('set-cookie') ?? '';
    check(
      66,
      'the cookie a manager signs in with lasts one hour, not the seven days others get',
      /Max-Age=3600\b/.test(loginCookie),
      loginCookie ? loginCookie.replace(/session=[^;]+/, 'session=…') : 'no set-cookie',
    );

    /* ── Cover media ─────────────────────────────────────────────────────── */

    // A Blob store created private serves nothing without the token, so an upload
    // answers with a path this deployment serves instead of a store URL. The
    // mapping is a pure function, and it is the only thing standing between a
    // request and an arbitrary blob read, so it is checked directly.
    const { coverUrl, coverPathname, isCoverPathname } = await import('../api/_lib/cover-url.ts');
    const { postCreateSchema } = await import('../api/_lib/validation.ts');

    const storedName = 'cover-1a2b3c-9f8e7d6c.webp';
    check(
      67,
      'a cover in a private store is served from this site, not from the store',
      coverUrl(`covers/full/${storedName}`) === `/api/media/covers/full/${storedName}`,
      coverUrl(`covers/full/${storedName}`),
    );
    check(
      68,
      'a stored cover path and an older store URL both map back to their pathname',
      coverPathname(`/api/media/covers/full/${storedName}`) === `covers/full/${storedName}` &&
        coverPathname(`https://store1.private.blob.vercel-storage.com/covers/thumb/${storedName}`) ===
          `covers/thumb/${storedName}`,
    );
    check(
      69,
      'only cover files are readable through the media route: no traversal, other folders or pasted URLs',
      !isCoverPathname('covers/full/../../secrets.webp') &&
        !isCoverPathname('other/full/cover.webp') &&
        coverPathname('/api/media/covers/full/../../secrets.webp') === null &&
        coverPathname('https://images.unsplash.com/photo-1.jpg') === null,
    );
    {
      const targets = ownCoverTargets([
        '/api/media/covers/full/a.webp',
        '/api/media/covers/thumb/a.webp',
        'https://store1.public.blob.vercel-storage.com/covers/full/b.webp',
        'https://images.unsplash.com/photo-1.jpg',
        null,
      ]);
      check(
        70,
        'cleanup deletes our covers by pathname and older store URLs as they were saved',
        targets.length === 3 &&
          targets.includes('covers/full/a.webp') &&
          targets.includes('covers/thumb/a.webp') &&
          targets.includes('https://store1.public.blob.vercel-storage.com/covers/full/b.webp'),
        targets.join(' '),
      );
    }

    const missingCover = await anonymous('/api/media/covers/full/nobody-000000-00000000.webp', {
      method: 'GET',
    });
    check(
      71,
      'a cover that is not in the store is a plain 404, not an error page',
      missingCover.status === 404,
      `status ${missingCover.status}`,
    );

    const traversal = await anonymous('/api/media/covers/full/..%2F..%2Fserver.js', {
      method: 'GET',
    });
    check(
      72,
      'the media route refuses a path that climbs out of the covers folder',
      traversal.status === 404 && !(traversal.text ?? '').includes('import '),
      `status ${traversal.status}`,
    );

    // The panel saves whatever the upload answered with, so the write schema has
    // to accept that path - while still refusing a cover value that would end up
    // in an <img src> and run as a script.
    const coverDraft = {
      type: 'blog',
      slug: `${POST_PREFIX}-cover`,
      title: 'Cover check',
      excerpt: '',
      body: 'Body',
      categoryId: '00000000-0000-0000-0000-000000000000',
      status: 'draft',
    };
    const savedCover = postCreateSchema.safeParse({
      ...coverDraft,
      coverImageUrl: `/api/media/covers/full/${storedName}`,
      coverImageThumbUrl: `/api/media/covers/thumb/${storedName}`,
    });
    check(
      73,
      'a post can be saved with a cover this site is serving',
      savedCover.success &&
        savedCover.data.coverImageUrl === `/api/media/covers/full/${storedName}`,
      savedCover.success ? '' : JSON.stringify(savedCover.error.issues[0]?.message),
    );
    check(
      74,
      'a cover value that is not a URL or one of our media paths is still refused',
      !postCreateSchema.safeParse({ ...coverDraft, coverImageUrl: 'javascript:alert(1)' }).success &&
        !postCreateSchema.safeParse({ ...coverDraft, coverImageUrl: '/api/media/other/x.webp' }).success,
    );

    /* ── The external link on a post ─────────────────────────────────────── */

    // The editor promises the manager's link is "shown as a button at the end of
    // the post". The page a crawler and a first paint see is rendered here, so
    // this is where that promise is checked - including that a stored value
    // cannot become a script link.
    const { renderFallbackArticle } = await import('../api/_lib/post-page.ts');
    const pagePost = {
      type: 'blog',
      slug: `${POST_PREFIX}-linked`,
      title: 'A linked post',
      excerpt: 'Summary',
      body: 'Body',
      category: 'Articles',
      coverImageUrl: null,
      linkLabel: 'See Post on LinkedIn',
      linkUrl: 'https://lnkd.in/p/eWTFv5es',
      eventStart: null,
      eventEnd: null,
      locationText: null,
      isOnline: false,
      registrationUrl: null,
      publishedAt: '2026-10-22T12:00:00.000Z',
      updatedAt: '2026-10-22T12:00:00.000Z',
    };

    const linkedHtml = renderFallbackArticle(pagePost);
    check(
      75,
      'a published post carries its external link as a button',
      linkedHtml.includes('href="https://lnkd.in/p/eWTFv5es"') &&
        linkedHtml.includes('See Post on LinkedIn'),
    );
    const scriptLink = renderFallbackArticle({ ...pagePost, linkUrl: 'javascript:alert(1)' });
    const unlabelled = renderFallbackArticle({ ...pagePost, linkLabel: '  ' });
    check(
      76,
      'a link that is not http(s) is dropped, and an empty label still gets a button',
      !scriptLink.includes('javascript:') && unlabelled.includes('>Read more<'),
      'javascript dropped, empty label falls back',
    );
    check(
      77,
      "an event does not grow the blog's external link",
      !renderFallbackArticle({
        ...pagePost,
        type: 'event',
        isOnline: true,
        linkUrl: 'https://lnkd.in/p/eWTFv5es',
      }).includes('lnkd.in'),
    );
  } finally {
    // Remove every row this run created, whatever happened above.
    try {
      if (createdPostId) await sql`DELETE FROM posts WHERE id = ${createdPostId}`;
      if (createdEventId) await sql`DELETE FROM posts WHERE id = ${createdEventId}`;
      if (createdCategoryId) await sql`DELETE FROM categories WHERE id = ${createdCategoryId}`;
      await sql`DELETE FROM posts WHERE slug LIKE ${`${POST_PREFIX}-%`}`;
      await sql`DELETE FROM categories WHERE slug IN (${`test-category-${STAMP}`}, ${`renamed-${STAMP}`})`;
      await sql`DELETE FROM users WHERE email IN (${TALENT_EMAIL}, ${MANAGER_EMAIL})`;
      await sql`DELETE FROM talent_profiles WHERE user_id NOT IN (SELECT id FROM users)`;
    } catch (error) {
      console.warn(`\nCleanup warning: ${error instanceof Error ? error.message : String(error)}`);
    }
    await server?.close();
  }

  const skipped = results.filter((result) => result.skipped).length;
  console.log(
    `\n${results.length} checks, ${failures} failed${skipped > 0 ? `, ${skipped} skipped` : ''}.`,
  );
  if (failures > 0) {
    console.log('\nFailing checks:');
    for (const result of results.filter((entry) => !entry.passed)) {
      console.log(`  ${result.number}. ${result.description} (${result.detail})`);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
}

await main();
