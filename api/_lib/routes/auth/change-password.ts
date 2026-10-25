import { ApiError, endpoint, parseJsonBody, sendJson } from '../../http.js';
import { parseInput, staffChangePasswordSchema } from '../../validation.js';
import { requireSession } from '../../current-user.js';
import { findSessionUserById, findUserByEmail, setOwnPassword } from '../../db.js';
import { hashPassword, verifyPassword } from '../../security.js';
import { createSessionToken, sessionTtlSeconds, setSessionCookie } from '../../session.js';
import { recordAudit } from '../../audit.js';

/**
 * POST /api/auth/change-password
 *
 * Used by a staff member whose account has `must_change_password` set (the
 * seeded administrator) and by anyone else who wants to change their own
 * password. The current password is required, and the fresh token_version is
 * carried into a new session so the change does not sign the person out.
 */
export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const sessionUser = await requireSession(req, res);
  const data = parseInput(staffChangePasswordSchema, parseJsonBody(req));

  // requireSession deliberately never reads the password hash, so the full row
  // is fetched here for the one check that needs it.
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
    });
    setSessionCookie(req, res, token, sessionTtlSeconds(updated.role));
  }
  await recordAudit('staff_password_changed', { userId: user.id });

  sendJson(res, 200, { ok: true });
});
