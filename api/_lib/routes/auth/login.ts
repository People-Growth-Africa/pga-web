import { ApiError, clientIp, endpoint, parseJsonBody, safeRedirect, sendJson } from '../../http.js';
import { loginSchema, parseInput } from '../../validation.js';
import { findUserByEmail } from '../../db.js';
import { spendPasswordTime, verifyPassword } from '../../security.js';
import { assertSessionConfigured, createSessionToken, setSessionCookie } from '../../session.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAuthEvent } from '../../audit.js';

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

  const sessionToken = await createSessionToken({
    userId: user.id,
    role: user.role,
    tokenVersion: user.token_version,
  });
  setSessionCookie(req, res, sessionToken);
  await recordAuthEvent('login', { userId: user.id, ip });

  sendJson(res, 200, {
    user: {
      id: user.id,
      role: user.role,
      email: user.email,
      emailVerified: user.email_verified,
    },
    // Managers get the content panel. Without a branch of their own they fall
    // through to the employer dashboard, which is a page their role cannot use.
    redirect: safeRedirect(
      user.role === 'talent'
        ? '/talent/dashboard'
        : user.role === 'manager'
          ? '/admin/content'
          : '/employer/dashboard',
    ),
  });
});
