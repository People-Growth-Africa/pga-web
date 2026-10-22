/**
 * What the crawler sees, checked against what the build actually wrote.
 *
 * Every assertion runs on `dist/`, not on the source, so a page that quietly
 * stops being prerendered fails here even if the React tree still renders in a
 * browser. Run after `npm run build`.
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

if (!fs.existsSync(path.join(dist, 'sitemap.xml'))) {
  console.error('dist/sitemap.xml is missing - run `npm run build` first.');
  process.exit(1);
}

/* ── Sitemap ──────────────────────────────────────────────────────────────── */

const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

check(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'sitemap starts with an XML declaration');
check(/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sitemap), 'sitemap is a urlset');
check(!sitemap.includes('<sitemapindex'), 'sitemap is not an index');
check(locs.length === 25, `sitemap lists 25 URLs (found ${locs.length})`);
check(new Set(locs).size === locs.length, 'sitemap has no duplicate URLs');

for (const loc of locs) {
  check(loc.startsWith(`${SITE}/`), `only www URLs: ${loc}`);
  if (loc !== `${SITE}/`) check(!loc.endsWith('/'), `no trailing slash: ${loc}`);
  for (const route of PRIVATE_ROUTES) {
    check(!new RegExp(`${route}(/|$)`).test(loc), `private route excluded: ${loc}`);
  }
  check(!loc.includes('/auth'), `no account URLs: ${loc}`);
  check(!loc.includes('/api/'), `no API URLs: ${loc}`);
  check(!loc.includes('/updates'), `the sitemap carries no retired /updates URL: ${loc}`);
}

/* ── The dynamic sitemap's static half ──────────────────────────────── */

// /sitemap.xml is served by /api/sitemap (see vercel.json), which merges this
// committed list with the published post slugs. The two copies of the list can
// drift - they are in different compile units - so they are compared here
// against the file the build actually wrote. A built-in post added without
// updating api/_lib/static-sitemap.ts would otherwise silently drop out of the
// sitemap that production serves.
const staticSitemapSource = fs.readFileSync(
  path.join(root, 'api', '_lib', 'static-sitemap.ts'),
  'utf8',
);
const constantMatch = staticSitemapSource.match(
  /export const STATIC_SITEMAP_PATHS[^=]*=\s*\[([\s\S]*?)\];/,
);
check(Boolean(constantMatch), 'static-sitemap.ts declares STATIC_SITEMAP_PATHS');

const constantPaths = [...(constantMatch?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const builtPaths = locs.map((loc) => loc.replace(SITE, '') || '/');
check(
  JSON.stringify(constantPaths) === JSON.stringify(builtPaths),
  `static sitemap paths match the build (${constantPaths.length} in the constant, ${builtPaths.length} built)`,
);

const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
check(lastmods.length === 9, `only the 9 articles carry a lastmod (found ${lastmods.length})`);
check(lastmods.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)), 'every lastmod is a real YYYY-MM-DD date');

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

check(prerendered.length === 25, `25 prerendered pages (found ${prerendered.length})`);

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
  check(title.length <= 60 || route.startsWith('/blog/') || route.startsWith('/events/'), `${route} title is within 60 characters (${title.length})`);
  check(description.length > 0, `${route} has a meta description`);
  check(description.length <= 155, `${route} description is within 155 characters (${description.length})`);
  check(canonicals.length === 1, `${route} has exactly one canonical (found ${canonicals.length})`);
  check(canonicals[0] === (route === '/' ? `${SITE}/` : `${SITE}${route}`), `${route} canonical is ${canonicals[0]}`);

  for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) {
    const count = [...head.matchAll(new RegExp(`property="${property}"`, 'g'))].length;
    check(count === 1, `${route} has one ${property}`);
  }
  check(head.includes('property="og:url" content="' + (route === '/' ? `${SITE}/` : `${SITE}${route}`) + '"'), `${route} og:url matches the canonical`);
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    check(head.includes(`name="${name}"`), `${route} has ${name}`);
  }

  check([...head.matchAll(/id="org-schema"/g)].length === 1, `${route} carries the static Organization node`);
  check(!head.includes('"@type": "Organization",\n        "@id"'), `${route} declares no second Organization node`);

  check((body.match(/<h1[\s>]/g) ?? []).length === 1, `${route} has one h1`);

  const text = body
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Articles have to carry their body; a functional page (the booking form)
  // legitimately ships less, so it is held to the smaller floor.
  const minWords = route.startsWith('/blog/') ? 400 : 100;
  check(text.split(' ').length > minWords, `${route} ships readable text (${text.split(' ').length} words, min ${minWords})`);

  titles.set(route, title);
  descriptions.set(route, description);
}

