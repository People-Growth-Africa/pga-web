/**
 * What a crawler gets from the build, checked against what the build wrote.
 *
 * Every assertion runs on `dist/`, not on the source, so a page that quietly
 * stops being prerendered fails here even if the React tree still renders in a
 * browser. Run after `npm run build`.
 *
 * What is deliberately NOT checked here: the two section indexes and the sitemap
 * are served by the function now (see scripts/test-crawl.mjs), because a file at
 * those paths would win over the rewrite and freeze them at build time. This
 * file checks the half that is still files: every prerendered page, the shells,
 * robots.txt, the IndexNow key and the platform config.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dist = path.join(root, 'dist');

const SITE = 'https://www.peoplegrowthafrica.com';
const PRIVATE_ROUTES = [
  '/auth',
  '/auth/verify',
  '/forgot-password',
  '/newsletter/confirm',
  '/talent/dashboard',
  '/employer/dashboard',
];

/** The two pages the function owns. No file, no prerender, still in the sitemap. */
const FUNCTION_OWNED_INDEXES = ['/blog', '/events'];

let failures = 0;
let checks = 0;

function check(condition, label) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

function read(file) {
  return fs.readFileSync(path.join(dist, file), 'utf8');
}

if (!fs.existsSync(path.join(dist, 'spa-fallback.html'))) {
  console.error('dist/ is missing - run `npm run build` first.');
  process.exit(1);
}

/* ── The pages that must NOT exist as files ──────────────────────────────── */

// Vercel serves a file before applying a rewrite, so a file here would silently
// take the section away from the handler that knows about new posts.
for (const route of FUNCTION_OWNED_INDEXES) {
  check(
    !fs.existsSync(path.join(dist, route, 'index.html')),
    `${route} is not prerendered (the handler owns it)`,
  );
}
check(
  !fs.existsSync(path.join(dist, 'sitemap.xml')),
  'no dist/sitemap.xml (it would shadow the /sitemap.xml rewrite)',
);

/* ── The built-in index the function bundles ─────────────────────────────── */

const indexFile = path.join(dist, 'seo-index.json');
check(fs.existsSync(indexFile), 'dist/seo-index.json exists');

if (fs.existsSync(indexFile)) {
  const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  check(entries.length > 0, `seo-index.json carries rows (${entries.length})`);
  check(
    entries.every(
      (entry) =>
        (entry.type === 'blog' || entry.type === 'event') &&
        typeof entry.slug === 'string' &&
        entry.slug.length > 0 &&
        typeof entry.title === 'string' &&
        typeof entry.excerpt === 'string',
    ),
    'every built-in index row has a type, slug, title and excerpt',
  );
  check(
    entries.some((entry) => entry.type === 'blog') && entries.some((entry) => entry.type === 'event'),
    'the built-in index carries both blog posts and events',
  );
  check(
    new Set(entries.map((entry) => `${entry.type}:${entry.slug}`)).size === entries.length,
    'the built-in index has no duplicate rows',
  );
}

/* ── Prerendered pages ────────────────────────────────────────────────────── */

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'index.html') files.push(path.relative(dist, full).split(path.sep).join('/'));
  }
}
walk(dist);

const prerendered = files.filter((file) => {
  const html = read(file);
  return html.includes('data-prerendered') && !html.includes('<div id="root"></div>');
});

// 25 pages minus the two indexes the function owns.
check(prerendered.length === 23, `23 prerendered pages (found ${prerendered.length})`);

const routeOf = (file) => (file === 'index.html' ? '/' : `/${file.replace(/\/index\.html$/, '')}`);
const titles = new Map();
const descriptions = new Map();

