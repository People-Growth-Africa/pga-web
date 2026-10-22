import type { VercelRequest } from '@vercel/node';

import { ApiError } from './http.js';
import { readSession, type SessionClaims } from './session.js';

/**
 * The server's half of "managers only".
 *
 * Every admin endpoint calls this before it touches a row. The UI hides the
 * admin routes from everyone else, but hiding is not a check: a talent or
 * employer account can call /api/admin/* directly with its own perfectly valid
 * session cookie, and this is what stops that. The role is read from the signed
 * session, never from a header, a query parameter or the request body, so there
 * is nothing a caller can supply to talk their way past it.
 *
 * Two different failures, deliberately: someone who is not signed in is told to
 * sign in (401), and someone signed in as the wrong kind of account is told they
 * do not have access (403). Collapsing them into one message would send a
 * manager with an expired session to the wrong debugging path.
 */
export async function requireManager(req: VercelRequest): Promise<SessionClaims> {
  const session = await readSession(req);

  if (!session) {
    throw new ApiError(
      401,
      'sign_in_required',
      'Sign in to the content admin with a manager account.',
    );
  }

  if (session.role !== 'manager') {
    throw new ApiError(
      403,
      'manager_only',
      'This area is for manager accounts. Nothing was changed.',
    );
  }

  return session;
}
