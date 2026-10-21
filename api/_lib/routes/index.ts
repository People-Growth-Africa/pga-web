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
  '/auth/logout': gatedAuth(async () => (await import('./auth/logout.js')).default),
  '/auth/logout-all': gatedAuth(async () => (await import('./auth/logout-all.js')).default),
  '/auth/me': gatedAuth(async () => (await import('./auth/me.js')).default),
  '/auth/resend-verification': gatedAuth(async () => (await import('./auth/resend-verification.js')).default),
  '/auth/reset-password': gatedAuth(async () => (await import('./auth/reset-password.js')).default),
  '/auth/signup': gatedAuth(async () => (await import('./auth/signup.js')).default),
  '/auth/verify-email': gatedAuth(async () => (await import('./auth/verify-email.js')).default),

  // --- Dashboard endpoints, behind an account like the rest of auth -------
  '/employer/consultation': gatedAuth(async () => (await import('./employer/consultation.js')).default),
  '/talent/profile': gatedAuth(async () => (await import('./talent/profile.js')).default),

  // --- A probe the forms read on load, so a missing database is known before
  //     a visitor fills anything in rather than after they press send. It is
  //     not gated: it exists to report the gate, and it touches nothing.
  '/forms/availability': lazy(async () => (await import('./forms/availability.js')).default),

  // --- Sheet content: blog rows and event rows from the published CSV. It is
  //     public and cacheable and trades in nothing that belongs to a visitor,
  //     so it is not gated. Revalidate is the only one that changes state: it
  //     is protected by its own secret, not by AUTH_ENABLED. ------------------
  //     (There is no sitemap endpoint: /sitemap.xml is one static urlset written
  //     at build time by scripts/prerender.mjs.) ------------------------------
  '/content': lazy(async () => (await import('./content.js')).default),
  '/revalidate': lazy(async () => (await import('./revalidate.js')).default),

  // --- Public forms that store submissions, up only when a database is set --
  '/leads/consultation-booking': requiresDatabase(async () => (await import('./leads/consultation-booking.js')).default),
  '/leads/enquiry': requiresDatabase(async () => (await import('./leads/enquiry.js')).default),
  '/leads/event-registration': requiresDatabase(async () => (await import('./leads/event-registration.js')).default),
  '/newsletter/confirm': requiresDatabase(async () => (await import('./newsletter/confirm.js')).default),
  '/newsletter/subscribe': requiresDatabase(async () => (await import('./newsletter/subscribe.js')).default),
};

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
