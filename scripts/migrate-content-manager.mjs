/**
 * Adds the content-manager role to the database.
 *
 *   npm run migrate:content-manager
 *   npm run migrate:content-manager -- media@peoplegrowthafrica.com
 *
 * The second form also moves an existing staff account to the content desk,
 * forces a fresh password and ends its old sessions. Without an email it only
 * widens the check constraints, which is safe to run repeatedly.
 *
 * This is the migration that lets the two portals exist in production: the
 * application code must not be deployed with content_manager accounts until
 * the users and staff_invites checks accept the value.
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
  console.error('\nDATABASE_URL is not set. Run `npx vercel env pull .env.development.local --yes` first.\n');
  process.exit(1);
}

const sql = neon(url);

async function widenCheck(table, constraint, definition) {
  const rows = await sql.query(
    `SELECT c.conname
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%role%'`,
    [table],
  );
  for (const row of rows) {
    await sql.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "${row.conname}"`);
  }
  await sql.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (${definition})`);
  console.log(`  ok  ${table} role check widened`);
}

await widenCheck(
  'users',
  'users_role_check',
  "role IN ('talent', 'employer', 'manager', 'admin', 'project_manager', 'hr_manager', 'content_manager')",
);

const inviteTable = await sql.query(
  `SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_invites'`,
);
if (inviteTable.length > 0) {
  await widenCheck(
    'staff_invites',
    'staff_invites_role_check',
    "role IN ('admin', 'project_manager', 'hr_manager', 'content_manager')",
  );
}

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (email) {
  if (!email.includes('@')) {
    console.error('\nUsage: npm run migrate:content-manager -- name@peoplegrowthafrica.com\n');
    process.exit(1);
  }
  const rows = await sql.query('SELECT id, role FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    console.error(`\nNo account exists for ${email}. Create one from Staff accounts after deploying.\n`);
    process.exit(1);
  }
  await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`UPDATE users
           SET role = 'content_manager',
               must_change_password = true,
               email_verified = true,
               token_version = token_version + 1
         WHERE id = ${rows[0].id}`,
    sql`INSERT INTO audit_log (user_id, action, detail)
        VALUES (${rows[0].id}, 'staff_role_changed', ${`${email} to content_manager`})`,
  ]);
  console.log(`  ok  ${email} is now a content manager and must choose a new password`);
}

console.log('\nContent manager role is ready.\n');
