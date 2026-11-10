/**
 * Focused tests for the append-only audit writer.
 *
 * Set AUDIT_TEST_DATABASE_URL to a disposable database where
 * `npm run migrate:audit-logs` has already been run. Test rows are intentionally
 * retained because the database rejects deletion.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { register, registerHooks } from 'node:module';

if (typeof registerHooks === 'function') {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('.') && specifier.endsWith('.js')) {
        try {
          return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
        } catch {
          // Use Node's regular resolver for non-TypeScript files.
        }
      }
      return nextResolve(specifier, context);
    },
  });
} else {
  register('./ts-resolve-hook.mjs', import.meta.url);
}

const databaseUrl = process.env.AUDIT_TEST_DATABASE_URL;
const permissionsOnly = process.argv.includes('--permissions-only');
if (!databaseUrl && !permissionsOnly) {
  console.error('Set AUDIT_TEST_DATABASE_URL to a disposable test database.');
  process.exit(1);
}
process.env.DATABASE_URL = databaseUrl ?? 'postgresql://audit-test:audit-test@localhost/audit-test';

const { logAudit, auditedMutation, prepareAuditWrite } = await import('../api/_lib/audit.ts');
const { hasPermission } = await import('../api/_lib/permissions.ts');
const auditPageSource = await readFile(
  new URL('../src/pages/admin/AdminAuditLog.tsx', import.meta.url),
  'utf8',
);
assert.match(
  auditPageSource,
  /authRequest<AuditPage>\(`\/api\/admin\/audit-log\?\$\{queryString\}`, \{ method: 'GET' \}\)/,
  'audit log pagination must use GET, which is the method accepted by the API endpoint',
);

assert.equal(hasPermission('admin', 'audit_log.view'), true);
assert.equal(hasPermission('project_manager', 'audit_log.view'), false);
assert.equal(hasPermission('data_admin', 'audit_log.view'), false);
assert.equal(hasPermission('content_manager', 'audit_log.view'), false);
assert.throws(() => prepareAuditWrite({
  req: { headers: {} },
  actor: { id: null, email: null, role: null },
  action: 'invalid.action',
  entity: { type: 'post' },
}));
const prepared = prepareAuditWrite({
  req: { headers: { 'x-forwarded-for': '192.0.2.1, 198.51.100.2' } },
  actor: { id: null, email: null, role: null },
  action: 'email_template.update',
  entity: { type: 'email_template' },
  before: { subject: 'Old', password: 'never store', actionUrl: 'https://secret.test/token' },
  after: { subject: 'New', password: 'never store', actionUrl: 'https://secret.test/token' },
});
assert.deepEqual(prepared.before, { subject: 'Old' });
assert.deepEqual(prepared.after, { subject: 'New' });
assert.equal(prepared.ip, '192.0.2.1');
const deleted = prepareAuditWrite({
  req: { headers: {} },
  actor: { id: null, email: null, role: null },
  action: 'content.delete',
  entity: { type: 'post', id: 'post-id' },
  before: { title: 'Deleted post', status: 'published' },
});
assert.deepEqual(deleted.before, { title: 'Deleted post', status: 'published' });
assert.deepEqual(deleted.after, { title: null, status: null });
if (permissionsOnly) {
  console.log('PASS  permissions and redacted diff');
  process.exit(0);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(databaseUrl);

const requestId = randomUUID();
const req = {
  headers: {
    'x-request-id': requestId,
    'x-forwarded-for': '192.0.2.1, 198.51.100.2',
    'user-agent': 'audit-log-test',
  },
};

await logAudit({
  req,
  actor: { id: null, email: 'admin@example.test', role: 'admin' },
  action: 'email_template.update',
  entity: { type: 'email_template', id: 'verification', label: 'Verification' },
  before: { subject: 'Old subject', paragraphs: ['Old body'], actionUrl: 'https://secret.test/token' },
  after: { subject: 'New subject', paragraphs: ['New body'], actionUrl: 'https://secret.test/token' },
});

const [row] = await sql.query(
  `SELECT id, actor_email, actor_role, action, entity_type, entity_id, entity_label,
          "before" AS before, "after" AS after, ip, user_agent, request_id
     FROM audit_logs WHERE request_id = $1`,
  [requestId],
);
assert.ok(row, 'audit event was inserted');
assert.equal(row.actor_email, 'admin@example.test');
assert.equal(row.actor_role, 'admin');
assert.equal(row.action, 'email_template.update');
assert.equal(row.entity_id, 'verification');
assert.deepEqual(row.before, { subject: 'Old subject', paragraphs: ['Old body'] });
assert.deepEqual(row.after, { subject: 'New subject', paragraphs: ['New body'] });
assert.equal(row.ip, '192.0.2.1');
assert.equal(row.user_agent, 'audit-log-test');

await assert.rejects(() => sql.query(
  `UPDATE audit_logs SET action = 'tampered' WHERE id = $1`,
  [row.id],
));
await assert.rejects(() => sql.query(`DELETE FROM audit_logs WHERE id = $1`, [row.id]));

const countBefore = Number((await sql.query(
  'SELECT count(*)::int AS count FROM audit_logs WHERE request_id = $1',
  [requestId],
))[0].count);
const noOpRequestId = randomUUID();
const noOpRows = await auditedMutation({
  req: { headers: { 'x-request-id': noOpRequestId } },
  actor: { id: null, email: 'admin@example.test', role: 'admin' },
  action: 'content.edit',
  entity: { type: 'post', id: randomUUID(), label: 'missing test post' },
  before: { title: 'Before' },
  after: { title: 'After' },
  mutationSql: 'UPDATE posts SET title = $1 WHERE id = $2 RETURNING id, type, slug, title, status',
  mutationParams: ['After', randomUUID()],
});
assert.equal(noOpRows.length, 0);
const countAfter = Number((await sql.query(
  'SELECT count(*)::int AS count FROM audit_logs WHERE request_id = $1',
  [noOpRequestId],
))[0].count);
assert.equal(countAfter, 0, 'a no-op mutation must not create an audit event');
assert.equal(countBefore, 1);
const failureRequestId = randomUUID();
await assert.rejects(() => auditedMutation({
  req: { headers: { 'x-request-id': failureRequestId } },
  actor: { id: null, email: 'admin@example.test', role: 'admin' },
  action: 'content.create',
  entity: { type: 'post', label: 'failed insert' },
  after: { type: 'blog', slug: 'failed-insert', title: 'failed insert', status: 'draft' },
  mutationSql: 'INSERT INTO posts (title) VALUES (NULL) RETURNING id, type, slug, title, status',
  mutationParams: [],
}));
const failureCount = Number((await sql.query(
  'SELECT count(*)::int AS count FROM audit_logs WHERE request_id = $1',
  [failureRequestId],
))[0].count);
assert.equal(failureCount, 0, 'a failed mutation must not create an audit event');
console.log('PASS  audit snapshots, role permission, redaction, append-only trigger and no-op behavior');
