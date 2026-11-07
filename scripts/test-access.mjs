/**
 * Disposable-database checks for the access-request and grant schema.
 *
 *   ACCESS_TEST_DATABASE_URL=... npm run test:access
 *
 * The default mode applies the migration to ACCESS_TEST_DATABASE_URL and
 * checks it twice. --no-migrate checks an already-migrated test database.
 * --permissions-only is a no-database placeholder for the permissions tests.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const args = new Set(process.argv.slice(2));
const permissionsOnly = args.has('--permissions-only');
const noMigrate = args.has('--no-migrate');
const unknownArgs = [...args].filter((arg) => !['--permissions-only', '--no-migrate'].includes(arg));
if (unknownArgs.length) {
  console.error(`Unknown option: ${unknownArgs.join(', ')}`);
  process.exit(1);
}

if (permissionsOnly) {
  console.log('SKIP database checks (--permissions-only mode; permissions checks are not implemented yet).');
  process.exit(0);
}

const databaseUrl = process.env.ACCESS_TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('Set ACCESS_TEST_DATABASE_URL to a disposable test database. No database connection was attempted.');
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch {
  console.error('ACCESS_TEST_DATABASE_URL must be a PostgreSQL connection URL. No database connection was attempted.');
  process.exit(1);
}
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
  console.error('ACCESS_TEST_DATABASE_URL must be a PostgreSQL connection URL. No database connection was attempted.');
  process.exit(1);
}

// Set these before importing database or API code, and pass the same values to
// the migration subprocess so local env files cannot redirect the test run.
process.env.DATABASE_URL = databaseUrl;
process.env.DATABASE_URL_UNPOOLED = databaseUrl;
process.env.AUTH_ENABLED = 'true';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(root, 'scripts', 'migrate-access-requests.mjs');
const testStamp = `${Date.now().toString(36)}-${randomUUID()}`;
const requesterEmail = `test-access-${testStamp}-requester@example.invalid`;
const adminEmail = `test-access-${testStamp}-admin@example.invalid`;
process.env.SUPER_ADMIN_EMAIL = adminEmail;
const testPasswordHash = `test-access-placeholder-${randomUUID()}`;
const results = [];
let failures = 0;
let sql;
let requesterId;
let adminId;

function check(description, passed, detail = '') {
  results.push({ description, passed });
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${description}${detail ? ` (${detail})` : ''}`);
}

function runMigration() {
  const result = spawnSync(process.execPath, [migrationPath], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replaceAll(databaseUrl, '[redacted test database URL]');
    throw new Error(`Access migration exited with status ${result.status}.\n${output}`);
  }
}

async function expectSqlError(description, expectedCode, query, params) {
  try {
    await sql.query(query, params);
    check(description, false, 'query unexpectedly succeeded');
  } catch (error) {
    check(description, error?.code === expectedCode, `expected ${expectedCode}, got ${error?.code ?? 'unknown error'}`);
  }
}

async function verifySchema() {
  const tables = await sql.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('access_requests', 'permission_grants')`,
  );
  const tableNames = new Set(tables.map((row) => row.table_name));
  assert.ok(tableNames.has('access_requests'), 'access_requests is missing; run npm run migrate:access-requests against ACCESS_TEST_DATABASE_URL');
  assert.ok(tableNames.has('permission_grants'), 'permission_grants is missing; run npm run migrate:access-requests against ACCESS_TEST_DATABASE_URL');

  const columns = await sql.query(
    `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('access_requests', 'permission_grants')`,
  );
  const column = (table, name) => columns.find((row) => row.table_name === table && row.column_name === name);
  check('both access schema tables exist', tableNames.size === 2);
  check(
    'access_requests.requested_duration is nullable smallint',
    column('access_requests', 'requested_duration')?.data_type === 'smallint' &&
      column('access_requests', 'requested_duration')?.is_nullable === 'YES',
  );
  check(
    'permission_grants.expiration_audited_at is nullable timestamptz',
    column('permission_grants', 'expiration_audited_at')?.data_type === 'timestamp with time zone' &&
      column('permission_grants', 'expiration_audited_at')?.is_nullable === 'YES',
  );

  const constraints = await sql.query(
    `SELECT c.conrelid::regclass::text AS table_name,
            c.contype AS type,
            pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
      WHERE c.conrelid IN ('public.access_requests'::regclass, 'public.permission_grants'::regclass)`,
  );
  const definitions = constraints.map((row) => `${row.table_name} ${row.type} ${row.definition}`.toLowerCase());
  const expectedPermissions = [
    'content.edit',
    'content.publish',
    'email_template.edit',
    'consultation.update',
    'export.data',
  ];
  const checkValues = (table, field) => {
    const constraint = constraints.find((row) =>
      row.table_name === table &&
      row.type === 'c' &&
      row.definition.toLowerCase().includes(field),
    );
    return constraint?.definition.match(/'([^']*)'/g)?.map((value) => value.slice(1, -1)).sort() ?? [];
  };
  const durationConstraint = constraints.find((row) =>
    row.table_name === 'access_requests' &&
    row.type === 'c' &&
    row.definition.toLowerCase().includes('requested_duration'),
  );
  const durationValues = durationConstraint?.definition.match(/\b\d+\b/g)?.map(Number).sort((a, b) => a - b) ?? [];
  check(
    'access request status constraint allows only the four lifecycle states',
    JSON.stringify(checkValues('access_requests', 'status')) ===
      JSON.stringify(['approved', 'cancelled', 'declined', 'pending']),
  );
  check(
    'access request permission constraint allows only the five requestable permissions',
    JSON.stringify(checkValues('access_requests', 'permission')) === JSON.stringify([...expectedPermissions].sort()),
  );
  check(
    'grant permission constraint allows only the five requestable permissions',
    JSON.stringify(checkValues('permission_grants', 'permission')) === JSON.stringify([...expectedPermissions].sort()),
  );
  const requiredDefinitions = [
    ['grant expiry constraint', 'permission_grants c', 'expires_at', 'granted_at'],
    ['requester foreign key', 'access_requests f', 'requester_id', 'users'],
    ['grant recipient foreign key', 'permission_grants f', 'user_id', 'users'],
    ['grantor foreign key', 'permission_grants f', 'granted_by', 'users'],
    ['originating request foreign key', 'permission_grants f', 'request_id', 'access_requests'],
  ];
  for (const [description, ...needles] of requiredDefinitions) {
    check(description, definitions.some((definition) => needles.every((needle) => definition.includes(needle))));
  }
  check(
    'access request duration constraint allows only NULL, 7, 30, or 90',
    durationConstraint?.definition.toLowerCase().includes('is null') === true &&
      JSON.stringify(durationValues) === JSON.stringify([7, 30, 90]),
  );

  const indexes = await sql.query(
    `SELECT tablename, indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('access_requests', 'permission_grants')`,
  );
  const indexDefinitions = indexes.map((row) => `${row.tablename} ${row.indexdef}`.toLowerCase());
  const requiredIndexes = [
    ['requester/status lookup index', 'access_requests', 'requester_id', 'status'],
    ['one-pending-request partial unique index', 'access_requests', 'unique', 'requester_id', 'permission', 'pending'],
    ['active user-grant lookup index', 'permission_grants', 'user_id', 'permission', 'revoked_at'],
    ['expiry scan index', 'permission_grants', 'expires_at', 'expiration_audited_at'],
    ['unique originating-request index', 'permission_grants', 'unique', 'request_id'],
  ];
  for (const [description, ...needles] of requiredIndexes) {
    check(description, indexDefinitions.some((definition) => needles.every((needle) => definition.includes(needle))));
  }
}

async function runConstraintChecks() {
  const [requester] = await sql.query(
    `INSERT INTO users (email, password_hash, role, email_verified)
     VALUES ($1, $2, 'talent', true)
     RETURNING id`,
    [requesterEmail, testPasswordHash],
  );
  requesterId = requester.id;
  const adminResult = await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`INSERT INTO users (email, password_hash, role, email_verified)
        VALUES (${adminEmail}, ${testPasswordHash}, 'admin', true)
        RETURNING id`,
  ]);
  adminId = adminResult[1]?.[0]?.id;

  const [pendingRequest] = await sql.query(
    `INSERT INTO access_requests (requester_id, permission, reason, requested_duration)
     VALUES ($1, 'content.edit', 'Access migration test', 7)
     RETURNING id`,
    [requesterId],
  );
  await expectSqlError(
    'only one pending request per requester and permission is allowed',
    '23505',
    `INSERT INTO access_requests (requester_id, permission, reason)
     VALUES ($1, 'content.edit', 'Duplicate pending test')`,
    [requesterId],
  );
  await expectSqlError(
    'access request rejects an unknown status',
    '23514',
    `INSERT INTO access_requests (requester_id, permission, reason, status)
     VALUES ($1, 'content.publish', 'Invalid status test', 'unknown')`,
    [requesterId],
  );
  await expectSqlError(
    'access request rejects unsupported durations',
    '23514',
    `INSERT INTO access_requests (requester_id, permission, reason, requested_duration)
     VALUES ($1, 'content.publish', 'Invalid duration test', 14)`,
    [requesterId],
  );
  await expectSqlError(
    'access request rejects permissions outside the requestable allowlist',
    '23514',
    `INSERT INTO access_requests (requester_id, permission, reason)
     VALUES ($1, 'staff.manage', 'Invalid permission test')`,
    [requesterId],
  );
  await expectSqlError(
    'access request rejects an empty reason',
    '23514',
    `INSERT INTO access_requests (requester_id, permission, reason)
     VALUES ($1, 'content.publish', '   ')`,
    [requesterId],
  );
  await expectSqlError(
    'grants reject permissions outside the requestable allowlist',
    '23514',
    `INSERT INTO permission_grants (user_id, permission, granted_by)
     VALUES ($1, 'staff.manage', $1)`,
    [requesterId],
  );
  await expectSqlError(
    'grants reject expirations at or before grant time',
    '23514',
    `INSERT INTO permission_grants (user_id, permission, granted_by, granted_at, expires_at)
     VALUES ($1, 'content.edit', $1, '2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')`,
    [requesterId],
  );

  const [secondRequest] = await sql.query(
    `INSERT INTO access_requests (requester_id, permission, reason, status)
     VALUES ($1, 'content.publish', 'Grant uniqueness test', 'approved')
     RETURNING id`,
    [requesterId],
  );
  await sql.query(
    `INSERT INTO permission_grants (user_id, permission, granted_by, request_id)
     VALUES ($1, 'content.publish', $2, $3)`,
    [requesterId, adminId, secondRequest.id],
  );
  await expectSqlError(
    'a request cannot create more than one permission grant',
    '23505',
    `INSERT INTO permission_grants (user_id, permission, granted_by, request_id)
     VALUES ($1, 'content.edit', $2, $3)`,
    [requesterId, adminId, secondRequest.id],
  );
  check('a valid request and grant can be stored', Boolean(pendingRequest?.id && secondRequest?.id));
}

async function cleanupTestRows() {
  if (!sql) return;
  const testUserIds = [requesterId, adminId].filter(Boolean);
  if (!testUserIds.length) return;
  await sql.query(
    'DELETE FROM permission_grants WHERE user_id = ANY($1) OR granted_by = ANY($1) OR revoked_by = ANY($1)',
    [testUserIds],
  );
  await sql.query(
    'DELETE FROM access_requests WHERE requester_id = ANY($1) OR decided_by = ANY($1)',
    [testUserIds],
  );
  await sql.query('DELETE FROM users WHERE id = ANY($1)', [testUserIds]);
}

async function main() {
  try {
    if (!noMigrate) runMigration();

    const { neon } = await import('@neondatabase/serverless');
    sql = neon(databaseUrl);

    await verifySchema();
    await runConstraintChecks();

    if (!noMigrate) {
      runMigration();
      await verifySchema();
      const [request] = await sql.query(
        'SELECT id FROM access_requests WHERE requester_id = $1 AND permission = $2 AND status = $3',
        [requesterId, 'content.edit', 'pending'],
      );
      check('a second migration run succeeds without losing existing test data', Boolean(request?.id));
    }
  } finally {
    await cleanupTestRows();
  }

  console.log(`\n${results.filter((result) => result.passed).length}/${results.length} checks passed`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
