/**
 * `/blog` and `/events`, rendered at request time.
 *
 * Both pages used to be written by the build. That had one fatal shape: Vercel
 * serves a file before it applies a rewrite, so while `dist/blog/index.html`
 * existed no request could ever reach code that knew about a post published
 * afterwards. The build no longer writes them; the function renders the list
 * from the built-in records (dist/seo-index.json, generated from src/data) plus
 * every published database row, which is the only arrangement where the HTML is
 * complete at all times.
 *
 * The readable list is placed in front of the app container, outside `#root`.
 * The browser app takes over on mount (src/main.tsx removes it), so the list a
 * visitor sees is still the React one; this is what a crawler that never runs
 * JavaScript reads.
 */

import { SITE_URL, absoluteUrl } from './post-page.js';

export type IndexType = 'blog' | 'event';

/** What one row needs: enough to print a link, a date and a summary. */
export type IndexRow = {
  type: IndexType;
  slug: string;
  title: string;
  excerpt: string;
  /** `YYYY-MM-DD` for a post, an ISO instant for an event. */
  date: string | null;
  category?: string;
};

export const INDEX_SECTION: Record<
  IndexType,
  { path: string; heading: string; section: string; title: string; description: string; intro: string }
> = {
  blog: {
    path: '/blog',
    heading: 'Insights for growing teams',
    section: 'Blog',
    title: 'HR & People Management Blog | People Growth Africa',
    description:
      'Plain-spoken guides on HR, Nigerian labour law and people management for growing businesses in Nigeria and across Africa.',
    intro:
      'Practical writing on HR, Nigerian labour law and the people problems that come with growth.',
  },
  event: {
    path: '/events',
    heading: 'Events and mentorship',
    section: 'Events',
    title: 'HR Webinars & Mentorship | People Growth Africa',
    description:
      'Live webinars, masterclasses and small mentorship cohorts on HR, labour law and leadership for African business leaders and HR teams.',
    intro:
      'Webinars, masterclasses and mentorship cohorts for leaders and HR teams across Africa.',
  },
};

const DEFAULT_IMAGE = '/images/og-image.jpg';
const SITE_NAME = 'People Growth Africa';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
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

/** The complete head block for a section index. */
export function renderIndexHead(type: IndexType): string {
  const copy = INDEX_SECTION[type];
  const url = `${SITE_URL}${copy.path}`;
  const image = absoluteUrl(DEFAULT_IMAGE);

  return [
    `<title>${escapeHtml(copy.title)}</title>`,
    `<meta name="description" content="${escapeHtml(copy.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(copy.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(copy.description)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(copy.title)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(copy.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(copy.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<script type="application/ld+json" id="breadcrumb-schema">${scriptJson({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: copy.section, item: url },
      ],
    })}</script>`,
  ].join('\n    ');
}

/** Newest first for posts, soonest first for events; undated rows go last. */
function sortRows(type: IndexType, rows: IndexRow[]): IndexRow[] {
  const time = (row: IndexRow) => (row.date ? new Date(row.date).getTime() : Number.NaN);
  return [...rows].sort((a, b) => {
    const left = time(a);
    const right = time(b);
    if (Number.isNaN(left) && Number.isNaN(right)) return a.title.localeCompare(b.title);
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    return type === 'event' ? left - right : right - left;
  });
}

/** The readable list, in front of the app container. */
export function renderIndexList(type: IndexType, rows: IndexRow[]): string {
  const copy = INDEX_SECTION[type];
  const link = (row: IndexRow) => `/${type === 'event' ? 'events' : 'blog'}/${row.slug}`;

  const items = sortRows(type, rows).map((row) => {
    const date = formatDay(row.date);
    const facts = [date, row.category].filter((value): value is string => Boolean(value));
    const meta = facts.map((value) => escapeHtml(value)).join(' · ');
    return [
      '<li style="padding:1.35rem 0;border-top:1px solid #e2e8e5">',
      `<a href="${link(row)}" style="font-size:1.2rem;font-weight:600;color:#14201d;text-decoration:none">${escapeHtml(row.title)}</a>`,
      meta ? `<p style="margin:.35rem 0 0;font-size:.85rem;color:#5b6b68">${meta}</p>` : '',
      row.excerpt ? `<p style="margin:.5rem 0 0;color:#31413d">${escapeHtml(row.excerpt)}</p>` : '',
      '</li>',
    ]
      .filter(Boolean)
      .join('\n        ');
  });

  return [
    '<div id="fallback-content">',
    `<article style="max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b2a27;line-height:1.7">`,
    '<nav aria-label="Breadcrumb" style="font-size:.85rem;margin-bottom:1.25rem">',
    `<a href="/" style="color:#0f6e56">Home</a> <span aria-hidden="true">/</span> ${copy.section}`,
    '</nav>',
    `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:clamp(1.9rem,4vw,2.6rem);line-height:1.15;margin:0 0 .75rem">${escapeHtml(copy.heading)}</h1>`,
    `<p style="margin:0 0 1.5rem;color:#5b6b68">${escapeHtml(copy.intro)}</p>`,
    items.length
      ? `<ul style="list-style:none;padding:0;margin:1rem 0 0">\n        ${items.join('\n        ')}\n      </ul>`
      : '<p>Nothing has been published here yet.</p>',
    '</article>',
    '</div>',
    `<!-- ${copy.path} rendered at request time from the built-in records and the published rows -->`,
  ].join('\n    ');
}

