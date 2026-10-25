/**
 * Creates the event registrations table.
 *
 *   npm run migrate:registrations
 *
 * Safe to run as often as you like: every statement is idempotent and no row is
 * touched. Uses the unpooled connection when one is configured, the same way the
 * other setup scripts do, because schema changes do not belong through a pooler.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = path.resolve(import.meta.dirname, '..');
const ENV_FILES = ['.env.development.local', '.env.local', '.env'];

for (const file of ENV_FILES) {
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
  console.log(`Loaded ${file}`);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    [
      '',
      'DATABASE_URL is not set.',
      '',
      'Pull the Vercel environment first, then run this again:',
      '  npx vercel env pull .env.development.local --yes',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const sql = neon(url);

const STATEMENTS = [
  [
    'registrations table',
    `CREATE TABLE IF NOT EXISTS registrations (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       event_slug text NOT NULL,
       name text NOT NULL,
       email text NOT NULL,
       phone text NOT NULL,
       organization text,
       notes text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  ],
  // The same address may not register twice for one event. A unique index
  // rather than an inline constraint so this runs unchanged on an existing
  // table too.
  [
    'registrations event/email unique index',
    `CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_email_uidx
       ON registrations (event_slug, email)`,
  ],
  [
    'registrations event_slug index',
    'CREATE INDEX IF NOT EXISTS registrations_event_slug_idx ON registrations (event_slug)',
  ],
  [
    'registrations created_at index',
    'CREATE INDEX IF NOT EXISTS registrations_created_at_idx ON registrations (created_at DESC)',
  ],
];

for (const [label, statement] of STATEMENTS) {
  try {
    await sql.query(statement);
  } catch (error) {
    console.error(`  !!  ${label}`);
    console.error(`      ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  console.log(`  ok  ${label}`);
}

const rows = await sql.query('SELECT count(*)::int AS total FROM registrations');
console.log(`\nregistrations is ready (${rows[0]?.total ?? 0} row(s)).`);
