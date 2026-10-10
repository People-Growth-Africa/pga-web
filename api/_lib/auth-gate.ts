import type { VercelResponse } from '@vercel/node';

import { sendJson } from './http.js';

/**
 * The accounts API's one switch, mirroring `AUTH_ENABLED` in
 * `src/config/signup-links.ts` on the client.
 *
 * It is off unless the deployment explicitly sets `AUTH_ENABLED=true`, so the
 * site runs with no database, session, email or rate limit configuration at
 * all. Every auth endpoint is looked up through the table in
 * `routes/index.ts`, which answers 410 while this is false and only then loads
 * the handler - and, with it, the database and JWT modules. A missing env var
 * therefore cannot crash the function at import time.
 */
export const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

/** The public prefix every account endpoint shares. */
export const AUTH_PATH_PREFIX = '/auth/';

/**
 * The answer a disabled auth endpoint gives. 410 rather than 404 because the
 * route did exist and may return: it says "gone for now" without pretending the
 * URL was never there, and nothing downstream touches the database, Redis or
 * Resend to produce it.
 */
export function authDisabled(res: VercelResponse): void {
  sendJson(res, 410, {
    error: 'Accounts are not available right now.',
    code: 'auth_disabled',
  });
}
