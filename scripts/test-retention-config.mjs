import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RETENTION_DEFAULTS } from '../api/_lib/retention-config.ts';

const [migration, retention, route, cron] = await Promise.all([
  readFile(new URL('../scripts/migrate-retention.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../api/_lib/retention.ts', import.meta.url), 'utf8'),
  readFile(new URL('../api/_lib/routes/admin-retention.ts', import.meta.url), 'utf8'),
  readFile(new URL('../api/_lib/routes/cron-traffic.ts', import.meta.url), 'utf8'),
]);

assert.deepEqual(RETENTION_DEFAULTS.softDeletedRecords, { days: 30 });
assert.deepEqual(RETENTION_DEFAULTS.eventRegistrations, { monthsAfterEvent: 24 });
assert.deepEqual(RETENTION_DEFAULTS.unsubscribedEmails, { days: 30 });
assert.deepEqual(RETENTION_DEFAULTS.completedConsultations, { monthsAfterDone: 24 });
assert.deepEqual(RETENTION_DEFAULTS.failedLoginEvents, { days: 90 });
assert.deepEqual(RETENTION_DEFAULTS.expiredOrRevokedSessions, { days: 30 });
assert.deepEqual(RETENTION_DEFAULTS.alerts, { months: 12 });
assert.deepEqual(RETENTION_DEFAULTS.auditLogs, { minimumMonths: 24, autoPurge: false });
assert.deepEqual(RETENTION_DEFAULTS.readNotifications, { days: 90 });
assert.deepEqual(RETENTION_DEFAULTS.unreadNotifications, { months: 12 });
assert.deepEqual(RETENTION_DEFAULTS.rawTrafficHits, { days: 60, configurable: true });

assert.match(migration, /real_purging_enabled boolean NOT NULL DEFAULT false/);
assert.match(migration, /raw_traffic_retention_days smallint NOT NULL DEFAULT 60/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false/);
assert.match(retention, /deleted_at < now\(\) - interval/);
assert.match(retention, /NOT r\.legal_hold/);
assert.match(retention, /NOT legal_hold/);
assert.match(retention, /name: 'traffic_hits'/);
assert.match(retention, /rawTrafficRetentionDays/);
assert.match(retention, /target\.\$\{spec\.idColumn \?\? 'id'\} = candidates\.id AND \$1::boolean/);
assert.doesNotMatch(retention, /DELETE FROM audit_logs/);
assert.match(route, /requireSuperAdmin/);
assert.match(route, /confirmDefaults/);
assert.match(route, /retention\.personal_data_delete/);
assert.match(cron, /runRetentionSweep\(false, req\)/);
assert.match(cron, /if \(purgeEnabled\)/);
assert.match(cron, /SECURITY_ALERT_EVENTS\.retentionPurge/);

console.log('Retention defaults checks passed.');
