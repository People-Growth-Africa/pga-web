import { ApiError, clientIp, endpoint, parseJsonBody, safeRedirect, sendJson } from '../../http.js';
import { parseInput, resetPasswordSchema } from '../../validation.js';
import { findSessionUserById, isAdminPortalRole, setPassword } from '../../db.js';
import { hashPassword, hashToken, isPasswordBreached } from '../../security.js';
import { redeemToken } from '../../auth-tokens.js';
import { clearAllSessionCookies } from '../../session.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAuthEvent } from '../../audit.js';
import { sendPasswordChangedEmail } from '../../email.js';

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  const data = parseInput(resetPasswordSchema, parseJsonBody(req));

  await enforceRateLimit({ name: 'reset-password-ip', identifier: ip, limit: 20, windowSeconds: 3600 });
  // The client already holds the token, so counting by its hash slows down
  // anyone trying to guess a valid one without making legitimate use harder.
  await enforceRateLimit({
    name: 'reset-password-token',
    identifier: hashToken(data.token),
    limit: 10,
    windowSeconds: 3600,
  });

  if (await isPasswordBreached(data.password)) {
    throw new ApiError(
      400,
      'password_breached',
      'That password has appeared in a known data breach. Choose one you have not used anywhere else.',
      { password: 'This password has appeared in a known data breach.' },
    );
  }

  const userId = await redeemToken(data.token, 'reset');
  if (!userId) {
    throw new ApiError(
      400,
      'token_invalid',
      'That reset link has already been used or has expired. Request a new one.',
    );
  }

  // setPassword also bumps token_version, which ends every existing session,
  // including one an attacker may already hold.
  // Choosing a password through the reset flow also completes the first-login
  // requirement, whether the account was seeded or invited.
  await setPassword(userId, await hashPassword(data.password), { clearMustChange: true });
  clearAllSessionCookies(req, res);
  await recordAuthEvent('password_reset', { userId, ip });

  const user = await findSessionUserById(userId);
  if (user) await sendPasswordChangedEmail(user.email);

  // Staff reset links are requested from the same page as everyone else's,
  // but staff cannot sign in at /auth: the public door refuses their role. Send
  // each account back to the door that will actually accept it.
  const loginPath =
    user?.role === 'content_manager'
      ? '/content/login'
      : user && isAdminPortalRole(user.role)
        ? '/admin/login'
        : '/auth#login';

  sendJson(res, 200, {
    ok: true,
    message: 'Your password is updated. Log in with it now.',
    redirect: safeRedirect(loginPath),
  });
});
