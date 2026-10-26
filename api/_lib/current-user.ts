import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError } from './http.js';
import {
  clearAllSessionCookies,
  clearSessionCookie,
  readAnySession,
  readSession,
  type SessionClaims,
  type SessionPortal,
} from './session.js';
import { findSessionUserById } from './db.js';
import type { SessionUserRow } from './db.js';

/**
 * Resolves the signed in public (talent or employer) user for an endpoint. A
 * session is only trusted if the account still exists and its token_version
 * still matches, so deleting an account or resetting a password ends sessions
 * immediately.
 */
export async function requireSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionUserRow> {
  const claims = await readSession(req, 'public');
  if (!claims) {
    throw new ApiError(401, 'not_authenticated', 'Log in to continue.');
  }

  const user = await findSessionUserById(claims.userId);
  if (
    !user ||
    user.disabled_at !== null ||
    user.token_version !== claims.tokenVersion ||
    user.role !== claims.role
  ) {
    clearSessionCookie(req, res, 'public');
    throw new ApiError(401, 'session_expired', 'Your session ended. Log in again.');
  }

  return user;
}

export type AnySession = {
  user: SessionUserRow;
  session: SessionClaims;
  portal: SessionPortal;
};

/**
 * The signed in user from whichever portal owns the request: public, admin or
 * content. Shared endpoints use this so the same sign-out, password change and
 * `/me` work from all three, while each portal's own guard still reads only its
 * cookie.
 */
export async function requireAnySession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AnySession> {
  const found = await readAnySession(req);
  if (!found) {
    throw new ApiError(401, 'not_authenticated', 'Log in to continue.');
  }

  const { session, portal } = found;
  const user = await findSessionUserById(session.userId);
  if (
    !user ||
    user.disabled_at !== null ||
    user.token_version !== session.tokenVersion ||
    user.role !== session.role
  ) {
    clearAllSessionCookies(req, res);
    throw new ApiError(401, 'session_expired', 'Your session ended. Log in again.');
  }

  return { user, session, portal };
}
