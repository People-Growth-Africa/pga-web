import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [
  db,
  routes,
  access,
  consultation,
  dataExport,
  registrationExport,
  auditExport,
  staff,
  login,
  staffLogin,
  deletions,
  config,
  securityConfig,
  migration,
  shell,
  page,
  siteShell,
] =
  await Promise.all([
    read('api/_lib/db.ts'),
    read('api/_lib/routes/admin-notifications.ts'),
    read('api/_lib/routes/admin-access.ts'),
    read('api/_lib/routes/leads/consultation-booking.ts'),
    read('api/_lib/routes/admin-data.ts'),
    read('api/_lib/routes/admin-registrations.ts'),
    read('api/_lib/routes/admin-audit.ts'),
    read('api/_lib/routes/admin-staff.ts'),
    read('api/_lib/routes/auth/login.ts'),
    read('api/_lib/staff-login.ts'),
    read('api/_lib/security-alerts.ts'),
    read('api/_lib/notification-config.ts'),
    read('api/_lib/security-alert-config.ts'),
    read('scripts/migrate-notifications.mjs'),
    read('src/components/admin/NotificationBell.tsx'),
    read('src/pages/admin/AdminNotifications.tsx'),
    read('src/SiteShell.tsx'),
  ]);

function functionSource(source, name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

for (const [name, next] of [
  ['countUnreadNotifications', 'countNotifications'],
  ['countNotifications', 'listNotifications'],
  ['listNotifications', 'markNotificationRead'],
  ['markNotificationRead', 'markAllNotificationsRead'],
]) {
  assert.match(functionSource(db, name, next), /WHERE user_id = \$1/, `${name} must be user-scoped`);
}
assert.match(functionSource(db, 'markAllNotificationsRead', 'findSessionUserById'), /WHERE user_id = \$1/);
assert.match(functionSource(db, 'createNotification', 'countUnreadNotifications'), /notifications \(user_id,/);
assert.match(routes, /userId: session\.userId/g);
assert.doesNotMatch(routes, /userId:\s*(?:query|mutation)\./);

assert.match(config, /'access_request\.created': 'super_admin'/);
assert.match(config, /'access_request\.decided': 'requester'/);
assert.match(config, /'consultation\.created': 'consultation_update'/);
assert.match(config, /'consultation\.assigned': 'assignee'/);
assert.match(config, /'consultation\.stale': 'consultation_update'/);
assert.match(config, /'content\.auto_published': 'author'/);
assert.match(access, /event: 'access_request\.created'/);
assert.match(access, /event: 'access_request\.decided'/);
assert.match(consultation, /event: 'consultation\.created'/);
assert.match(dataExport, /rowCount > SECURITY_ALERT_THRESHOLDS\.largeExportRows \|\| parsed\.type === 'users'/);
assert.match(registrationExport, /rows\.length > SECURITY_ALERT_THRESHOLDS\.largeExportRows/);
assert.match(auditExport, /rows\.length > SECURITY_ALERT_THRESHOLDS\.largeExportRows/);
assert.match(staff, /SECURITY_ALERT_EVENTS\.roleChange/);
assert.match(staff, /SECURITY_ALERT_EVENTS\.accountDisable/);
assert.match(login, /reportFailedLogin\(data\.email, ip\)/);
assert.match(staffLogin, /reportFailedLogin\(data\.email, ip\)/);
assert.match(deletions, /security-bulk-delete/);
assert.match(securityConfig, /largeExportRows: 200/);
assert.match(securityConfig, /bulkDeleteRecords: 5/);
assert.match(securityConfig, /failedLoginAttempts: 5/);
assert.match(securityConfig, /notificationDedupeSeconds: 30 \* 60/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS notifications/);
assert.match(migration, /to_regclass\('public\.alerts'\)/);
assert.match(migration, /notifications_user_unread_idx/);
assert.match(migration, /notifications_read_retention_idx/);
assert.match(shell, /document\.visibilityState !== 'visible'/);
assert.match(shell, /60_000/);
assert.match(shell, /notifications-count/);
assert.match(shell, /pageSize=10/);
assert.match(db, /ON CONFLICT \(user_id, type, dedupe_key\)/);
assert.match(db, /stale_notified_at IS NULL/);
assert.match(migration, /u\.is_super_admin AND u\.role = 'admin'/);
assert.match(page, /action: 'all'/);
assert.match(page, /pageSize=20/);
assert.match(siteShell, /path="\/admin\/notifications"/);

console.log('Notification migration, user scoping, alert triggers, and UI wiring passed.');
