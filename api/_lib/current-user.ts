import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError } from './http.js';
import { clearSessionCookie, readSession } from './session.js';
import { findSessionUserById } from './db.js';
import type { SessionUserRow } from './db.js';

/**
 * Resolves the signed in user for a protected endpoint. A session is only
 * trusted if the account still exists and its token_version still matches, so
 * deleting an account or resetting a password ends sessions immediately.
 */
export async function requireSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionUserRow> {
  const claims = await readSession(req);
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
    clearSessionCookie(req, res);
    throw new ApiError(401, 'session_expired', 'Your session ended. Log in again.');
  }

  return user;
}
