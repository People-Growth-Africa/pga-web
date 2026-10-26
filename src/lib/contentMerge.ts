import {
  blogPosts,
  categories as builtInCategories,
  type Author,
  type BlogPost,
  type Category,
} from '../data/posts';
import { eventsList, type EventItem, type EventType } from '../data/events';
import { coerceRegistrationForm } from './registrationForm';
import { formatEventDate, formatTime, type FeedEntry } from './content';
import { displayTime, formatEventDay, lagosDate, lagosTime, type LivePost } from './published';

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

/** A built-in, sheet or manager-published blog post, with where it came from. */
export type BlogView = BlogPost & {
  origin: 'site' | 'sheet' | 'live';
  /**
   * The full-size cover, for the article page. `image` is what a grid uses, and
   * for a manager-published post that is the thumbnail: a card never needs the
   * 1600px file, and a reader who opens the article does.
   */
  detailImage?: string;
  /**
   * An outside page the article points at, offered as a button after the body.
   * Only a manager can set one, and only on a blog post, so a built-in or sheet
   * post never has either field.
   */
  linkLabel?: string | null;
  linkUrl?: string | null;
};

/** A built-in or sheet event, with the extra facts the cards and page need. */
export type EventView = EventItem & {
  origin: 'site' | 'sheet' | 'live';
  detailHref: string;
  registrationUrl: string | null;
  /** Last day of a multi-day event, or null. Used by the Event JSON-LD. */
  eventEndDate: string | null;
  /** Local start time as `HH:MM` when the sheet had one, for the Event JSON-LD. */
  startTime: string | null;
  /** Sheet events can carry an image; built-in ones use the card design. */
  imageUrl: string | null;
  /** The full-size cover for the event page; `imageUrl` is the thumbnail. */
  detailImageUrl: string | null;
  /** Grouped into "Past events" rather than "Upcoming events". */
  isPast: boolean;
  /** Online events say so instead of naming a venue, and the JSON-LD follows. */
  isOnline: boolean;
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

/**
 * A post a manager published from the admin panel.
 *
 * Its category arrives as a slug, so the readable name is carried in `tags` for
 * `mergeBlogCategories` to use as the chip label. The thumbnail is preferred for
 * the card: the grid never needs the full-size file.
 */
export function blogFromLive(post: LivePost): BlogView {
  const author: Author = {
    name: 'People Growth Africa',
    initials: 'PGA',
    role: 'People Growth Africa',
    bio: AUTHOR_BIO,
  };

  return {
    id: `live-blog-${post.slug}`,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.body,
    // Every published blog post has a category (the database refuses one
    // without), so the fallback only covers a malformed payload.
    category: post.categorySlug ?? 'articles',
    tags: post.category ? [post.category] : [],
    image: post.coverImageThumbUrl ?? post.coverImageUrl ?? '',
    // Shares get the full file: an og:image rendered from a 480px thumbnail
    // looks soft in every client that shows it large.
    shareImage: post.coverImageUrl ?? post.coverImageThumbUrl ?? undefined,
    detailImage: post.coverImageUrl ?? post.coverImageThumbUrl ?? undefined,
    linkLabel: post.linkLabel,
    linkUrl: post.linkUrl,
    date: (post.publishedAt ?? post.updatedAt).slice(0, 10),
    author,
    readTime: readTime(post.body),
    featured: false,
    origin: 'live',
  };
}

/**
 * Built-in posts first, then sheet posts, then manager-published ones, each
 * skipped if its slug is already taken.
 *
 * The order is the rule: the hand-written pages that are already indexed keep
 * their URL, and a manager publishing a slug that collides cannot displace one.
 * The editor warns about that collision before saving.
 */
export function mergeBlogPosts(entries: FeedEntry[], live: LivePost[] = []): BlogView[] {
  const site: BlogView[] = blogPosts.map((post) => ({ ...post, origin: 'site' }));
  const taken = new Set(blogPosts.map((post) => post.slug));
  const sheet = entries
    .filter((entry) => entry.type === 'blog' && !taken.has(entry.slug))
    .map(blogFromSheet);

  for (const row of sheet) taken.add(row.slug);

  const published = live.filter((post) => post.type === 'blog' && !taken.has(post.slug));

  return [...site, ...sheet, ...published.map(blogFromLive)].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}

export function findBlog(
  slug: string,
  entries: FeedEntry[],
  live: LivePost[] = [],
): BlogView | undefined {
  const builtIn = blogPosts.find((post) => post.slug === slug);
  if (builtIn) return { ...builtIn, origin: 'site' };
  const sheet = entries.find((entry) => entry.type === 'blog' && entry.slug === slug);
  if (sheet) return blogFromSheet(sheet);
  const row = live.find((post) => post.type === 'blog' && post.slug === slug);
  return row ? blogFromLive(row) : undefined;
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
      // The chip label: a manager's category arrives as a slug, and its readable
      // name travels in tags rather than as a second identifier.
      extra.set(post.category, post.tags[0] ?? post.category);
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
    detailImageUrl: entry.imageUrl,
    // The sheet has a location column and no online flag; an empty location is
    // already rendered as "Location to be announced".
    isOnline: false,
    // Built-in events keep the status they were written with; sheet events get
    // it from event_date. An event dated in the future or the past is never
    // hidden by that date - only grouped - which is why this is a separate
    // question from visibility.
    isPast: startDate < today,
  };
}

