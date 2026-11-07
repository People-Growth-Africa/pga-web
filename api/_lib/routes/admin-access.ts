import { getEffectivePermissions } from '../access.js';
import { auditActorForUser, prepareAuditWrite } from '../audit.js';
import {
  sendAccessDecisionNotification,
  sendAccessRequestNotification,
} from '../email.js';
import {
  approveAccessRequest,
  cancelAccessRequest,
  createAccessRequest,
  declineAccessRequest,
  findSessionUserById,
  listAccessRequestsByRequester,
  listActivePermissionGrants,
  listPendingAccessRequests,
  revokePermissionGrant,
} from '../db.js';
import { ApiError, endpoint, parseJsonBody, sendJson } from '../http.js';
import { isSuperAdminEmail, requireStaff, requireSuperAdmin } from '../staff.js';
import { hasPermission } from '../permissions.js';
import {
  accessRequestCreateSchema,
  accessRequestMutationSchema,
  parseInput,
} from '../validation.js';

function conflict(): ApiError {
  return new ApiError(
    409,
    'access_state_conflict',
    'That access request or grant has already changed.',
  );
}

export default endpoint({ methods: ['GET', 'POST', 'PATCH'], csrf: true }, async (req, res) => {
  if (req.method === 'GET') {
    const session = await requireStaff(req, res);
    const [requests, effectivePermissions, user] = await Promise.all([
      listAccessRequestsByRequester(session.userId),
      getEffectivePermissions(session.userId, session.role),
      findSessionUserById(session.userId),
    ]);
    const response: Record<string, unknown> = {
      requests,
      effectivePermissions: [...effectivePermissions].sort(),
    };

    if (
      user &&
      user.disabled_at === null &&
      hasPermission(user.role, 'admin.staff.manage') &&
      isSuperAdminEmail(user.email)
    ) {
      const [pendingRequests, activeGrants] = await Promise.all([
        listPendingAccessRequests(),
        listActivePermissionGrants(),
      ]);
      response.pendingRequests = pendingRequests;
      response.activeGrants = activeGrants;
    }

    sendJson(res, 200, response);
    return;
  }

  if (req.method === 'POST') {
    const session = await requireStaff(req, res);
    const data = parseInput(accessRequestCreateSchema, parseJsonBody(req));
    const effectivePermissions = await getEffectivePermissions(session.userId, session.role);
    if (effectivePermissions.has(data.permission)) {
      throw new ApiError(
        409,
        'permission_already_granted',
        'You already have this permission.',
      );
    }

    const audit = prepareAuditWrite({
      req,
      actor: await auditActorForUser(session.userId),
      action: 'access.request_created',
      entity: { type: 'access_request', label: data.permission },
    });
    const request = await createAccessRequest({
      requesterId: session.userId,
      permission: data.permission,
      reason: data.reason,
      requestedDuration: data.requestedDuration,
      audit,
    });
    if (!request) throw conflict();
    if (!(await sendAccessRequestNotification(request.requester_name, request.permission))) {
      console.error('[access] request notification was not sent');
    }
    sendJson(res, 201, {
      request: { id: request.id, permission: request.permission, status: request.status },
    });
    return;
  }

  const data = parseInput(accessRequestMutationSchema, parseJsonBody(req));
  if (data.action === 'cancel') {
    const session = await requireStaff(req, res);
    const audit = prepareAuditWrite({
      req,
      actor: await auditActorForUser(session.userId),
      action: 'access.request_cancelled',
      entity: { type: 'access_request', id: data.requestId },
      before: { status: 'pending' },
    });
    const request = await cancelAccessRequest({
      requestId: data.requestId,
      requesterId: session.userId,
      audit,
    });
    if (!request) throw conflict();
    sendJson(res, 200, {
      request: { id: request.id, permission: request.permission, status: request.status },
    });
    return;
  }

  const { user } = await requireSuperAdmin(req, res);
  const actor = await auditActorForUser(user.id);

  if (data.action === 'approve') {
    const audit = prepareAuditWrite({
      req,
      actor,
      action: 'access.request_approved',
      entity: { type: 'access_request', id: data.requestId },
      before: { status: 'pending' },
    });
    const request = await approveAccessRequest({
      requestId: data.requestId,
      decidedBy: user.id,
      duration: data.duration,
      audit,
    });
    if (!request) throw conflict();
    if (
      !(await sendAccessDecisionNotification(
        request.requester_email,
        request.requester_name,
        request.permission,
        'approved',
      ))
    ) {
      console.error('[access] approval notification was not sent');
    }
    sendJson(res, 200, {
      request: {
        id: request.id,
        permission: request.permission,
        status: request.status,
        expires_at: request.expires_at,
        grant_id: request.grant_id,
      },
    });
    return;
  }

  if (data.action === 'decline') {
    const audit = prepareAuditWrite({
      req,
      actor,
      action: 'access.request_declined',
      entity: { type: 'access_request', id: data.requestId },
      before: { status: 'pending' },
    });
    const request = await declineAccessRequest({
      requestId: data.requestId,
      decidedBy: user.id,
      decisionNote: data.decisionNote,
      audit,
    });
    if (!request) throw conflict();
    if (
      !(await sendAccessDecisionNotification(
        request.requester_email,
        request.requester_name,
        request.permission,
        'declined',
      ))
    ) {
      console.error('[access] decline notification was not sent');
    }
    sendJson(res, 200, {
      request: { id: request.id, permission: request.permission, status: request.status },
    });
    return;
  }

  const audit = prepareAuditWrite({
    req,
    actor,
    action: 'access.grant_revoked',
    entity: { type: 'permission_grant', id: data.grantId },
    before: { status: 'active' },
  });
  const grant = await revokePermissionGrant({
    grantId: data.grantId,
    revokedBy: user.id,
    audit,
  });
  if (!grant) throw conflict();
  sendJson(res, 200, { grant });
});
