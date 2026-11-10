import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.ADMIN_GOVERNANCE_TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error('\nADMIN_GOVERNANCE_TEST_DATABASE_URL must point to a disposable database. No database was accessed.\n');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const sql = neon(databaseUrl);
const email = `auth-session-test-${randomUUID()}@example.invalid`;
const sessionId = randomUUID();
let userId;

function runMigration() {
  const result = spawnSync(process.execPath, ['scripts/migrate-auth-sessions.mjs'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Auth sessions migration failed:\n${result.stdout}\n${result.stderr}`);
  }
}

try {
  const rows = await sql.query(
    `INSERT INTO users (name, email, password_hash, role, email_verified, must_change_password)
     VALUES ('Auth session test', $1, 'not-a-real-password-hash', 'talent', true, false)
     RETURNING id`,
    [email],
  );
  userId = rows[0]?.id;
  assert.equal(typeof userId, 'string', 'the disposable database should create a user fixture');

  runMigration();
  runMigration();

  await sql.query(
    `INSERT INTO sessions (id, user_id, portal, expires_at, ip, user_agent)
     VALUES ($1, $2, 'public', now() + interval '1 hour', '192.0.2.1', 'session-test')`,
    [sessionId, userId],
  );
  const active = await sql.query(
    `SELECT id FROM sessions
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
    [sessionId, userId],
  );
  assert.equal(active.length, 1, 'an unexpired session should validate');

  await sql.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
  const revoked = await sql.query(
    `SELECT id FROM sessions
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
    [sessionId, userId],
  );
  assert.equal(revoked.length, 0, 'a revoked session should fail validation immediately');

  await sql.query(
    `INSERT INTO login_events (user_id, email_attempted, success, ip, user_agent)
     VALUES ($1, $2, false, '192.0.2.1', 'session-test')`,
    [userId, email],
  );
  const events = await sql.query(
    'SELECT email_attempted, success FROM login_events WHERE user_id = $1',
    [userId],
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.email_attempted, email);
  assert.equal(events[0]?.success, false);

  await sql.query('UPDATE users SET disabled_at = now() WHERE id = $1', [userId]);
  const disabled = await sql.query('SELECT disabled_at FROM users WHERE id = $1', [userId]);
  assert.ok(disabled[0]?.disabled_at, 'the fixture can represent a disabled account');

  console.log('Auth session migration idempotence, revocation, and login-history writes passed.');
} finally {
  if (userId) await sql.query('DELETE FROM users WHERE id = $1', [userId]);
}
