import type { VercelRequest, VercelResponse } from '@vercel/node';

import { AUTH_ENABLED, authDisabled } from '../auth-gate.js';
import { DATABASE_CONFIGURED, databaseUnavailable } from '../db-gate.js';

export type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

/**
 * Every endpoint the API serves, keyed by its path with `/api` stripped.
 *
 * Vercel gives every file in api/ that is not behind an underscore its own
 * serverless function, and the Hobby plan allows twelve of them per deployment.
 * Past twelve the build succeeds and the deployment then fails outright with
 * `exceeded_serverless_functions_per_deployment`, so the handlers live under
 * api/_lib/routes/ (never counted) and are reached through this table from the
 * single function in api/[...path].ts.
 *
 * Each entry loads its handler on demand rather than importing it up front.
 * That matters now that the site deploys without DATABASE_URL, JWT_SECRET,
 * UPSTASH_* or RESEND_API_KEY: those modules throw or connect at import time, so
 * importing them at startup would take the whole function down before a single
 * request - including the ones that never needed them. Loading on demand keeps
 * the module graph small, and the auth endpoints, which are the only ones that
 * read a session or an account, are additionally gated by `AUTH_ENABLED`.
 *
 * The public URLs are unchanged: /api/auth/login is still /api/auth/login, and
 * so on. Writing the surface out by hand rather than walking the directory
 * keeps it readable in one place, and a route that is missing from the table is
 * a 404 in production only if someone forgets to add it here too - which is why
 * the table is the only way in.
 */
