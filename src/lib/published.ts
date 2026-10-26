/**
 * The manager-published feed, as the browser sees it.
 *
 * One cached response, /api/posts, holds every published blog post and event
 * with its body. The list pages and the detail pages read the same payload
 * rather than each fetching its own: a slug that is not in the list is not
 * published, which is exactly the not-found state the detail pages need, and a
 * draft never reaches this endpoint at all.
 *
 * These rows are joined with the built-in and sheet content in
 * `src/lib/contentMerge.ts`; nothing here decides what a page looks like.
 */

export type LivePostType = 'blog' | 'event';

export type LivePost = {
  type: LivePostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string | null;
  categorySlug: string | null;
  coverImageUrl: string | null;
  coverImageThumbUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  locationText: string | null;
  isOnline: boolean;
  registrationUrl: string | null;
  registrationIntro: string | null;
  registrationButtonLabel: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type LiveFeed = {
  status: 'loading' | 'ready' | 'unavailable';
  posts: LivePost[];
};

/** Where a post lives. The type decides the section, never the data. */
export function livePostPath(post: Pick<LivePost, 'type' | 'slug'>): string {
  return `/${post.type === 'blog' ? 'blog' : 'events'}/${post.slug}`;
}

/** The canonical URL, for share links and structured data. */
export function livePostCanonicalUrl(post: Pick<LivePost, 'type' | 'slug'>): string {
  return `https://www.peoplegrowthafrica.com${livePostPath(post)}`;
}

/**
 * A title as a URL segment.
 *
 * Runs on the server too - the admin panel computes the slug it sends - so it
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

/* ── Lagos ──────────────────────────────────────────────────────────────── */

/** Events are stored in UTC and read by people in Lagos, which has no DST. */
export const LAGOS_TIME_ZONE = 'Africa/Lagos';

/** `2027-03-18T09:00:00Z` -> `2027-03-18`, in Lagos. */
export function lagosDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: LAGOS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** `2027-03-18T09:00:00Z` -> `09:00`, in Lagos. */
export function lagosTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: LAGOS_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '00:00';
  }
}

/** `9:00 AM` from `09:00`. The same shape `formatTime` produces for the sheet. */
export function displayTime(hhmm: string): string {
  const match = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!match) return hhmm;
  const hour24 = Number(match[1]);
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour24 % 12 === 0 ? 12 : hour24 % 12}:${match[2]} ${suffix}`;
}

/**
 * `2027-03-18T09:00` -> `2027-03-18T08:00:00.000Z`.
 *
 * The admin form collects a wall-clock time in Lagos, because that is the time
 * a manager types and the time the audience reads. Lagos is UTC+1 all year, so
 * the offset is written literally rather than taken from the machine, which may
 * be somewhere else entirely.
 */
export function lagosInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  // A date that does not exist (31 February) rolls over in Date; comparing the
  // result back to the input catches that instead of saving a different day.
  const parsed = new Date(`${value}:00+01:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** The inverse, for filling an `datetime-local` input from a stored instant. */
export function isoToLagosInput(iso: string | null): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${lagosDate(iso)}T${lagosTime(iso)}`;
}

/**
 * Upcoming soonest first, past newest first.
 *
 * Generic over the shape rather than tied to `EventView`, so it can be tested
 * in Node without pulling the whole content module (and the built-in data) into
 * the test run. Both sides of the split read `isoDate`, which is a Lagos
 * calendar day, so an event that starts at 00:30 WAT stays on the day a member
 * of the audience would call it.
 */
export function splitEvents<T extends { isoDate: string; isPast: boolean }>(
  events: readonly T[],
): { upcoming: T[]; past: T[] } {
  return {
    upcoming: events
      .filter((event) => !event.isPast)
      .slice()
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate)),
    past: events
      .filter((event) => event.isPast)
      .slice()
      .sort((a, b) => b.isoDate.localeCompare(a.isoDate)),
  };
}

/** `22 October 2026`, the format the rest of the site uses. */
export function formatPostDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      timeZone: LAGOS_TIME_ZONE,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** `Thursday 18 March 2027`, for an event. */
export function formatEventDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      timeZone: LAGOS_TIME_ZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/* ── Fetching ───────────────────────────────────────────────────────────── */

let inFlight: Promise<LiveFeed> | null = null;

/**
 * The feed, or the last good copy.
 *
 * Shared by every consumer, so a list page and the page it links to do not each
 * pay for it. A failed request reads as "no posts" rather than an error banner:
 * the pages have designed empty states, and a visitor on a train does not need
 * to be told the network failed on top of being shown an empty list.
 */
export function fetchLivePosts(): Promise<LiveFeed> {
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<LiveFeed> => {
    try {
      const response = await fetch('/api/posts', { credentials: 'omit' });
      if (!response.ok) return { status: 'unavailable', posts: [] };
      const payload = (await response.json()) as { posts?: unknown };
      if (!Array.isArray(payload.posts)) return { status: 'unavailable', posts: [] };
      return { status: 'ready', posts: payload.posts.filter(isLivePost) };
    } catch {
      return { status: 'unavailable', posts: [] };
    }
  })();

  return inFlight;
}

/** Keeps a malformed response from reaching a component that expects fields. */
function isLivePost(value: unknown): value is LivePost {
  if (typeof value !== 'object' || value === null) return false;
  const post = value as Partial<LivePost>;
  return (
    (post.type === 'blog' || post.type === 'event') &&
    typeof post.slug === 'string' &&
    typeof post.title === 'string'
  );
}
