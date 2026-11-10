/**
 * Adds retention metadata and a disabled-by-default purge switch.
 *
 *   npm run migrate:retention
 *
 * Safe to rerun. Does not delete or rewrite submitted records.
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
const statements = [
  `ALTER TABLE registrations
     ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
     ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false`,
  `ALTER TABLE event_registrations
     ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
     ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false`,
  `ALTER TABLE newsletter_subscribers
     ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
     ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz,
     ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false`,
  `UPDATE newsletter_subscribers SET unsubscribed_at = now()
    WHERE status = 'unsubscribed' AND unsubscribed_at IS NULL`,
  `ALTER TABLE consultation_bookings
     ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
     ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
     ADD COLUMN IF NOT EXISTS done_at timestamptz`,
  `UPDATE consultation_bookings SET done_at = now()
    WHERE status = 'done' AND done_at IS NULL`,
  `ALTER TABLE posts
     ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
     ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false`,
  `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS retention_settings (
     id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     real_purging_enabled boolean NOT NULL DEFAULT false,
     updated_at timestamptz NOT NULL DEFAULT now(),
     updated_by uuid REFERENCES users(id) ON DELETE SET NULL
   )`,
  `INSERT INTO retention_settings (id, real_purging_enabled)
   VALUES (1, false) ON CONFLICT (id) DO NOTHING`,
  `ALTER TABLE retention_settings
     ADD COLUMN IF NOT EXISTS defaults_confirmed_at timestamptz,
     ADD COLUMN IF NOT EXISTS defaults_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS raw_traffic_retention_days smallint NOT NULL DEFAULT 60
       CHECK (raw_traffic_retention_days BETWEEN 1 AND 730)`,
  `CREATE INDEX IF NOT EXISTS registrations_deletion_idx
     ON registrations (deleted_at) WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS event_registrations_deletion_idx
     ON event_registrations (deleted_at) WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS newsletter_subscribers_deletion_idx
     ON newsletter_subscribers (deleted_at) WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS newsletter_subscribers_unsubscribed_at_idx
     ON newsletter_subscribers (unsubscribed_at) WHERE status = 'unsubscribed'`,
  `CREATE INDEX IF NOT EXISTS consultation_bookings_deletion_idx
     ON consultation_bookings (deleted_at) WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS posts_deletion_idx
     ON posts (deleted_at) WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS consultation_bookings_done_at_idx
     ON consultation_bookings (done_at) WHERE status = 'done'`,
  `CREATE OR REPLACE FUNCTION set_newsletter_unsubscribed_at()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF NEW.status = 'unsubscribed' THEN
       IF TG_OP = 'INSERT' THEN
         NEW.unsubscribed_at := coalesce(NEW.unsubscribed_at, now());
       ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
         NEW.unsubscribed_at := coalesce(NEW.unsubscribed_at, now());
       END IF;
     ELSE
       NEW.unsubscribed_at := NULL;
     END IF;
     RETURN NEW;
   END;
   $$`,
  `DROP TRIGGER IF EXISTS newsletter_unsubscribed_at_trigger ON newsletter_subscribers`,
  `CREATE TRIGGER newsletter_unsubscribed_at_trigger
     BEFORE INSERT OR UPDATE OF status ON newsletter_subscribers
     FOR EACH ROW EXECUTE FUNCTION set_newsletter_unsubscribed_at()`,
  `CREATE OR REPLACE FUNCTION set_consultation_done_at()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF NEW.status = 'done' THEN
       IF TG_OP = 'INSERT' THEN
         NEW.done_at := coalesce(NEW.done_at, now());
       ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
         NEW.done_at := coalesce(NEW.done_at, now());
       END IF;
     ELSE
       NEW.done_at := NULL;
     END IF;
     RETURN NEW;
   END;
   $$`,
  `DROP TRIGGER IF EXISTS consultation_done_at_trigger ON consultation_bookings`,
  `CREATE TRIGGER consultation_done_at_trigger
     BEFORE INSERT OR UPDATE OF status ON consultation_bookings
     FOR EACH ROW EXECUTE FUNCTION set_consultation_done_at()`,
];

for (const statement of statements) await sql.query(statement);
const alertsTable = await sql.query("SELECT to_regclass('public.alerts') IS NOT NULL AS present");
if (alertsTable[0]?.present) {
  await sql.query(
    'ALTER TABLE alerts ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false',
  );
}
console.log('\nRetention metadata is ready. Real purging remains disabled.\n');
