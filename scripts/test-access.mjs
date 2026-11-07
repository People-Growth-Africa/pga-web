/**
 * Disposable-database checks for access schema and the real HTTP lifecycle API.
 *
 *   ACCESS_TEST_DATABASE_URL=... npm run test:access
 *
 * The default mode applies the migration to ACCESS_TEST_DATABASE_URL, checks
 * it twice, and exercises the API with temporary staff accounts. --no-migrate
 * checks an already-migrated test database. --permissions-only checks role
 * permissions and validation without a database connection.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const args = new Set(process.argv.slice(2));
const permissionsOnly = args.has('--permissions-only');
const noMigrate = args.has('--no-migrate');
const unknownArgs = [...args].filter((arg) => !['--permissions-only', '--no-migrate'].includes(arg));
if (unknownArgs.length) {
  console.error(`Unknown option: ${unknownArgs.join(', ')}`);
  process.exit(1);
}

if (permissionsOnly) {
  await import('./api-server.mjs');
  const { combinePermissions, permissionsForRole } = await import('../api/_lib/permissions.ts');
  const {
    ACCESS_REQUEST_PERMISSIONS,
    accessRequestCreateSchema,
    accessRequestMutationSchema,
  } = await import('../api/_lib/validation.ts');

  const has = (role, permission) => permissionsForRole(role).includes(permission);
  const granted = combinePermissions(permissionsForRole('project_manager'), ['content.edit']);
  const ungranted = combinePermissions(permissionsForRole('project_manager'), []);
  const roleBased = combinePermissions(permissionsForRole('content_manager'), []);

  assert.equal(granted.has('content.edit'), true);
  assert.equal(ungranted.has('content.edit'), false);
  assert.equal(granted.has('email_template.edit'), false);
  assert.equal(roleBased.has('content.edit'), true);

  for (const permission of [
    'admin.dashboard.read',
    'admin.data.read',
    'admin.content.write',
    'admin.staff.manage',
    'audit_log.view',
    'audit_log.export',
    'content.edit',
    'content.publish',
    'email_template.edit',
    'export.data',
  ]) {
    assert.equal(has('admin', permission), true, `admin keeps ${permission}`);
  }
  for (const role of ['project_manager', 'hr_manager', 'data_admin']) {
    assert.equal(has(role, 'admin.dashboard.read'), true, `${role} keeps dashboard access`);
    assert.equal(has(role, 'admin.data.read'), true, `${role} keeps data access`);
    assert.equal(has(role, 'export.data'), true, `${role} keeps export access`);
    assert.equal(has(role, 'content.edit'), false, `${role} has no default content access`);
  }
  assert.equal(has('content_manager', 'content.write'), true);
  assert.equal(has('content_manager', 'content.edit'), true);
  assert.equal(has('content_manager', 'content.publish'), true);
  assert.equal(has('content_manager', 'admin.dashboard.read'), false);
  assert.equal(has('content_manager', 'admin.data.read'), false);
  assert.equal(has('content_manager', 'export.data'), false);

  const request = {
    action: 'request',
    permission: 'content.edit',
    reason: 'Need to update content',
    requestedDuration: null,
  };
  assert.equal(accessRequestCreateSchema.safeParse(request).success, true);
  assert.equal(accessRequestCreateSchema.safeParse({ ...request, reason: '  ' }).success, false);
  assert.equal(accessRequestCreateSchema.safeParse({ ...request, permission: 'access.manage' }).success, false);
  assert.equal(accessRequestCreateSchema.safeParse({ ...request, requestedDuration: 14 }).success, false);
  assert.equal(accessRequestCreateSchema.safeParse({ ...request, extra: true }).success, false);
  assert.deepEqual([...ACCESS_REQUEST_PERMISSIONS].sort(), [
    'consultation.update',
    'content.edit',
    'content.publish',
    'email_template.edit',
    'export.data',
  ]);
  assert.equal(
    accessRequestMutationSchema.safeParse({
      action: 'approve',
      requestId: randomUUID(),
      duration: null,
    }).success,
    true,
  );
  assert.equal(
    accessRequestMutationSchema.safeParse({
      action: 'decline',
      requestId: randomUUID(),
      decisionNote: '  ',
    }).success,
    false,
  );
  assert.equal(
    accessRequestMutationSchema.safeParse({
      action: 'cancel',
      requestId: 'not-a-uuid',
    }).success,
    false,
  );

  console.log('PASS  role permissions, access validation, and grants (no database connection)');
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
const otherRequesterEmail = `test-access-${testStamp}-other@example.invalid`;
const adminEmail = `test-access-${testStamp}-admin@example.invalid`;
const testPassword = `Access-Test-${randomUUID()}-aA7!`;
process.env.SUPER_ADMIN_EMAIL = adminEmail;
const results = [];
let failures = 0;
let sql;
let requesterId;
let otherRequesterId;
let adminId;
let server;

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
  const bcrypt = (await import('bcryptjs')).default;
  const passwordPrehash = createHash('sha256').update(testPassword, 'utf8').digest('base64');
  const passwordHash = await bcrypt.hash(passwordPrehash, 12);
  const createStaff = async (email, role, name) => {
    const result = await sql.transaction([
      sql`SELECT set_config('pga.staff_write', 'on', true)`,
      sql`INSERT INTO users
            (name, email, password_hash, role, email_verified, must_change_password)
          VALUES (${name}, ${email}, ${passwordHash}, ${role}, true, false)
          RETURNING id`,
    ]);
    return result[1]?.[0]?.id;
  };
  requesterId = await createStaff(requesterEmail, 'project_manager', 'Access Test Requester');
  otherRequesterId = await createStaff(otherRequesterEmail, 'hr_manager', 'Access Test Other');
  adminId = await createStaff(adminEmail, 'admin', 'Access Test Admin');

  const [pendingRequest] = await sql.query(
    `INSERT INTO access_requests (requester_id, permission, reason, requested_duration)
     VALUES ($1, 'content.publish', 'Access migration test', 7)
     RETURNING id`,
    [otherRequesterId],
  );
  await expectSqlError(
    'only one pending request per requester and permission is allowed',
    '23505',
    `INSERT INTO access_requests (requester_id, permission, reason)
     VALUES ($1, 'content.publish', 'Duplicate pending test')`,
    [otherRequesterId],
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
     VALUES ($1, 'consultation.update', 'Grant uniqueness test', 'approved')
     RETURNING id`,
    [requesterId],
  );
  await sql.query(
    `INSERT INTO permission_grants (user_id, permission, granted_by, request_id)
     VALUES ($1, 'consultation.update', $2, $3)`,
    [requesterId, adminId, secondRequest.id],
  );
  await expectSqlError(
    'a request cannot create more than one permission grant',
    '23505',
    `INSERT INTO permission_grants (user_id, permission, granted_by, request_id)
     VALUES ($1, 'content.publish', $2, $3)`,
    [requesterId, adminId, secondRequest.id],
  );
  check('a valid request and grant can be stored', Boolean(pendingRequest?.id && secondRequest?.id));
}

async function runApiChecks() {
  process.env.JWT_SECRET ??= `access-test-secret-${randomUUID()}-long-enough`;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const { startApiServer } = await import('./api-server.mjs');
  server = await startApiServer({ quiet: true, serveStatic: false });
  const baseUrl = server.origin;

  const requesterLogin = await call(baseUrl, '/api/admin/login', {
    method: 'POST',
    body: { email: requesterEmail, password: testPassword },
  });
  const otherLogin = await call(baseUrl, '/api/admin/login', {
    method: 'POST',
    body: { email: otherRequesterEmail, password: testPassword },
  });
  const adminLogin = await call(baseUrl, '/api/admin/login', {
    method: 'POST',
    body: { email: adminEmail, password: testPassword },
  });
  check(
    'real project-manager, HR-manager, and admin test accounts sign in over HTTP',
    requesterLogin.status === 200 &&
      otherLogin.status === 200 &&
      adminLogin.status === 200 &&
      requesterLogin.json?.user?.role === 'project_manager' &&
      otherLogin.json?.user?.role === 'hr_manager' &&
      adminLogin.json?.user?.role === 'admin',
    `${requesterLogin.status}/${otherLogin.status}/${adminLogin.status}`,
  );
  const requesterCookie = `pga_admin_session=${requesterLogin.admin}`;
  const otherCookie = `pga_admin_session=${otherLogin.admin}`;
  const adminCookie = `pga_admin_session=${adminLogin.admin}`;
  const auditCount = async () => {
    const [row] = await sql.query(
      'SELECT count(*)::int AS count FROM audit_logs WHERE actor_id = ANY($1)',
      [[requesterId, otherRequesterId, adminId]],
    );
    return row?.count ?? 0;
  };
  const findAudit = async (entityId) =>
    sql.query(
      `SELECT action, "before", "after"
         FROM audit_logs
        WHERE entity_id = $1
          AND actor_id = ANY($2)
        ORDER BY created_at, id`,
      [entityId, [requesterId, otherRequesterId, adminId]],
    );

  const requesterOverview = await call(baseUrl, '/api/admin/access', {
    cookie: requesterCookie,
  });
  const adminOverview = await call(baseUrl, '/api/admin/access', {
    cookie: adminCookie,
  });
  check(
    'GET returns own requests and effective permissions, with review data only for the super administrator',
    requesterOverview.status === 200 &&
      Array.isArray(requesterOverview.json?.requests) &&
      requesterOverview.json?.effectivePermissions?.includes('export.data') &&
      !('pendingRequests' in (requesterOverview.json ?? {})) &&
      !('activeGrants' in (requesterOverview.json ?? {})) &&
      adminOverview.status === 200 &&
      Array.isArray(adminOverview.json?.pendingRequests) &&
      Array.isArray(adminOverview.json?.activeGrants),
    `${requesterOverview.status}/${adminOverview.status}`,
  );

  const firstReason = `test reason ${testStamp}`;
  const firstRequest = await call(baseUrl, '/api/admin/access', {
    method: 'POST',
    cookie: requesterCookie,
    body: {
      action: 'request',
      permission: 'content.edit',
      reason: firstReason,
      requestedDuration: 7,
    },
  });
  const firstRequestId = firstRequest.json?.request?.id;
  check(
    'a staff account can create a pending request for a permission it does not have',
    firstRequest.status === 201 &&
      firstRequest.json?.request?.permission === 'content.edit' &&
      firstRequest.json?.request?.status === 'pending' &&
      Boolean(firstRequestId),
    `${firstRequest.status}`,
  );

  const auditCountAfterCreate = await auditCount();
  const duplicateRequest = await call(baseUrl, '/api/admin/access', {
    method: 'POST',
    cookie: requesterCookie,
    body: {
      action: 'request',
      permission: 'content.edit',
      reason: 'duplicate request',
      requestedDuration: null,
    },
  });
  check(
    'a duplicate pending request conflicts without an audit row',
    duplicateRequest.status === 409 && (await auditCount()) === auditCountAfterCreate,
    `${duplicateRequest.status}`,
  );

  const rolePermissionRequest = await call(baseUrl, '/api/admin/access', {
    method: 'POST',
    cookie: requesterCookie,
    body: {
      action: 'request',
      permission: 'export.data',
      reason: 'role permission',
      requestedDuration: null,
    },
  });
  const grantPermissionRequest = await call(baseUrl, '/api/admin/access', {
    method: 'POST',
    cookie: requesterCookie,
    body: {
      action: 'request',
      permission: 'consultation.update',
      reason: 'existing active grant',
      requestedDuration: 30,
    },
  });
  check(
    'requests conflict when the permission already comes from a role or active grant',
    rolePermissionRequest.status === 409 && grantPermissionRequest.status === 409,
    `${rolePermissionRequest.status}/${grantPermissionRequest.status}`,
  );

  const forbiddenPermissions = [
    'staff.manage',
    'admin.staff.manage',
    'audit.view',
    'audit_log.view',
    'audit_log.export',
    'registration.purge',
    'export.accounts',
    'access.manage',
  ];
  const forbiddenResponses = await Promise.all(
    forbiddenPermissions.map((permission) =>
      call(baseUrl, '/api/admin/access', {
        method: 'POST',
        cookie: requesterCookie,
        body: {
          action: 'request',
          permission,
          reason: 'forbidden permission',
          requestedDuration: null,
        },
      }),
    ),
  );
  const strictRequest = await call(baseUrl, '/api/admin/access', {
    method: 'POST',
    cookie: requesterCookie,
    body: {
      action: 'request',
      permission: 'content.publish',
      reason: 'strict schema',
      requestedDuration: null,
      extra: true,
    },
  });
  check(
    'all non-allowlisted permissions and extra request properties are rejected',
    forbiddenResponses.every((response) => response.status === 400) && strictRequest.status === 400,
    `${forbiddenResponses.map((response) => response.status).join('/')}/${strictRequest.status}`,
  );

  const secondRequest = await call(baseUrl, '/api/admin/access', {
    method: 'POST',
    cookie: requesterCookie,
    body: {
      action: 'request',
      permission: 'content.publish',
      reason: 'temporary grant test',
      requestedDuration: 7,
    },
  });
  const secondRequestId = secondRequest.json?.request?.id;
  const declineRequest = await call(baseUrl, '/api/admin/access', {
    method: 'POST',
    cookie: otherCookie,
    body: {
      action: 'request',
      permission: 'email_template.edit',
      reason: 'decline test',
      requestedDuration: null,
    },
  });
  const declineRequestId = declineRequest.json?.request?.id;
  const [activeGrantRow] = await sql.query(
    `SELECT id FROM permission_grants
      WHERE user_id = $1 AND permission = 'consultation.update'
        AND revoked_at IS NULL`,
    [requesterId],
  );

  const beforeUnauthorizedWrites = await auditCount();
  const deniedApprove = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: requesterCookie,
    body: { action: 'approve', requestId: secondRequestId, duration: 7 },
  });
  const deniedDecline = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: requesterCookie,
    body: { action: 'decline', requestId: declineRequestId, decisionNote: 'no' },
  });
  const deniedRevoke = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: requesterCookie,
    body: { action: 'revoke', grantId: activeGrantRow?.id },
  });
  check(
    'non-super-admins cannot approve, decline, or revoke and make no audit rows',
    deniedApprove.status === 403 &&
      deniedDecline.status === 403 &&
      deniedRevoke.status === 403 &&
      (await auditCount()) === beforeUnauthorizedWrites,
    `${deniedApprove.status}/${deniedDecline.status}/${deniedRevoke.status}`,
  );

  const otherCancel = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: otherCookie,
    body: { action: 'cancel', requestId: firstRequestId },
  });
  const ownCancel = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: requesterCookie,
    body: { action: 'cancel', requestId: firstRequestId },
  });
  const beforeFailedTransition = await auditCount();
  const failedApproval = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { action: 'approve', requestId: firstRequestId, duration: 7 },
  });
  const [cancelledRow] = await sql.query(
    'SELECT status FROM access_requests WHERE id = $1',
    [firstRequestId],
  );
  check(
    'only the requester may cancel, and invalid state transitions leave row and audit unchanged',
    otherCancel.status === 409 &&
      ownCancel.status === 200 &&
      failedApproval.status === 409 &&
      cancelledRow?.status === 'cancelled' &&
      (await auditCount()) === beforeFailedTransition,
    `${otherCancel.status}/${ownCancel.status}/${failedApproval.status}`,
  );

  const approved = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { action: 'approve', requestId: secondRequestId, duration: 30 },
  });
  const [approvedGrant] = await sql.query(
    `SELECT id, granted_at, expires_at, request_id
       FROM permission_grants
      WHERE request_id = $1`,
    [secondRequestId],
  );
  check(
    'approval atomically creates exactly one grant with a 30-day expiry',
    approved.status === 200 &&
      approved.json?.request?.status === 'approved' &&
      approvedGrant?.request_id === secondRequestId &&
      new Date(approvedGrant.expires_at).getTime() > new Date(approvedGrant.granted_at).getTime() &&
      (await sql.query('SELECT id FROM permission_grants WHERE request_id = $1', [secondRequestId])).length === 1,
    `${approved.status}`,
  );

  const permanentRequest = await call(baseUrl, '/api/admin/access', {
    method: 'POST',
    cookie: requesterCookie,
    body: {
      action: 'request',
      permission: 'email_template.edit',
      reason: 'permanent grant test',
      requestedDuration: null,
    },
  });
  const permanentRequestId = permanentRequest.json?.request?.id;
  const permanentApproval = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { action: 'approve', requestId: permanentRequestId, duration: null },
  });
  const [permanentGrant] = await sql.query(
    'SELECT expires_at FROM permission_grants WHERE request_id = $1',
    [permanentRequestId],
  );
  check(
    'permanent approval stores a NULL grant expiry',
    permanentApproval.status === 200 &&
      permanentApproval.json?.request?.status === 'approved' &&
      permanentGrant?.expires_at === null,
    `${permanentApproval.status}`,
  );

  const declineNote = `private decision note ${testStamp}`;
  const declined = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { action: 'decline', requestId: declineRequestId, decisionNote: declineNote },
  });
  const [declinedRow] = await sql.query(
    'SELECT status, decision_note FROM access_requests WHERE id = $1',
    [declineRequestId],
  );
  const revoked = await call(baseUrl, '/api/admin/access', {
    method: 'PATCH',
    cookie: adminCookie,
    body: { action: 'revoke', grantId: activeGrantRow?.id },
  });
  const [revokedRow] = await sql.query(
    'SELECT revoked_at, revoked_by FROM permission_grants WHERE id = $1',
    [activeGrantRow?.id],
  );
  check(
    'super-admin decline and revocation update their targets',
    declined.status === 200 &&
      declined.json?.request?.status === 'declined' &&
      declinedRow?.status === 'declined' &&
      declinedRow?.decision_note === declineNote &&
      revoked.status === 200 &&
      Boolean(revokedRow?.revoked_at) &&
      revokedRow?.revoked_by === adminId,
    `${declined.status}/${revoked.status}`,
  );

  const accessActions = new Map();
  for (const id of [
    firstRequestId,
    secondRequestId,
    permanentRequestId,
    declineRequestId,
    activeGrantRow?.id,
  ]) {
    if (!id) continue;
    for (const row of await findAudit(id)) {
      accessActions.set(row.action, row);
    }
  }
  const auditJson = JSON.stringify([...accessActions.values()]);
  check(
    'request, approve, decline, cancel, and revoke audit actions omit reason and decision-note text',
    [
      'access.request_created',
      'access.request_approved',
      'access.request_declined',
      'access.request_cancelled',
      'access.grant_revoked',
    ].every((action) => accessActions.has(action)) &&
      !auditJson.includes(firstReason) &&
      !auditJson.includes(declineNote),
    [...accessActions.keys()].join(','),
  );

  const requesterHistory = await call(baseUrl, '/api/admin/access', {
    cookie: requesterCookie,
  });
  check(
    'request history reflects approved and cancelled lifecycle states',
    requesterHistory.status === 200 &&
      requesterHistory.json?.requests?.some((request) => request.id === firstRequestId && request.status === 'cancelled') &&
      requesterHistory.json?.requests?.some((request) => request.id === secondRequestId && request.status === 'approved'),
    `${requesterHistory.status}`,
  );
}

async function cleanupTestRows() {
  if (!sql) return;
  const testUserIds = [requesterId, otherRequesterId, adminId].filter(Boolean);
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
        [otherRequesterId, 'content.publish', 'pending'],
      );
      check('a second migration run succeeds without losing existing test data', Boolean(request?.id));
    }
    await runApiChecks();
  } finally {
    if (server) await server.close();
    await cleanupTestRows();
  }

  console.log(`\n${results.filter((result) => result.passed).length}/${results.length} checks passed`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