/**
 * An event a manager published from the admin panel.
 *
 * The row stores an instant in UTC; everything shown here is that instant read
 * in Africa/Lagos, which is where the audience is and which has no daylight
 * saving to complicate it. The `WAT` suffix is deliberate: a start time without
 * a zone is ambiguous the moment a page is shared outside Nigeria.
 */
export function eventFromLive(post: LivePost, today: string = todayInLagos()): EventView {
  const start = post.eventStart ?? post.updatedAt;
  const startDate = lagosDate(start);
  const startTime = lagosTime(start);

  const endDate = post.eventEnd ? lagosDate(post.eventEnd) : null;
  const sameDayEnd = endDate === startDate ? post.eventEnd : null;

  const time = sameDayEnd
    ? `${displayTime(startTime)} – ${displayTime(lagosTime(sameDayEnd))} WAT`
    : `${displayTime(startTime)} WAT`;

  const isPast = startDate < today;

  return {
    id: `live-event-${post.slug}`,
    slug: post.slug,
    title: post.title,
    subtitle: post.excerpt,
    type: 'workshop',
    typeLabel: post.isOnline ? 'Online' : 'In person',
    date: formatEventDay(start),
    isoDate: startDate,
    time,
    duration: endDate && endDate !== startDate ? `Until ${formatEventDay(post.eventEnd!)}` : '',
    format: post.isOnline ? 'Online' : (post.locationText ?? 'Location to be announced'),
    description: post.body,
    learningOutcomes: [],
    targetAudience: '',
    speaker: { name: 'People Growth Africa', title: '', organization: 'People Growth Africa' },
    seatsTotal: 0,
    seatsRemaining: 0,
    price: '',
    featured: false,
    status: isPast ? 'completed' : 'upcoming',
    origin: 'live',
    detailHref: `/events/${post.slug}`,
    registrationUrl: post.registrationUrl,
    registrationIntro: post.registrationIntro,
    registrationButtonLabel: post.registrationButtonLabel,
    registrationForm: coerceRegistrationForm(post.registrationForm),
    eventEndDate: endDate,
    startTime,
    imageUrl: post.coverImageThumbUrl ?? post.coverImageUrl,
    detailImageUrl: post.coverImageUrl ?? post.coverImageThumbUrl,
    isPast,
    isOnline: post.isOnline,
  };
}

/**
 * Built-in events first, then sheet events, then manager-published ones.
 *
 * Same precedence as blog posts, for the same reason: an existing page keeps
 * its URL, and a manager is warned in the editor before choosing one.
 */
export function mergeEvents(
  entries: FeedEntry[],
  live: LivePost[] = [],
  today: string = todayInLagos(),
): EventView[] {
  const site: EventView[] = eventsList.map((event) => ({
    ...event,
    origin: 'site',
    detailHref: `/events/${event.slug}`,
    registrationUrl: null,
    registrationForm: null,
    eventEndDate: null,
    startTime: null,
    imageUrl: null,
    detailImageUrl: null,
    isPast: event.status === 'completed',
    isOnline: false,
  }));
  const taken = new Set(eventsList.map((event) => event.slug));
  const sheet = entries
    .filter((entry) => entry.type === 'event' && !taken.has(entry.slug))
    .map((entry) => eventFromSheet(entry, today));

  for (const row of sheet) taken.add(row.slug);

  const published = live.filter((post) => post.type === 'event' && !taken.has(post.slug));

  return [...site, ...sheet, ...published.map((post) => eventFromLive(post, today))];
}

export function findEvent(
  slug: string,
  entries: FeedEntry[],
  live: LivePost[] = [],
  today: string = todayInLagos(),
): EventView | undefined {
  return mergeEvents(entries, live, today).find((event) => event.slug === slug);
}

/**
 * Upcoming soonest first, past newest first. The rule lives in published.ts,
 * next to the Lagos date helpers it depends on; this re-export is what the two
 * event pages import.
 */
export { splitEvents } from './published';
