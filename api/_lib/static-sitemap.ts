/**
 * The URLs this site ships as static HTML, at the origin without the scheme.
 *
 * These come from `prerenderPages()` in src/lib/pageMeta.ts, which is what
 * writes the prerendered pages themselves. They are listed here a second time
 * because `api/` and `src/` are separate compile units with their own tsconfig
 * and Node resolution, so a serverless function cannot import the page module.
 * Duplicating a list is only safe if the duplication is caught, which is what
 * the "static sitemap paths match" check in scripts/test-seo.mjs does: add a
 * built-in page and forget this file, and the build's SEO test fails rather
 * than shipping a sitemap that quietly dropped a page.
 *
 * Only the pages the build writes a file for are here. /blog and /events are
 * rendered at request time (they are merged in by /api/sitemap), and articles
 * and events are rows in the posts table, so they were never static pages.
 *
 * /api/sitemap merges these with the published post slugs from the database, so
 * the sitemap stays complete without a rebuild every time a manager publishes.
 */
export const STATIC_SITEMAP_PATHS: readonly string[] = [
  '/',
  '/consultation',
  '/blog',
  '/events',
];
