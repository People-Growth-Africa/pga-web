/**
 * The URLs this site ships as static HTML, at the origin without the scheme.
 *
 * These come from `prerenderPages()` in src/lib/pageMeta.ts, which is what
 * writes dist/sitemap.xml and the prerendered pages themselves. They are listed
 * here a second time because `api/` and `src/` are separate compile units with
 * their own tsconfig and Node resolution, so a serverless function cannot import
 * the page module. Duplicating a list is only safe if the duplication is caught,
 * which is what the "static sitemap paths match" check in scripts/test-seo.mjs
 * does: add a built-in post and forget this file, and the build's SEO test
 * fails rather than shipping a sitemap that quietly dropped a page.
 *
 * /api/sitemap merges these with the published post slugs from the database, so
 * the sitemap stays complete without a rebuild every time a manager publishes.
 */
export const STATIC_SITEMAP_PATHS: readonly string[] = [
  '/',
  '/consultation',
  '/blog',
  '/blog/from-whatsapp-groups-to-world-class-hr',
  '/blog/understanding-nigerias-labour-act',
  '/blog/first-time-managers-survival-guide',
  '/blog/building-culture-that-survives-growth',
  '/blog/why-best-employees-are-leaving',
  '/blog/how-to-conduct-hr-audit',
  '/blog/ten-to-hundred-employee-inflection-point',
  '/blog/performance-management-for-african-startups',
  '/blog/recruitment-best-practices-african-market',
  '/events',
  '/events/nigerian-labour-law-compliance-2026',
  '/events/hr-leaders-mentorship-cohort-q2',
  '/events/agribusiness-workforce-optimization',
  '/events/executive-okr-performance-masterclass',
  '/events/founders-people-mentorship-circle',
  '/events/statutory-payroll-masterclass-2026',
  '/events/people-analytics-bootcamp',
  '/events/compensation-salary-banding-workshop',
  '/events/recruitment-engine-webinar',
  '/events/first-time-manager-accelerator',
  '/events/culture-by-design-workshop',
  '/events/performance-conversations-webinar',
];