check(titles.size === new Set(titles.values()).size, 'every prerendered page has a unique title');
check(descriptions.size === new Set(descriptions.values()).size, 'every prerendered page has a unique description');

/* Blog posts: Article + BreadcrumbList */

const postFiles = prerendered.filter((file) => file.startsWith('blog/') && file !== 'blog/index.html');

for (const file of postFiles) {
  const html = read(file);
  const route = routeOf(file);
  const pageSchema = html.match(/<script type="application\/ld\+json" id="page-schema">([\s\S]*?)<\/script>/)?.[1];
  const breadcrumb = html.match(/<script type="application\/ld\+json" id="breadcrumb-schema">([\s\S]*?)<\/script>/)?.[1];

  check(Boolean(pageSchema), `${route} has per-page structured data`);
  check(Boolean(breadcrumb), `${route} has a BreadcrumbList`);

  if (pageSchema) {
    const node = JSON.parse(pageSchema);
    check(node['@type'] === 'BlogPosting', `${route} schema is a BlogPosting`);
    check(Boolean(node.headline), `${route} schema has a headline`);
    check(/^\d{4}-\d{2}-\d{2}$/.test(node.datePublished ?? ''), `${route} schema has datePublished`);
    check(/^\d{4}-\d{2}-\d{2}$/.test(node.dateModified ?? ''), `${route} schema has dateModified`);
    check(node.mainEntityOfPage?.['@id'] === `${SITE}${route}`, `${route} schema mainEntityOfPage is the page`);
    check(node.publisher?.['@id'] === `${SITE}/#organization`, `${route} schema publisher is the shared Organization`);
    check(Object.keys(node.publisher ?? {}).length === 1, `${route} schema publisher declares no second Organization`);
    // The author is a reference to the shared Organization, never a second
    // declaration of it and never a Person: one company, one node, by @id.
    check(
      node.author?.['@type'] === 'Organization' &&
        node.author?.['@id'] === `${SITE}/#organization`,
      `${route} schema author is the shared Organization`,
    );
    check(Object.keys(node.author ?? {}).length === 2, `${route} schema author is a pure @id reference`);
    check(Boolean(node.image), `${route} schema has an image`);

    // The share image is the article's own card, never a stock photo. An
    // Unsplash URL as og:image makes every shared link preview a picture the
    // post is not, and the twitter card has to agree with the og one.
    const postHead = html.slice(0, html.indexOf('</head>'));
    const ogImage = postHead.match(/property="og:image" content="([^"]*)"/)?.[1] ?? '';
    const twitterImage = postHead.match(/name="twitter:image" content="([^"]*)"/)?.[1] ?? '';
    check(Boolean(ogImage), `${route} has an og:image`);
    check(!/unsplash\.com/i.test(ogImage), `${route} og:image is not a stock photo`);
    check(!/unsplash\.com/i.test(String(node.image)), `${route} schema image is not a stock photo`);
    check(twitterImage === ogImage, `${route} twitter:image matches og:image`);
  }

  if (breadcrumb) {
    const node = JSON.parse(breadcrumb);
    check(node['@type'] === 'BreadcrumbList', `${route} breadcrumb is a BreadcrumbList`);
    check(node.itemListElement?.length >= 3, `${route} breadcrumb has Home, Blog and the article`);
    check(node.itemListElement?.[1]?.item === `${SITE}/blog`, `${route} breadcrumb points at /blog`);
  }

  const body = html.slice(html.indexOf('<body>'));
  check(body.includes('<article'), `${route} has an article element`);
  check((body.match(/<h2[\s>]/g) ?? []).length >= 2, `${route} article headings are in the HTML`);
  check((body.match(/href="\/blog\/[a-z0-9-]+"/g) ?? []).length >= 2, `${route} links to other posts`);
}

