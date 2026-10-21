import Papa from 'papaparse';
import { z } from 'zod';

/**
 * The sheet, in one file: CSV in, typed entries out.
 *
 * The same published tab feeds two places. A row whose `type` is Blog becomes a
 * blog post; a row whose `type` is Event becomes an event. Everything here is
 * pure - no fetch, no environment, no logging - so the rules can be exercised by
 * `npm run test:content` without a network. The fetching and the last-good
 * fallback live next door in source.ts.
 *
 * Every row is treated as untrusted input from a spreadsheet: one bad row is
 * skipped with a note, never allowed to take a page down. Nothing here produces
 * HTML; the body stays plain text and the client renders a tiny markdown subset
 * as React nodes.
 */

/** Which page family an entry belongs to. */
export type ContentType = 'blog' | 'event';

/** One published entry, flattened and JSON-safe. */
export type FeedEntry = {
  type: ContentType;
  slug: string;
  title: string;
  /** Blog category, or the event's own label ("Webinar", "Workshop", ...). */
  category: string;
  summary: string;
  body: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  platform: string | null;
  author: string;
  /** Calendar date, `YYYY-MM-DD`. Never a timestamp: the sheet has no time zone. */
  publishedAt: string;
  /** Events only: the day the event happens, `YYYY-MM-DD`. */
  eventDate: string | null;
  /** Events only: local start time as `HH:MM`, or null when the sheet had none. */
  eventTime: string | null;
  eventEndDate: string | null;
  eventEndTime: string | null;
  location: string | null;
  registrationUrl: string | null;
};

/** A row that was not published, and why. Row 1 is the header, so it starts at 2. */
export type SkippedRow = { row: number; reason: string };

export type ParsedSheet = { entries: FeedEntry[]; skipped: SkippedRow[] };

/**
 * The only statuses that reach a page. "Hidden" is the one the editorial team
 * uses to take an entry down without deleting it, so it is called out by name
 * in the warning; Draft, In review and anything else behave the same way.
 */
const VISIBLE_STATUSES = new Set(['published', 'approved']);

const DEFAULT_BLOG_CATEGORY = 'Insights';
const DEFAULT_EVENT_CATEGORY = 'Event';
const DEFAULT_AUTHOR = 'People Growth Africa';
const MAX_SLUG_LENGTH = 80;
const SUMMARY_LENGTH = 180;

/* ── CSV ─────────────────────────────────────────────────────────── */

/**
 * Column names are matched case-insensitively and trimmed, which is what lets
 * the sheet say "Publish Date" or " publish_date ". Runs of anything that is not
 * a letter or a digit collapse to one underscore, so "Image URL" and
 * "image-url" are the same column.
 */
export function normaliseHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** A cell as a trimmed string. Numbers are accepted; anything else is blank. */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return '';
}

/** Case- and space-insensitive, but no fuzzy matching: only these two words. */
export function normaliseType(value: string): ContentType | null {
  const type = value.trim().toLowerCase();
  if (type === 'blog') return 'blog';
  if (type === 'event') return 'event';
  return null;
}

const rowSchema = z.object({
  title: z.string().min(1, 'title is blank').max(200, 'title is longer than 200 characters'),
  slug: z.string().max(160),
  category: z.string().max(80),
  summary: z.string().max(600),
  body: z.string().max(20000, 'body is longer than 20000 characters'),
  image_url: z.string().max(2000),
  source_url: z.string().max(2000),
  platform: z.string().max(60),
  author: z.string().max(160),
  publish_date: z.string().min(1, 'publish_date is blank').max(60),
  status: z.string().max(40),
  event_date: z.string().max(60),
  end_date: z.string().max(60),
  location: z.string().max(200),
  registration_url: z.string().max(2000),
});

/* ── Images and links ────────────────────────────────────────────── */

/**
 * Hosts an entry's image may come from. Google Drive and the Google user content
 * CDN are here because the sheet is filled in by the social media team, who
 * paste Drive links; unsplash.com and the site's own origin cover what the
 * existing pages already use. To allow another host, add it here and add it to
 * `img-src` in vercel.json (the CSP there is report-only for now).
 */
const IMAGE_HOSTS = new Set([
  'drive.google.com',
  'lh3.googleusercontent.com',
  'images.unsplash.com',
  'peoplegrowthafrica.com',
  'www.peoplegrowthafrica.com',
]);

