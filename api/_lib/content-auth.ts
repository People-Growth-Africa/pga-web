import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ApiError } from './http.js';
import { findSessionUserById, isContentManagerRole } from './db.js';
import {
  clearSessionCookie,
  hasSessionCookie,
  readSession,
  refreshManagerSession,
  type SessionClaims,
} from './session.js';

/**
 * Server-side authorization for the content desk.
 *
 * Only the content cookie and only the content_manager role pass. An
 * administrator has separate oversight routes and pages under /admin; a
 * project/HR manager and a legacy manager are refused. The role is re-read from
 * the users row on every request, so disabling or changing an account takes
 * effect at once.
 */
export async function requireContentManager(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionClaims> {
  const session = await readSession(req, 'content');

  if (!session) {
    if (hasSessionCookie(req, 'content')) {
      throw new ApiError(401, 'session_expired', 'Your session expired. Sign in again to carry on.');
    }
    if (hasSessionCookie(req, 'admin')) {
      throw new ApiError(403, 'content_only', 'This area is for content managers. Nothing was changed.');
    }
    throw new ApiError(
      401,
      'sign_in_required',
      'Sign in with a content manager account to continue.',
    );
  }

  if (!isContentManagerRole(session.role)) {
    throw new ApiError(403, 'content_only', 'This area is for content managers. Nothing was changed.');
  }

  const user = await findSessionUserById(session.userId);
  if (
    !user ||
    user.disabled_at !== null ||
    user.role !== session.role ||
    !isContentManagerRole(user.role) ||
    user.must_change_password ||
    user.token_version !== session.tokenVersion
  ) {
    clearSessionCookie(req, res, 'content');
    throw new ApiError(401, 'session_expired', 'Your session ended. Sign in again.');
  }

  await refreshManagerSession(req, res, session, 'content');
  return session;
}