export const ROUTES: Record<string, RouteHandler> = {
  // --- Accounts, off unless AUTH_ENABLED is set ----------------------------
  '/auth/account': gatedAuth(async () => (await import('./auth/account.js')).default),
  '/auth/forgot-password': gatedAuth(async () => (await import('./auth/forgot-password.js')).default),
  '/auth/login': gatedAuth(async () => (await import('./auth/login.js')).default),
  //     Separate staff doors: the administrator portal and the content desk
  //     each have their own endpoint, cookie and audience. Neither shares the
  //     public door above. -----------------------------------------------
  '/admin/login': gatedAuth(async () => (await import('./auth/admin-login.js')).default),
  '/content/login': gatedAuth(async () => (await import('./auth/content-login.js')).default),
  '/auth/logout': gatedAuth(async () => (await import('./auth/logout.js')).default),
  '/auth/logout-all': gatedAuth(async () => (await import('./auth/logout-all.js')).default),
  '/auth/me': gatedAuth(async () => (await import('./auth/me.js')).default),
  '/auth/resend-verification': gatedAuth(async () => (await import('./auth/resend-verification.js')).default),
  '/auth/reset-password': gatedAuth(async () => (await import('./auth/reset-password.js')).default),
  '/auth/set-password': gatedAuth(async () => (await import('./auth/set-password.js')).default),
  '/auth/change-password': gatedAuth(async () => (await import('./auth/change-password.js')).default),
  '/auth/signup': gatedAuth(async () => (await import('./auth/signup.js')).default),
  '/auth/verify-email': gatedAuth(async () => (await import('./auth/verify-email.js')).default),

  // --- Dashboard endpoints, behind an account like the rest of auth -------
  '/employer/consultation': gatedAuth(async () => (await import('./employer/consultation.js')).default),
  '/talent/profile': gatedAuth(async () => (await import('./talent/profile.js')).default),

  // --- Content admin: manager accounts only. The gate here is the same
  //     AUTH_ENABLED switch as the rest of accounts; the manager role check
  //     itself lives inside each handler (api/_lib/manager.ts) and reads the
  //     signed session, so a talent or employer cookie is refused there.
  //     Three paths point at the posts module and two at the categories one:
  //     the table is keyed by exact path, so each action gets its own key and
  //     the handler dispatches on the method. ----------------------------------
  '/admin/posts': gatedAuth(async () => (await import('./admin-posts.js')).default),
  '/admin/post': gatedAuth(async () => (await import('./admin-posts.js')).default),
  '/admin/post-status': gatedAuth(async () => (await import('./admin-posts.js')).default),
  '/admin/categories': gatedAuth(async () => (await import('./admin-categories.js')).default),
  '/admin/category': gatedAuth(async () => (await import('./admin-categories.js')).default),
  '/admin/upload': gatedAuth(async () => (await import('./admin-upload.js')).default),
  //     Content desk endpoints. These are a different prefix, cookie and guard
  //     from the admin oversight routes above; a content manager cannot reach
  //     /api/admin/* and an administrator cannot reach /api/content/*.
  '/content/posts': gatedAuth(async () => (await import('./content-posts.js')).default),
  '/content/post': gatedAuth(async () => (await import('./content-posts.js')).default),
  '/content/post-status': gatedAuth(async () => (await import('./content-posts.js')).default),
  '/content/categories': gatedAuth(async () => (await import('./content-categories.js')).default),
  '/content/category': gatedAuth(async () => (await import('./content-categories.js')).default),
  '/content/upload': gatedAuth(async () => (await import('./content-upload.js')).default),
  '/content/ping': gatedAuth(async () => (await import('./content-ping.js')).default),
  //     The panel's keep-alive: a manager editing for an hour sends nothing else,
  //     and the idle limit has to measure absence, not silence. --------------
  '/admin/ping': gatedAuth(async () => (await import('./admin-ping.js')).default),
  //     Event registrations, read and exported by managers. Personal data, so
  //     the handler checks the role on every request and nothing is cached.
  '/admin/registrations': gatedAuth(async () => (await import('./admin-registrations.js')).default),
  '/admin/registrations-export': gatedAuth(async () => (await import('./admin-registrations.js')).default),
  //     Staff dashboard and data lists. All staff roles may read them; staff
  //     account management is admin only inside the handler.
  '/admin/stats': gatedAuth(async () => (await import('./admin-stats.js')).default),
  '/admin/data': gatedAuth(async () => (await import('./admin-data.js')).default),
  '/admin/data-export': gatedAuth(async () => (await import('./admin-data.js')).default),
  '/admin/traffic': gatedAuth(async () => (await import('./admin-traffic.js')).default),
  '/admin/staff': gatedAuth(async () => (await import('./admin-staff.js')).default),
  //     Writing one account's name, email or role. Same module, its own path,
  //     so the disable action keeps its own payload shape. -----------------
  '/admin/staff-detail': gatedAuth(async () => (await import('./admin-staff.js')).default),

  // --- A probe the forms read on load, so a missing database is known before
  //     a visitor fills anything in rather than after they press send. It is
  //     not gated: it exists to report the gate, and it touches nothing.
  '/forms/availability': lazy(async () => (await import('./forms/availability.js')).default),

  // --- Sheet content: blog rows and event rows from the published CSV. It is
  //     public and cacheable and trades in nothing that belongs to a visitor,
  //     so it is not gated. Revalidate is the only one that changes state: it
  //     is protected by its own secret, not by AUTH_ENABLED. ------------------
  //     (/sitemap.xml is rewritten to /sitemap below, so the urlset is
  //     assembled per request instead of only at build time.) -----------------
  '/content': lazy(async () => (await import('./content.js')).default),
  '/revalidate': lazy(async () => (await import('./revalidate.js')).default),

  // --- Cover images stored in a private Blob store. Kept out of the table
  //     above, because its key is a whole subtree: the rest of the URL is the
  //     Blob pathname, and those contain slashes. See PREFIX_ROUTES below. ---

  // --- The published posts feed, the pages that need a head at request time,
  //     and the sitemap that lists them. Public and cacheable, and like
  //     /content they answer from the database rather than from a build, so
  //     publishing does not need a deploy. All three are behind the database
  //     gate for the same reason the forms are: with no DATABASE_URL there is
  //     nothing to read.
  //
  //     /post is not an API path anyone calls. It is the destination of the
  //     rewrites for /blog/:slug and /events/:slug, and it arrives as
  //     path=post&type=blog|event&slug=... so a manager-published page can be
  //     answered with its own meta tags and a real 404. /sitemap arrives the
  //     same way, from the /sitemap.xml rewrite. ---------------------------
  '/posts': requiresDatabase(async () => (await import('./posts.js')).default),
  '/post': requiresDatabase(async () => (await import('./post-page.js')).default),
  //     /index is the destination of the /blog and /events rewrites. It is not
  //     behind the database gate: with no DATABASE_URL it still lists the
  //     built-in records the build recorded, which is better than a 503 on a
  //     section a visitor can reach. --------------------------------
  '/index': lazy(async () => (await import('./index-page.js')).default),
  '/sitemap': requiresDatabase(async () => (await import('./sitemap.js')).default),

  // --- Public forms that store submissions, up only when a database is set --
  '/leads/consultation-booking': requiresDatabase(async () => (await import('./leads/consultation-booking.js')).default),
  '/leads/enquiry': requiresDatabase(async () => (await import('./leads/enquiry.js')).default),
  '/leads/event-registration': requiresDatabase(async () => (await import('./leads/event-registration.js')).default),
  //     The public registration form's write-only endpoint. POST only; it
  //     returns no registrant data and is rate limited per IP.
  '/registrations': requiresDatabase(async () => (await import('./registrations.js')).default),
  '/newsletter/confirm': requiresDatabase(async () => (await import('./newsletter/confirm.js')).default),
  '/newsletter/subscribe': requiresDatabase(async () => (await import('./newsletter/subscribe.js')).default),
  //     First-party traffic: one public write-only beacon and one daily cron.
  '/track': requiresDatabase(async () => (await import('./track.js')).default),
  '/cron/traffic-cleanup': requiresDatabase(async () => (await import('./cron-traffic.js')).default),
};

