/**
 * Event pages: custom registration copy and permanent old-slug redirects.
 *
 *   npm run migrate:event-pages
 *
 * Additive only. Existing posts keep their slugs; the redirect table is new.
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

await sql.transaction([
  sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS registration_intro text`,
  sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS registration_button_label text`,
  sql`CREATE TABLE IF NOT EXISTS post_slug_redirects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL CHECK (type IN ('blog', 'event')),
        old_slug text NOT NULL,
        post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (type, old_slug)
      )`,
  sql`CREATE INDEX IF NOT EXISTS post_slug_redirects_post_idx ON post_slug_redirects (post_id)`,
]);

console.log('\nEvent page fields and old-slug redirects are ready.\n');
