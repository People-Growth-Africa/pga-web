/**
 * Promotes an existing account to the manager role, or creates one.
 *
 *   node scripts/promote-manager.mjs you@example.com [password]
 *
 * This is the only way a manager account comes into being. Public signup
 * cannot produce one: the signup schemas accept only 'talent' and 'employer',
 * and a database trigger (scripts/setup-content.mjs) refuses a manager row
 * unless the `pga.promote_manager` setting is on, which only this script sets
 * and only for the length of one transaction.
 *
 * With no password argument the account is created with a random password you
 * will never need, because managers sign in with the same email link and
 * password flows as everyone else and can reset it. Passing one is only for
 * when you want to know the password up front.
 *
 * Safe to run twice: promoting an account that is already a manager is a no-op.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = path.resolve(import.meta.dirname, '..');
const ENV_FILES = ['.env.development.local', '.env.local', '.env'];

function loadEnvFiles() {
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
  }
}

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('\nUsage: node scripts/promote-manager.mjs you@example.com [password]\n');
  process.exit(1);
}

const suppliedPassword = process.argv[3];

loadEnvFiles();
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('\nDATABASE_URL is not set. Run `npx vercel env pull .env.development.local --yes` first.\n');
  process.exit(1);
}

const sql = neon(url);

/**
 * The password is hashed the same way the API hashes one (bcrypt, 12 rounds,
 * sha256 pre-hash) so the account can sign in immediately. The API module
 * cannot be imported from here: it is TypeScript compiled for a different
 * project, and this script has to run with plain node.
 */
async function hashPassword(plain) {
  const { createHash } = await import('node:crypto');
  const bcrypt = (await import('bcryptjs')).default;
  const preHashed = createHash('sha256').update(plain, 'utf8').digest('base64');
  return bcrypt.hash(preHashed, 12);
}

const password = suppliedPassword ?? randomBytes(24).toString('base64url');
const passwordHash = await hashPassword(password);

// The trigger that blocks public manager signups is relaxed for this
// transaction only. `true` makes the setting transaction-local, so it cannot
// leak into a later statement. Neon's HTTP driver runs every query on its own,
// so the setting and the write have to travel in one `transaction()` call to
// share a session - a separate set_config would be gone before the write ran.
const existing = await sql.query('SELECT id, role FROM users WHERE email = $1', [email]);

if (existing.length > 0) {
  if (existing[0].role === 'manager') {
    console.log(`\n${email} is already a manager. Nothing to do.\n`);
    process.exit(0);
  }
  const before = existing[0].role;
  await sql.transaction([
    sql`SELECT set_config('pga.promote_manager', 'on', true)`,
    sql`UPDATE users
           SET role = 'manager',
               email_verified = true,
               token_version = token_version + 1
         WHERE id = ${existing[0].id}`,
  ]);
  console.log(`\nPromoted ${email} from ${before} to manager.`);
  console.log('Any session they were already signed in with has been ended.');
} else {
  await sql.transaction([
    sql`SELECT set_config('pga.promote_manager', 'on', true)`,
    sql`INSERT INTO users (email, password_hash, role, email_verified)
        VALUES (${email}, ${passwordHash}, 'manager', true)`,
  ]);
  console.log(`\nCreated a manager account for ${email}.`);
  console.log(
    suppliedPassword
      ? 'Sign in with the password you passed.'
      : 'A random password was generated for it. Use "Forgot password" on the sign in page to set one you know.',
  );
}

console.log(
  [
    '',
    'Next steps:',
    '  1. Set AUTH_ENABLED=true in Vercel (the accounts API answers 410 until you do).',
    '  2. Deploy this branch.',
    `  3. Sign in at /auth, then open /admin/content.`,
    '',
  ].join('\n'),
);
