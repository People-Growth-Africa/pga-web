/**
 * The public updates feed, and the slugs both the feed and the admin panel use.
 *
 * Posts come from /api/updates, which is one cached response holding every
 * published post. The list and the detail page read the same payload rather than
 * the detail page fetching its own: the feed is cached at the edge, so the
 * second request would usually be free, and a slug that is not in the list is
 * genuinely not published - which is exactly the 404 the detail page needs to
 * show. A draft never reaches this endpoint at all, so it cannot be found here.
 */

export type UpdatePost = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  categorySlug: string;
  coverImageUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  /** ISO-8601 UTC, or null while the post is still a draft. */
  publishedAt: string | null;
  updatedAt: string;
};

export const UPDATES_PATH = '/updates';

/** One article's page. */
export function updatePath(slug: string): string {
  return `${UPDATES_PATH}/${slug}`;
}

/** The canonical URL, for share links and structured data. */
export function updateCanonicalUrl(slug: string): string {
  return `https://www.peoplegrowthafrica.com${updatePath(slug)}`;
}

/**
 * A title as a URL segment.
 *
 * Runs on the server too (the admin panel sends the slug it computed), so it
 * must stay dependency free and produce the same string the API's regex
 * accepts: lowercase letters, numbers and single hyphens, nothing else.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    // Apostrophes and accents become their base letters rather than being
    // dropped, so "Nigeria's Labour Act" keeps its words.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

/**
 * The feed, or the last good copy.
 *
 * A failed request reads as "no posts" rather than an error banner: the pages
 * have a designed empty state, and a visitor on a train does not need to be
 * told the network failed on top of being shown an empty list.
 */
export async function fetchUpdates(signal?: AbortSignal): Promise<UpdatePost[]> {
  try {
    const response = await fetch('/api/updates', {
      credentials: 'omit',
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { posts?: unknown };
    if (!Array.isArray(payload.posts)) return [];
    return payload.posts.filter(isUpdatePost);
  } catch {
    return [];
  }
}

/** Keeps a malformed response from reaching a component that expects fields. */
function isUpdatePost(value: unknown): value is UpdatePost {
  if (typeof value !== 'object' || value === null) return false;
  const post = value as Partial<UpdatePost>;
  return typeof post.slug === 'string' && typeof post.title === 'string';
}

/** `12 March 2026`, the format the rest of the site uses. */
export function formatUpdateDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
