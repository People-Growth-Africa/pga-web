import { parseSheet, type ContentType, type FeedEntry, type SkippedRow } from './parse.js';

/**
 * Where blog posts and events come from: the published CSV of the sheet's
 * "Live" tab.
 *
 * The data layer the pages use is the four functions near the bottom of this
 * file. Everything above them is about the one thing a sheet cannot promise -
 * that it will be reachable - so a failed fetch serves the last good copy and a
 * missing variable serves nothing at all rather than an error.
 *
 * Caching happens twice, on purpose:
 *
 *   - Vercel's CDN keeps /api/content for REVALIDATE_SECONDS (`s-maxage`), which
 *     is this deployment's equivalent of ISR: the function is not even invoked
 *     while a cached copy is fresh, and a stale copy is served while the next
 *     one is built. That is what lets a new post or event appear without a
 *     redeploy.
 *   - This module keeps the last successful parse in memory for the same
 *     window, so a burst of requests that reach different instances, or a
 *     request after the CDN copy expires, does not hammer Google. It also
 *     outlives a failed refresh, which is how the site survives the sheet being
 *     unpublished for a minute.
 *
 * The sheet URL is read from SHEET_CSV_URL and never logged, never put in a
 * response and never sent to the browser.
 */

/** Both caches turn over this often. Five minutes is the promised staleness. */
export const REVALIDATE_SECONDS = 300;

/** A slow sheet must not hold a page request open. */
const FETCH_TIMEOUT_MS = 8000;

let snapshot: { entries: FeedEntry[]; at: number } | null = null;
let inFlight: Promise<FeedEntry[]> | null = null;
let warnedMissingUrl = false;

function sheetUrl(): string | null {
  const value = process.env.SHEET_CSV_URL?.trim();
  return value ? value : null;
}

/**
 * Only messages this module wrote itself are ever logged. A `fetch` TypeError can
 * carry the request URL in its message, and SHEET_CSV_URL must not end up in the
 * platform logs.
 */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  if (/^status \d{3}$/.test(error.message)) return error.message;
  if (error.message === 'not-csv') return 'the sheet returned a page, not CSV';
  return error.name;
}

function logSkipped(skipped: SkippedRow[]): void {
  // A short note per row, capped: a badly formed sheet should not bury the log.
  for (const row of skipped.slice(0, 10)) {
    console.warn(`[content] skipped sheet row ${row.row}: ${row.reason}`);
  }
  if (skipped.length > 10) {
    console.warn(`[content] ${skipped.length - 10} more sheet rows skipped`);
  }
}

async function downloadCsv(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'text/csv, text/plain;q=0.9, */*;q=0.1' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // The caching above is the only cache; an HTTP cache in front of it would
    // make REVALIDATE_SECONDS a suggestion.
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`status ${response.status}`);

  const body = await response.text();
  // A Drive or Forms URL that was not published as CSV answers with a sign-in
  // page. Parsing that as CSV yields one blank row, so it is caught here and
  // reported as a failure instead of silently emptying the pages.
  if (body.trim().startsWith('<')) throw new Error('not-csv');
  return body;
}

async function refresh(url: string): Promise<FeedEntry[]> {
  try {
    const csv = await downloadCsv(url);
    const { entries, skipped } = parseSheet(csv);
    logSkipped(skipped);
    snapshot = { entries, at: Date.now() };
    return entries;
  } catch (error) {
    console.error(
      `[content] could not read the sheet (${describeFailure(error)}), serving the last good copy`,
    );
    // The last good copy, even if it is old. An empty array only when there has
    // never been a successful read on this instance.
    return snapshot?.entries ?? [];
  }
}

/* ── The data layer ──────────────────────────────────────────────── */

/**
 * Every published entry of both types. Never throws and never returns an error:
 * an unset SHEET_CSV_URL, an unpublished tab or a Google outage all read as "no
 * entries", and the existing content keeps working.
 */
export async function getAllEntries(): Promise<FeedEntry[]> {
  const url = sheetUrl();
  if (!url) {
    if (!warnedMissingUrl) {
      warnedMissingUrl = true;
      console.warn('[content] SHEET_CSV_URL is not set, so no sheet entries will be shown.');
    }
    return [];
  }

  if (snapshot && Date.now() - snapshot.at < REVALIDATE_SECONDS * 1000) {
    return snapshot.entries;
  }

  // Concurrent requests share one fetch rather than each starting their own.
  inFlight ??= refresh(url).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** One type's entries: blogs newest first, events soonest first. */
export async function getPosts(type: ContentType): Promise<FeedEntry[]> {
  const entries = (await getAllEntries()).filter((entry) => entry.type === type);
  return sortForType(entries, type);
}

function sortForType(entries: FeedEntry[], type: ContentType): FeedEntry[] {
  const sorted = [...entries];
  if (type === 'blog') {
    // Newest first; Array.prototype.sort is stable, so equal dates keep sheet order.
    sorted.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  } else {
    // Soonest first. An event without a date cannot exist (parseSheet rejects
    // it), so the null fallback is only for type safety.
    sorted.sort((a, b) => {
      const byDate = (a.eventDate ?? '').localeCompare(b.eventDate ?? '');
      if (byDate !== 0) return byDate;
      return (a.eventTime ?? '00:00').localeCompare(b.eventTime ?? '00:00');
    });
  }
  return sorted;
}

export async function getPostBySlug(type: ContentType, slug: string): Promise<FeedEntry | null> {
  const entries = await getAllEntries();
  return entries.find((entry) => entry.type === type && entry.slug === slug) ?? null;
}

export async function getLatestPosts(type: ContentType, limit: number): Promise<FeedEntry[]> {
  const entries = await getPosts(type);
  return entries.slice(0, Math.max(0, limit));
}

/**
 * Drops this instance's copy so the next request reads the sheet again. Called by
 * /api/revalidate; the CDN's copy still has to expire on its own, which is why
 * that endpoint reports the window rather than promising an instant change.
 */
export function clearSnapshot(): void {
  snapshot = null;
}
