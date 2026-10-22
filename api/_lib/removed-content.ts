/**
 * The URLs whose content was withdrawn on purpose.
 *
 * These pages were published from src/data, where the site once shipped
 * placeholder articles and programmes. They are gone, and a plain 404 is the
 * wrong answer for them: a crawler reads 404 as "not here yet" and keeps the URL
 * on its list, while 410 Gone says the page was removed and can be dropped.
 *
 * The list is deliberately hand-written and finite. It exists so `post-page`
 * can answer 410 for a URL the build no longer writes, and it is safe to keep
 * forever: the handler only reaches this list after the database says there is
 * no published post with that slug, so if a manager ever publishes one of these
 * slugs again, the real page wins and this list is never consulted.
 *
 * api/ and src/ are separate compile units, which is why this cannot be derived
 * from a removed entry in src/data: the function cannot import it.
 */

export type RemovedContentType = 'blog' | 'event';

type RemovedContent = { type: RemovedContentType; slug: string };

export const REMOVED_CONTENT: readonly RemovedContent[] = [
  // Blog posts that shipped in src/data/posts.ts.
  { type: 'blog', slug: 'from-whatsapp-groups-to-world-class-hr' },
  { type: 'blog', slug: 'understanding-nigerias-labour-act' },
  { type: 'blog', slug: 'first-time-managers-survival-guide' },
  { type: 'blog', slug: 'building-culture-that-survives-growth' },
  { type: 'blog', slug: 'why-best-employees-are-leaving' },
  { type: 'blog', slug: 'how-to-conduct-hr-audit' },
  { type: 'blog', slug: 'ten-to-hundred-employee-inflection-point' },
  { type: 'blog', slug: 'performance-management-for-african-startups' },
  { type: 'blog', slug: 'recruitment-best-practices-african-market' },
  // Events that shipped in src/data/events.ts.
  { type: 'event', slug: 'nigerian-labour-law-compliance-2026' },
  { type: 'event', slug: 'hr-leaders-mentorship-cohort-q2' },
  { type: 'event', slug: 'agribusiness-workforce-optimization' },
  { type: 'event', slug: 'executive-okr-performance-masterclass' },
  { type: 'event', slug: 'founders-people-mentorship-circle' },
  { type: 'event', slug: 'statutory-payroll-masterclass-2026' },
  { type: 'event', slug: 'people-analytics-bootcamp' },
  { type: 'event', slug: 'compensation-salary-banding-workshop' },
  { type: 'event', slug: 'recruitment-engine-webinar' },
  { type: 'event', slug: 'first-time-manager-accelerator' },
  { type: 'event', slug: 'culture-by-design-workshop' },
  { type: 'event', slug: 'performance-conversations-webinar' },
];

const REMOVED = new Set(REMOVED_CONTENT.map((entry) => `${entry.type}:${entry.slug}`));

/** Whether this exact section URL names a page that was removed. */
export function isRemovedContent(type: RemovedContentType, slug: string): boolean {
  return REMOVED.has(`${type}:${slug}`);
}