function imageHostAllowed(hostname: string): boolean {
  return IMAGE_HOSTS.has(hostname) || hostname.endsWith('.googleusercontent.com');
}

/** A Drive file id: long, URL-safe, and never empty. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

/**
 * The file id inside a Drive share link. Covers the forms people actually copy:
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/uc?export=download&id=<ID>
 *   https://drive.google.com/thumbnail?id=<ID>&sz=w1200
 */
function driveFileId(url: URL): string | null {
  if (url.hostname.toLowerCase() !== 'drive.google.com') return null;
  const fromPath = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (fromPath?.[1] && DRIVE_ID.test(fromPath[1])) return fromPath[1];
  const id = url.searchParams.get('id');
  if (id && DRIVE_ID.test(id) && /^\/(open|uc|thumbnail)$/.test(url.pathname)) return id;
  return null;
}

/** http(s) only, no embedded credentials. Everything else is refused. */
function httpUrl(raw: string): URL | null {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return url;
}

/**
 * The URL a page should load, or null for the branded placeholder.
 *
 * Drive share links are rewritten to `thumbnail` form because the `/view` page
 * is HTML, not an image, and the browser would show a broken image. The `sz`
 * parameter asks Drive for something close to the card width rather than the
 * full original.
 */
export function normaliseImageUrl(raw: string): string | null {
  const url = httpUrl(raw);
  if (!url) return null;
  const driveId = driveFileId(url);
  if (driveId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`;
  if (!imageHostAllowed(url.hostname.toLowerCase())) return null;
  return url.toString();
}

/** A link to the original social post, or a registration page. http(s) only. */
export function normaliseLinkUrl(raw: string): string | null {
  const url = httpUrl(raw);
  return url ? url.toString() : null;
}

/* ── Dates and times ─────────────────────────────────────────────── */

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthNumber(name: string): number | null {
  const index = MONTH_KEYS.indexOf(name.trim().toLowerCase().slice(0, 3));
  return index === -1 ? null : index + 1;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** A real calendar date, or null if the numbers do not name one. */
function isoFrom(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200) return null;
  if (month < 1 || month > 12 || day < 1) return null;
  // Day 0 of the next month is the last day of this one, leap years included.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Every date format this accepts. A time may follow any of them.
 *
 *   YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD     - 2026-10-12
 *   DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY     - 12/10/2026
 *   M/D/YYYY                               - 10/12/2026 (see the rule below)
 *   D Mon YYYY / D Month YYYY              - 12 Oct 2026, 12 October 2026
 *   Mon D, YYYY / Month D, YYYY            - Oct 12, 2026, October 12 2026
 *   any of the above + "09:30" or "T09:30:00Z"
 *
 * A four-digit year is required, so "12/10/26" is invalid rather than guessed.
 *
 * The one genuinely ambiguous shape is a/b/YYYY where both numbers could be a
 * month. Reading it month-first would silently move a post from October to
 * December whenever the sheet writes 10/12/2026, so the rule is day-first
 * (DD/MM/YYYY), matching the locale of the team filling the sheet. Where the
 * numbers settle it - 13/10/2026 or 10/13/2026 - one of them being over 12 is
 * enough. The setup doc recommends YYYY-MM-DD in the sheet to avoid the question
 * entirely; the "Live" tab can compute it with TEXT(...,"yyyy-mm-dd").
 */
export function parsePublishDate(input: string): string | null {
  const value = input.trim().replace(/\s+/g, ' ');
  if (!value) return null;

  const yearFirst = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (yearFirst) {
    return isoFrom(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  }

  const slashFirst = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (slashFirst) {
    const first = Number(slashFirst[1]);
    const second = Number(slashFirst[2]);
    const year = Number(slashFirst[3]);
    if (first > 12 && second > 12) return null;
    if (second > 12) return isoFrom(year, first, second);
    // Day-first, including when both numbers could be a month.
    return isoFrom(year, second, first);
  }

  const dayMonthName = value.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})/);
  if (dayMonthName) {
    const month = monthNumber(dayMonthName[2] ?? '');
    return month ? isoFrom(Number(dayMonthName[3]), month, Number(dayMonthName[1])) : null;
  }

  const monthNameDay = value.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (monthNameDay) {
    const month = monthNumber(monthNameDay[1] ?? '');
    return month ? isoFrom(Number(monthNameDay[3]), month, Number(monthNameDay[2])) : null;
  }

  return null;
}

/** `9:00 am` -> `09:00`, `2:30 PM` -> `14:30`, `09:00` -> `09:00`. */
function normaliseTime(hourText: string, minuteText: string, meridiem?: string): string | null {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm';
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (pm) hour += 12;
  }
  if (hour < 0 || hour > 23) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

export type DateAndTime = { date: string; time: string | null };

/**
 * A date with an optional time, for `event_date` and `end_date`.
 *
 * Google Sheets exports a date-time cell in several shapes - `2026-11-12 09:00`,
 * `12/11/2026 9:00:00`, `November 12, 2026 9:00 AM`, or an ISO string with a `T`
 * and a zone. The date half goes through `parsePublishDate`; the time half is
 * pulled out separately and normalised to 24-hour `HH:MM`. A time that cannot be
 * read is dropped rather than making the whole date invalid, because the date is
 * what the page orders and groups by.
 */
export function parseDateTime(input: string): DateAndTime | null {
  const date = parsePublishDate(input);
  if (!date) return null;
  const value = input.trim().replace(/\s+/g, ' ');
  const timeMatch = value.match(/(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  const time = timeMatch ? normaliseTime(timeMatch[1] ?? '', timeMatch[2] ?? '', timeMatch[3]) : null;
  return { date, time };
}

/**
 * Today in Lagos, as `YYYY-MM-DD`. The team is in Nigeria, so "today" means
 * today there: a post dated the 19th is public from 23:00 UTC on the 18th,
 * which is midnight in Lagos, rather than five hours late.
 */
export function todayInLagos(now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the shape wanted here.
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

/* ── Slugs ───────────────────────────────────────────────────────── */

/**
 * A URL-safe slug: lower case, accents folded to their base letters, apostrophes
 * dropped rather than turned into hyphens, everything else collapsed to single
 * hyphens and trimmed. Capped so a very long title cannot produce an unwieldy
 * URL, and the cap never leaves a trailing hyphen.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
}

/**
 * `base`, or `base-2`, `base-3`... on collision within one type. Deterministic,
 * readable, and stable for a given row order. The base is shortened when needed
 * so the result still fits the cap.
 */
export function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let suffixNumber = 2;
  for (;;) {
    const suffix = `-${suffixNumber}`;
    const trimmed = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, '');
    const candidate = `${trimmed || 'entry'}${suffix}`;
    if (!used.has(candidate)) return candidate;
    suffixNumber += 1;
  }
}

/* ── Row -> entry ────────────────────────────────────────────────── */

/** A summary for rows that left it blank: the opening of the body, on a word break. */
export function summarise(body: string, limit: number = SUMMARY_LENGTH): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim();
  return `${trimmed}…`;
}

/**
 * Parses the CSV and returns every public entry, with a note for each row left
 * out.
 *
 * A row is left out when its type is missing or not Blog/Event, when its status
 * is neither Published nor Approved (so "Hidden" and "Draft" both disappear),
 * when a required cell is blank or too long, when its publish date cannot be
 * read or is still in the future, or - for events only - when `event_date` is
 * missing or unreadable.
 *
 * Visibility of an event is decided by `publish_date` and status alone. The
 * event's own date never hides it: an event dated next year is published now so
 * people can register, and an event dated last month stays published so it can
 * appear under "Past events".
 *
 * `today` exists for tests; production uses today in Lagos.
 */
export function parseSheet(csv: string, options: { today?: string } = {}): ParsedSheet {
  const today = options.today ?? todayInLagos();
  const skipped: SkippedRow[] = [];

  let rows: Record<string, unknown>[];
  try {
    const result = Papa.parse<Record<string, unknown>>(csv.replace(/^\uFEFF/, ''), {
      header: true,
      // A blank line is a separator in a sheet, not an entry.
      skipEmptyLines: 'greedy',
      transformHeader: normaliseHeader,
    });
    rows = result.data.filter((row) => Object.values(row).some((value) => text(value) !== ''));
  } catch {
    // Papa is very forgiving; reaching here means the input was not text at all.
    return { entries: [], skipped: [{ row: 0, reason: 'the sheet could not be read as CSV' }] };
  }

  const entries: FeedEntry[] = [];
  // Slugs only have to be unique inside their own type, so /blog/x and /events/x
  // can both exist.
  const used: Record<ContentType, Set<string>> = { blog: new Set(), event: new Set() };

  rows.forEach((row, index) => {
    // The header occupies sheet row 1, so the first record is row 2. A cell with
    // line breaks in it spans several spreadsheet lines, but the record number
    // is what a person searches for in the sheet anyway.
    const rowNumber = index + 2;

    const rawType = text(row.type);
    const type = normaliseType(rawType);
    if (!type) {
      skipped.push({
        row: rowNumber,
        reason: `type "${rawType || 'blank'}" is not Blog or Event`,
      });
      return;
    }

    const status = text(row.status).toLowerCase();
    if (!VISIBLE_STATUSES.has(status)) {
      skipped.push({
        row: rowNumber,
        reason:
          status === 'hidden'
            ? 'status is Hidden'
            : `status "${text(row.status) || 'blank'}" is not Published or Approved`,
      });
      return;
    }

    const candidate = {
      title: text(row.title),
      slug: text(row.slug),
      category: text(row.category),
      summary: text(row.summary),
      body: text(row.body),
      image_url: text(row.image_url),
      source_url: text(row.source_url),
      platform: text(row.platform),
      author: text(row.author),
      publish_date: text(row.publish_date),
      status: text(row.status),
      event_date: text(row.event_date),
      end_date: text(row.end_date),
      location: text(row.location),
      registration_url: text(row.registration_url),
    };

    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join('.') || 'row';
      skipped.push({ row: rowNumber, reason: `${field}: ${issue?.message ?? 'invalid'}` });
      return;
    }

    if (type === 'blog' && parsed.data.body.trim() === '') {
      skipped.push({ row: rowNumber, reason: 'body: a blog post needs a body' });
      return;
    }

    const publishedAt = parsePublishDate(parsed.data.publish_date);
    if (!publishedAt) {
      skipped.push({
        row: rowNumber,
        reason: `publish_date "${parsed.data.publish_date.slice(0, 40)}" is not a recognised date`,
      });
      return;
    }
    if (publishedAt > today) {
      skipped.push({ row: rowNumber, reason: `publish_date ${publishedAt} is in the future` });
      return;
    }

    let eventStart: DateAndTime | null = null;
    if (type === 'event') {
      eventStart = parseDateTime(parsed.data.event_date);
      if (!eventStart) {
        skipped.push({
          row: rowNumber,
          reason: `event_date "${parsed.data.event_date || 'blank'}" is missing or not a recognised date`,
        });
        return;
      }
    }

    // An end date before the start is a typo, not a reason to drop the event:
    // the start is what the page lists and orders by, so the end is ignored.
    let eventEnd: DateAndTime | null = type === 'event' && parsed.data.end_date
      ? parseDateTime(parsed.data.end_date)
      : null;
    if (eventEnd && eventStart && eventEnd.date < eventStart.date) eventEnd = null;

    const title = parsed.data.title.replace(/\s+/g, ' ');
    const base = slugify(parsed.data.slug) || slugify(title) || 'entry';
    const slug = uniqueSlug(base, used[type]);
    used[type].add(slug);

    entries.push({
      type,
      slug,
      title,
      category:
        parsed.data.category ||
        (type === 'event' ? DEFAULT_EVENT_CATEGORY : DEFAULT_BLOG_CATEGORY),
      summary: parsed.data.summary || summarise(parsed.data.body) || parsed.data.location || '',
      body: parsed.data.body,
      imageUrl: normaliseImageUrl(parsed.data.image_url),
      sourceUrl: normaliseLinkUrl(parsed.data.source_url),
      platform: parsed.data.platform || null,
      author: parsed.data.author || DEFAULT_AUTHOR,
      publishedAt,
      eventDate: eventStart?.date ?? null,
      eventTime: eventStart?.time ?? null,
      eventEndDate: eventEnd?.date ?? null,
      eventEndTime: eventEnd?.time ?? null,
      location: type === 'event' ? parsed.data.location || null : null,
      registrationUrl: type === 'event' ? normaliseLinkUrl(parsed.data.registration_url) : null,
    });
  });

  return { entries, skipped };
}
