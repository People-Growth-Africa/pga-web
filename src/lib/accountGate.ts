/**
 * Whether the sign up and log in forms are open on the host the page is on.
 *
 * The accounts feature is built but not announced, so the public site answers
 * `/auth` with a coming soon page while the machines and previews used to build,
 * review and demonstrate it keep the real forms. One build, two behaviours, with
 * no build time switch that has to be set correctly by hand.
 *
 * The rule is deliberately the same one the API already applies to credentialed
 * requests (`isLocalOrPreview` in `api/_lib/http.ts`): localhost, 127.0.0.1, ::1
 * and any `*.vercel.app` deployment are local or preview, and everything else is
 * the public site. Matching it matters: the cross site guard only trusts those
 * hosts, so opening a host here that the API refuses would print a form that
 * cannot submit.
 *
 * Two consequences worth stating plainly:
 *
 * - `peoplegrowthafrica.com` and `www.peoplegrowthafrica.com` are listed as the
 *   public site, so they stay closed even though they are not a preview.
 * - Any `*.vercel.app` host is treated as a preview, which includes the project's
 *   own alias if it has one. That host is not the public domain and it is not
 *   advertised anywhere the public can reach it; the day the alias has to be
 *   closed too, its name goes in PUBLIC_SITES and in scripts/test-auth-gate.mjs.
 *
 * This is a presentation rule about which form a visitor sees. It does not gate
 * the API, and a signed in visitor never reaches it: the account page redirects
 * them to their dashboard first, so existing accounts keep working.
 */
const PUBLIC_SITES = new Set(['peoplegrowthafrica.com', 'www.peoplegrowthafrica.com']);

export function accountScreensOpen(hostname: string): boolean {
  // Case and a trailing dot: the same host can arrive written more than one way.
  const host = hostname.toLowerCase().replace(/\.$/, '');

  if (PUBLIC_SITES.has(host)) return false;

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.vercel.app')
  );
}
