/**
 * Creates per-user notifications and copies legacy alerts to active super admins.
 *
 *   npm run migrate:notifications
 *
 * Idempotent. This script is never run by the build or deployment pipeline.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = path.resolve(import.meta.dirname, '..');
for (const file of ['.env.development.local', '.env.local', '.env']) {
  const fullPath = path.join(root, file);
  if (!existsSync(fullPath)) continue;
  for (const rawLine of readFileSync(fullPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).replace(/^export\s+/, '').trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('\nDATABASE_URL is not set. No migration was run.\n');
  process.exit(1);
}

const sql = neon(url);
await sql.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    title text NOT NULL,
    body text NOT NULL,
    href text NULL,
    read_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz NULL,
    legal_hold boolean NOT NULL DEFAULT false,
    legacy_source_id text NULL,
    dedupe_key text NULL,
    dedupe_until timestamptz NULL
  )
`);
await sql.query(`
  ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info',
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS legacy_source_id text NULL,
    ADD COLUMN IF NOT EXISTS dedupe_key text NULL,
    ADD COLUMN IF NOT EXISTS dedupe_until timestamptz NULL
`);
await sql.query(
  'ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS stale_notified_at timestamptz NULL',
);
await sql.query(
  'CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC, id DESC) WHERE deleted_at IS NULL',
);
await sql.query(
  'CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, created_at DESC, id DESC) WHERE read_at IS NULL AND deleted_at IS NULL',
);
await sql.query(
  'CREATE INDEX IF NOT EXISTS notifications_read_retention_idx ON notifications (read_at, created_at) WHERE read_at IS NOT NULL AND deleted_at IS NULL',
);
await sql.query(
  'CREATE INDEX IF NOT EXISTS notifications_unread_retention_idx ON notifications (created_at) WHERE read_at IS NULL AND deleted_at IS NULL',
);
await sql.query(
  'CREATE UNIQUE INDEX IF NOT EXISTS notifications_legacy_source_idx ON notifications (user_id, legacy_source_id) WHERE legacy_source_id IS NOT NULL',
);
await sql.query(
  'CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications (user_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL',
);

const legacyAlerts = await sql.query(
  "SELECT to_regclass('public.alerts') IS NOT NULL AS present",
);
if (legacyAlerts[0]?.present) {
  const superAdminEmail = (
    process.env.SUPER_ADMIN_EMAIL ?? 'admin@peoplegrowthafrica.com'
  ).trim().toLowerCase();
  const superAdminColumn = await sql.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name = 'is_super_admin'
     ) AS present`,
  );
  const recipientClause = superAdminColumn[0]?.present
    ? "u.is_super_admin AND u.role = 'admin' AND u.disabled_at IS NULL"
    : "lower(u.email) = $1 AND u.role = 'admin' AND u.disabled_at IS NULL";
  await sql.query(
    `INSERT INTO notifications (
       user_id, type, severity, title, body, href, read_at, created_at, legacy_source_id
     )
     SELECT u.id, 'legacy_alert',
            CASE WHEN a.severity IN ('info', 'warning', 'critical') THEN a.severity ELSE 'warning' END,
            left(coalesce(nullif(a.type, ''), 'Security alert'), 120),
            left(coalesce(nullif(a.summary, ''), 'A previous security alert was recorded.'), 2000),
            '/admin/audit-log', a.read_at, a.created_at, a.id::text
       FROM alerts a
       JOIN users u ON ${recipientClause}
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications n
         WHERE n.user_id = u.id AND n.legacy_source_id = a.id::text
      )
     ON CONFLICT (user_id, legacy_source_id)
       WHERE legacy_source_id IS NOT NULL DO NOTHING`,
    superAdminColumn[0]?.present ? [] : [superAdminEmail],
  );
}

console.log('\nNotifications are ready. Legacy alerts were copied to active super admins when present.\n');
