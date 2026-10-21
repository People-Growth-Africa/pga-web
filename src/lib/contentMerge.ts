import {
  blogPosts,
  categories as builtInCategories,
  type Author,
  type BlogPost,
  type Category,
} from '../data/posts';
import { eventsList, type EventItem, type EventType } from '../data/events';
import { formatEventDate, formatTime, type FeedEntry } from './content';

/**
 * How the sheet joins the content that already ships with the site.
 *
 * Nothing here replaces or deletes what is in src/data: the built-in posts and
 * events are always rendered, and sheet rows are appended to them. A sheet row
 * whose slug already belongs to a built-in entry is skipped, so the older,
 * hand-written page keeps its URL and its content. That rule is one-way on
 * purpose - editing a sheet row can never quietly rewrite a built-in page.
 *
 * Duplicates are therefore handled by slug, per type. Blog slugs only compete
 * with blog slugs and event slugs with event slugs, because /blog/:slug and
 * /events/:slug are different namespaces.
 */

const AUTHOR_BIO =
  'People Growth Africa is an HR and organisational consulting firm based in Apapa, Lagos, helping businesses across Nigeria and Africa build structured, effective people systems.';

/** Today in Lagos as YYYY-MM-DD, matching the rule the server uses. */
export function todayInLagos(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** A built-in or sheet blog post, with where it came from. */
export type BlogView = BlogPost & { origin: 'site' | 'sheet' };

/** A built-in or sheet event, with the extra facts the cards and page need. */
export type EventView = EventItem & {
  origin: 'site' | 'sheet';
  detailHref: string;
  registrationUrl: string | null;
  /** Last day of a multi-day event, or null. Used by the Event JSON-LD. */
  eventEndDate: string | null;
  /** Local start time as `HH:MM` when the sheet had one, for the Event JSON-LD. */
  startTime: string | null;
  /** Sheet events can carry an image; built-in ones use the card design. */
  imageUrl: string | null;
  /** Grouped into "Past events" rather than "Upcoming events". */
  isPast: boolean;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function readTime(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** Map the sheet's free-text category onto an existing category id when it matches. */
const categoryByKey = new Map<string, string>();
for (const category of builtInCategories) {
  if (category.id === 'all') continue;
  categoryByKey.set(category.id.toLowerCase(), category.id);
  categoryByKey.set(category.label.toLowerCase(), category.id);
}

export function blogFromSheet(entry: FeedEntry): BlogView {
  const authorName = entry.author || 'People Growth Africa';
  const author: Author = {
    name: authorName,
    initials: initials(authorName) || 'PGA',
    role: entry.platform ? `Shared on ${entry.platform}` : 'People Growth Africa',
    bio: AUTHOR_BIO,
  };

  return {
    id: `sheet-blog-${entry.slug}`,
    slug: entry.slug,
    title: entry.title,
    excerpt: entry.summary,
    content: entry.body,
    category: categoryByKey.get(entry.category.toLowerCase()) ?? entry.category,
    tags: entry.category ? [entry.category] : [],
    image: entry.imageUrl ?? '',
    date: entry.publishedAt,
    author,
    readTime: readTime(entry.body),
    featured: false,
    origin: 'sheet',
  };
}

/** Built-in posts first, then sheet posts whose slug is not already taken. */
export function mergeBlogPosts(entries: FeedEntry[]): BlogView[] {
  const site: BlogView[] = blogPosts.map((post) => ({ ...post, origin: 'site' }));
  const taken = new Set(blogPosts.map((post) => post.slug));
  const sheet = entries
    .filter((entry) => entry.type === 'blog' && !taken.has(entry.slug))
    .map(blogFromSheet);

  return [...site, ...sheet].sort((a, b) => b.date.localeCompare(a.date));
}

export function findBlog(slug: string, entries: FeedEntry[]): BlogView | undefined {
  const builtIn = blogPosts.find((post) => post.slug === slug);
  if (builtIn) return { ...builtIn, origin: 'site' };
  const sheet = entries.find((entry) => entry.type === 'blog' && entry.slug === slug);
  return sheet ? blogFromSheet(sheet) : undefined;
}

/**
 * The filter pills: the built-in categories plus any category a sheet post
 * introduced. Without the second half a sheet post with a new category would be
 * visible under "All Posts" but impossible to filter to.
 */
export function mergeBlogCategories(blogs: BlogView[]): Category[] {
  const known = new Set(builtInCategories.map((category) => category.id));
  const extra = new Map<string, string>();
  for (const post of blogs) {
    if (!known.has(post.category) && !extra.has(post.category)) {
      extra.set(post.category, post.category);
    }
  }
  return [...builtInCategories, ...[...extra].map(([id, label]) => ({ id, label }))];
}

function eventTypeFromCategory(category: string): EventType {
  const value = category.toLowerCase();
  if (value.includes('webinar')) return 'webinar';
  if (value.includes('mentor')) return 'mentorship';
  return 'workshop';
}

export function eventFromSheet(entry: FeedEntry, today: string = todayInLagos()): EventView {
  const startDate = entry.eventDate ?? entry.publishedAt;
  const startTime = formatTime(entry.eventTime);
  const endTime = formatTime(entry.eventEndTime);
  const hasEndTime = Boolean(endTime && entry.eventEndDate === entry.eventDate);
  const time = [startTime, hasEndTime ? endTime : null].filter(Boolean).join(' – ');

  const days = Math.max(
    1,
    Math.round(
      (new Date(`${startDate}T12:00:00Z`).getTime() - new Date(`${entry.publishedAt}T12:00:00Z`).getTime()) /
        86_400_000,
    ),
  );

  return {
    id: `sheet-event-${entry.slug}`,
    slug: entry.slug,
    title: entry.title,
    subtitle: entry.summary,
    type: eventTypeFromCategory(entry.category),
    typeLabel: entry.category || 'Event',
    date: formatEventDate(startDate),
    isoDate: startDate,
    time: time || 'Time to be announced',
    duration: endTime && entry.eventEndDate && entry.eventEndDate !== entry.eventDate
      ? `Until ${formatEventDate(entry.eventEndDate)}`
      : days > 0
        ? 'Multi-day programme'
        : '',
    format: entry.location ?? 'Location to be announced',
    description: entry.body,
    learningOutcomes: [],
    targetAudience: '',
    speaker: { name: entry.author, title: '', organization: entry.platform ?? '' },
    seatsTotal: 0,
    seatsRemaining: 0,
    price: '',
    featured: false,
    status: startDate < today ? 'completed' : 'upcoming',
    origin: 'sheet',
    detailHref: `/events/${entry.slug}`,
    registrationUrl: entry.registrationUrl,
    eventEndDate: entry.eventEndDate,
    startTime: entry.eventTime,
    imageUrl: entry.imageUrl,
    // Built-in events keep the status they were written with; sheet events get
    // it from event_date. An event dated in the future or the past is never
    // hidden by that date - only grouped - which is why this is a separate
    // question from visibility.
    isPast: startDate < today,
  };
}

/** Built-in events first, then sheet events whose slug is not already taken. */
export function mergeEvents(entries: FeedEntry[], today: string = todayInLagos()): EventView[] {
  const site: EventView[] = eventsList.map((event) => ({
    ...event,
    origin: 'site',
    detailHref: `/events/${event.slug}`,
    registrationUrl: null,
    eventEndDate: null,
    startTime: null,
    imageUrl: null,
    isPast: event.status === 'completed',
  }));
  const taken = new Set(eventsList.map((event) => event.slug));
  const sheet = entries
    .filter((entry) => entry.type === 'event' && !taken.has(entry.slug))
    .map((entry) => eventFromSheet(entry, today));

  return [...site, ...sheet];
}

export function findEvent(
  slug: string,
  entries: FeedEntry[],
  today: string = todayInLagos(),
): EventView | undefined {
  return mergeEvents(entries, today).find((event) => event.slug === slug);
}

/** Upcoming soonest first, past newest first. */
export function splitEvents(events: EventView[]): { upcoming: EventView[]; past: EventView[] } {
  const upcoming = events
    .filter((event) => !event.isPast)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  const past = events
    .filter((event) => event.isPast)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  return { upcoming, past };
}
