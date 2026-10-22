import type { VercelRequest, VercelResponse } from '@vercel/node';

import { endpoint } from '../http.js';
import { listPublishedSlugs } from '../db.js';
import { STATIC_SITEMAP_PATHS } from '../static-sitemap.js';

/**
 * GET /api/sitemap - one urlset holding every page worth indexing.
 *
 * /sitemap.xml is rewritten here (see vercel.json). The static file the build
 * writes, dist/sitemap.xml, cannot know about rows in the database: it is
 * generated before anyone has published anything, and a manager publishing at
 * 3am is not going to trigger a deploy. So the list is assembled when it is
 * asked for - the static pages from the committed constant, plus the slug of
 * every published post.
 *
 * Drafts cannot appear here for the same reason they cannot appear on /blog or
 * /events: the only query involved filters on status in SQL.
 *
 * The response is cached at the edge. A new post is in the sitemap once that
 * copy turns over, which is the same window the feed itself uses.
 *
 * Nothing writes dist/sitemap.xml any more. The build used to, and because
 * Vercel checks the filesystem before rewrites that file shadowed this handler:
 * the sitemap production served could only ever list what existed at build time.
 */
const SITE_URL = 'https://www.peoplegrowthafrica.com';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default endpoint({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const slugs = await listPublishedSlugs();

  const seen = new Set<string>();
  const locations: { path: string; lastmod?: string }[] = [];

  const add = (path: string, lastmod?: string) => {
    const normalised = path === '/' ? '/' : path.replace(/\/+$/, '');
    if (seen.has(normalised)) return;
    seen.add(normalised);
    locations.push({ path: normalised, ...(lastmod ? { lastmod } : {}) });
  };

  for (const path of STATIC_SITEMAP_PATHS) add(path);
  // A post lives under the section its type names, so the same slug can never
  // appear at two paths.
  for (const { slug, type, updated_at } of slugs) {
    // A published row carries a real change date, so it is stated. The static
    // pages have none, and today's date on every one of them would be a lie that
    // changed daily.
    add(
      `/${type === 'blog' ? 'blog' : 'events'}/${slug}`,
      updated_at.slice(0, 10),
    );
  }

  const entries = locations
    .map(({ path, lastmod }) =>
      [
        '  <url>',
        `    <loc>${escapeXml(path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`)}</loc>`,
        // A lastmod is written only where the content carries a real date. The
        // static pages have no change date of their own, and today's date on
        // every one of them would be a lie that changes the file daily.
        ...(lastmod ? [`    <lastmod>${escapeXml(lastmod)}</lastmod>`] : []),
        '  </url>',
      ].join('\n'),
    )
    .join('\n');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${entries}\n` +
    '</urlset>\n';

  res.status(200);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(xml);
});
