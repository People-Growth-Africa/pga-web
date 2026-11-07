/**
 * Adds access requests and permission grants.
 *
 *   npm run migrate:access-requests
 *
 * Idempotent. Uses the configured local database; this script is never run by
 * the build or deployment pipeline.
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
  CREATE TABLE IF NOT EXISTS access_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission text NOT NULL,
    reason text NOT NULL CHECK (length(trim(reason)) > 0),
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
    requested_duration smallint NULL
      CHECK (requested_duration IS NULL OR requested_duration IN (7, 30, 90)),
    decided_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
    decided_at timestamptz NULL,
    decision_note text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (permission IN (
      'content.edit', 'content.publish', 'email_template.edit',
      'consultation.update', 'export.data'
    ))
  )
`);
await sql.query(`
  CREATE TABLE IF NOT EXISTS permission_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission text NOT NULL CHECK (permission IN (
      'content.edit', 'content.publish', 'email_template.edit',
      'consultation.update', 'export.data'
    )),
    granted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    granted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NULL,
    revoked_at timestamptz NULL,
    revoked_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
    request_id uuid NULL REFERENCES access_requests(id) ON DELETE SET NULL,
    expiration_audited_at timestamptz NULL,
    CHECK (expires_at IS NULL OR expires_at > granted_at)
  )
`);
await sql.query(
  'CREATE INDEX IF NOT EXISTS access_requests_requester_status_idx ON access_requests (requester_id, status)',
);
await sql.query(
  `CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending_idx
     ON access_requests (requester_id, permission)
     WHERE status = 'pending'`,
);
await sql.query(
  `CREATE INDEX IF NOT EXISTS permission_grants_active_user_idx
     ON permission_grants (user_id, permission)
     WHERE revoked_at IS NULL`,
);
await sql.query(
  `CREATE INDEX IF NOT EXISTS permission_grants_expiry_idx
     ON permission_grants (expires_at)
     WHERE expires_at IS NOT NULL AND expiration_audited_at IS NULL`,
);
await sql.query(
  `CREATE UNIQUE INDEX IF NOT EXISTS permission_grants_request_id_idx
     ON permission_grants (request_id)
     WHERE request_id IS NOT NULL`,
);

console.log('\nAccess requests and permission grants tables are ready.\n');
