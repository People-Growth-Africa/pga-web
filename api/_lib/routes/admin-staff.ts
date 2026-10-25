import { ApiError, endpoint, parseJsonBody, sendJson } from '../http.js';
import { requireStaff } from '../staff.js';
import { parseInput, staffCreateSchema, staffUpdateSchema } from '../validation.js';
import {
  createStaffAccount,
  createStaffInvite,
  findUserByEmail,
  listStaffAccounts,
  setStaffDisabled,
} from '../db.js';
import { hashPassword, hashToken, newToken } from '../security.js';
import { sendStaffInviteEmail } from '../email.js';
import { recordAudit } from '../audit.js';

/**
 * GET   /api/admin/staff  - staff accounts
 * POST  /api/admin/staff  - create one and email a 24 hour set-password link
 * PATCH /api/admin/staff  - disable or re-enable one
 *
 * Admin only. `requireStaff` re-reads the account row, so a disabled admin
 * cannot keep using a token they already hold.
 */

export default endpoint({ methods: ['GET', 'POST', 'PATCH'], csrf: true }, async (req, res) => {
  const session = await requireStaff(req, res, { adminOnly: true });

  if (req.method === 'GET') {
    sendJson(res, 200, { staff: await listStaffAccounts() });
    return;
  }

  if (req.method === 'POST') {
    const data = parseInput(staffCreateSchema, parseJsonBody(req));
    if (await findUserByEmail(data.email)) {
      throw new ApiError(409, 'email_in_use', 'An account with that email already exists.');
    }

    // A random password nobody knows is written first; the invite link is the
    // only way in until the person chooses their own. `must_change_password`
    // keeps every staff endpoint closed until then.
    const id = await createStaffAccount({
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(newToken()),
      role: data.role,
    });
    if (!id) {
      throw new ApiError(500, 'staff_not_created', 'The account could not be created. Try again.');
    }

    const token = newToken();
    await createStaffInvite({
      email: data.email,
      role: data.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdBy: session.userId,
    });
    const emailSent = await sendStaffInviteEmail(data.email, data.name, token);
    await recordAudit('staff_created', {
      userId: session.userId,
      detail: `${data.email} as ${data.role}`,
    });

    sendJson(res, 201, {
      ok: true,
      id,
      emailSent,
      message: emailSent
        ? 'The account was created and the set-password link is on its way.'
        : 'The account was created, but the invitation email could not be sent. Check Resend and ask them to use Forgot password.',
    });
    return;
  }

  const data = parseInput(staffUpdateSchema, parseJsonBody(req));
  if (data.id === session.userId && data.disabled) {
    throw new ApiError(400, 'cannot_disable_self', 'You cannot disable your own account.');
  }

  const changed = await setStaffDisabled(data.id, data.disabled);
  if (!changed) {
    throw new ApiError(404, 'staff_not_found', 'That staff account no longer exists.');
  }
  await recordAudit(data.disabled ? 'staff_disabled' : 'staff_enabled', {
    userId: session.userId,
    detail: data.id,
  });
  sendJson(res, 200, { ok: true });
});
