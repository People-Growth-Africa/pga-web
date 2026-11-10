import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.ADMIN_GOVERNANCE_TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error(
    '\nADMIN_GOVERNANCE_TEST_DATABASE_URL must point to a disposable database. No database was accessed.\n',
  );
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const sql = neon(databaseUrl);
const suffix = randomUUID();
const firstEmail = `super-admin-test-${suffix}@example.invalid`;
const secondEmail = `super-admin-test-second-${suffix}@example.invalid`;
const userIds = [];
let migrationReady = false;

async function createAdmin(email) {
  const results = await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`INSERT INTO users (name, email, password_hash, role, email_verified, must_change_password)
        VALUES ('Super admin test', ${email}, 'not-a-real-password-hash', 'admin', true, false)
        RETURNING id`,
  ]);
  const id = results[1]?.[0]?.id;
  assert.equal(typeof id, 'string', 'the disposable database should create a staff fixture');
  userIds.push(id);
  return id;
}

function runMigration() {
  const result = spawnSync(process.execPath, ['scripts/migrate-super-admins.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
      SUPER_ADMIN_EMAIL: firstEmail,
    },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Super-admin migration failed:\n${result.stdout}\n${result.stderr}`);
  }
}

try {
  const firstId = await createAdmin(firstEmail);
  const secondId = await createAdmin(secondEmail);
  runMigration();
  migrationReady = true;
  runMigration();

  const seeded = await sql.query(
    'SELECT is_super_admin FROM users WHERE id = $1',
    [firstId],
  );
  const unseeded = await sql.query(
    'SELECT is_super_admin FROM users WHERE id = $1',
    [secondId],
  );
  assert.equal(seeded[0]?.is_super_admin, true, 'SUPER_ADMIN_EMAIL should seed a super admin');
  assert.equal(unseeded[0]?.is_super_admin, false, 'unconfigured admins should remain ordinary admins');

  await assert.rejects(
    sql.query('UPDATE users SET is_super_admin = false WHERE id = $1', [firstId]),
    (error) =>
      typeof error === 'object' &&
      error !== null &&
      'constraint' in error &&
      error.constraint === 'last_active_super_admin_guard',
    'the last active super admin must not be demoted',
  );

  await sql.query('UPDATE users SET is_super_admin = true WHERE id = $1', [secondId]);
  await sql.query('UPDATE users SET disabled_at = now() WHERE id = $1', [firstId]);
  await assert.rejects(
    sql.query('UPDATE users SET disabled_at = now() WHERE id = $1', [secondId]),
    (error) =>
      typeof error === 'object' &&
      error !== null &&
      'constraint' in error &&
      error.constraint === 'last_active_super_admin_guard',
    'the last active super admin must not be disabled',
  );
  await assert.rejects(
    sql.query('DELETE FROM users WHERE id = $1', [secondId]),
    (error) =>
      typeof error === 'object' &&
      error !== null &&
      'constraint' in error &&
      error.constraint === 'last_active_super_admin_guard',
    'the last active super admin must not be deleted',
  );

  console.log('Super-admin migration idempotence and last-admin protection passed.');
} finally {
  if (migrationReady) {
    await sql.query('DROP TRIGGER IF EXISTS users_last_super_admin_guard ON users');
  }
  if (userIds.length > 0) {
    await sql.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
  }
  if (migrationReady) {
    await sql.query('CREATE TRIGGER users_last_super_admin_guard BEFORE UPDATE OF role, disabled_at, is_super_admin OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION prevent_last_active_super_admin_removal()');
  }
}
