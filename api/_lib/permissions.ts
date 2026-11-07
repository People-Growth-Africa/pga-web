import type { Role } from './db.js';

export type Permission =
  | 'admin.dashboard.read'
  | 'admin.data.read'
  | 'admin.content.write'
  | 'admin.staff.manage'
  | 'content.write'
  | 'audit_log.view'
  | 'audit_log.export'
  | 'content.edit'
  | 'content.publish'
  | 'email_template.edit'
  | 'consultation.update'
  | 'export.data';

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
    'content.edit',
    'content.publish',
    'email_template.edit',
    'export.data',
  ],
  project_manager: ['admin.dashboard.read', 'admin.data.read', 'export.data'],
  hr_manager: ['admin.dashboard.read', 'admin.data.read', 'export.data'],
  content_manager: ['content.write', 'content.edit', 'content.publish'],
  data_admin: ['admin.dashboard.read', 'admin.data.read', 'export.data'],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function combinePermissions(
  rolePermissions: Iterable<Permission>,
  activeGrantedPermissions: Iterable<Permission>,
): ReadonlySet<Permission> {
  return new Set([...rolePermissions, ...activeGrantedPermissions]);
}
