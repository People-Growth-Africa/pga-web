/**
 * The sheet content as the browser sees it.
 *
 * The sheet is read on the server (api/_lib/content/source.ts) and handed to the
 * site as JSON, cached at the edge for five minutes. This module makes one
 * request per visit for the whole site: the blog list, a blog post, the events
 * page and an event page all await the same promise, so navigating between them
 * never re-fetches.
 *
 * `FeedEntry` mirrors the type of the same name in api/_lib/content/parse.ts.
 * The two are deliberately separate: the browser bundle should not import
 * server modules, and the guard below re-checks the payload anyway, because data
 * that started life in a spreadsheet should not be trusted just because it
 * arrived over the same origin.
 */

export type ContentType = 'blog' | 'event';

export type FeedEntry = {
  type: ContentType;
  slug: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  platform: string | null;
  author: string;
  /** `YYYY-MM-DD` */
  publishedAt: string;
  eventDate: string | null;
  /** `HH:MM`, 24-hour */
  eventTime: string | null;
  eventEndDate: string | null;
  eventEndTime: string | null;
  location: string | null;
  registrationUrl: string | null;
};

let request: Promise<FeedEntry[] | null> | null = null;

function isFeedEntry(value: unknown): value is FeedEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  const optionalText = (field: unknown) => field === null || typeof field === 'string';
  return (
    (entry.type === 'blog' || entry.type === 'event') &&
    typeof entry.slug === 'string' &&
    entry.slug.length > 0 &&
    typeof entry.title === 'string' &&
    typeof entry.category === 'string' &&
    typeof entry.summary === 'string' &&
    typeof entry.body === 'string' &&
    typeof entry.author === 'string' &&
    typeof entry.publishedAt === 'string' &&
    optionalText(entry.imageUrl) &&
    optionalText(entry.sourceUrl) &&
    optionalText(entry.platform) &&
    optionalText(entry.eventDate) &&
    optionalText(entry.eventTime) &&
    optionalText(entry.eventEndDate) &&
    optionalText(entry.eventEndTime) &&
    optionalText(entry.location) &&
    optionalText(entry.registrationUrl)
  );
}

async function load(): Promise<FeedEntry[] | null> {
  try {
    const response = await fetch('/api/content', { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const entries = (payload as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(entries)) return null;
    return entries.filter(isFeedEntry);
  } catch {
    return null;
  }
}

/**
 * Every published sheet entry, or null when the feed could not be read.
 *
 * null is distinct from `[]` on purpose: an empty sheet means "nothing added
 * yet" and a failed request means "the sheet content cannot be shown right now".
 * A failure is not cached, so the next page that mounts tries again. Either way
 * the built-in blog and event content still renders.
 */
export function fetchContent(): Promise<FeedEntry[] | null> {
  request ??= load().then((result) => {
    if (result === null) request = null;
    return result;
  });
  return request;
}

/** A `YYYY-MM-DD` date as people read dates, in UTC so midday never slips a day. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `2026-11-12` -> `Thursday, 12 November 2026`. */
export function formatEventDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `14:30` -> `2:30 PM`. */
export function formatTime(time: string | null): string | null {
  if (!time) return null;
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return time;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${suffix}`;
}

/** `2026-11-12T14:30:00+01:00`, for JSON-LD startDate/endDate. */
export function eventInstant(date: string, time: string | null): string {
  return `${date}T${time ?? '00:00'}:00+01:00`;
}

/** True for an absolute http(s) URL. Used before rendering a link from the sheet. */
export function isSafeHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}