/**
 * Endpoints that answer a subtree rather than one exact path.
 *
 * The rest of the URL after the prefix is handed to the handler as `path`, the
 * same way a rewrite hands over an endpoint name. Only the cover media route
 * needs this today: what it serves is a Blob pathname, and those contain
 * slashes, so an exact key could never name it.
 */
export const PREFIX_ROUTES: { prefix: string; handler: RouteHandler }[] = [
  { prefix: '/media/', handler: lazy(async () => (await import('./media.js')).default) },
];

/** A handler that is loaded the first time its route is called, then reused. */
function lazy(load: () => Promise<RouteHandler>): RouteHandler {
  let cached: RouteHandler | null = null;
  return async (req, res) => {
    cached ??= await load();
    await cached(req, res);
  };
}

/**
 * An account endpoint: 410 while accounts are off, and only brought into memory
 * when they are on. The check happens before `load()` runs, so the database,
 * session and rate limit modules are never imported while the flag is false.
 */
function gatedAuth(load: () => Promise<RouteHandler>): RouteHandler {
  const handler = lazy(load);
  return async (req, res) => {
    if (!AUTH_ENABLED) {
      authDisabled(res);
      return;
    }
    await handler(req, res);
  };
}

/**
 * A form endpoint that stores its submission: 503 with a way to get in touch
 * while no database is configured, and the handler - and, with it, the database
 * module - is never imported until `DATABASE_URL` is present. The check runs
 * before `load()`, so a missing connection string is a clean answer, never a
 * crash at import time.
 */
function requiresDatabase(load: () => Promise<RouteHandler>): RouteHandler {
  const handler = lazy(load);
  return async (req, res) => {
    if (!DATABASE_CONFIGURED) {
      databaseUnavailable(res);
      return;
    }
    await handler(req, res);
  };
}
