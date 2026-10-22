/**
 * What a crawler gets from the pages the build cannot write.
 *
 *   npm run build && npm run test:crawl
 *
 * Articles and events are not files any more: the build writes only the home page
 * and /consultation, and everything else - a new post, a new event, the two
 * section indexes and the sitemap - is rendered by the function through a
 * rewrite. This suite starts the real API on a local port,
 * inserts its own rows, asks for those URLs with a crawler's user agent and
 * checks the response itself: status, canonical, structured data, and the body
 * text a crawler that never runs JavaScript would read.
 *
 * It needs DATABASE_URL (the same .env files the other suites use) and removes
 * every row it creates, success or failure.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFiles, startApiServer } from './api-server.mjs';
import { checkApiImports } from './check-api-imports.mjs';

const SITE = 'https://www.peoplegrowthafrica.com';
const stamp = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
const PUBLISHED_SLUG = `crawl-test-published-${stamp}`;
const DRAFT_SLUG = `crawl-test-draft-${stamp}`;
const EVENT_SLUG = `crawl-test-event-${stamp}`;
const EVENT_TITLE = `Crawl test event ${stamp}`;
const BODY_SENTINEL = `Sentinel line ${stamp} that only the article body carries.`;
const DRAFT_SENTINEL = `Draft line ${stamp} that must never be public.`;
const BINGBOT = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';

const BLOG_BODY = [
  '## What changed',
  '',
  `The first paragraph mentions ${BODY_SENTINEL}`,
  '',
  '- First action for the payroll team',
  '- Second action for the payroll team',
  '',
  '### Why it matters',
  '',
  'A closing paragraph with a [link](https://www.peoplegrowthafrica.com/consultation).',
].join('\n');

let failures = 0;
let checks = 0;
let sql = null;
let categoryId = null;

function check(condition, label, detail = '') {
  checks += 1;
  const mark = condition ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${String(checks).padStart(2)}. ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures += 1;
}

/** The readable text of an HTML response, tags and scripts removed. */
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every JSON-LD block in a document, parsed; throws on invalid JSON. */
function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]),
  );
}

async function fetchText(baseUrl, path, userAgent = BINGBOT) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { 'user-agent': userAgent } });
  const body = await response.text();
  return { response, body };
}

