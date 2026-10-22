import { del } from '@vercel/blob';

/**
 * Removing cover files that no post points at any more.
 *
 * A cover is two blobs - the full WebP and its thumbnail - and nothing in the
 * database cascades to object storage. Replacing a cover, clearing one, or
 * deleting the post therefore has to delete them here, or the store slowly fills
 * with files no page can reach. `scripts/test-content-admin.mjs` covers the
 * "old file is gone after a replace" case against the Blob API.
 *
 * Two rules keep this safe to call from a request:
 *
 *   1. Only URLs under `<store>.public.blob.vercel-storage.com/covers/` are
 *      deleted. The column also accepts an arbitrary http(s) URL for a pasted
 *      image, and deleting *that* would mean this endpoint could remove a file
 *      the site merely linked to.
 *   2. A failure never fails the save. The row is already written by the time
 *      this runs, and an orphaned blob is a housekeeping problem, not a reason
 *      to tell a manager their published post did not save.
 */

const COVER_PATH_PREFIX = '/covers/';
const BLOB_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

/** The URLs among these that this deployment could have created. */
export function ownCoverUrls(urls: readonly (string | null | undefined)[]): string[] {
  const owned = new Set<string>();
  for (const url of urls) {
    if (!url || !BLOB_HOST.test(url)) continue;
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (pathname.startsWith(COVER_PATH_PREFIX)) owned.add(url);
  }
  return [...owned];
}

/**
 * Deletes the given cover blobs, ignoring anything not ours and any failure.
 *
 * `del` takes a list and is a no-op for a URL that is already gone, which is the
 * right behaviour when two tabs race to replace the same cover.
 */
export async function deleteCoverBlobs(urls: readonly (string | null | undefined)[]): Promise<void> {
  const owned = ownCoverUrls(urls);
  if (owned.length === 0) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;

  try {
    await del(owned);
  } catch (error) {
    console.error(
      `[covers] could not delete ${owned.length} blob(s): ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
