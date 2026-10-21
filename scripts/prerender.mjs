/**
 * Turn the built SPA into a set of real HTML pages, and write the sitemap.
 *
 * Runs after `vite build` (dist/ with the client bundle) and
 * `vite build --config vite.ssr.config.ts` (dist-ssr/ with the renderer). For
 * every public route it renders the same React tree the browser hydrates and
 * writes the result into dist, so the first response already contains the
 * article text, the headings, the internal links and that page's head tags.
 *
 * Deliberately not a headless browser: the whole site is rendered by React in
 * Node in well under a second, which keeps the Vercel Hobby build time and
 * memory as they were.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dist = path.join(root, 'dist');
const templatePath = path.join(dist, 'index.html');

if (!fs.existsSync(templatePath)) {
  console.error('prerender: dist/index.html is missing - run `vite build` first.');
  process.exit(1);
}

const serverEntry = path.join(root, 'dist-ssr', 'server.js');
const metaEntry = path.join(root, 'dist-ssr', 'meta.js');
if (!fs.existsSync(serverEntry) || !fs.existsSync(metaEntry)) {
  console.error('prerender: the SSR build output is missing - run `vite build --config vite.ssr.config.ts`.');
  process.exit(1);
}

const { default: PrerenderApp } = await import(pathToFileURL(serverEntry).href);
const {
  prerenderPages,
  PRIVATE_ROUTES,
  PRIVATE_ROUTE_TITLES,
  canonicalUrl,
  renderHeadHtml,
} = await import(pathToFileURL(metaEntry).href);

/** The app, at one URL, as HTML. */
const render = (routePath) => renderToString(createElement(PrerenderApp, { url: routePath }));

const template = fs.readFileSync(templatePath, 'utf8');
const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
const ROOT_DIV = '<div id="root"></div>';

if (!SEO_BLOCK.test(template)) {
  console.error('prerender: dist/index.html has no <!--seo:start-->...<!--seo:end--> block.');
  process.exit(1);
}
if (!template.includes(ROOT_DIV)) {
  console.error(`prerender: dist/index.html has no ${ROOT_DIV}.`);
  process.exit(1);
}

/** The template with one page's head and body written in. */
function pageHtml({ head, markup, prerendered }) {
  let html = template.replace(SEO_BLOCK, `<!--seo:start-->\n    ${head}\n    <!--seo:end-->`);

  if (markup !== undefined) {
    html = html.replace(ROOT_DIV, `<div id="root">${markup}</div>`);
  }
  if (prerendered) {
    // Read by src/lib/firstPaint.ts: the markup here is already visible, so the
    // hydrating app must not replay entrance animations over it.
    html = html.replace('<html lang="en">', '<html lang="en" data-prerendered>');
  }
  return html;
}

/** `dist/blog/my-post/index.html` - Vercel resolves `/blog/my-post` to it. */
function writeRoute(routePath, html) {
  const relative = routePath === '/' ? 'index.html' : path.join(routePath.replace(/^\//, ''), 'index.html');
  const file = path.join(dist, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, 'utf8');
  return path.relative(dist, file).split(path.sep).join('/');
}

/* ── Public pages ─────────────────────────────────────────────────────────── */

const pages = prerenderPages();
const written = [];

for (const page of pages) {
  const markup = render(page.path);
  if (!markup || markup.length < 500) {
    console.error(`prerender: ${page.path} rendered almost nothing (${markup.length} bytes).`);
    process.exit(1);
  }
  written.push(writeRoute(page.path, pageHtml({ head: renderHeadHtml(page), markup, prerendered: true })));
}

/* ── Client-only shells ───────────────────────────────────────────────────── */

// The SPA fallback every non-prerendered route is rewritten to (vercel.json).
// An empty root and no canonical: it must never be mistaken for a page.
fs.writeFileSync(path.join(dist, 'spa-fallback.html'), template, 'utf8');

const privateHtml = (route) =>
  pageHtml({
    head: [
      `<title>${PRIVATE_ROUTE_TITLES[route] ?? 'People Growth Africa'}</title>`,
      // Belt and braces: vercel.json also sends X-Robots-Tag: noindex for these
      // URLs, and this meta covers anyone who reaches the HTML another way.
      '<meta name="robots" content="noindex, nofollow" />',
    ].join('\n    '),
    prerendered: false,
  });

for (const route of PRIVATE_ROUTES) {
  written.push(writeRoute(route, privateHtml(route)));
}

/* ── Sitemap ──────────────────────────────────────────────────────────────── */

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// One entry per canonical URL, in the order the pages are listed above. A
// lastmod is written only where the content itself carries a real date; the
// build clock is not a modification date.
const seen = new Set();
const entries = [];

for (const page of pages) {
  const loc = canonicalUrl(page.path);
  if (seen.has(loc)) continue;
  seen.add(loc);

  const lastmod = page.article?.publishedAt;
  entries.push(
    [
      '  <url>',
      `    <loc>${escapeXml(loc)}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      '  </url>',
    ].join('\n'),
  );
}

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  `${entries.join('\n')}\n` +
  '</urlset>\n';

fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap, 'utf8');

console.log(`prerender: wrote ${written.length} HTML files (${pages.length} prerendered).`);
console.log(`prerender: dist/sitemap.xml lists ${entries.length} URLs.`);
