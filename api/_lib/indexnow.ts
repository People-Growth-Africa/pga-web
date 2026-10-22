/**
 * IndexNow: tell Bing and Yandex about a URL the moment it changes.
 *
 * A sitemap is a hint a crawler checks when it gets round to it; IndexNow is a
 * notification. Bing, Yandex, Seznam and Naver share the endpoint, so one POST
 * covers all of them. Google does not take part and continues to discover pages
 * the usual way.
 *
 * The key is public by design: the protocol authenticates by asking the site to
 * serve `/<key>.txt` containing the same key. The build writes that file from
 * `INDEXNOW_KEY` (see scripts/prerender.mjs), so rotating the key is one
 * environment variable and one deploy.
 *
 * Nothing here may break a manager's save. Automatic announcements are
 * fire-and-forget: the request is already answered, a failure is logged, and a
 * rejected fetch is caught so it cannot surface as an unhandled rejection.
 */

export const DEFAULT_INDEXNOW_KEY = 'cd7fc363c33879dab4b0ccf1061ac27f';

/** The one host that may ever appear in a payload. */
export const INDEXNOW_HOST = 'www.peoplegrowthafrica.com';
export const INDEXNOW_SITE = `https://${INDEXNOW_HOST}`;

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_DEDUPE_MS = 10 * 60 * 1000;
const MAX_PER_MINUTE = 30;

export type PostStatus = 'draft' | 'published';

/** What changed, as the admin handlers know it. */
export type PostChange = {
  type: 'blog' | 'event';
  slug: string;
  status: PostStatus;
  /** The status before the change; null for a new post. */
  previous?: PostStatus | null;
};

/** `INDEXNOW_KEY` when it is a usable key, the committed default otherwise. */
export function indexNowKey(): string {
  const fromEnv = (process.env.INDEXNOW_KEY ?? '').trim();
  return /^[A-Za-z0-9-]{8,128}$/.test(fromEnv) ? fromEnv : DEFAULT_INDEXNOW_KEY;
}

/** Overridable so a test can prove the window without waiting ten minutes. */
function dedupeWindowMs(): number {
  const value = Number(process.env.INDEXNOW_DEDUPE_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DEDUPE_MS;
}

/** Automatic announcements are production-only; preview URLs are not public pages. */
function automaticAnnouncementsEnabled(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

function sectionPath(type: PostChange['type']): string {
  return type === 'event' ? '/events' : '/blog';
}

/**
 * The paths a change affects.
 *
 * A draft that stays a draft has no public URL, so it affects nothing. A row that
 * is published, or was published and is not any more (unpublish, delete), does:
 * its own page and the section index whose listing changes. Drafts are therefore
 * excluded by construction rather than by a check someone can forget.
 */
export function indexNowPaths(change: PostChange): string[] {
  const wasPublished = change.previous === 'published';
  const isPublished = change.status === 'published';
  if (!wasPublished && !isPublished) return [];
  return [`${sectionPath(change.type)}/${change.slug}`, sectionPath(change.type)];
}

/** A path this site could actually serve: no admin, no API, no query string. */
function isPublicPath(path: string): boolean {
  return /^\/(blog|events)(\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path);
}

const sentAt = new Map<string, number>();
const sentInTheLastMinute: number[] = [];

/**
 * The subset worth sending, marked as sent.
 *
 * Dedupe is per instance and in memory: a serverless deployment can run several
 * instances, so two of them may each send the same URL once in the window. That
 * is the correct trade-off for a notification - IndexNow asks that a URL not be
 * submitted repeatedly, not that it never be submitted twice by different
 * instances - and it keeps the write path free of another dependency.
 */
function claimPaths(paths: string[]): string[] {
  const now = Date.now();
  const windowMs = dedupeWindowMs();

  for (const [path, at] of sentAt) {
    if (now - at >= windowMs) sentAt.delete(path);
  }

  const fresh = [...new Set(paths)].filter((path) => isPublicPath(path) && !sentAt.has(path));
  if (fresh.length === 0) return [];

  while (sentInTheLastMinute.length > 0 && sentInTheLastMinute[0]! < now - 60_000) {
    sentInTheLastMinute.shift();
  }
  if (sentInTheLastMinute.length + fresh.length > MAX_PER_MINUTE) {
    console.warn('[indexnow] skipping this batch: the per-minute cap is reached');
    return [];
  }

  for (const path of fresh) sentAt.set(path, now);
  for (let index = 0; index < fresh.length; index += 1) sentInTheLastMinute.push(now);

  return fresh;
}

/** The request body. Never logged: it names the key and the key's own URL. */
function buildPayload(urlList: string[]): string {
  const key = indexNowKey();
  return JSON.stringify({
    host: INDEXNOW_HOST,
    key,
    keyLocation: `${INDEXNOW_SITE}/${key}.txt`,
    urlList,
  });
}

/**
 * Send one batch and resolve with the HTTP status.
 *
 * Exported for the CLI script and the tests; the automatic path should use
 * `pingIndexNow`, which adds the production and dedupe rules.
 */
export async function sendIndexNow(urls: string[]): Promise<number> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: buildPayload(urls),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return response.status;
}

/**
 * Announce paths, if this is production and they are new enough to send.
 *
 * Returns nothing on purpose: the caller is a request handler that has already
 * answered, and nothing here may make it wait.
 */
export function pingIndexNow(paths: string[]): void {
  if (!automaticAnnouncementsEnabled()) return;

  const fresh = claimPaths(paths);
  if (fresh.length === 0) return;

  const urls = fresh.map((path) => `${INDEXNOW_SITE}${path}`);

  void sendIndexNow(urls)
    .then((status) => {
      // 200 and 202 both mean accepted. Anything else is worth a log line, and
      // the line names the paths, never the payload.
      if (status !== 200 && status !== 202) {
        console.warn(`[indexnow] ${status} for ${fresh.join(', ')}`);
      }
    })
    .catch((error: unknown) => {
      console.warn('[indexnow] ping failed', error instanceof Error ? error.message : error);
    });
}

/** The admin handlers' one call: work out what changed, then announce it. */
export function announcePostChange(change: PostChange): void {
  pingIndexNow(indexNowPaths(change));
}