async function main() {
  loadEnvFiles({ quiet: true });
  if (!process.env.DATABASE_URL) {
    console.error(
      [
        '',
        'DATABASE_URL is not set, so the crawl suite cannot run the posted rows.',
        'Pull the Vercel environment first:',
        '  vercel env pull .env.development.local --yes',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const imports = await checkApiImports({ quiet: true });
  if (!imports.ok) {
    console.error(`\n${imports.summary}\n\nRun \`node scripts/check-api-imports.mjs\` for the details.\n`);
    process.exit(1);
  }

  const { neon } = await import('@neondatabase/serverless');
  sql = neon(process.env.DATABASE_URL);

  const categories = await sql.query('SELECT id FROM categories ORDER BY name LIMIT 1');
  categoryId = categories[0]?.id ?? null;
  if (!categoryId) {
    console.error('No category exists, and a blog post requires one. Run `npm run setup:content` first.');
    process.exit(1);
  }

  await sql.query(
    `INSERT INTO posts (slug, title, excerpt, body, type, category_id, status, published_at)
     VALUES ($1, $2, $3, $4, 'blog', $5, 'published', now())`,
    [
      PUBLISHED_SLUG,
      'Crawl test: a post published after the build',
      'A summary written by the crawl suite so the excerpt can be checked.',
      BLOG_BODY,
      categoryId,
    ],
  );
  await sql.query(
    `INSERT INTO posts (slug, title, excerpt, body, type, category_id, status)
     VALUES ($1, $2, $3, $4, 'blog', $5, 'draft')`,
    [
      DRAFT_SLUG,
      'Crawl test: a draft that must stay private',
      'This draft must not appear anywhere.',
      DRAFT_SENTINEL,
      categoryId,
    ],
  );

  // An event carries no category: the table's check constraint allows one only
  // for a blog post, which is why this insert leaves it null.
  await sql.query(
    `INSERT INTO posts (slug, title, excerpt, body, type, status, published_at, event_start, is_online)
     VALUES ($1, $2, $3, $4, 'event', 'published', now(), now() + interval '30 days', true)`,
    [EVENT_SLUG, EVENT_TITLE, 'A summary written by the crawl suite.', 'The event body.'],
  );

  const server = await startApiServer({ quiet: true });
  const base = server.origin;
  console.log(`\nTesting ${base} as Bingbot\n`);

  try {
    /* ── A post published after the build ─────────────────────────────────── */

    const post = await fetchText(base, `/blog/${PUBLISHED_SLUG}`);
    const postText = textOf(post.body);
    const postHead = post.body.slice(0, post.body.indexOf('</head>'));

    check(post.response.status === 200, 'a published post answers 200', String(post.response.status));
    check(
      /text\/html/.test(post.response.headers.get('content-type') ?? ''),
      'the post is served as HTML',
      post.response.headers.get('content-type') ?? 'none',
    );
    check(
      postHead.includes(`<link rel="canonical" href="${SITE}/blog/${PUBLISHED_SLUG}"`),
      'the post canonical is its own URL',
    );
    check(
      postHead.includes('<meta property="og:title"') && postHead.includes('<meta name="twitter:card"'),
      'the post carries Open Graph and Twitter tags',
    );
    check((post.body.match(/<h1[\s>]/g) ?? []).length === 1, 'the post has exactly one h1');
    check(postText.includes('Crawl test: a post published after the build'), 'the h1 text is in the response');
    check(postText.includes(BODY_SENTINEL), 'the article body text is in the response');
    check(postText.includes('What changed') && postText.includes('Why it matters'), 'the body headings are in the response');
    check(
      postText.includes('First action for the payroll team') && postText.includes('Second action for the payroll team'),
      'the body list items are in the response',
    );
    check(post.body.includes('id="fallback-content"'), 'the readable copy sits outside the app container');
    check(
      post.body.indexOf('id="fallback-content"') < post.body.indexOf('<div id="root">'),
      'the readable copy comes before the app container',
    );

    const postSchema = jsonLd(post.body).find((node) => node['@type'] === 'BlogPosting');
    check(Boolean(postSchema), 'the post has a BlogPosting node');
    check(postSchema?.url === `${SITE}/blog/${PUBLISHED_SLUG}`, 'the BlogPosting url is the canonical');
    check(/^\d{4}-\d{2}-\d{2}$/.test(postSchema?.datePublished ?? ''), 'the BlogPosting has a publish date');
    check(Boolean(postSchema?.description), 'the BlogPosting has a description');
    const breadcrumb = jsonLd(post.body).find((node) => node['@type'] === 'BreadcrumbList');
    check(breadcrumb?.itemListElement?.length === 3, 'the post has a three-step BreadcrumbList');

    const plain = await fetchText(base, `/blog/${PUBLISHED_SLUG}`, 'Mozilla/5.0 (Windows NT 10.0)');
    check(
      textOf(plain.body) === postText,
      'a browser user agent gets the same content as Bingbot',
    );

    /* ── A draft ──────────────────────────────────────────────────────────── */

    const draft = await fetchText(base, `/blog/${DRAFT_SLUG}`);
    check(draft.response.status === 404, 'a draft answers 404', String(draft.response.status));
    check(!textOf(draft.body).includes(DRAFT_SENTINEL), 'the draft body is not in the response');
    check(
      draft.body.includes('<meta name="robots" content="noindex, nofollow"'),
      'the draft response is noindex',
    );

    /* ── A post asked for under the wrong section ─────────────────────────── */

    const wrongSection = await fetchText(base, `/events/${PUBLISHED_SLUG}`);
    check(wrongSection.response.status === 404, 'a blog slug requested under /events is a 404');

    /* ── A withdrawn page ──────────────────────────────────────────────────── */

    // These URLs served real pages until the placeholder content was removed.
    // 410 tells a crawler the page was taken down on purpose; 404 would keep it
    // coming back for a URL that is never returning.
    for (const gone of [
      '/blog/from-whatsapp-groups-to-world-class-hr',
      '/events/nigerian-labour-law-compliance-2026',
    ]) {
      const response = await fetchText(base, gone);
      check(response.response.status === 410, `${gone} answers 410`, String(response.response.status));
      check(
        response.body.includes('<meta name="robots" content="noindex, nofollow"'),
        `${gone} is noindex`,
      );
    }

    /* ── The section indexes ──────────────────────────────────────────────── */

    const blogIndex = await fetchText(base, '/blog');
    const blogText = textOf(blogIndex.body);
    check(blogIndex.response.status === 200, '/blog answers 200');
    check(
      blogIndex.body.slice(0, blogIndex.body.indexOf('</head>')).includes(`<link rel="canonical" href="${SITE}/blog"`),
      '/blog canonical is the section URL',
    );
    check(blogText.includes(PUBLISHED_SLUG) || blogText.includes('Crawl test: a post published after the build'), '/blog links the new post');
    check(!blogText.includes(DRAFT_SLUG), '/blog does not link a draft');
    check((blogIndex.body.match(/<h1[\s>]/g) ?? []).length === 1, '/blog has exactly one h1');
    check(
      jsonLd(blogIndex.body).some((node) => node['@type'] === 'BreadcrumbList'),
      '/blog has a BreadcrumbList',
    );

    const eventsIndex = await fetchText(base, '/events');
    const eventsText = textOf(eventsIndex.body);
    check(eventsIndex.response.status === 200, '/events answers 200');
    check(eventsText.includes(EVENT_TITLE), '/events lists a published event from the database');
    check((eventsIndex.body.match(/<h1[\s>]/g) ?? []).length === 1, '/events has exactly one h1');

    /* ── The sitemap ──────────────────────────────────────────────────────── */

    const sitemap = await fetchText(base, '/sitemap.xml');
    check(sitemap.response.status === 200, '/sitemap.xml answers 200');
    check(
      /xml/.test(sitemap.response.headers.get('content-type') ?? ''),
      '/sitemap.xml is served as XML',
      sitemap.response.headers.get('content-type') ?? 'none',
    );
    check(sitemap.body.includes(`<loc>${SITE}/blog/${PUBLISHED_SLUG}</loc>`), 'the sitemap includes the published post');
    check(sitemap.body.includes(`<loc>${SITE}/events/${EVENT_SLUG}</loc>`), 'the sitemap includes the published event');
    check(!sitemap.body.includes(DRAFT_SLUG), 'the sitemap excludes the draft');
    check(
      !sitemap.body.includes('from-whatsapp-groups-to-world-class-hr') &&
        !sitemap.body.includes('nigerian-labour-law-compliance-2026'),
      'the sitemap lists no withdrawn page',
    );
    check(sitemap.body.includes(`<loc>${SITE}/blog</loc>`), 'the sitemap includes the two section indexes');

    const publishedBlock = sitemap.body
      .split('<url>')
      .find((block) => block.includes(`/blog/${PUBLISHED_SLUG}`));
    check(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(publishedBlock ?? ''), 'the published post carries a lastmod');

    /* ── robots.txt and the IndexNow key ──────────────────────────────────── */

    const robots = await fetchText(base, '/robots.txt');
    check(robots.response.status === 200, '/robots.txt answers 200');
    check(robots.body.includes(`Sitemap: ${SITE}/sitemap.xml`), 'robots.txt names the sitemap');
    check(/User-agent: Bingbot\s*\n\s*Allow: \//.test(robots.body), 'robots.txt allows Bingbot');

    // Read rather than import: this is a .mjs script, and the key is public by
    // design - the protocol asks the site to serve it in a text file.
    const keySource = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'api', '_lib', 'indexnow.ts'),
      'utf8',
    );
    const moduleKey = keySource.match(/DEFAULT_INDEXNOW_KEY = '([^']+)'/)?.[1];
    const configuredKey = (process.env.INDEXNOW_KEY ?? '').trim();
    const key = /^[A-Za-z0-9-]{8,128}$/.test(configuredKey) ? configuredKey : moduleKey;
    check(Boolean(key), 'the IndexNow key is resolved');
    if (key) {
      const keyFile = await fetchText(base, `/${key}.txt`);
      check(keyFile.response.status === 200, 'the IndexNow key file is served', String(keyFile.response.status));
      check(keyFile.body.trim() === key, 'the IndexNow key file contains the key');
    }
  } finally {
    await server.close();
  }
}

try {
  await main();
} catch (error) {
  console.error('\nThe crawl suite crashed:', error);
  failures += 1;
} finally {
  if (sql) {
    await sql
      .query('DELETE FROM posts WHERE slug = ANY($1)', [[PUBLISHED_SLUG, DRAFT_SLUG, EVENT_SLUG]])
      .catch((error) => console.error('cleanup failed', error));
  }

  if (failures > 0) {
    console.error(`\n${failures} of ${checks} checks failed.`);
    process.exit(1);
  }
  console.log(`\n${checks} checks passed.`);
}
