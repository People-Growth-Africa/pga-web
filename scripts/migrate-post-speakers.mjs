import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

/**
 * Adds the speakers feature: a per-post list of speakers, and the toggle that
 * decides whether the public page shows the "Meet the speakers" section.
 *
 * Every statement is idempotent, so running it twice is the same as running it
 * once. Nothing existing is rewritten: `show_speakers` is added with a default,
 * and a post with no rows in `post_speakers` renders exactly as it did before.
 */

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

// The section is on unless a manager turns it off. A post with no speakers has
// nothing to show, so this default never makes an older post grow a new block.
await sql.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS show_speakers boolean NOT NULL DEFAULT true');

// ON DELETE CASCADE is what makes a speaker part of its post: purging the post
// removes them with it, and nothing else can leave an orphan row behind.
await sql.query(`CREATE TABLE IF NOT EXISTS post_speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  role text,
  organisation text,
  bio text,
  photo_url text,
  photo_thumb_url text,
  linkedin_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`);

// Dropped and recreated so the rule can be tightened later without a second
// migration file, in the same style as the status check.
await sql.query('ALTER TABLE post_speakers DROP CONSTRAINT IF EXISTS post_speakers_bio_check');
await sql.query(`ALTER TABLE post_speakers ADD CONSTRAINT post_speakers_bio_check
  CHECK (bio IS NULL OR char_length(bio) <= 280)`);
await sql.query('ALTER TABLE post_speakers DROP CONSTRAINT IF EXISTS post_speakers_name_check');
await sql.query(`ALTER TABLE post_speakers ADD CONSTRAINT post_speakers_name_check
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)`);
// The linked-in column is optional and, when present, https only. The API
// validates this too; this is the backstop for anything that skips it.
await sql.query('ALTER TABLE post_speakers DROP CONSTRAINT IF EXISTS post_speakers_linkedin_check');
await sql.query(`ALTER TABLE post_speakers ADD CONSTRAINT post_speakers_linkedin_check
  CHECK (linkedin_url IS NULL OR linkedin_url ~ '^https://')`);

// The only query the public side makes: every speaker for a page, in order.
await sql.query(`CREATE INDEX IF NOT EXISTS post_speakers_post_position_idx
  ON post_speakers (post_id, position)`);

console.log('Post speakers migration complete.');
