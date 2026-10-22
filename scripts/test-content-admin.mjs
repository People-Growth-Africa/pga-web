/**
 * Content admin test suite. Runs the real API over HTTP against a real
 * database and checks the things that would be dangerous to assume:
 *
 *   - a manager account cannot be produced by public signup
 *   - every admin endpoint refuses a missing session and a non-manager session
 *   - a manager can create, edit, publish, unpublish and delete posts
 *   - a draft is reachable from neither /api/updates nor the sitemap
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

import { loadEnvFiles, startApiServer } from './api-server.mjs';
import { checkApiImports } from './check-api-imports.mjs';

const STAMP = Date.now().toString(36);
const TALENT_EMAIL = `test-content-talent-${STAMP}@example.com`;
const MANAGER_EMAIL = `test-content-manager-${STAMP}@example.com`;
const PASSWORD = `Str0ng-${randomBytes(9).toString('base64url')}`;
const POST_PREFIX = `test-content-${STAMP}`;

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
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
    return { status: response.status, json, text };
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
    check(
      3,
      'the manager can sign in',
      managerLogin.status >= 200 && managerLogin.status < 300,
      `status ${managerLogin.status}`,
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
    check(9, 'the six default categories are seeded', (adminManager.json?.categories?.length ?? 0) >= 6, `${adminManager.json?.categories?.length ?? 0} categories`);

    const created = await manager('/api/admin/posts', {
      method: 'PUT',
      body: {
        slug: `${POST_PREFIX}-post`,
        title: 'A test update',
        excerpt: 'Short summary for the test.',
        body: 'First paragraph.\n\nSecond paragraph with **bold**.',
        categoryId: firstCategory.id,
        coverImageUrl: null,
        linkLabel: null,
        linkUrl: null,
        status: 'draft',
      },
    });
    createdPostId = created.json?.post?.id ?? null;
    check(
      10,
      'a manager can create a draft post',
      created.status === 201 && Boolean(createdPostId),
      `status ${created.status}`,
    );

    const duplicate = await manager('/api/admin/posts', {
      method: 'PUT',
      body: {
        slug: `${POST_PREFIX}-post`,
        title: 'Collision',
        excerpt: '',
        body: '',
        categoryId: firstCategory.id,
        coverImageUrl: null,
        linkLabel: null,
        linkUrl: null,
        status: 'draft',
      },
    });
    check(
      11,
      'a duplicate slug is refused rather than renamed',
      duplicate.status === 409 && duplicate.json?.code === 'slug_taken',
      `status ${duplicate.status}`,
    );

    const badCategory = await manager('/api/admin/posts', {
      method: 'PUT',
      body: {
        slug: `${POST_PREFIX}-nope`,
        title: 'Bad category',
        excerpt: '',
        body: '',
        categoryId: '00000000-0000-4000-8000-000000000000',
        coverImageUrl: null,
        linkLabel: null,
        linkUrl: null,
        status: 'draft',
      },
    });
    check(
      12,
      'an unknown category is refused',
      badCategory.status === 400,
      `status ${badCategory.status}`,
    );

    // A draft must not be reachable from the public feed.
    const feedWhileDraft = await anonymous('/api/updates', { method: 'GET' });
    const draftVisible = (feedWhileDraft.json?.posts ?? []).some(
      (post) => post.slug === `${POST_PREFIX}-post`,
    );
    check(
      13,
      'a draft is not in the public feed',
      feedWhileDraft.status === 200 && !draftVisible,
      `status ${feedWhileDraft.status}`,
    );

    const sitemapWhileDraft = await anonymous('/api/sitemap', { method: 'GET' });
    check(
      14,
      'a draft is not in the sitemap',
      sitemapWhileDraft.status === 200 && !sitemapWhileDraft.text.includes(`${POST_PREFIX}-post`),
      `status ${sitemapWhileDraft.status}`,
    );

    /* ── Publish ─────────────────────────────────────────────────────────── */

    const published = await manager('/api/admin/post-status', {
      method: 'POST',
      body: { id: createdPostId, status: 'published' },
    });
    check(
      15,
      'a manager can publish a post',
      published.status === 200 && published.json?.post?.status === 'published',
      `status ${published.status}`,
    );
    check(
      16,
      'publishing stamps published_at',
      Boolean(published.json?.post?.published_at),
      String(published.json?.post?.published_at ?? 'null'),
    );

    const feedWhilePublished = await anonymous('/api/updates', { method: 'GET' });
    check(
      17,
      'a published post appears in the public feed',
      (feedWhilePublished.json?.posts ?? []).some((post) => post.slug === `${POST_PREFIX}-post`),
      `status ${feedWhilePublished.status}`,
    );

    const sitemapPublished = await anonymous('/api/sitemap', { method: 'GET' });
    check(
      18,
      'a published post is added to the sitemap',
      sitemapPublished.text.includes(`/updates/${POST_PREFIX}-post`),
      `status ${sitemapPublished.status}`,
    );
    check(
      19,
      'the sitemap keeps its static entries',
      sitemapPublished.text.includes('https://www.peoplegrowthafrica.com/blog') &&
        sitemapPublished.text.includes('https://www.peoplegrowthafrica.com/events'),
    );

    /* ── Edit ────────────────────────────────────────────────────────────── */

    const edited = await manager('/api/admin/post', {
      method: 'PUT',
      body: {
        id: createdPostId,
        slug: `${POST_PREFIX}-post`,
        title: 'A test update, edited',
        excerpt: 'Updated summary.',
        body: 'Updated body.',
        categoryId: firstCategory.id,
        coverImageUrl: null,
        linkLabel: 'Read more',
        linkUrl: 'https://example.com',
        status: 'published',
      },
    });
    check(
      20,
      'a manager can edit a post',
      edited.status === 200 && edited.json?.post?.title === 'A test update, edited',
      `status ${edited.status}`,
    );

    const unpublish = await manager('/api/admin/post-status', {
      method: 'POST',
      body: { id: createdPostId, status: 'draft' },
    });
    const feedAfterUnpublish = await anonymous('/api/updates', { method: 'GET' });
    check(
      21,
      'unpublishing removes it from the public feed again',
      unpublish.status === 200 &&
        !(feedAfterUnpublish.json?.posts ?? []).some((post) => post.slug === `${POST_PREFIX}-post`),
      `status ${unpublish.status}`,
    );

    /* ── Categories ──────────────────────────────────────────────────────── */

    const newCategory = await manager('/api/admin/categories', {
      method: 'POST',
      body: { name: `Test Category ${STAMP}`, slug: `test-category-${STAMP}` },
    });
    createdCategoryId = newCategory.json?.category?.id ?? null;
    check(
      22,
      'a manager can add a category',
      newCategory.status === 201 && Boolean(createdCategoryId),
      `status ${newCategory.status}`,
    );

    const renamed = await manager('/api/admin/category', {
      method: 'PUT',
      body: { id: createdCategoryId, name: `Renamed ${STAMP}`, slug: `renamed-${STAMP}` },
    });
    check(
      23,
      'a manager can rename a category',
      renamed.status === 200 && renamed.json?.category?.name === `Renamed ${STAMP}`,
      `status ${renamed.status}`,
    );

    // Move the post across so the new category has something in it.
    await manager('/api/admin/post', {
      method: 'PUT',
      body: {
        id: createdPostId,
        slug: `${POST_PREFIX}-post`,
        title: 'A test update, edited',
        excerpt: 'Updated summary.',
        body: 'Updated body.',
        categoryId: createdCategoryId,
        coverImageUrl: null,
        linkLabel: null,
        linkUrl: null,
        status: 'draft',
      },
    });

    const blockedDelete = await manager(`/api/admin/category?id=${createdCategoryId}`, {
      method: 'DELETE',
    });
    check(
      24,
      'deleting a category with posts is refused',
      blockedDelete.status === 409 && blockedDelete.json?.code === 'category_in_use',
      `status ${blockedDelete.status} ${blockedDelete.json?.code ?? ''}`,
    );
    check(
      25,
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
      26,
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
      27,
      'a manager can delete a post',
      deletedPost.status === 200,
      `status ${deletedPost.status}`,
    );
    createdPostId = null;

    const feedAfterDelete = await anonymous('/api/updates', { method: 'GET' });
    check(
      28,
      'a deleted post is gone from the public feed',
      !(feedAfterDelete.json?.posts ?? []).some((post) => post.slug === `${POST_PREFIX}-post`),
    );

    /* ── Uploads ─────────────────────────────────────────────────────────── */

    const noBlobToken = !process.env.BLOB_READ_WRITE_TOKEN;
    const upload = await manager('/api/admin/upload', {
      body: { filename: 'x.png', contentType: 'image/png', data: 'iVBORw0KGgo=' },
    });
    if (noBlobToken) {
      check(
        29,
        'upload reports that Blob is not configured',
        upload.status === 503 && upload.json?.code === 'uploads_disabled',
        `status ${upload.status}`,
      );
    } else {
      check(
        29,
        'a non-image upload is refused by its magic bytes',
        upload.status === 400,
        `status ${upload.status}`,
      );
    }

    const badMethod = await manager('/api/admin/posts', { method: 'GET' });
    check(
      30,
      'the admin list answers the manager after all of that',
      badMethod.status === 200,
      `status ${badMethod.status}`,
    );
  } finally {
    // Remove every row this run created, whatever happened above.
    try {
      if (createdPostId) await sql`DELETE FROM posts WHERE id = ${createdPostId}`;
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

  console.log(`\n${results.length} checks, ${failures} failed.`);
  if (failures > 0) {
    console.log('\nFailing checks:');
    for (const result of results.filter((entry) => !entry.passed)) {
      console.log(`  ${result.number}. ${result.description} (${result.detail})`);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
}

await main();
