/**
 * Referrer labels.
 *
 * A host is stored, not a URL. The same platform still arrives under several
 * hosts (Facebook alone sends m., l. and lm. subdomains), and the old collector
 * stored an empty string for direct traffic. Both are normalised here so the
 * ranking is one row per source and the direct bucket says what it is instead
 * of rendering as a blank.
 */

const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'm.facebook.com',
  'l.facebook.com',
  'lm.facebook.com',
  'fb.com',
]);

const LINKEDIN_HOSTS = new Set([
  'linkedin.com',
  'com.linkedin.android',
  'lnkd.in',
]);

/** A stored host, with protocol, www and any path removed. */
export function normalizeReferrerHost(value: string): string {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    ?.replace(/\.$/, '') ?? '';
  if (!host) return '';
  // A known platform is stored under one readable name. Keeping the empty
  // string for direct traffic preserves the distinction between "none" and a
  // source literally named Facebook.
  if (FACEBOOK_HOSTS.has(host)) return 'Facebook';
  if (LINKEDIN_HOSTS.has(host)) return 'LinkedIn';
  return host.slice(0, 100);
}

/** How a referrer is shown: direct is explicit, known aliases are grouped. */
export function normalizeReferrerLabel(value: string): string {
  const host = normalizeReferrerHost(value);
  return host === '' ? 'Direct / none' : host;
}

/** Merge rows that now share a label, preserving the descending view order. */
export function mergeReferrerRows<T extends { label: string; views: number }>(
  rows: readonly T[],
): { label: string; views: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = normalizeReferrerLabel(row.label);
    totals.set(label, (totals.get(label) ?? 0) + row.views);
  }
  return [...totals]
    .map(([label, views]) => ({ label, views }))
    .sort((left, right) => right.views - left.views || left.label.localeCompare(right.label));
}
