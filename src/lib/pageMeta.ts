import { blogPosts, categories, type BlogPost } from '../data/posts';
import { eventsList, type EventItem } from '../data/events';

/**
 * An event as the page sees it. The built-in records predate the sheet's extra
 * fields (image, start time, end date); a sheet event carries them, so both
 * shapes are accepted and the missing ones simply do not appear in the JSON-LD.
 */
export type EventMetaSource = EventItem & {
  imageUrl?: string | null;
  startTime?: string | null;
  eventEndDate?: string | null;
};
import { eventInstant } from './content';

/**
 * Every fact the `<head>` of a page needs, in one place.
 *
 * The same values feed two consumers: the client-side `SEO` component (which
 * rewrites the tags as you move around the app) and `scripts/prerender.mjs`
 * (which writes them into the HTML at build time). Keeping one builder for both
 * is the whole point: a title or canonical that the build writes but the client
 * then changes is worse than no tag at all, because the two disagree about what
 * the page is.
 *
 * Nothing here touches `window` or `document`, so it runs in Node during the
 * build as happily as it runs in the browser.
 */

/** Canonical origin. The apex redirects here, so every URL we emit uses www. */
export const SITE_URL = 'https://www.peoplegrowthafrica.com';

export const SITE_NAME = 'People Growth Africa';

/** Stable @id of the single Organization entity declared in index.html. */
export const ORG_ID = `${SITE_URL}/#organization`;

export const DEFAULT_IMAGE = '/images/og-image.jpg';

/** Search results cut titles off at roughly this width. */
const MAX_TITLE_LENGTH = 60;

/** Meta descriptions are read in full at about this length. */
const MAX_DESCRIPTION_LENGTH = 155;

export interface ArticleMeta {
  /** `YYYY-MM-DD` */
  publishedAt: string;
  /** `YYYY-MM-DD`; the publish date when the content records no later change. */
  modifiedAt: string;
  author: {
    /** A Person node unless the post explicitly opts the site into being the author. */
    '@type': 'Person' | 'Organization';
    name: string;
    '@id'?: string;
  };
  section?: string;
}

export interface EventMeta {
  /** ISO 8601 instant, including Lagos' +01:00 offset. */
  startDate: string;
  endDate?: string;
  location?: string;
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface PageMeta {
  /** The route this page is served at, e.g. `/blog/a-post`. Always `/`-leading. */
  path: string;
  title: string;
  description: string;
  image: string;
  type: 'website' | 'article';
  article?: ArticleMeta;
  event?: EventMeta;
  breadcrumb?: BreadcrumbItem[];
}

/** The absolute URL of a route. The homepage keeps its trailing slash. */
export function canonicalUrl(path: string): string {
  if (path === '/') return `${SITE_URL}/`;
  return `${SITE_URL}${path.replace(/\/+$/, '')}`;
}

/** A site-relative asset path as an absolute URL; absolute URLs pass through. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Append the brand when it still fits, otherwise leave the title alone.
 *
 * A blog headline is already the most useful thing in the tab and in a search
 * result; padding it to `Headline | People Growth Africa` would only push the
 * words that matter past the cut. Section pages, whose own titles are short,
 * carry the brand.
 */
export function buildTitle(title: string, { brand = true }: { brand?: boolean } = {}): string {
  if (!brand || title.includes(SITE_NAME)) return title;
  const branded = `${title} | ${SITE_NAME}`;
  return branded.length <= MAX_TITLE_LENGTH ? branded : title;
}

/** Collapse whitespace and cut on a word boundary, never mid-word. */
export function clampDescription(text: string, limit = MAX_DESCRIPTION_LENGTH): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const clipped = (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '');
  return `${clipped}…`;
}

/**
 * The four public pages that are not content records. Their titles and
 * descriptions are written once here so the sitemap, the static HTML and the
 * client-side head can never drift apart.
 */
