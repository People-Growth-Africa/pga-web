/**
 * IndexNow: tell Bing and Yandex about a URL the moment it is published.
 *
 * A sitemap is a hint that a crawler checks when it gets round to it; IndexNow
 * is a notification. Bing, Yandex, Seznam and Naver share the endpoint, so one
 * POST covers all of them. Google does not take part and continues to discover
 * pages the usual way.
 *
 * The key is public by design - the protocol authenticates by asking the site to
 * serve `/<key>.txt` containing the key, which is why that file is committed in
 * public/. It proves control of the host, and nothing else.
 *
 * Nothing here may break a publish. The call is fire-and-forget, the save has
 * already been answered, and a failure is logged rather than surfaced.
 */

export const INDEXNOW_KEY = '8f4c1d7a9b2e6f3c5d8a1b4e7c0f9d2a';

const HOST = 'www.peoplegrowthafrica.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/**
 * Whether this deployment should announce URLs.
 *
 * Production only: a preview publish would announce a URL that is about to
 * disappear, and a local run must never touch a third party. Tests set neither,
 * so the default is silence.
 */
function announcementsEnabled(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/** `postPath` for the two types, without importing the page module. */
export function postUrlPath(type: 'blog' | 'event', slug: string): string {
  return `/${type === 'blog' ? 'blog' : 'events'}/${slug}`;
}

/** Announce one or more published paths. Never throws, never awaited. */
export function pingIndexNow(paths: string[]): void {
  if (!announcementsEnabled() || paths.length === 0) return;

  const body = JSON.stringify({
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: paths.map((path) => `https://${HOST}${path}`),
  });

  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  })
    .then((response) => {
      // 200 and 202 both mean accepted; anything else is worth a log line.
      if (response.status !== 200 && response.status !== 202) {
        console.warn(`[indexnow] ${response.status} for ${paths.join(', ')}`);
      }
    })
    .catch((error: unknown) => {
      console.warn('[indexnow] ping failed', error);
    });
}
