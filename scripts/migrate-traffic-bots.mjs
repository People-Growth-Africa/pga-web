/**
 * Adds raw, pseudonymized traffic hits and super-admin classification rules.
 *
 *   npm run migrate:traffic-bots
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
  CREATE TABLE IF NOT EXISTS traffic_hits (
    hit_id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    path text NOT NULL,
    referrer_host text NOT NULL DEFAULT '',
    utm_source text NOT NULL DEFAULT '',
    country text NOT NULL DEFAULT 'ZZ',
    device text NOT NULL DEFAULT 'desktop',
    ip_hash text,
    visitor_hash text,
    user_agent text NOT NULL DEFAULT '',
    javascript_executed boolean NOT NULL DEFAULT false
  )
`);
await sql.query('CREATE INDEX IF NOT EXISTS traffic_hits_created_at_idx ON traffic_hits (created_at DESC)');
await sql.query('CREATE INDEX IF NOT EXISTS traffic_hits_ip_created_at_idx ON traffic_hits (ip_hash, created_at DESC)');
await sql.query('CREATE INDEX IF NOT EXISTS traffic_hits_path_created_at_idx ON traffic_hits (path, created_at DESC)');
await sql.query(`
  CREATE TABLE IF NOT EXISTS traffic_bot_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type text NOT NULL CHECK (rule_type IN ('user_agent', 'path')),
    pattern text NOT NULL,
    classification text NOT NULL CHECK (classification IN ('bot', 'human')),
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rule_type, pattern, classification)
  )
`);
await sql.query('CREATE INDEX IF NOT EXISTS traffic_bot_rules_lookup_idx ON traffic_bot_rules (rule_type, classification)');

console.log('\nRaw traffic hit and bot rule tables are ready.\n');