for (const file of prerendered) {
  const html = read(file);
  const route = routeOf(file);
  const head = html.slice(0, html.indexOf('</head>'));
  const body = html.slice(html.indexOf('<body>'));
  const title = head.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
  const description = head.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  const canonicals = [...head.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);

  check(title.length > 0, `${route} has a title`);
  check(
    title.length <= 60 || route.startsWith('/blog/') || route.startsWith('/events/'),
    `${route} title is within 60 characters (${title.length})`,
  );
  check(description.length > 0, `${route} has a meta description`);
  check(description.length <= 155, `${route} description is within 155 characters (${description.length})`);
  check(canonicals.length === 1, `${route} has exactly one canonical (found ${canonicals.length})`);
  check(canonicals[0] === (route === '/' ? `${SITE}/` : `${SITE}${route}`), `${route} canonical is ${canonicals[0]}`);

  for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) {
    const count = [...head.matchAll(new RegExp(`property="${property}"`, 'g'))].length;
    check(count === 1, `${route} has one ${property}`);
  }
  check(
    head.includes('property="og:url" content="' + (route === '/' ? `${SITE}/` : `${SITE}${route}`) + '"'),
    `${route} og:url matches the canonical`,
  );
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    check(head.includes(`name="${name}"`), `${route} has ${name}`);
  }

  check(html.includes('<html lang="en-NG"'), `${route} declares lang="en-NG"`);
  check(html.includes('data-prerendered'), `${route} is marked prerendered`);
  check([...head.matchAll(/id="org-schema"/g)].length === 1, `${route} carries the static Organization node`);
  check([...head.matchAll(/id="website-schema"/g)].length === 1, `${route} carries the static WebSite node`);
  check(!head.includes('"@type": "Organization",\n        "@id"'), `${route} declares no second Organization node`);

  check((body.match(/<h1[\s>]/g) ?? []).length === 1, `${route} has one h1`);

  // Every JSON-LD block has to be JSON. A trailing comma or an unescaped quote
  // is invisible in a browser and fatal to a crawler.
  for (const [index, match] of [...head.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].entries()) {
    try {
      const node = JSON.parse(match[1]);
      check(node['@context'] === 'https://schema.org', `${route} JSON-LD block ${index + 1} uses schema.org`);
    } catch {
      check(false, `${route} JSON-LD block ${index + 1} is valid JSON`);
    }
  }

  const text = body
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const minWords = route.startsWith('/blog/') ? 400 : 100;
  check(text.split(' ').length > minWords, `${route} ships readable text (${text.split(' ').length} words, min ${minWords})`);

  titles.set(route, title);
  descriptions.set(route, description);
}

check(titles.size === new Set(titles.values()).size, 'every prerendered page has a unique title');
check(descriptions.size === new Set(descriptions.values()).size, 'every prerendered page has a unique description');

/* Blog posts: BlogPosting + BreadcrumbList. Events: Event + BreadcrumbList. */