/* Every post listed on /blog */

const blogHtml = read('blog/index.html');
const knownPosts = blogHtml.match(/href="\/blog\/[a-z0-9-]+"/g) ?? [];
for (const file of postFiles) {
  const route = routeOf(file);
  check(knownPosts.includes(`href="${route}"`), `/blog links to ${route}`);
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

check(fs.existsSync(path.join(dist, 'spa-fallback.html')), 'SPA fallback shell exists');

/* ── Routing config and service worker ────────────────────────────────────── */

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

/* ── /updates and the admin are wired into the platform config ───────────── */

const sitemapRewrite = (vercel.rewrites ?? []).find((rule) => rule.source === '/sitemap.xml');
check(
  Boolean(sitemapRewrite?.destination?.includes('path=sitemap')),
  'vercel.json rewrites /sitemap.xml to the API route',
);

// /updates is retired: no redirect keeps the URL alive, and neither public
// section pretends to be it.
check(
  !(vercel.redirects ?? []).some((rule) => rule.source.startsWith('/updates')),
  'vercel.json has no /updates redirect',
);

// A slug no static file matched has to be answered by the page handler, which
// supplies that post's head tags and a real status code. Without these two
// rewrites a manager-published page would be served the empty SPA shell.
for (const [section, type] of [['blog', 'blog'], ['events', 'event']]) {
  const rule = (vercel.rewrites ?? []).find((entry) => entry.source === `/${section}/:slug`);
  check(
    rule?.destination === `/api/[...path]?path=post&type=${type}&slug=:slug`,
    `vercel.json rewrites /${section}/:slug to the page handler`,
  );
}

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
check(fallbackRewrite?.destination === '/spa-fallback.html', 'unknown routes fall back to the shell, not the prerendered homepage');

const sitemapHeaders = (vercel.headers ?? []).find((rule) => rule.source === '/sitemap.xml');
check(Boolean(sitemapHeaders), 'vercel.json sets headers for /sitemap.xml');
const robotsHeaders = (vercel.headers ?? []).find((rule) => rule.source === '/robots.txt');
check(Boolean(robotsHeaders), 'vercel.json sets headers for /robots.txt');

for (const source of ['/auth', '/auth/:path*', '/forgot-password', '/talent/:path*', '/employer/:path*', '/admin', '/admin/:path*', '/newsletter/confirm']) {
  const rule = (vercel.headers ?? []).find((entry) => entry.source === source);
  check(
    (rule?.headers ?? []).some((header) => header.key === 'X-Robots-Tag' && header.value.includes('noindex')),
    `X-Robots-Tag noindex for ${source}`,
  );
}

const robots = fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8');
check(!/Disallow:\s*\/(auth|talent|employer)/.test(robots), 'robots.txt does not block the noindex routes');
check(robots.includes(`Sitemap: ${SITE}/sitemap.xml`), 'robots.txt points at the sitemap');

const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
check(sw.includes("'/sitemap.xml'") && sw.includes("'/robots.txt'"), 'the service worker lets sitemap.xml and robots.txt through');

/* ── Result ───────────────────────────────────────────────────────────────── */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`${checks} checks passed.`);
