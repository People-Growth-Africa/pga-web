import { ApiError, endpoint, parseJsonBody, sendJson } from '../../http.js';
import { parseInput, staffChangePasswordSchema } from '../../validation.js';
import { requireAnySession } from '../../current-user.js';
import { findSessionUserById, findUserByEmail, setOwnPassword } from '../../db.js';
import { hashPassword, verifyPassword } from '../../security.js';
import { createSessionToken, sessionTtlSeconds, setSessionCookie } from '../../session.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAudit } from '../../audit.js';

/**
 * POST /api/auth/change-password
 *
 * Used by any signed in account, including a staff member whose account has
 * `must_change_password` set (the seeded administrator) and a content manager
 * finishing a first sign-in. The current password is required, and the fresh
 * token_version is carried into a new session in the same portal so the change
 * does not sign the person out.
 */
export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const { user: sessionUser, portal } = await requireAnySession(req, res);
  const data = parseInput(staffChangePasswordSchema, parseJsonBody(req));

  await enforceRateLimit({
    name: 'change-password',
    identifier: sessionUser.id,
    limit: 10,
    windowSeconds: 900,
  });

  // requireAnySession deliberately never reads the password hash, so the full
  // row is fetched here for the one check that needs it.
  const user = await findUserByEmail(sessionUser.email);
  if (!user) {
    throw new ApiError(401, 'session_expired', 'Your session ended. Sign in again.');
  }

  if (!(await verifyPassword(data.currentPassword, user.password_hash))) {
    throw new ApiError(400, 'current_password_incorrect', 'Your current password is not correct.');
  }
  if (data.currentPassword === data.password) {
    throw new ApiError(400, 'password_unchanged', 'Choose a password you have not used here before.');
  }

  await setOwnPassword(user.id, await hashPassword(data.password));
  const updated = await findSessionUserById(user.id);
  if (updated) {
    const token = await createSessionToken({
      userId: updated.id,
      role: updated.role,
      tokenVersion: updated.token_version,
      portal,
    });
    setSessionCookie(req, res, token, sessionTtlSeconds(updated.role), portal);
  }
  await recordAudit('staff_password_changed', { userId: user.id, detail: `portal=${portal}` });

  sendJson(res, 200, { ok: true });
});