const STATIC_PAGES: Record<'/' | '/blog' | '/events' | '/consultation' | '/updates', PageMeta> = {
  '/': {
    path: '/',
    title: 'People Growth Africa | HR Consulting for African Businesses',
    description:
      'Practical HR and people systems for growing businesses across Nigeria and Africa: advisory, compliance, audits and manager development.',
    image: DEFAULT_IMAGE,
    type: 'website',
  },
  '/blog': {
    path: '/blog',
    title: 'HR & People Management Blog | People Growth Africa',
    description:
      'Plain-spoken guides on HR, Nigerian labour law and people management for growing businesses in Nigeria and across Africa.',
    image: DEFAULT_IMAGE,
    type: 'website',
  },
  '/events': {
    path: '/events',
    title: 'HR Webinars & Mentorship | People Growth Africa',
    description:
      'Live webinars, masterclasses and small mentorship cohorts on HR, labour law and leadership for African business leaders and HR teams.',
    image: DEFAULT_IMAGE,
    type: 'website',
  },
  '/consultation': {
    path: '/consultation',
    title: 'Book a Free HR Consultation | People Growth Africa',
    description:
      'Book a free 30-minute people systems diagnostic with People Growth Africa. Weekdays 8am-6pm and Saturdays 11am-4pm WAT.',
    image: DEFAULT_IMAGE,
    type: 'website',
  },
  // Not prerendered: the posts it lists live in the database, so the page is
  // served as a shell and filled in by the browser from /api/updates. The head
  // is still set here so the client writes the same values the sitemap claims.
  '/updates': {
    path: '/updates',
    title: 'Updates, News & Opportunities | People Growth Africa',
    description:
      'News, announcements, events, resources and opportunities from People Growth Africa, published by our team.',
    image: DEFAULT_IMAGE,
    type: 'website',
  },
};

/** The metadata for a static public page. */
export function staticPageMeta(
  path: '/' | '/blog' | '/events' | '/consultation' | '/updates',
): PageMeta {
  return STATIC_PAGES[path];
}

function categoryLabel(categoryId: string): string | undefined {
  return categories.find((category) => category.id === categoryId)?.label;
}

/** A blog post's page: /blog/<slug>. */
export function blogMeta(post: BlogPost): PageMeta {
  return {
    path: `/blog/${post.slug}`,
    // Headlines are left exactly as written: they are already the words a
    // searcher would use, and most of them are at the 60-character limit on
    // their own.
    title: post.title,
    description: clampDescription(post.metaDescription ?? post.excerpt),
    // The share image, never the page's decorative `image`: see the field's
    // doc comment in src/data/posts.ts.
    image: post.shareImage || DEFAULT_IMAGE,
    type: 'article',
    article: {
      publishedAt: post.date,
      modifiedAt: post.updated ?? post.date,
      author: {
        '@type': 'Organization' as const,
        '@id': ORG_ID,
        name: SITE_NAME,
      },
      section: categoryLabel(post.category),
    },
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
      { name: post.title, path: `/blog/${post.slug}` },
    ],
  };
}

/**
 * A manager-published post's page: /updates/<slug>.
 *
 * Shaped like `blogMeta` on purpose - same Article node, same publisher, same
 * author reference to the one Organization - so a search engine reads an update
 * and an article as the same site writing the same kind of thing. The fields
 * are declared structurally rather than by importing the feed's type, because * the feed is a client module and this one has to stay importable from the
 * build without pulling a fetch layer into it.
 */
export function updateMeta(post: {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  category: string;
  publishedAt: string | null;
  updatedAt: string;
}): PageMeta {
  const path = `/updates/${post.slug}`;
  return {
    path,
    // Left exactly as written, the same reasoning as a blog headline: it is
    // already the words a searcher would use.
    title: post.title,
    description: clampDescription(post.excerpt || post.title),
    // A cover the manager uploaded, or the site's own card. Never the Unsplash
    // artwork the blog uses: an update is not a blog post and should not borrow
    // one of its pictures.
    image: post.coverImageUrl || DEFAULT_IMAGE,
    type: 'article',
    article: {
      publishedAt: (post.publishedAt ?? post.updatedAt).slice(0, 10),
      modifiedAt: post.updatedAt.slice(0, 10),
      author: {
        '@type': 'Organization' as const,
        '@id': ORG_ID,
        name: SITE_NAME,
      },
      section: post.category,
    },
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Updates', path: '/updates' },
      { name: post.title, path },
    ],
  };
}

/** An event's page: /events/<slug>. */
export function eventMeta(event: EventMetaSource): PageMeta {
  return {
    path: `/events/${event.slug}`,
    title: event.title,
    description: clampDescription(event.subtitle),
    image: event.imageUrl ?? DEFAULT_IMAGE,
    type: 'website',
    event: {
      startDate: eventInstant(event.isoDate, event.startTime ?? null),
      ...(event.eventEndDate ? { endDate: eventInstant(event.eventEndDate, null) } : {}),
      location: event.format,
    },
  };
}

