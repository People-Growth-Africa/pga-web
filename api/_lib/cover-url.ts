/**
 * How a stored cover is addressed, in one place.
 *
 * A cover lives in Vercel Blob, and a Blob store is created either public or
 * private - the access mode cannot be changed afterwards. A public store hands
 * out a URL anyone can load. A private store requires the read-write token on
 * every read, so a URL pointing straight at it is a broken image on every page;
 * those files are served by this deployment instead (api/_lib/routes/media.ts)
 * under a path of its own.
 *
 * A row's cover column can therefore hold one of three things, and they all have
 * to keep working at once:
 *
 *   1. `/api/media/covers/...` - a cover in this deployment's private store.
 *   2. `https://<store>.public.blob.vercel-storage.com/covers/...` - a cover in a
 *      store that was created public (and anything uploaded before the store was
 *      replaced).
 *   3. Any other http(s) URL, pasted by a manager. Never ours, never deleted.
 *
 * Every reader and the cleanup path go through this module so the three cannot
 * drift apart.
 */

/** Where this deployment serves covers that are stored privately. */
export const COVER_MEDIA_PREFIX = '/api/media/';

/**
 * The pathnames a cover may live at, and nothing else: one of the two cover
 * folders, one file name segment, an image extension.
 *
 * The server generates those names itself (api/_lib/routes/admin-upload.ts), so
 * anything else did not come from here. Refusing the rest is what stops the
 * media endpoint from becoming a reader for the whole store: `..`, another
 * folder, or a pathname outside covers/ never reaches the Blob API.
 */
const COVER_PATHNAME = /^covers\/(?:full|thumb)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:webp|jpe?g|png)$/;

/** The host a Vercel Blob store answers on, in either access mode. */
const BLOB_URL = /^https:\/\/[a-z0-9-]+\.(?:public|private)\.blob\.vercel-storage\.com\//i;

/** Is this a pathname a cover of ours can live at? */
export function isCoverPathname(pathname: string): boolean {
  return COVER_PATHNAME.test(pathname);
}

/** The URL a page uses for a cover this deployment stores. */
export function coverUrl(pathname: string): string {
  return `${COVER_MEDIA_PREFIX}${pathname}`;
}

/**
 * The Blob pathname behind one of our cover URLs, or null when the URL is not
 * ours to serve or delete (a pasted image, another host, a malformed value).
 */
export function coverPathname(url: string | null | undefined): string | null {
  if (!url) return null;

  if (url.startsWith(COVER_MEDIA_PREFIX)) {
    const pathname = url.slice(COVER_MEDIA_PREFIX.length);
    return isCoverPathname(pathname) ? pathname : null;
  }

  if (!BLOB_URL.test(url)) return null;
  try {
    const pathname = new URL(url).pathname.replace(/^\/+/, '');
    return isCoverPathname(pathname) ? pathname : null;
  } catch {
    return null;
  }
}
