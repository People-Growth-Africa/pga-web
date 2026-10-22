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
  builtInIndexEntries,
  PRIVATE_ROUTES,
  PRIVATE_ROUTE_TITLES,
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
    html = html.replace('<html lang="en-NG">', '<html lang="en-NG" data-prerendered>');
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

/*
 * /blog and /events are deliberately not written here.
 *
 * Vercel serves a file before it applies a rewrite, so while dist/blog/index.html
 * exists no request for /blog can ever reach the function that knows about posts
 * published since the build. Those two pages are rendered by
 * api/_lib/routes/index-page.ts from this build's list plus every published
 * database row, which is the only way their HTML is complete at all times.
 * Everything else - the home page, consultation, every built-in article and
 * event - keeps its prerendered file.
 */
const INDEX_ROUTES = new Set(['/blog', '/events']);
const pages = prerenderPages().filter((page) => !INDEX_ROUTES.has(page.path));
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

/* ── The built-in index, for the request-time index pages ─────────────────── */

/*
 * /blog and /events are served by the API, which cannot import src/. This file
 * is the bridge: the same records the React pages read, reduced to what an index
 * row prints, written into dist/ and bundled into the function by vercel.json.
 * It is build output, not a second source of truth - it is generated from
 * src/data on every build, so it cannot drift.
 */
const indexEntries = builtInIndexEntries();
fs.writeFileSync(
  path.join(dist, 'seo-index.json'),
  `${JSON.stringify({ entries: indexEntries })}\n`,
  'utf8',
);

// No dist/sitemap.xml on purpose. The file would win over the /sitemap.xml
// rewrite (Vercel checks the filesystem before rewrites), so the build could
// only ever publish a sitemap that was already stale. /api/sitemap is the one
// source: static paths plus every published row, asked for on demand.

console.log(`prerender: wrote ${written.length} HTML files (${pages.length} prerendered).`);
console.log(`prerender: dist/seo-index.json lists ${indexEntries.length} built-in index rows.`);
