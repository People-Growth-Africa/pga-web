/**
 * Staff roles, audit log, staff invites and first-party traffic tables.
 *
 *   npm run migrate:staff
 *
 * Idempotent: every statement can run again without touching a row. Uses the
 * unpooled connection when it is configured, like the other setup scripts.
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
  console.error('\nDATABASE_URL is not set. Run `npx vercel env pull .env.development.local --yes` first.\n');
  process.exit(1);
}

const sql = neon(url);

/* ── Roles ──────────────────────────────────────────────────────────────── */

const existingChecks = await sql.query(
  `SELECT c.conname
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%role%'`,
);
for (const row of existingChecks) {
  await sql.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${row.conname}"`);
}
await sql.query(
  `ALTER TABLE users ADD CONSTRAINT users_role_check
     CHECK (role IN ('talent', 'employer', 'manager', 'admin', 'project_manager', 'hr_manager'))`,
);

const STATEMENTS = [
  ['citext extension', 'CREATE EXTENSION IF NOT EXISTS citext'],
  [
    'users staff columns',
    `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS name text,
       ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
       ADD COLUMN IF NOT EXISTS disabled_at timestamptz`,
  ],
  [
    'staff invites table',
    `CREATE TABLE IF NOT EXISTS staff_invites (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       email citext NOT NULL,
       role text NOT NULL CHECK (role IN ('admin', 'project_manager', 'hr_manager')),
       token_hash text NOT NULL,
       expires_at timestamptz NOT NULL,
       used_at timestamptz,
       created_by uuid REFERENCES users(id) ON DELETE SET NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  ],
  [
    'staff invites token index',
    'CREATE INDEX IF NOT EXISTS staff_invites_token_idx ON staff_invites (token_hash)',
  ],
  [
    'audit log table',
    `CREATE TABLE IF NOT EXISTS audit_log (
       id bigserial PRIMARY KEY,
       user_id uuid REFERENCES users(id) ON DELETE SET NULL,
       action text NOT NULL,
       detail text,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  ],
  [
    'audit log created_at index',
    'CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC)',
  ],
  [
    'newsletter source column',
    `ALTER TABLE newsletter_subscribers
       ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'website'`,
  ],
  [
    'consultation status column',
    `ALTER TABLE consultation_bookings
       ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new'`,
  ],
  [
    'newsletter created_at index',
    'CREATE INDEX IF NOT EXISTS newsletter_subscribers_created_at_idx ON newsletter_subscribers (created_at DESC)',
  ],
  [
    'users created_at index',
    'CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC)',
  ],
  [
    'page views daily table',
    `CREATE TABLE IF NOT EXISTS page_views_daily (
       date date NOT NULL,
       path text NOT NULL,
       referrer_host text NOT NULL DEFAULT '',
       utm_source text NOT NULL DEFAULT '',
       country text NOT NULL DEFAULT 'ZZ',
       device text NOT NULL DEFAULT 'desktop',
       views bigint NOT NULL DEFAULT 0,
       PRIMARY KEY (date, path, referrer_host, utm_source, country, device)
     )`,
  ],
  [
    'page views daily date index',
    'CREATE INDEX IF NOT EXISTS page_views_daily_date_idx ON page_views_daily (date DESC)',
  ],
  [
    'visitor hashes daily table',
    `CREATE TABLE IF NOT EXISTS visitor_hashes_daily (
       date date NOT NULL,
       hash text NOT NULL,
       PRIMARY KEY (date, hash)
     )`,
  ],
  [
    'visitor hashes date index',
    'CREATE INDEX IF NOT EXISTS visitor_hashes_daily_date_idx ON visitor_hashes_daily (date)',
  ],
  [
    'traffic uniques daily table',
    `CREATE TABLE IF NOT EXISTS traffic_uniques_daily (
       date date PRIMARY KEY,
       uniques bigint NOT NULL DEFAULT 0
     )`,
  ],
];

for (const [label, statement] of STATEMENTS) {
  try {
    await sql.query(statement);
  } catch (error) {
    console.error(`  !!  ${label}`);
    console.error(`      ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  console.log(`  ok  ${label}`);
}

/*
 * The public signup guard. Talent and employer rows are always allowed; a
 * manager or staff role is allowed only inside a script transaction that sets
 * `pga.staff_write`. The setting cannot be sent by a request, and the signup
 * helpers hardcode the two public roles as a second layer.
 */
await sql.query(`
  CREATE OR REPLACE FUNCTION users_guard_manager() RETURNS trigger AS $$
  BEGIN
    IF NEW.role NOT IN ('talent', 'employer')
       AND coalesce(current_setting('pga.staff_write', true), '') <> 'on'
       AND coalesce(current_setting('pga.promote_manager', true), '') <> 'on' THEN
      RAISE EXCEPTION 'staff accounts can only be created by an admin endpoint or a setup script';
    END IF;
    RETURN NEW;
  END $$ LANGUAGE plpgsql`);
await sql.query('DROP TRIGGER IF EXISTS users_manager_guard ON users');
await sql.query(
  `CREATE TRIGGER users_manager_guard
     BEFORE INSERT OR UPDATE OF role ON users
     FOR EACH ROW EXECUTE FUNCTION users_guard_manager()`,
);
console.log('  ok  staff roles are guarded against public signup');

console.log('\nStaff, audit and traffic schema is ready.');
