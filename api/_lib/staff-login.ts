import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ApiError, clientIp, parseJsonBody, safeRedirect, sendJson } from './http.js';
import { loginSchema, parseInput } from './validation.js';
import {
  findSessionUserById,
  findUserByEmail,
  isAdminPortalRole,
  isContentManagerRole,
  setPassword,
} from './db.js';
import { hashPassword, passwordNeedsUpgrade, spendPasswordTime, verifyPassword } from './security.js';
import {
  assertSessionConfigured,
  createSessionToken,
  sessionTtlSeconds,
  setOnlySessionCookie,
} from './session.js';
import { enforceRateLimit } from './ratelimit.js';
import { recordAudit, recordAuthEvent } from './audit.js';

export type StaffPortal = 'admin' | 'content';

type PortalConfig = {
  home: string;
  passwordScreen: string;
  allows: (role: Parameters<typeof isAdminPortalRole>[0]) => boolean;
};

const PORTALS: Record<StaffPortal, PortalConfig> = {
  admin: {
    home: '/admin/stats',
    passwordScreen: '/admin/set-password',
    allows: isAdminPortalRole,
  },
  content: {
    home: '/content',
    passwordScreen: '/content/set-password',
    allows: isContentManagerRole,
  },
};

/**
 * One password check, two doors.
 *
 * `/api/admin/login` and `/api/content/login` share this body but never share a
 * result: each only issues its own cookie, and each refuses an account whose
 * role belongs to the other portal. The public `/api/auth/login` refuses both.
 */
export async function handleStaffLogin(
  req: VercelRequest,
  res: VercelResponse,
  portal: StaffPortal,
): Promise<void> {
  const config = PORTALS[portal];
  const ip = clientIp(req);
  const data = parseInput(loginSchema, parseJsonBody(req));
  assertSessionConfigured();

  await enforceRateLimit({
    name: `${portal}-login-ip`,
    identifier: ip,
    limit: 20,
    windowSeconds: 3600,
  });
  await enforceRateLimit({
    name: `${portal}-login-email`,
    identifier: data.email,
    limit: 5,
    windowSeconds: 900,
  });

  const user = await findUserByEmail(data.email);
  if (!user) {
    await spendPasswordTime(data.password);
    await recordAuthEvent(`${portal}_login_failed_unknown_email`, { ip });
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }

  if (!(await verifyPassword(data.password, user.password_hash))) {
    await recordAuthEvent(`${portal}_login_failed_bad_password`, { userId: user.id, ip });
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }

  if (user.disabled_at !== null) {
    await recordAuthEvent(`${portal}_login_failed_disabled`, { userId: user.id, ip });
    throw new ApiError(403, 'account_disabled', 'This account has been disabled. Contact an administrator.');
  }

  if (!config.allows(user.role)) {
    await recordAuthEvent(`${portal}_login_failed_wrong_portal`, { userId: user.id, ip });
    // Same message as a wrong password: the door must not tell an attacker that
    // the address is real but belongs to the other portal.
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }

  let tokenVersion = user.token_version;
  if (passwordNeedsUpgrade(user.password_hash)) {
    await setPassword(user.id, await hashPassword(data.password));
    tokenVersion = (await findSessionUserById(user.id))?.token_version ?? tokenVersion;
  }

  const sessionToken = await createSessionToken({
    userId: user.id,
    role: user.role,
    tokenVersion,
    portal,
  });
  setOnlySessionCookie(req, res, sessionToken, sessionTtlSeconds(user.role), portal);
  await recordAuthEvent(`${portal}_login`, { userId: user.id, ip });
  await recordAudit(portal === 'admin' ? 'staff_login' : 'content_manager_login', {
    userId: user.id,
  });

  sendJson(res, 200, {
    user: {
      id: user.id,
      // Sent with the sign-in too, so the panel can greet the person straight
      // away instead of waiting for the next session refresh.
      name: user.name ?? null,
      role: user.role,
      email: user.email,
      emailVerified: user.email_verified,
      mustChangePassword: user.must_change_password,
    },
    redirect: safeRedirect(
      user.must_change_password ? config.passwordScreen : config.home,
    ),
  });
}
