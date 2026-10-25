import { ApiError, clientIp, endpoint, parseJsonBody, safeRedirect, sendJson } from '../../http.js';
import { loginSchema, parseInput } from '../../validation.js';
import { findSessionUserById, findUserByEmail, isStaffRole, setPassword } from '../../db.js';
import { hashPassword, passwordNeedsUpgrade, spendPasswordTime, verifyPassword } from '../../security.js';
import {
  assertSessionConfigured,
  createSessionToken,
  sessionTtlSeconds,
  setSessionCookie,
} from '../../session.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAudit, recordAuthEvent } from '../../audit.js';

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  const data = parseInput(loginSchema, parseJsonBody(req));
  assertSessionConfigured();

  await enforceRateLimit({ name: 'login-ip', identifier: ip, limit: 20, windowSeconds: 3600 });
  await enforceRateLimit({
    name: 'login-email',
    identifier: data.email,
    limit: 5,
    windowSeconds: 900,
  });

  const user = await findUserByEmail(data.email);

  if (!user) {
    // Spend the same time as a real password check so the response cannot be
    // timed to reveal whether the email is registered.
    await spendPasswordTime(data.password);
    await recordAuthEvent('login_failed_unknown_email', { ip });
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }

  const passwordMatches = await verifyPassword(data.password, user.password_hash);
  if (!passwordMatches) {
    await recordAuthEvent('login_failed_bad_password', { userId: user.id, ip });
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }

  // Checked after the password so the response cannot be used to learn that
  // an address has a disabled account.
  if (user.disabled_at !== null) {
    await recordAuthEvent('login_failed_disabled', { userId: user.id, ip });
    throw new ApiError(403, 'account_disabled', 'This account has been disabled. Contact an administrator.');
  }

  // A hash made with fewer rounds than the current setting is upgraded here,
  // while the password is still in hand and has just been proved correct.
  // setPassword bumps token_version, so the session is minted from the row as
  // it stands after that write rather than from the stale one in `user`.
  let tokenVersion = user.token_version;
  if (passwordNeedsUpgrade(user.password_hash)) {
    await setPassword(user.id, await hashPassword(data.password));
    tokenVersion = (await findSessionUserById(user.id))?.token_version ?? tokenVersion;
  }

  const sessionToken = await createSessionToken({
    userId: user.id,
    role: user.role,
    tokenVersion,
  });
  setSessionCookie(req, res, sessionToken, sessionTtlSeconds(user.role));
  await recordAuthEvent('login', { userId: user.id, ip });
  if (isStaffRole(user.role)) {
    await recordAudit('staff_login', { userId: user.id });
  }

  const staff = isStaffRole(user.role);
  sendJson(res, 200, {
    user: {
      id: user.id,
      role: user.role,
      email: user.email,
      emailVerified: user.email_verified,
      mustChangePassword: user.must_change_password,
    },
    // Staff get the admin area. A forced password change goes straight to the
    // set-password screen; every staff endpoint refuses until it is done.
    redirect: safeRedirect(
      staff
        ? user.must_change_password
          ? '/admin/set-password'
          : '/admin/stats'
        : user.role === 'talent'
          ? '/talent/dashboard'
          : '/employer/dashboard',
    ),
  });
});
