import {
  listActiveGrantedPermissions,
  type Role,
} from './db.js';
import {
  combinePermissions,
  permissionsForRole,
  type Permission,
} from './permissions.js';

export async function getEffectivePermissions(
  userId: string,
  role: Role,
): Promise<ReadonlySet<Permission>> {
  const grantedPermissions = await listActiveGrantedPermissions(userId);
  return combinePermissions(permissionsForRole(role), grantedPermissions);
}

export async function hasEffectivePermission(
  userId: string,
  role: Role,
  permission: Permission,
): Promise<boolean> {
  const effectivePermissions = await getEffectivePermissions(userId, role);
  return effectivePermissions.has(permission);
}
