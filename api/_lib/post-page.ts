import type { PostType } from './db.js';

/**
 * The `<head>` for a manager-published post, rendered at request time.
 *
 * This is a second implementation of what `src/lib/pageMeta.ts` builds for the
 * pages the build writes, and it exists for the same reason `static-sitemap.ts`
 * does: `api/` and `src/` are separate compile units, so a serverless function
 * cannot import the page module. The tag order, the escaping and the JSON-LD
 * shape are deliberately copied rather than reinvented, and
 * `scripts/test-content-admin.mjs` asserts the important parts against a real
 * request so the two cannot drift apart unnoticed.
 *
 * Everything here is pure: it takes a row and returns a string. The handler
 * decides the status code, the caching and what to do when there is no row.
 */

export const SITE_URL = 'https://www.peoplegrowthafrica.com';
const SITE_NAME = 'People Growth Africa';
const ORG_ID = `${SITE_URL}/#organization`;
const DEFAULT_IMAGE = '/images/og-image.jpg';
const MAX_DESCRIPTION_LENGTH = 155;

/** The fields a page needs. Body is not one of them: the browser renders it. */
export type PagePost = {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  category: string | null;
  coverImageUrl: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  locationText: string | null;
  isOnline: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export function postPath(post: Pick<PagePost, 'type' | 'slug'>): string {
  return `/${post.type === 'blog' ? 'blog' : 'events'}/${post.slug}`;
}

export function canonicalUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

/** A site path or an absolute URL, made absolute. Shares the page module's rule. */
export function absoluteUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith('/') ? `${SITE_URL}${value}` : `${SITE_URL}/${value}`;
}

/** Trim to a word boundary near the limit, as the page module does. */
function clampDescription(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_DESCRIPTION_LENGTH) return clean;
  const cut = clean.slice(0, MAX_DESCRIPTION_LENGTH);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[.,;:\-–—]$/, '')}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `</script>` inside a JSON string would end the block early. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** A `YYYY-MM-DD` from an ISO instant, without inventing a timezone shift. */
function isoDate(value: string | null): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

/**
 * BlogPosting for a written post, Event for an event.
 *
 * BlogPosting rather than a bare Article: it is the type that says "this is a
 * blog post", and it is what the built-in pages now emit too, so a crawler reads
 * manager-published and hand-written posts as the same kind of thing.
 */
function pageSchema(post: PagePost, path: string, description: string, image: string) {
  if (post.type === 'event') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: post.title,
      description,
      startDate: post.eventStart,
      ...(post.eventEnd ? { endDate: post.eventEnd } : {}),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: post.isOnline
        ? 'https://schema.org/OnlineEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode',
      ...(post.isOnline
        ? { virtualLocation: { '@type': 'VirtualLocation', url: canonicalUrl(path) } }
        : post.locationText
          ? { location: { '@type': 'Place', name: post.locationText } }
          : {}),
      image,
      url: canonicalUrl(path),
      organizer: { '@type': 'Organization', '@id': ORG_ID },
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    image,
    url: canonicalUrl(path),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl(path) },
    datePublished: isoDate(post.publishedAt) ?? isoDate(post.updatedAt),
    dateModified: isoDate(post.updatedAt),
    ...(post.category ? { articleSection: post.category } : {}),
    author: { '@type': 'Organization', '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  };
}

/** The complete head block, in the same order and shape the build writes. */
export function renderPostHead(post: PagePost): string {
  const path = postPath(post);
  const url = canonicalUrl(path);
  const description = clampDescription(post.excerpt || post.title);
  const image = absoluteUrl(post.coverImageUrl || DEFAULT_IMAGE);
  const isEvent = post.type === 'event';

  const tags = [
    `<title>${escapeHtml(post.title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(post.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="${isEvent ? 'website' : 'article'}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(post.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(post.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<script type="application/ld+json" id="page-schema">${scriptJson(
      pageSchema(post, path, description, image),
    )}</script>`,
    `<script type="application/ld+json" id="breadcrumb-schema">${scriptJson({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: canonicalUrl('/') },
        {
          '@type': 'ListItem',
          position: 2,
          name: isEvent ? 'Events' : 'Blog',
          item: canonicalUrl(isEvent ? '/events' : '/blog'),
        },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    })}</script>`,
  ];

  return tags.join('\n    ');
}

/**
 * The head for a slug that names nothing publishable.
 *
 * A 404 with `noindex` and a human title: the SPA still boots and draws its own
 * not-found page, and nothing here invites a crawler to index the URL.
 */
export function renderMissingHead(): string {
  return [
    '<title>Page not found | People Growth Africa</title>',
    '<meta name="robots" content="noindex, nofollow" />',
  ].join('\n    ');
}
