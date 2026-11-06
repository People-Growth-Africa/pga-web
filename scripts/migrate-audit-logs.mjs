/**
 * Adds the append-only staff audit trail.
 *
 *   npm run migrate:audit-logs
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
  CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    actor_id uuid,
    actor_email text,
    actor_role text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    entity_label text,
    "before" jsonb,
    "after" jsonb,
    ip text,
    user_agent text,
    request_id text
  )
`);
await sql.query('CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC)');
await sql.query('CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON audit_logs (actor_id)');
await sql.query('CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action)');
await sql.query('CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id)');
await sql.query(`
  CREATE OR REPLACE FUNCTION reject_audit_logs_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RAISE EXCEPTION 'audit_logs is append-only';
  END;
  $$
`);
await sql.query('DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs');
await sql.query(`
  CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_audit_logs_mutation()
`);

console.log('\nAppend-only audit_logs table and indexes are ready.\n');
