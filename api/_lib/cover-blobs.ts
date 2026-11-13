import { del } from '@vercel/blob';

import { COVER_MEDIA_PREFIX, mediaPathname } from './cover-url.js';

/**
 * Removing stored images that no post points at any more.
 *
 * A cover is two blobs - the full WebP and its thumbnail - and a speaker photo
 * is the same pair under `speakers/`. Nothing in the database cascades to object
 * storage. Replacing a cover, clearing one, deleting a speaker or purging the
 * post therefore has to delete them here, or the store slowly fills with files
 * no page can reach. `scripts/test-content-admin.mjs` covers the "old file is
 * gone after a replace" case against the Blob API.
 *
 * Two rules keep this safe to call from a request:
 *
 *   1. Only images this deployment could have stored are deleted: a path under
 *      `/api/media/`, or a URL on a Vercel Blob host with the same path. The
 *      column also accepts an arbitrary http(s) URL for a pasted image, and
 *      deleting *that* would mean this endpoint could remove a file the site
 *      merely linked to.
 *   2. A failure never fails the save. The row is already written by the time
 *      this runs, and an orphaned blob is a housekeeping problem, not a reason
 *      to tell a manager their published post did not save.
 */

/**
 * The refs the Blob API should delete for these image values.
 *
 * A media path is sent as the bare pathname, which is what `del` takes; a blob
 * URL from an older store is sent as the URL it was saved with, so nothing here
 * has to guess which store answered it.
 */
export function ownMediaTargets(urls: readonly (string | null | undefined)[]): string[] {
  const targets = new Set<string>();

  for (const url of urls) {
    const pathname = mediaPathname(url);
    if (!pathname || !url) continue;
    targets.add(url.startsWith(COVER_MEDIA_PREFIX) ? pathname : url);
  }

  return [...targets];
}

/**
 * Deletes the given images, ignoring anything not ours and any failure.
 *
 * `del` takes a list and is a no-op for a URL that is already gone, which is the
 * right behaviour when two tabs race to replace the same image.
 */
export async function deleteMediaBlobs(
  urls: readonly (string | null | undefined)[],
): Promise<void> {
  const targets = ownMediaTargets(urls);
  if (targets.length === 0) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;

  try {
    await del(targets);
  } catch (error) {
    console.error(
      `[media] could not delete ${targets.length} blob(s): ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

/** Covers are images too; the older name is kept for the existing callers. */
export const deleteCoverBlobs = deleteMediaBlobs;
