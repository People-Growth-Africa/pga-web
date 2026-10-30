import { ApiError, endpoint, parseJsonBody, sendJson } from '../http.js';
import { requireSuperAdmin } from '../staff.js';
import {
  parseInput,
  staffCreateSchema,
  staffEditSchema,
  staffUpdateSchema,
} from '../validation.js';
import {
  createStaffAccount,
  createStaffInvite,
  findStaffAccount,
  findUserByEmail,
  isUniqueViolation,
  listStaffAccounts,
  setStaffDisabled,
  updateStaffAccount,
} from '../db.js';
import { hashPassword, hashToken, newToken } from '../security.js';
import { sendStaffInviteEmail } from '../email.js';
import { recordAudit } from '../audit.js';

/**
 * GET   /api/admin/staff         - staff accounts, and whether this viewer may
 *                                  change them
 * POST  /api/admin/staff         - invite one: create it and email a 24 hour
 *                                  set-password link
 * PATCH /api/admin/staff         - disable or re-enable one
 * PATCH /api/admin/staff-detail  - rewrite one's name, email or role
 *
 * Only the configured super administrator - `SUPER_ADMIN_EMAIL`, defaulting
 * to the seeded `admin@peoplegrowthafrica.com` - may read the list or write
 * staff changes. Authorization runs before the list query, so no other admin
 * receives account data from this endpoint.
 */

export default endpoint({ methods: ['GET', 'POST', 'PATCH'], csrf: true }, async (req, res) => {
  const path = (req.url ?? '').split('?')[0]?.replace(/\/+$/, '') ?? '';
  const editingDetails = path.endsWith('/staff-detail');

  if (req.method === 'GET') {
    await requireSuperAdmin(req, res);
    sendJson(res, 200, { staff: await listStaffAccounts() });
    return;
  }

  const { session, user } = await requireSuperAdmin(req, res);

  if (req.method === 'POST' && !editingDetails) {
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

    const emailSent = await invite(data.email, data.name, data.role, user.id);
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

  if (editingDetails) {
    const data = parseInput(staffEditSchema, parseJsonBody(req));

    const target = await findStaffAccount(data.id);
    if (!target) {
      throw new ApiError(404, 'staff_not_found', 'That staff account no longer exists.');
    }

    // A legacy row still says 'manager', which is not one of the roles this
    // form offers: saving would quietly convert it. The migration owns that
    // decision, so refuse rather than guess.
    if (target.role === 'manager') {
      throw new ApiError(
        409,
        'legacy_role',
        'That account still holds the legacy manager role. Run the role migration before editing it.',
      );
    }

    const isSelf = data.id === user.id;
    const emailChanged = data.email.trim().toLowerCase() !== target.email.trim().toLowerCase();
    const roleChanged = data.role !== target.role;

    // A super administrator may correct their own name, but not hand away or
    // rewrite the account that is allowed to do this: the title is the address,
    // and changing it here would lock the panel out of its own controls.
    if (isSelf && (emailChanged || roleChanged)) {
      throw new ApiError(
        400,
        'cannot_edit_self',
        'You can change your own name here, but not your email or role.',
      );
    }

    const saved = await updateStaffAccount({
      id: data.id,
      name: data.name ? data.name : null,
      email: data.email,
      role: data.role,
      // A new address has to be proved, and the set-password link is how this
      // panel already does that: the flag forces the screen, the invite opens it.
      resetPassword: emailChanged,
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'email_in_use', 'Another account already uses that email.', {
          email: 'Another account already uses that email.',
        });
      }
      throw error;
    });

    if (!saved) {
      throw new ApiError(404, 'staff_not_found', 'That staff account no longer exists.');
    }

    let emailSent = false;
    if (emailChanged) {
      emailSent = await invite(data.email, data.name || data.email, data.role, user.id);
    }

    await recordAudit('staff_updated', {
      userId: session.userId,
      detail: `${target.email} -> ${data.email} as ${data.role}${emailChanged ? ' (re-invited)' : ''}`,
    });

    sendJson(res, 200, {
      ok: true,
      emailSent,
      message: emailChanged
        ? emailSent
          ? 'Details saved. A set-password link is on its way to the new address.'
          : 'Details saved, but the invitation email could not be sent. Ask them to use Forgot password.'
        : 'Details saved.',
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

/**
 * A 24 hour set-password link, emailed. Returns whether the email left the
 * server; the account is usable either way, through Forgot password.
 */
async function invite(
  email: string,
  name: string,
  role: 'admin' | 'project_manager' | 'hr_manager' | 'content_manager' | 'data_admin',
  createdBy: string,
): Promise<boolean> {
  const token = newToken();
  await createStaffInvite({
    email,
    role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdBy,
  });
  // Data administrators sign in at the administrator portal, so their invite
  // carries the same door and cookie as the rest of that panel.
  return sendStaffInviteEmail(email, name, token, role === 'content_manager' ? 'content' : 'admin');
}
