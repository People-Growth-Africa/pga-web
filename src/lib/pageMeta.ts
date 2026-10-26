import { blogPosts, categories, type BlogPost } from '../data/posts';
import { eventsList, type EventItem } from '../data/events';

/**
 * An event as the page sees it. The built-in records predate the sheet's extra
 * fields (image, start time, end date); a sheet event carries them, so both
 * shapes are accepted and the missing ones simply do not appear in the JSON-LD.
 */
export type EventMetaSource = EventItem & {
  imageUrl?: string | null;
  /** The full-size cover, preferred over `imageUrl` for sharing. */
  detailImageUrl?: string | null;
  startTime?: string | null;
  eventEndDate?: string | null;
  isOnline?: boolean;
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
  /** The venue, for an in-person event. Never set on an online one. */
  location?: string;
  /**
   * A manager can publish an event as online, in which case the JSON-LD names a
   * VirtualLocation instead of a Place. Built-in and sheet events are in-person
   * unless their text says otherwise, so this is optional.
   */
  isOnline?: boolean;
  /** A free event gets a schema.org Offer at price 0. */
  isFree?: boolean;
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
const STATIC_PAGES: Record<'/' | '/blog' | '/events' | '/consultation', PageMeta> = {
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
};

/** The metadata for a static public page. */
export function staticPageMeta(path: '/' | '/blog' | '/events' | '/consultation'): PageMeta {
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

/** An event's page: /events/<slug>. */
export function eventMeta(event: EventMetaSource): PageMeta {
  return {
    path: `/events/${event.slug}`,
    title: event.title,
    description: clampDescription(
      `${event.date}${event.time ? ` at ${event.time}` : ''}: ${event.subtitle}`,
    ),
    image: event.detailImageUrl ?? event.imageUrl ?? DEFAULT_IMAGE,
    type: 'website',
    event: {
      startDate: eventInstant(event.isoDate, event.startTime ?? null),
      ...(event.eventEndDate ? { endDate: eventInstant(event.eventEndDate, null) } : {}),
      // An online event has nowhere to be: a Place naming "Online" would be a
      // lie to a calendar, so it gets a VirtualLocation instead.
      ...(event.isOnline ? { isOnline: true } : { location: event.format }),
      ...(!event.price || /free/i.test(event.price) ? { isFree: true } : {}),
    },
    // Events carry the same trail as articles. Without it the built-in event
    // pages were the only ones on the site with no BreadcrumbList, while the
    // manager-published ones had one: a difference a crawler sees, for no reason.
    breadcrumb: [
      { name: 'Home', path: '/' },
      { name: 'Events', path: '/events' },
      { name: event.title, path: `/events/${event.slug}` },
    ],
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
 * One row of a section index, as the request-time renderer needs it.
 *
 * `/blog` and `/events` are built by api/_lib/routes/index-page.ts, which cannot
 * import this module (the two compile units are separate). The build writes this
 * list into dist/seo-index.json and the function bundles it, so the built-in
 * records reach the database rows without a second hand-written copy.
 */
export interface IndexEntry {
  type: 'blog' | 'event';
  slug: string;
  title: string;
  excerpt: string;
  /** `YYYY-MM-DD` for a post, an ISO instant for an event. */
  date: string | null;
  category?: string;
}

/** Every built-in post and event, in the order the sections list them. */
export function builtInIndexEntries(): IndexEntry[] {
  return [
    ...blogPosts.map((post) => ({
      type: 'blog' as const,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      date: post.date,
      ...(categoryLabel(post.category) ? { category: categoryLabel(post.category) } : {}),
    })),
    ...eventsList.map((event) => ({
      type: 'event' as const,
      slug: event.slug,
      title: event.title,
      excerpt: event.subtitle,
      // Built-in events predate the sheet's optional start time, so the day is
      // the whole date they have.
      date: eventInstant(event.isoDate, null),
    })),
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
  '/admin/login',
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
  '/admin/login': 'Content admin sign-in | People Growth Africa',
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
      eventAttendanceMode: meta.event.isOnline
        ? 'https://schema.org/OnlineEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode',
      ...(meta.event.isOnline
        ? { virtualLocation: { '@type': 'VirtualLocation', url: canonicalUrl(meta.path) } }
        : meta.event.location
          ? { location: { '@type': 'Place', name: meta.event.location } }
          : {}),
      image: absoluteUrl(meta.image),
      url: canonicalUrl(meta.path),
      organizer: { '@type': 'Organization', '@id': ORG_ID },
      ...(meta.event.isFree
        ? {
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'NGN',
              availability: 'https://schema.org/InStock',
              url: canonicalUrl(meta.path),
            },
          }
        : {}),
    };
  }

  if (meta.article) {
    return {
      '@context': 'https://schema.org',
      // BlogPosting rather than a bare Article: it is the type that says what
      // the page is, and manager-published posts emit the same one.
      '@type': 'BlogPosting',
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