for (const file of prerendered) {
  const route = routeOf(file);
  const isPost = route.startsWith('/blog/');
  const isEvent = route.startsWith('/events/');
  if (!isPost && !isEvent) continue;

  const html = read(file);
  const pageSchema = html.match(/<script type="application\/ld\+json" id="page-schema">([\s\S]*?)<\/script>/)?.[1];
  const breadcrumb = html.match(/<script type="application\/ld\+json" id="breadcrumb-schema">([\s\S]*?)<\/script>/)?.[1];

  check(Boolean(pageSchema), `${route} has per-page structured data`);
  check(Boolean(breadcrumb), `${route} has a BreadcrumbList`);

  if (pageSchema) {
    const node = JSON.parse(pageSchema);
    check(
      node['@type'] === (isPost ? 'BlogPosting' : 'Event'),
      `${route} schema is a ${isPost ? 'BlogPosting' : 'Event'}`,
    );
    check(node.url === `${SITE}${route}`, `${route} schema url is the canonical`);
    check(Boolean(node.image), `${route} schema has an image`);
    // A BlogPosting names its publisher; an Event names its organizer. Both point
    // at the one Organization node rather than declaring a second one.
    const orgRef = isPost ? node.publisher : node.organizer;
    check(orgRef?.['@id'] === `${SITE}/#organization`, `${route} schema points at the shared Organization`);

    if (isPost) {
      check(Boolean(node.headline), `${route} schema has a headline`);
      check(/^\d{4}-\d{2}-\d{2}$/.test(node.datePublished ?? ''), `${route} schema has datePublished`);
      check(/^\d{4}-\d{2}-\d{2}$/.test(node.dateModified ?? ''), `${route} schema has dateModified`);
      check(node.mainEntityOfPage?.['@id'] === `${SITE}${route}`, `${route} schema mainEntityOfPage is the page`);
    } else {
      check(Boolean(node.startDate), `${route} schema has a startDate`);
      check(
        node.eventAttendanceMode === 'https://schema.org/OfflineEventAttendanceMode' ||
          node.eventAttendanceMode === 'https://schema.org/OnlineEventAttendanceMode',
        `${route} schema has an attendance mode`,
      );
      check(
        node.eventAttendanceMode === 'https://schema.org/OnlineEventAttendanceMode'
          ? Boolean(node.virtualLocation?.url)
          : Boolean(node.location?.name),
        `${route} schema has somewhere for the event to happen`,
      );
    }
  }

  if (breadcrumb) {
    const node = JSON.parse(breadcrumb);
    check(node['@type'] === 'BreadcrumbList', `${route} breadcrumb is a BreadcrumbList`);
    check(node.itemListElement?.length >= 3, `${route} breadcrumb names Home, the section and the page`);
    check(
      node.itemListElement?.[1]?.item === `${SITE}${isEvent ? '/events' : '/blog'}`,
      `${route} breadcrumb points at its section`,
    );
  }

  const body = html.slice(html.indexOf('<body>'));
  // Articles are wrapped in <article>; an event page is a set of sections with
  // the practical facts in a definition list.
  check(
    isPost ? body.includes('<article') : body.includes('<dl'),
    `${route} carries its ${isPost ? 'article' : 'event details'} markup`,
  );
}

/* ── Client-only shells ───────────────────────────────────────────────────── */

for (const route of PRIVATE_ROUTES) {
  const file = path.join(dist, route, 'index.html');
  check(fs.existsSync(file), `${route} shell exists`);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  check(/<meta name="robots" content="noindex, nofollow"/.test(html), `${route} carries a robots noindex meta tag`);
  check(html.includes('<div id="root"></div>'), `${route} is a client-rendered shell`);
  check(!html.includes('data-prerendered'), `${route} is not prerendered`);
}

/* ── Routing config ───────────────────────────────────────────────────────── */

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

const sitemapRewrite = (vercel.rewrites ?? []).find((rule) => rule.source === '/sitemap.xml');
check(
  Boolean(sitemapRewrite?.destination?.includes('path=sitemap')),
  'vercel.json rewrites /sitemap.xml to the API route',
);

for (const [section, type] of [
  ['blog', 'blog'],
  ['events', 'event'],
]) {
  const indexRule = (vercel.rewrites ?? []).find((entry) => entry.source === `/${section}`);
  check(
    indexRule?.destination === `/api/[...path]?path=index&type=${type}`,
    `vercel.json rewrites /${section} to the index handler`,
  );
  const postRule = (vercel.rewrites ?? []).find((entry) => entry.source === `/${section}/:slug`);
  check(
    postRule?.destination === `/api/[...path]?path=post&type=${type}&slug=:slug`,
    `vercel.json rewrites /${section}/:slug to the page handler`,
  );
}

const includeFiles = vercel.functions?.['api/[...path].ts']?.includeFiles ?? '';
check(
  includeFiles.includes('dist/seo-index.json'),
  'the function bundle includes the built-in index',
);

const cspHeader = (vercel.headers ?? [])
  .flatMap((rule) => rule.headers ?? [])
  .find((header) => header.key === 'Content-Security-Policy-Report-Only');
check(
  cspHeader?.value.includes('https://*.public.blob.vercel-storage.com') ?? false,
  'the CSP allows Vercel Blob covers to render',
);
check(vercel.trailingSlash === false, 'vercel.json sets trailingSlash: false');
check(vercel.cleanUrls === true, 'vercel.json sets cleanUrls: true');

