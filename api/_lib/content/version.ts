/**
 * A cheap marker of "when the content last changed".
 *
 * The public feed is cached at the edge, so nothing here can make a change
 * appear instantly for a visitor - that window is the CDN's, and it is short by
 * design. What this is for is the per-instance side: it gives the feed response
 * a `version` a client can hold on to, so the admin panel can tell "my save"
 * apart from "someone else's save" and refetch without guessing, and it keeps
 * one timestamp for the logs instead of every route inventing its own.
 */
let lastChangedAt = Date.now();

export function markContentChanged(): void {
  lastChangedAt = Date.now();
}

/** Base36, so it is short enough to put in a query string when a client needs it. */
export function contentVersion(): string {
  return lastChangedAt.toString(36);
}
