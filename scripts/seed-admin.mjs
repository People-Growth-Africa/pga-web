/**
 * Seeds the first staff administrator.
 *
 *   ADMIN_EMAIL=admin@peoplegrowthafrica.com ADMIN_TEMP_PASSWORD='...' npm run seed:admin
 *
 * The password is read from the environment, hashed, and never printed or
 * logged. The account is marked `must_change_password`, so the temporary
 * password only opens the set-password screen.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

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

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.ADMIN_TEMP_PASSWORD ?? '';

if (!email || !email.includes('@')) {
  console.error('\nADMIN_EMAIL is required, for example ADMIN_EMAIL=admin@peoplegrowthafrica.com.\n');
  process.exit(1);
}
if (password.length < 12) {
  console.error('\nADMIN_TEMP_PASSWORD is required and must be at least 12 characters.\n');
  process.exit(1);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('\nDATABASE_URL is not set. Run `npx vercel env pull .env.development.local --yes` first.\n');
  process.exit(1);
}

const preHashed = createHash('sha256').update(password, 'utf8').digest('base64');
const passwordHash = await bcrypt.hash(preHashed, 12);
const sql = neon(url);

await sql.transaction([
  sql`SELECT set_config('pga.staff_write', 'on', true)`,
  sql`INSERT INTO users (email, password_hash, role, email_verified, must_change_password)
      VALUES (${email}, ${passwordHash}, 'admin', true, true)
      ON CONFLICT (email) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            role = 'admin',
            email_verified = true,
            must_change_password = true,
            disabled_at = null,
            token_version = users.token_version + 1`,
  sql`INSERT INTO audit_log (action, detail) VALUES ('staff_seeded', ${email})`,
]);

console.log(`\nSeeded ${email} as an administrator. They must set a new password on first sign in.`);
console.log('Temporary passwords are not printed. Run this once, then keep the value out of your shell history.\n');
