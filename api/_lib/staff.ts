import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ApiError } from './http.js';
import {
  findSessionUserById,
  isAdminPortalRole,
  isAdminRole,
  type Role,
  type SessionUserRow,
} from './db.js';
import {
  clearSessionCookie,
  hasSessionCookie,
  readSession,
  refreshManagerSession,
  type SessionClaims,
} from './session.js';

/**
 * Server-side authorization for the administrator portal.
 *
 * This guard reads the administrator cookie only. A content manager session is
 * a different cookie with a different audience, so even if one is present it
 * does not authenticate this portal. The role is then re-read from the account
 * row, so a removed, demoted or disabled account stops working immediately.
 *
 * Dashboard and data lists are open to every administrator-portal role; staff
 * account management is admin only.
 */
export async function requireStaff(
  req: VercelRequest,
  res: VercelResponse,
  options: { adminOnly?: boolean } = {},
): Promise<SessionClaims> {
  const session = await readSession(req, 'admin');

  if (!session) {
    const contentSession = await readSession(req, 'content');
    if (contentSession?.role === 'content_manager') {
      throw new ApiError(403, 'content_only', 'This area is for administrator-portal accounts.');
    }
    if (hasSessionCookie(req, 'admin')) {
      throw new ApiError(401, 'session_expired', 'Your session expired. Sign in again to carry on.');
    }
    throw new ApiError(401, 'sign_in_required', 'Sign in with a staff account to continue.');
  }

  if (!isAdminPortalRole(session.role)) {
    throw new ApiError(403, 'staff_only', 'This area is for administrator-portal accounts.');
  }
  if (options.adminOnly && !isAdminRole(session.role)) {
    throw new ApiError(403, 'admin_only', 'Only an administrator can do that.');
  }

  const user = await findSessionUserById(session.userId);
  if (
    !user ||
    user.disabled_at !== null ||
    user.role !== session.role ||
    !isAdminPortalRole(user.role) ||
    user.token_version !== session.tokenVersion
  ) {
    clearSessionCookie(req, res, 'admin');
    throw new ApiError(401, 'session_expired', 'Your session ended. Sign in again.');
  }

  if (user.must_change_password) {
    throw new ApiError(
      403,
      'password_change_required',
      'Set a new password before opening the admin area.',
    );
  }

  await refreshManagerSession(req, res, session, 'admin');
  return session;
}

const ADMIN_DATA_ROLES = new Set(['admin', 'project_manager', 'hr_manager']);

/**
 * Personal-data and aggregate dashboard routes. This is an explicit allowlist,
 * not "every staff role": a future role is excluded until someone deliberately
 * adds it here. Content managers and legacy manager rows never pass.
 */
export async function requireAdminData(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionClaims> {
  const session = await requireStaff(req, res);
  if (!ADMIN_DATA_ROLES.has(session.role)) {
    throw new ApiError(403, 'admin_data_only', 'This data is for administrator-portal accounts.');
  }
  return session;
}

/** The dashboard's content oversight is deliberately narrower than the data
 * lists: only the admin role may change what the public sees. */
export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<SessionClaims> {
  return requireStaff(req, res, { adminOnly: true });
}

/**
 * The one account that may invite, disable and edit other staff accounts.
 *
 * Deliberately an email rather than another role: the role column, the session
 * audiences and every portal guard already understand "admin", and a second
 * administrator role would have to be threaded through all of them for a
 * single account. `SUPER_ADMIN_EMAIL` lets the title move without a deploy;
 * unset, it is the address the seed script is documented with.
 *
 * Every other administrator keeps the read-only staff list. The check runs on
 * the server for each write, so hiding a button is a courtesy, not the rule.
 */
export const DEFAULT_SUPER_ADMIN_EMAIL = 'admin@peoplegrowthafrica.com';

export function superAdminEmail(): string {
  const configured = (process.env.SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase();
  return configured || DEFAULT_SUPER_ADMIN_EMAIL;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === superAdminEmail();
}

/**
 * The administrator role *and* the one email, re-read from the account row.
 * `requireStaff` has already checked the account is enabled and still holds
 * the administrator role; this adds the identity the write endpoints need.
 */
export async function requireSuperAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ session: SessionClaims; user: SessionUserRow }> {
  const session = await requireStaff(req, res, { adminOnly: true });
  const user = await findSessionUserById(session.userId);
  if (!user || !isSuperAdminEmail(user.email)) {
    throw new ApiError(
      403,
      'super_admin_only',
      'Only the super administrator can manage staff accounts.',
    );
  }
  return { session, user };
}

export type { Role };
