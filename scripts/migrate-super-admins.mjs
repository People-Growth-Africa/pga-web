/**
 * Adds database-backed super-administrator membership and protects the last
 * active super administrator. SUPER_ADMIN_EMAIL seeds the legacy account.
 *
 *   npm run migrate:super-admins
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
await sql.query(
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false',
);
await sql.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'users'::regclass
         AND conname = 'users_super_admin_requires_admin_role'
    ) THEN
      ALTER TABLE users
        ADD CONSTRAINT users_super_admin_requires_admin_role
        CHECK (NOT is_super_admin OR role = 'admin');
    END IF;
  END;
  $$
`);

const seedEmail = (process.env.SUPER_ADMIN_EMAIL ?? 'admin@peoplegrowthafrica.com')
  .trim()
  .toLowerCase();
await sql.query(
  `UPDATE users
      SET is_super_admin = true
    WHERE lower(email) = $1 AND role = 'admin' AND disabled_at IS NULL`,
  [seedEmail],
);
const activeSuperAdmins = await sql.query(
  `SELECT count(*)::int AS count FROM users
    WHERE is_super_admin AND role = 'admin' AND disabled_at IS NULL`,
);
if (!activeSuperAdmins[0]?.count) {
  throw new Error(
    'No active super administrator exists. Verify SUPER_ADMIN_EMAIL matches an enabled admin account.',
  );
}
await sql.query(
  `CREATE INDEX IF NOT EXISTS users_active_super_admin_idx
     ON users (id) WHERE is_super_admin AND role = 'admin' AND disabled_at IS NULL`,
);
await sql.query(`
  CREATE OR REPLACE FUNCTION prevent_last_active_super_admin_removal()
  RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE
    removing_active_super_admin boolean;
    remaining_active_super_admins integer;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      removing_active_super_admin :=
        OLD.is_super_admin AND OLD.role = 'admin' AND OLD.disabled_at IS NULL;
    ELSE
      removing_active_super_admin :=
        OLD.is_super_admin AND OLD.role = 'admin' AND OLD.disabled_at IS NULL
        AND (
          NOT NEW.is_super_admin
          OR NEW.role <> 'admin'
          OR NEW.disabled_at IS NOT NULL
        );
    END IF;

    IF removing_active_super_admin THEN
      PERFORM pg_advisory_xact_lock(hashtext('pga.last_active_super_admin'));
      SELECT count(*)::integer
        INTO remaining_active_super_admins
        FROM users
       WHERE id <> OLD.id
         AND is_super_admin
         AND role = 'admin'
         AND disabled_at IS NULL;
      IF remaining_active_super_admins = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last active super administrator.'
          USING ERRCODE = '23514',
                CONSTRAINT = 'last_active_super_admin_guard';
      END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END;
  $$
`);
await sql.query('DROP TRIGGER IF EXISTS users_last_super_admin_guard ON users');
await sql.query(`
  CREATE TRIGGER users_last_super_admin_guard
  BEFORE UPDATE OF role, disabled_at, is_super_admin OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_last_active_super_admin_removal()
`);

console.log('\nDatabase-backed super administrators are ready.\n');
