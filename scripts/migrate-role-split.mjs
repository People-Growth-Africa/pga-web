/**
 * One-time role split migration.
 *
 * Edit ACCOUNT_MAPPING before running. The script:
 *   1. widens the users/staff_invites role constraints to include content_manager;
 *   2. maps each configured email to its new role and prints what changed;
 *   3. disables every example.com account;
 *   4. bumps token_version for every user, ending every active session.
 *
 *   npm run migrate:role-split
 *
 * The mapping is intentionally explicit and never inferred from a name. A
 * missing email is reported as skipped, not created.
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const ACCOUNT_MAPPING = [
  { email: 'admin@peoplegrowthafrica.com', role: 'admin' },
  { email: 'manager@peoplegrowthafrica.com', role: 'project_manager' },
  { email: 'media@peoplegrowthafrica.com', role: 'content_manager' },
];

const VALID_STAFF_ROLES = new Set(['admin', 'project_manager', 'hr_manager', 'content_manager']);

function loadEnv() {
  // Same small loader as the existing migration scripts: no dependency on
  // dotenv, and environment variables already present win.
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
for (const entry of ACCOUNT_MAPPING) {
  if (!VALID_STAFF_ROLES.has(entry.role)) {
    console.error(`Unsupported role "${entry.role}" for ${entry.email}.`);
    process.exit(1);
  }
}

const sql = neon(connection);

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

let changed = 0;
for (const entry of ACCOUNT_MAPPING) {
  const email = entry.email.trim().toLowerCase();
  const rows = await sql.query('SELECT id, role FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    console.log(`  skip ${email} (no account)`);
    continue;
  }
  const user = rows[0];
  if (user.role === entry.role) {
    console.log(`  ok   ${email} already ${entry.role}`);
    continue;
  }
  await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`UPDATE users
           SET role = ${entry.role},
               must_change_password = true,
               token_version = token_version + 1,
               disabled_at = NULL
         WHERE id = ${user.id}`,
    sql`INSERT INTO audit_log (user_id, action, detail)
        VALUES (${user.id}, 'staff_role_changed', ${`${email}: ${user.role} -> ${entry.role}`})`,
  ]);
  console.log(`  map  ${email}: ${user.role} -> ${entry.role}`);
  changed += 1;
}

const disabled = await sql.query(
  `UPDATE users SET disabled_at = now(), token_version = token_version + 1
    WHERE email ILIKE '%@example.com' AND disabled_at IS NULL
    RETURNING email`,
);
console.log(`  ok  ${disabled.length} example.com account(s) disabled`);

const invalidated = await sql.query(
  'UPDATE users SET token_version = token_version + 1 RETURNING id',
);
console.log(`  ok  ${invalidated.length} account(s) signed out (token_version bumped)`);
console.log(`\nRole split complete: ${changed} account(s) remapped.`);