const apex = (vercel.redirects ?? []).find((rule) =>
  (rule.has ?? []).some((condition) => condition.type === 'host' && condition.value === 'peoplegrowthafrica.com'),
);
check(Boolean(apex), 'vercel.json redirects the apex host');
check(apex?.destination === 'https://www.peoplegrowthafrica.com/$1', 'the apex redirect targets www and keeps the path');
check(apex?.permanent === true, 'the apex redirect is permanent');

const fallbackRewrite = (vercel.rewrites ?? []).find((rule) => rule.source === '/(.*)');
check(
  fallbackRewrite?.destination === '/spa-fallback.html',
  'unknown routes fall back to the shell, not the prerendered homepage',
);

for (const source of [
  '/auth',
  '/auth/:path*',
  '/forgot-password',
  '/talent/:path*',
  '/employer/:path*',
  '/admin',
  '/admin/:path*',
  '/newsletter/confirm',
  '/api/:path*',
]) {
  const rule = (vercel.headers ?? []).find((entry) => entry.source === source);
  check(
    (rule?.headers ?? []).some((header) => header.key === 'X-Robots-Tag' && header.value.includes('noindex')),
    `X-Robots-Tag noindex for ${source}`,
  );
}

// The public sitemap's committed half. api/_lib/static-sitemap.ts duplicates the
// route list because api/ and src/ are separate compile units; the build's own
// pages are the only thing that can catch the copy drifting.
const staticSitemapSource = fs.readFileSync(path.join(root, 'api', '_lib', 'static-sitemap.ts'), 'utf8');
const constantMatch = staticSitemapSource.match(/export const STATIC_SITEMAP_PATHS[^=]*=\s*\[([\s\S]*?)\];/);
check(Boolean(constantMatch), 'static-sitemap.ts declares STATIC_SITEMAP_PATHS');

const constantPaths = [...(constantMatch?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const builtPaths = [
  ...prerendered.map((file) => routeOf(file)),
  ...FUNCTION_OWNED_INDEXES,
].sort();
check(
  JSON.stringify([...constantPaths].sort()) === JSON.stringify(builtPaths),
  `static sitemap paths match every public page (${constantPaths.length} in the constant, ${builtPaths.length} public)`,
);

/* ── robots.txt ───────────────────────────────────────────────────────────── */

const robots = fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8');
check(robots.includes(`Sitemap: ${SITE}/sitemap.xml`), 'robots.txt points at the sitemap');
check(robots.includes('User-agent: *') && /Allow: \//.test(robots), 'robots.txt allows the wildcard');
for (const bot of ['Bingbot', 'DuckDuckBot', 'Bravebot', 'YandexBot', 'Baiduspider']) {
  check(
    new RegExp(`User-agent: ${bot}\\s*\\n\\s*Allow: /`).test(robots),
    `robots.txt names and allows ${bot}`,
  );
}
// The choice made here: private routes stay crawlable so their noindex is
// readable. A Disallow on them would hide the meta tag that keeps them out.
check(
  !/Disallow:\s*\/(auth|talent|employer|admin|api)/.test(robots),
  'robots.txt does not block the noindex routes',
);

/* ── IndexNow key ─────────────────────────────────────────────────────────── */

const indexNowSource = fs.readFileSync(path.join(root, 'api', '_lib', 'indexnow.ts'), 'utf8');
const key = indexNowSource.match(/export const INDEXNOW_KEY = '([^']+)'/)?.[1];
check(Boolean(key), 'indexnow.ts declares a key');
if (key) {
  const keyFile = path.join(dist, `${key}.txt`);
  check(fs.existsSync(keyFile), `dist/${key}.txt is served as the IndexNow key`);
  if (fs.existsSync(keyFile)) {
    check(fs.readFileSync(keyFile, 'utf8').trim() === key, 'the IndexNow key file contains the key');
  }
}

const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
check(sw.includes("'/sitemap.xml'") && sw.includes("'/robots.txt'"), 'the service worker lets sitemap.xml and robots.txt through');

/* ── Result ───────────────────────────────────────────────────────────────── */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`${checks} checks passed.`);
