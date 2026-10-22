import { del } from '@vercel/blob';

import { COVER_MEDIA_PREFIX, coverPathname } from './cover-url.js';

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
 *   1. Only covers this deployment could have stored are deleted: a path under
 *      `/api/media/covers/`, or a URL on a Vercel Blob host with the same
 *      `covers/` path. The column also accepts an arbitrary http(s) URL for a
 *      pasted image, and deleting *that* would mean this endpoint could remove a
 *      file the site merely linked to.
 *   2. A failure never fails the save. The row is already written by the time
 *      this runs, and an orphaned blob is a housekeeping problem, not a reason
 *      to tell a manager their published post did not save.
 */

/**
 * The refs the Blob API should delete for these cover values.
 *
 * A media path is sent as the bare pathname, which is what `del` takes; a blob
 * URL from an older store is sent as the URL it was saved with, so nothing here
 * has to guess which store answered it.
 */
export function ownCoverTargets(urls: readonly (string | null | undefined)[]): string[] {
  const targets = new Set<string>();

  for (const url of urls) {
    const pathname = coverPathname(url);
    if (!pathname || !url) continue;
    targets.add(url.startsWith(COVER_MEDIA_PREFIX) ? pathname : url);
  }

  return [...targets];
}

/**
 * Deletes the given cover blobs, ignoring anything not ours and any failure.
 *
 * `del` takes a list and is a no-op for a URL that is already gone, which is the
 * right behaviour when two tabs race to replace the same cover.
 */
export async function deleteCoverBlobs(urls: readonly (string | null | undefined)[]): Promise<void> {
  const targets = ownCoverTargets(urls);
  if (targets.length === 0) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;

  try {
    await del(targets);
  } catch (error) {
    console.error(
      `[covers] could not delete ${targets.length} blob(s): ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
