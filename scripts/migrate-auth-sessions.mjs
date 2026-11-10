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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
await sql.query(`CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portal text NOT NULL CHECK (portal IN ('public', 'admin', 'content')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text,
  revoked_at timestamptz
)`);
await sql.query(`ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS portal text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz`);
await sql.query(`CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions (user_id, last_seen_at DESC) WHERE revoked_at IS NULL`);
await sql.query(`CREATE INDEX IF NOT EXISTS sessions_expiry_idx
  ON sessions (expires_at) WHERE revoked_at IS NOT NULL`);
await sql.query(`CREATE TABLE IF NOT EXISTS login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email_attempted text NOT NULL,
  success boolean NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
)`);
await sql.query(`CREATE INDEX IF NOT EXISTS login_events_user_created_idx
  ON login_events (user_id, created_at DESC)`);
await sql.query(`CREATE INDEX IF NOT EXISTS login_events_email_created_idx
  ON login_events (lower(email_attempted), created_at DESC)`);
await sql.query(`CREATE INDEX IF NOT EXISTS login_events_ip_created_idx
  ON login_events (ip, created_at DESC)`);
console.log('Server-side auth sessions migration complete.');
