/**
 * Event slugs that have a better-spelled canonical URL.
 *
 * Two rows were published for the same programme, so both URLs collected
 * traffic. The plural spelling is canonical; vercel.json sends the singular URL
 * there with a 301, and the sitemap does not list the alias. Kept on the server
 * side because the sitemap is rendered there; src/lib/pageMeta.ts carries the
 * same map for the page head.
 */
export const EVENT_SLUG_ALIASES: Readonly<Record<string, string>> = {
  'career-advancement-in-agriculture': 'career-advancements-in-agriculture',
};

export function canonicalEventSlug(slug: string): string {
  return EVENT_SLUG_ALIASES[slug] ?? slug;
}
