import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ApiError } from './http.js';
import { findSessionUserById } from './db.js';
import {
  clearSessionCookie,
  hasSessionCookie,
  readSession,
  refreshManagerSession,
  type SessionClaims,
} from './session.js';

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
 * sign in (401 `sign_in_required`), someone whose session ran out is told that
 * it ran out (401 `session_expired`), and someone signed in as the wrong kind of
 * account is told they do not have access (403). Collapsing them would send a
 * manager with an expired session to the wrong debugging path.
 *
 * A request that passes also restarts the idle clock (see `refreshManagerSession`
 * in session.ts): the panel is used by working on it, so activity is exactly
 * what should keep the session alive.
 */
export async function requireManager(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionClaims> {
  const session = await readSession(req);

  if (!session) {
    // A cookie that is present but no longer accepted means the session ended -
    // idle, past its absolute limit, signed out elsewhere, or the password
    // changed. Saying so is the difference between "sign in" and "you were
    // signed out while you were writing".
    if (hasSessionCookie(req)) {
      throw new ApiError(401, 'session_expired', 'Your session expired. Sign in again to carry on.');
    }
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

  // The token says who signed in; the row says whether that is still true. A
  // deleted account, a demoted one, a password change and a sign-out all bump
  // token_version, and without this check every one of them would leave the old
  // token working until it expired - which is exactly the window an attacker
  // holding a copied cookie needs.
  const user = await findSessionUserById(session.userId);
  if (!user || user.role !== 'manager' || user.token_version !== session.tokenVersion) {
    clearSessionCookie(req, res);
    throw new ApiError(401, 'session_expired', 'Your session ended. Sign in again.');
  }

  await refreshManagerSession(req, res, session);

  return session;
}
