import { authRequest, type ApiResult, type Role } from '../../lib/authClient';

export const ACCESS_PERMISSIONS = [
  {
    id: 'content.edit',
    label: 'Edit content',
    description: 'Create and update blog posts and events.',
  },
  {
    id: 'content.publish',
    label: 'Publish content',
    description: 'Publish, unpublish, or schedule posts and events.',
  },
  {
    id: 'email_template.edit',
    label: 'Edit email templates',
    description: 'Change transactional email copy and links.',
  },
  {
    id: 'consultation.update',
    label: 'Manage consultations',
    description: 'Update consultation status, owner, and internal notes.',
  },
  {
    id: 'export.data',
    label: 'Export data',
    description: 'Download staff data as a CSV file.',
  },
] as const;

export type AccessPermission = (typeof ACCESS_PERMISSIONS)[number]['id'];
export type AccessRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';
export type AccessDuration = 7 | 30 | 90 | null;

export type AccessRequest = {
  id: string;
  permission: AccessPermission;
  reason: string;
  status: AccessRequestStatus;
  requested_duration: AccessDuration;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  grant_expires_at: string | null;
};

export type PendingAccessRequest = AccessRequest & {
  requester_id: string;
  requester_name: string | null;
  requester_email: string;
  requester_role: Role;
};

export type ActivePermissionGrant = {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  user_role: Role;
  grantor_name: string | null;
  grantor_email: string;
  permission: AccessPermission;
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
  request_id: string | null;
};

export type AccessOverview = {
  requests: AccessRequest[];
  effectivePermissions: string[];
  pendingRequests?: PendingAccessRequest[];
  activeGrants?: ActivePermissionGrant[];
};

export type CreatedRequest = Pick<AccessRequest, 'id' | 'permission' | 'status'>;
type DecidedRequest = CreatedRequest & {
  expires_at?: string | null;
  grant_id?: string;
};
type ChangedGrant = Pick<
  ActivePermissionGrant,
  'id' | 'permission' | 'expires_at'
> & {
  revoked_at: string;
};

export async function listAccess(): Promise<ApiResult<AccessOverview>> {
  return authRequest('/api/admin/access', { method: 'GET' });
}

export async function requestAccess(input: {
  permission: AccessPermission;
  reason: string;
  requestedDuration: AccessDuration;
}): Promise<ApiResult<{ request: CreatedRequest }>> {
  return authRequest('/api/admin/access', { body: { action: 'request', ...input } });
}

export async function cancelAccessRequest(
  requestId: string,
): Promise<ApiResult<{ request: CreatedRequest }>> {
  return authRequest('/api/admin/access', {
    method: 'PATCH',
    body: { action: 'cancel', requestId },
  });
}

export async function approveAccessRequest(
  requestId: string,
  duration: AccessDuration,
): Promise<ApiResult<{ request: DecidedRequest }>> {
  return authRequest('/api/admin/access', {
    method: 'PATCH',
    body: { action: 'approve', requestId, duration },
  });
}

export async function declineAccessRequest(
  requestId: string,
  decisionNote: string,
): Promise<ApiResult<{ request: CreatedRequest }>> {
  return authRequest('/api/admin/access', {
    method: 'PATCH',
    body: { action: 'decline', requestId, decisionNote },
  });
}

export async function revokePermissionGrant(
  grantId: string,
): Promise<ApiResult<{ grant: ChangedGrant }>> {
  return authRequest('/api/admin/access', {
    method: 'PATCH',
    body: { action: 'revoke', grantId },
  });
}