/** Every page that ships real HTML from the build, in sitemap order. */
export function prerenderPages(): PageMeta[] {
  return [
    STATIC_PAGES['/'],
    STATIC_PAGES['/consultation'],
    STATIC_PAGES['/blog'],
    ...blogPosts.map(blogMeta),
    STATIC_PAGES['/events'],
    ...eventsList.map(eventMeta),
  ];
}

/**
 * Client routes that must never be indexed: account, dashboard, password and
 * subscription flows. They are excluded from the sitemap, carry a
 * `X-Robots-Tag: noindex` header in vercel.json, and are served a shell whose
 * `<meta name="robots">` says the same thing.
 */
export const PRIVATE_ROUTES = [
  '/auth',
  '/auth/verify',
  '/forgot-password',
  '/newsletter/confirm',
  '/talent/dashboard',
  '/employer/dashboard',
  '/admin/content',
] as const;

/** Titles for those shells, so a browser tab still says what the page is. */
export const PRIVATE_ROUTE_TITLES: Record<string, string> = {
  '/auth': 'Sign in | People Growth Africa',
  '/auth/verify': 'Verify your email | People Growth Africa',
  '/forgot-password': 'Reset your password | People Growth Africa',
  '/newsletter/confirm': 'Confirm your subscription | People Growth Africa',
  '/talent/dashboard': 'Talent dashboard | People Growth Africa',
  '/employer/dashboard': 'Employer dashboard | People Growth Africa',
  '/admin/content': 'Content Admin | People Growth Africa',
};

/**
 * The Article or Event node for a page.
 *
 * The Organization is referenced by `@id`, never re-declared: index.html holds
 * the one Organization node and every page points at it, so search engines read
 * one company rather than a dozen lookalikes.
 */
export function buildPageSchema(meta: PageMeta): Record<string, unknown> | null {
  if (meta.event) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: meta.title,
      description: meta.description,
      startDate: meta.event.startDate,
      ...(meta.event.endDate ? { endDate: meta.event.endDate } : {}),
      eventStatus: 'https://schema.org/EventScheduled',
      ...(meta.event.location
        ? { location: { '@type': 'Place', name: meta.event.location } }
        : {}),
      image: absoluteUrl(meta.image),
      url: canonicalUrl(meta.path),
      organizer: { '@type': 'Organization', '@id': ORG_ID },
    };
  }

  if (meta.article) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: meta.title,
      description: meta.description,
      image: absoluteUrl(meta.image),
      url: canonicalUrl(meta.path),
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl(meta.path) },
      datePublished: meta.article.publishedAt,
      dateModified: meta.article.modifiedAt,
      ...(meta.article.author['@type'] === 'Organization' && meta.article.author['@id']
        ? { author: { '@type': 'Organization', '@id': meta.article.author['@id'] } }
        : { author: { '@type': 'Person', name: meta.article.author.name } }),
      ...(meta.article.section ? { articleSection: meta.article.section } : {}),
      publisher: { '@id': ORG_ID },
    };
  }

  return null;
}

/** BreadcrumbList for a page that declares a trail. */
export function buildBreadcrumbSchema(meta: PageMeta): Record<string, unknown> | null {
  if (!meta.breadcrumb || meta.breadcrumb.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: meta.breadcrumb.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** JSON-LD is JSON, and `</script>` inside a string would end the block early. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * The complete head block for one page, as HTML.
 *
 * Used only by the build; the browser gets the same values applied through the
 * SEO component. The Organization node is deliberately absent here: it lives in
 * index.html and is copied unchanged into every prerendered page.
 */
export function renderHeadHtml(meta: PageMeta): string {
  const url = canonicalUrl(meta.path);
  const image = absoluteUrl(meta.image);
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    // No fixed width/height: post images come from their own data and are not
    // all 1200x630, and a declared size that is wrong is worse than none.
    `<meta property="og:image:alt" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ];

  const pageSchema = buildPageSchema(meta);
  if (pageSchema) {
    tags.push(
      `<script type="application/ld+json" id="page-schema">${scriptJson(pageSchema)}</script>`,
    );
  }

  const breadcrumb = buildBreadcrumbSchema(meta);
  if (breadcrumb) {
    tags.push(
      `<script type="application/ld+json" id="breadcrumb-schema">${scriptJson(breadcrumb)}</script>`,
    );
  }

  return tags.join('\n    ');
}
