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

/** The fields a page needs, including the body so the response can carry it. */
export type PagePost = {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string | null;
  coverImageUrl: string | null;
  /** An outside page the article points at, shown as a button after the body. */
  linkLabel: string | null;
  linkUrl: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  locationText: string | null;
  isOnline: boolean;
  registrationUrl: string | null;
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

/** One blank line separates paragraphs; a single newline is kept as a break. */
const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
const LINK_TOKEN = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/;
const ORDERED_ITEM = /^(\d+)\.\s+(.*)$/;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/;

/**
 * The tiny inline subset the editor writes: bold, italic and http(s) links.
 *
 * Every character is escaped here before a tag is built around it, so this
 * function is the whole security boundary for a post body. It mirrors
 * `renderInline` in src/components/PostBody.tsx; that module is the browser's
 * renderer, this one is the crawler's, and they support the same three tokens.
 */
function renderInline(text: string): string {
  const parts: string[] = [];
  let cursor = 0;

  INLINE_TOKEN.lastIndex = 0;
  for (let match = INLINE_TOKEN.exec(text); match !== null; match = INLINE_TOKEN.exec(text)) {
    if (match.index > cursor) parts.push(escapeHtml(text.slice(cursor, match.index)));
    const token = match[0];

    if (token.startsWith('**')) {
      parts.push(`<strong>${escapeHtml(token.slice(2, -2))}</strong>`);
    } else if (token.startsWith('[')) {
      const link = LINK_TOKEN.exec(token);
      const href = link?.[2];
      const label = link?.[1];
      // Only an http(s) destination without quotes or spaces can survive: the
      // markup this builds is never parsed from the body itself.
      if (href && label && /^https?:\/\/[^"<>\s]+$/i.test(href)) {
        parts.push(
          `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
        );
      } else {
        parts.push(escapeHtml(token));
      }
    } else {
      parts.push(`<em>${escapeHtml(token.slice(1, -1))}</em>`);
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) parts.push(escapeHtml(text.slice(cursor)));
  return parts.join('');
}

/**
 * A manager-written body as readable HTML: headings, lists, paragraphs.
 *
 * This is a second implementation of src/components/PostBody.tsx, for the same
 * reason the head is a second implementation of pageMeta: the two compile units
 * cannot import each other. scripts/test-crawl.mjs feeds the same body through
 * both and compares the visible text, so a rule added to one and not the other
 * fails a test instead of quietly changing what a crawler reads.
 */
export function renderBodyHtml(body: string): string {
  const chunks = body
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const html: string[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trim());

    if (lines[0]?.startsWith('## ')) {
      html.push(`<h2>${renderInline(lines[0].slice(3).trim())}</h2>`);
      continue;
    }
    if (lines[0]?.startsWith('### ')) {
      html.push(`<h3>${renderInline(lines[0].slice(4).trim())}</h3>`);
      continue;
    }

    if (lines.every((line) => UNORDERED_ITEM.test(line))) {
      html.push(
        `<ul>${lines
          .map((line) => `<li>${renderInline(UNORDERED_ITEM.exec(line)?.[1] ?? line)}</li>`)
          .join('')}</ul>`,
      );
      continue;
    }
    if (lines.every((line) => ORDERED_ITEM.test(line))) {
      html.push(
        `<ol>${lines
          .map((line) => `<li>${renderInline(ORDERED_ITEM.exec(line)?.[2] ?? line)}</li>`)
          .join('')}</ol>`,
      );
      continue;
    }

    html.push(`<p>${lines.map((line) => renderInline(line)).join('<br />')}</p>`);
  }

  return html.join('\n');
}

/** A YYYY-MM-DD or ISO instant as a readable day in Lagos. */
function formatDay(value: string | null): string {
  if (!value) return '';
  const date = value.length === 10 ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: value.length === 10 ? 'UTC' : 'Africa/Lagos',
  }).format(date);
}

/** An event instant with the time and the zone it is in. */
function formatInstant(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(date);
}

/** An http(s) link, or nothing. Used for the registration button. */
function safeHttpUrl(value: string | null): string | null {
  return value && /^https?:\/\/[^"<>\s]+$/i.test(value) ? value : null;
}

const FALLBACK_FONT =
  "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The article a crawler reads, in front of the app container.
 *
 * Inline styles rather than utility classes: the site's CSS is built from src/,
 * so a class that appears only in api/ would be absent from the stylesheet and
 * this block would render unstyled. It is removed before the app mounts (see
 * src/main.tsx), so for a visitor it is at most a single frame; for a crawler
 * that never runs JavaScript it is the page.
 */
export function renderFallbackArticle(post: PagePost): string {
  const path = postPath(post);
  const isEvent = post.type === 'event';
  const section = isEvent ? 'Events' : 'Blog';
  const cover = post.coverImageUrl ? absoluteUrl(post.coverImageUrl) : null;
  const registration = safeHttpUrl(post.registrationUrl);
  // A blog post can point at an outside page - a LinkedIn post, a source, a
  // longer read. The manager's own label is the button text, and a URL that is
  // not http(s) is dropped rather than written into the response.
  const external = isEvent ? null : safeHttpUrl(post.linkUrl);

  // A post carries a date and a category; an event carries a schedule and a
  // place, which a definition list states properly.
  const blogFacts: string[] = [];
  if (!isEvent) {
    const published = formatDay(post.publishedAt);
    if (published) {
      blogFacts.push(
        `<time datetime="${escapeHtml(post.publishedAt ?? '')}">${escapeHtml(published)}</time>`,
      );
    }
    if (post.category) blogFacts.push(escapeHtml(post.category));
  }

  const eventFacts: string[] = [];
  if (isEvent) {
    const start = formatInstant(post.eventStart);
    const end = post.eventEnd ? formatInstant(post.eventEnd) : '';
    if (start) {
      eventFacts.push(
        '<dt style="font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#5b6b68;margin:.55rem 0 .15rem">When</dt>' +
          `<dd style="margin:0;font-weight:600"><time datetime="${escapeHtml(post.eventStart ?? '')}">${escapeHtml(start)}</time>${end ? ` – ${escapeHtml(end)}` : ''}</dd>`,
      );
    }
    eventFacts.push(
      '<dt style="font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#5b6b68;margin:.55rem 0 .15rem">Where</dt>' +
        `<dd style="margin:0">${escapeHtml(post.isOnline ? 'Online' : (post.locationText ?? 'Venue to be confirmed'))}</dd>`,
    );
  }

  return [
    '<div id="fallback-content">',
    `<article style="max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem;font-family:${FALLBACK_FONT};color:#1b2a27;line-height:1.7">`,
    `<nav aria-label="Breadcrumb" style="font-size:.85rem;margin-bottom:1.25rem">`,
    `<a href="/" style="color:#0f6e56">Home</a> <span aria-hidden="true">/</span> `,
    `<a href="/${isEvent ? 'events' : 'blog'}" style="color:#0f6e56">${section}</a>`,
    '</nav>',
    `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:clamp(1.9rem,4vw,2.6rem);line-height:1.15;margin:0 0 .9rem">${escapeHtml(post.title)}</h1>`,
    blogFacts.length
      ? `<p style="font-size:.9rem;color:#5b6b68;margin:0 0 1.5rem">${blogFacts.join(' <span aria-hidden="true">·</span> ')}</p>`
      : '',
    isEvent
      ? `<dl style="margin:0 0 1.75rem;padding:1rem 1.25rem;background:#f4f7f5;border-radius:.75rem">${eventFacts.join('')}</dl>`
      : '',
    cover
      ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(post.title)}" style="width:100%;height:auto;border-radius:.75rem;margin:0 0 1.75rem" />`
      : '',
    `<div>${renderBodyHtml(post.body)}</div>`,
    external
      ? `<p style="margin:2rem 0 0"><a href="${escapeHtml(external)}" rel="noopener noreferrer" style="display:inline-block;background:#0f6e56;color:#fff;padding:.7rem 1.4rem;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(post.linkLabel?.trim() || 'Read more')}</a></p>`
      : '',
    isEvent && registration
      ? `<p style="margin:2rem 0 0"><a href="${escapeHtml(registration)}" rel="noopener noreferrer" style="display:inline-block;background:#0f6e56;color:#fff;padding:.7rem 1.4rem;border-radius:999px;text-decoration:none;font-weight:600">Register for this event</a></p>`
      : '',
    '</article>',
    '</div>',
    `<!-- ${path} rendered at request time for a post published after the build -->`,
  ]
    .filter(Boolean)
    .join('\n    ');
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

/**
 * The head for a URL whose page was removed on purpose.
 *
 * Served with 410 by the handler, never with 200: the title explains the answer
 * to a person who followed an old link, and `noindex` keeps the URL out of an
 * index while the crawler processes the removal.
 */
export function renderGoneHead(): string {
  return [
    '<title>This page has been removed | People Growth Africa</title>',
    '<meta name="robots" content="noindex, nofollow" />',
  ].join('\n    ');
}
