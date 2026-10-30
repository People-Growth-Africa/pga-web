/**
 * Widens the role constraints so a data administrator can exist.
 *
 * The application code knows the `data_admin` role, but the database still
 * carries the old CHECK constraints, and an account cannot be written until
 * they include it. This script:
 *   1. widens users.role to include data_admin;
 *   2. widens staff_invites.role when that table exists;
 *   3. reports whether the trigger guard still refuses public signup roles.
 *
 *   npm run migrate:data-admin
 *
 * It creates no accounts. Once it has run, the super administrator can invite
 * a data administrator from Staff accounts in the administrator panel.
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadEnv() {
  // The same small loader the other migration scripts use: no dotenv, and
  // environment variables already present win.
  const files = ['.env.development.local', '.env.local', '.env'];
  for (const file of files) {
    try {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
      }
      return;
    } catch {
      // try the next file
    }
  }
}

loadEnv();
const connection = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connection) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(connection);

const USER_ROLES =
  "role IN ('talent', 'employer', 'manager', 'admin', 'project_manager', 'hr_manager', 'content_manager', 'data_admin')";
const INVITE_ROLES =
  "role IN ('admin', 'project_manager', 'hr_manager', 'content_manager', 'data_admin')";

async function widenCheck(table, constraint, definition) {
  const rows = await sql.query(
    `SELECT c.conname
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = $1
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

await widenCheck('users', 'users_role_check', USER_ROLES);

const inviteTable = await sql.query(
  `SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_invites'`,
);
if (inviteTable.length > 0) {
  await widenCheck('staff_invites', 'staff_invites_role_check', INVITE_ROLES);
} else {
  console.log('  skip staff_invites (table not present)');
}

const guard = await sql.query(
  `SELECT 1
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'users' AND t.tgname = 'users_manager_guard'`,
);
console.log(
  guard.length > 0
    ? '  ok  staff signup guard still installed'
    : '  warn staff signup guard not found - run the content setup or staff migration',
);
console.log('\nRole constraints updated. Invite a data administrator from Staff accounts.');
