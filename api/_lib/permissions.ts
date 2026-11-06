import type { Role } from './db.js';

export type Permission =
  | 'admin.dashboard.read'
  | 'admin.data.read'
  | 'admin.content.write'
  | 'admin.staff.manage'
  | 'content.write'
  | 'audit_log.view'
  | 'audit_log.export';

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  talent: [],
  employer: [],
  manager: [],
  admin: [
    'admin.dashboard.read',
    'admin.data.read',
    'admin.content.write',
    'admin.staff.manage',
    'audit_log.view',
    'audit_log.export',
  ],
  project_manager: ['admin.dashboard.read', 'admin.data.read'],
  hr_manager: ['admin.dashboard.read', 'admin.data.read'],
  content_manager: ['content.write'],
  data_admin: ['admin.dashboard.read', 'admin.data.read'],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}
