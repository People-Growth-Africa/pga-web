import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ApiError } from './http.js';
import { findSessionUserById, isAdminRole, isStaffRole, type Role } from './db.js';
import {
  clearSessionCookie,
  hasSessionCookie,
  readSession,
  refreshManagerSession,
  type SessionClaims,
} from './session.js';

/**
 * Server-side staff authorization.
 *
 * `manager` is the legacy name for an administrator. The dashboard and data
 * lists are open to all staff; staff account management is admin only. The role
 * always comes from the signed session and is re-checked against the row, so a
 * removed or disabled account stops working immediately.
 */
export async function requireStaff(
  req: VercelRequest,
  res: VercelResponse,
  options: { adminOnly?: boolean } = {},
): Promise<SessionClaims> {
  const session = await readSession(req);

  if (!session) {
    if (hasSessionCookie(req)) {
      throw new ApiError(401, 'session_expired', 'Your session expired. Sign in again to carry on.');
    }
    throw new ApiError(401, 'sign_in_required', 'Sign in with a staff account to continue.');
  }

  if (!isStaffRole(session.role)) {
    throw new ApiError(403, 'staff_only', 'This area is for staff accounts.');
  }
  if (options.adminOnly && !isAdminRole(session.role)) {
    throw new ApiError(403, 'admin_only', 'Only an administrator can do that.');
  }

  const user = await findSessionUserById(session.userId);
  if (
    !user ||
    user.disabled_at !== null ||
    user.role !== session.role ||
    user.token_version !== session.tokenVersion
  ) {
    clearSessionCookie(req, res);
    throw new ApiError(401, 'session_expired', 'Your session ended. Sign in again.');
  }

  if (user.must_change_password) {
    throw new ApiError(
      403,
      'password_change_required',
      'Set a new password before opening the admin area.',
    );
  }

  await refreshManagerSession(req, res, session);
  return session;
}

export type { Role };
