/**
 * Adds persistent, structured overrides for transactional email copy.
 *
 *   npm run migrate:email-templates                 # development env files
 *   npm run migrate:email-templates -- --production # .env.production.local only
 *
 * On a Vercel production build, it uses only Vercel-injected production database
 * variables; preview builds skip it. Outside Vercel, --production reads only
 * .env.production.local. Credentials are never printed.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = path.resolve(import.meta.dirname, '..');
const production = process.argv.includes('--production');
const isVercel = process.env.VERCEL === '1';
const isVercelProduction = isVercel && process.env.VERCEL_ENV === 'production';
if (isVercel && !isVercelProduction) {
  console.log('\nSkipping email template migration outside a Vercel production build.\n');
  process.exit(0);
}
const envFiles = production && !isVercelProduction
  ? ['.env.production.local']
  : ['.env.development.local', '.env.local', '.env'];
const values = {};

for (const file of envFiles) {
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
    if (!(key in values)) values[key] = value;
  }
}

const url = isVercelProduction
  ? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  : values.DATABASE_URL_UNPOOLED ?? values.DATABASE_URL;
if (!url) {
  console.error(
    production
      ? '\nProduction DATABASE_URL is missing from .env.production.local. No migration was run.\n'
      : '\nDATABASE_URL is missing from the local env files. No migration was run.\n',
  );
  process.exit(1);
}

let target;
try {
  const parsed = new URL(url);
  target = `${parsed.hostname}/${parsed.pathname.replace(/^\//, '').split('/')[0] || '(default database)'}`;
} catch {
  console.error('\nThe selected database URL is invalid. No migration was run.\n');
  process.exit(1);
}

const sql = neon(url);
await sql.query(`
  CREATE TABLE IF NOT EXISTS email_template_overrides (
    template_id text PRIMARY KEY,
    content jsonb NOT NULL,
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`);
console.log(`\nEmail template overrides table is ready on ${production ? 'production' : 'development'} target ${target}.\n`);
