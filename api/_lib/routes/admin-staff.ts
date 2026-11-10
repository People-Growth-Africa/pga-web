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
  isLastActiveSuperAdminViolation,
  setStaffDisabled,
  updateStaffAccount,
} from '../db.js';
import { hashPassword, hashToken, newToken } from '../security.js';
import { sendStaffInviteEmail } from '../email.js';
import { auditActorForUser, prepareAuditWrite } from '../audit.js';
import { createBestEffortNotification } from '../notifications.js';
import { SECURITY_ALERT_EVENTS } from '../security-alert-config.js';
import { scheduleBestEffort } from '../best-effort.js';

/**
 * GET   /api/admin/staff         - staff accounts, and whether this viewer may
 *                                  change them
 * POST  /api/admin/staff         - invite one: create it and email a 24 hour
 *                                  set-password link
 * PATCH /api/admin/staff         - disable or re-enable one
 * PATCH /api/admin/staff-detail  - rewrite one's name, email or role
 *
 * Only active database-backed super administrators may read the list or write
 * staff changes. Authorization runs before the list query.
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
    const audit = prepareAuditWrite({
      req,
      actor: await auditActorForUser(session.userId),
      action: 'staff.create',
      entity: { type: 'staff_account', label: data.email },
      after: { role: data.role },
    });
    const id = await createStaffAccount({
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(newToken()),
      role: data.role,
      audit,
    });
    if (!id) {
      throw new ApiError(500, 'staff_not_created', 'The account could not be created. Try again.');
    }

    const emailSent = await invite(data.email, data.name, data.role, user.id);
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
    const isSuperAdmin = data.role === 'admin' && (data.isSuperAdmin ?? target.is_super_admin);
    if (data.isSuperAdmin === true && data.role !== 'admin') {
      throw new ApiError(400, 'super_admin_requires_admin', 'A super administrator must have the administrator role.');
    }
    const superAdminChanged = isSuperAdmin !== target.is_super_admin;

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

    const action = roleChanged
      ? 'staff.role_change'
      : superAdminChanged
        ? 'staff.super_admin_change'
        : 'staff.account_update';
    const audit = prepareAuditWrite({
      req,
      actor: await auditActorForUser(session.userId),
      action,
      entity: { type: 'staff_account', id: target.id, label: target.email },
      before: { role: target.role, is_super_admin: target.is_super_admin },
      after: { role: data.role, is_super_admin: isSuperAdmin },
    });
    const saved = await updateStaffAccount({
      id: data.id,
      name: data.name ? data.name : null,
      email: data.email,
      role: data.role,
      isSuperAdmin,
      // A new address has to be proved, and the set-password link is how this
      // panel already does that: the flag forces the screen, the invite opens it.
      resetPassword: emailChanged,
      audit,
    }).catch((error: unknown) => {
      if (isLastActiveSuperAdminViolation(error)) {
        throw new ApiError(409, 'last_super_admin', 'The last active super administrator cannot be demoted or removed.');
      }
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

    if (roleChanged) {
      scheduleBestEffort(
        () => createBestEffortNotification({
          event: SECURITY_ALERT_EVENTS.roleChange,
          previousRole: target.role,
          nextRole: data.role,
        }),
        'security-alert',
      );
    }

    let emailSent = false;
    if (emailChanged) {
      emailSent = await invite(data.email, data.name || data.email, data.role, user.id);
    }

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

  const target = await findStaffAccount(data.id);
  if (!target) {
    throw new ApiError(404, 'staff_not_found', 'That staff account no longer exists.');
  }
  const audit = prepareAuditWrite({
    req,
    actor: await auditActorForUser(session.userId),
    action: data.disabled ? 'staff.disable' : 'staff.enable',
    entity: { type: 'staff_account', id: target.id, label: target.email },
    before: { disabled: target.disabled_at !== null },
    after: { disabled: data.disabled },
  });
  const changed = await setStaffDisabled(data.id, data.disabled, audit).catch((error: unknown) => {
    if (isLastActiveSuperAdminViolation(error)) {
      throw new ApiError(409, 'last_super_admin', 'The last active super administrator cannot be disabled.');
    }
    throw error;
  });
  if (!changed) {
    throw new ApiError(404, 'staff_not_found', 'That staff account no longer exists.');
  }
  if (data.disabled && target.disabled_at === null) {
    scheduleBestEffort(
      () => createBestEffortNotification({
        event: SECURITY_ALERT_EVENTS.accountDisable,
      }),
      'security-alert',
    );
  }
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
