import { ApiError, clientIp, endpoint, parseJsonBody, sendJson } from '../../http.js';
import { parseInput, staffInviteAcceptSchema } from '../../validation.js';
import { findOpenStaffInvite, findUserByEmail, finishStaffPasswordSetup, useStaffInvite } from '../../db.js';
import { hashPassword, hashToken } from '../../security.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { prepareAuditWrite } from '../../audit.js';

/**
 * POST /api/auth/set-password
 *
 * Opens a staff invitation, once, within 24 hours. The invite is looked up by
 * the hash of the token, so the raw token is never stored. This endpoint is
 * public because the person does not have a password yet, but the token is the
 * credential and it is rate limited per IP.
 */
export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  await enforceRateLimit({ name: 'staff-set-password-ip', identifier: ip, limit: 10, windowSeconds: 3600 });

  const data = parseInput(staffInviteAcceptSchema, parseJsonBody(req));
  const invite = await findOpenStaffInvite(hashToken(data.token));
  if (!invite) {
    throw new ApiError(
      400,
      'invite_invalid',
      'That invitation link has expired or was already used. Ask an administrator for a new one.',
    );
  }

  const target = await findUserByEmail(invite.email);
  const audit = target
    ? prepareAuditWrite({
      req,
      actor: { id: target.id, email: target.email, role: target.role },
      action: 'staff.password_change',
      entity: { type: 'staff_account', id: target.id, label: target.email },
    })
    : undefined;
  const userId = await finishStaffPasswordSetup(invite.email, await hashPassword(data.password), audit);
  if (!userId) {
    throw new ApiError(400, 'invite_invalid', 'That account is not available. Contact an administrator.');
  }
  await useStaffInvite(invite.id);
  sendJson(res, 200, {
    ok: true,
    message: 'Your password is set. Sign in to open the admin.',
  });
});
