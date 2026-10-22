/**
 * Sets up everything the content admin panel needs in Neon Postgres.
 *
 *   npm run setup:content
 *
 * Safe to run as often as you like: every statement is idempotent, the seed
 * inserts on conflict do nothing, and each self test creates and removes its
 * own throwaway rows. It creates two new tables and widens one existing
 * constraint; it never drops a table and never rewrites a row that is already
 * there.
 *
 * Run this after `npm run setup:auth`, which owns the users table this widens.
 */
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
    console.log(`Loaded ${file}`);
  }
}

function connectionString() {
  // Migrations run better unpooled. The app itself always uses DATABASE_URL.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      [
        '',
        'DATABASE_URL is not set.',
        '',
        'Pull the Vercel environment first, then run this again:',
        '  npx vercel login',
        '  npx vercel link',
        '  npx vercel env pull .env.development.local --yes',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  return url;
}

/* ── Tables ─────────────────────────────────────────────────────────────── */

const STATEMENTS = [
  [
    'categories table',
    `CREATE TABLE IF NOT EXISTS categories (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       name text NOT NULL,
       slug text UNIQUE NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  ],

  // ON DELETE RESTRICT is the database's half of "a category that still has
  // posts cannot be deleted": the API offers a reassign flow, and this stops a
  // delete that somehow skipped it from orphaning rows.
  [
    'posts table',
    `CREATE TABLE IF NOT EXISTS posts (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       slug text UNIQUE NOT NULL,
       title text NOT NULL,
       excerpt text NOT NULL DEFAULT '',
       body text NOT NULL DEFAULT '',
       category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
       cover_image_url text,
       link_label text,
       link_url text,
       status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
       published_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       author_id uuid REFERENCES users(id) ON DELETE SET NULL
     )`,
  ],

  // The public feed reads published rows newest first, so this index is the one
  // that query will always use.
  [
    'posts published index',
    `CREATE INDEX IF NOT EXISTS posts_published_idx
       ON posts (published_at DESC) WHERE status = 'published'`,
  ],

  ['posts category index', 'CREATE INDEX IF NOT EXISTS posts_category_idx ON posts (category_id)'],
  ['posts author index', 'CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author_id)'],
  ['posts updated index', 'CREATE INDEX IF NOT EXISTS posts_updated_idx ON posts (updated_at DESC)'],
];

/** The six content types managers start with. Added on conflict do nothing. */
const DEFAULT_CATEGORIES = [
  ['News', 'news'],
  ['Events', 'events'],
  ['Articles', 'articles'],
  ['Resources', 'resources'],
  ['Announcements', 'announcements'],
  ['Opportunities', 'opportunities'],
];

/* ── The manager role ───────────────────────────────────────────────────── */

/**
 * Widen the users.role check to allow 'manager'.
 *
 * The constraint is found by looking at its definition rather than trusting a
 * name, because `setup:auth` let Postgres name it and a renamed or duplicated
 * constraint would otherwise survive this and keep rejecting manager rows. Only
 * the constraint is touched: no column, no row, no other table.
 */
async function allowManagerRole(sql) {
  const existing = await sql.query(
    `SELECT c.conname
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'users'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%role%'`,
  );

  for (const row of existing) {
    await sql.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${row.conname}"`);
    console.log(`  ok  dropped role check ${row.conname}`);
  }

  await sql.query(
    `ALTER TABLE users
        ADD CONSTRAINT users_role_check CHECK (role IN ('talent', 'employer', 'manager'))`,
  );
  console.log('  ok  users.role accepts manager');
}

/**
 * The other half of "managers can never be created through public signup".
 *
 * The API already cannot write a manager row: the signup schemas only accept
 * the literals 'talent' and 'employer', and the two insert helpers hardcode
 * their own role. This trigger closes the door behind them, so a future
 * endpoint that forgot those checks still cannot mint a manager account. The
 * promotion script turns it off for the length of one transaction with the
 * `pga.promote_manager` setting, which no request can set.
 */
const MANAGER_GUARD = `
  CREATE OR REPLACE FUNCTION users_guard_manager() RETURNS trigger AS $$
  BEGIN
    IF NEW.role = 'manager'
       AND coalesce(current_setting('pga.promote_manager', true), '') <> 'on' THEN
      RAISE EXCEPTION 'manager accounts can only be created by scripts/promote-manager.mjs';
    END IF;
    RETURN NEW;
  END $$ LANGUAGE plpgsql`;

async function installManagerGuard(sql) {
  await sql.query(MANAGER_GUARD);
  await sql.query('DROP TRIGGER IF EXISTS users_manager_guard ON users');
  await sql.query(
    `CREATE TRIGGER users_manager_guard
       BEFORE INSERT OR UPDATE OF role ON users
       FOR EACH ROW EXECUTE FUNCTION users_guard_manager()`,
  );
  console.log('  ok  manager accounts are guarded against public signup');
}

/* ── Seed ───────────────────────────────────────────────────────────────── */

async function seedCategories(sql) {
  let added = 0;
  for (const [name, slug] of DEFAULT_CATEGORIES) {
    const rows = await sql.query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [name, slug],
    );
    added += rows.length;
  }
  console.log(`  ok  categories seeded (${added} added, ${DEFAULT_CATEGORIES.length - added} already there)`);
}

/* ── Self tests ─────────────────────────────────────────────────────────── */

/**
 * Runs the exact shapes the app runs, then removes its own rows. A constraint
 * that is missing or wrong is the failure this catches: the admin panel would
 * look like it worked either way.
 */
async function verify(sql) {
  const tables = await sql.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [['categories', 'posts']],
  );
  const found = new Set(tables.map((row) => row.table_name));
  const missing = ['categories', 'posts'].filter((table) => !found.has(table));
  if (missing.length > 0) throw new Error(`Missing tables: ${missing.join(', ')}`);
  console.log('  ok  categories and posts present');

  const categories = await sql.query('SELECT id, slug FROM categories');
  const bySlug = new Map(categories.map((row) => [row.slug, row.id]));
  for (const [, slug] of DEFAULT_CATEGORIES) {
    if (!bySlug.has(slug)) throw new Error(`Default category ${slug} was not seeded.`);
  }

  const managerEmail = 'content-smoke-test@example.invalid';
  const categoryA = 'smoke-test-a';
  const categoryB = 'smoke-test-b';

  try {
    await sql.query('DELETE FROM posts WHERE slug LIKE $1', ['smoke-test-%']);
    await sql.query('DELETE FROM categories WHERE slug = ANY($1)', [[categoryA, categoryB]]);

    const [insertedA, insertedB] = await sql.query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2), ($3, $4) RETURNING id, slug`,
      ['Smoke Test A', categoryA, 'Smoke Test B', categoryB],
    );

    // A manager row, written the way the promotion script writes it. Neon's
    // HTTP driver gives every query its own session, so the setting and the
    // insert have to travel in one transaction to be seen by the trigger.
    await sql.query('DELETE FROM users WHERE email = $1', [managerEmail]);
    const manager = await sql.transaction([
      sql`SELECT set_config('pga.promote_manager', 'on', true)`,
      sql`INSERT INTO users (email, password_hash, role, email_verified)
          VALUES (${managerEmail}, ${'not-a-real-hash'}, 'manager', true) RETURNING id`,
    ]);
    const managerRows = manager[1] ?? [];
    if (managerRows.length !== 1) throw new Error('Self test: a manager row could not be written.');

    // ... and the same write without the setting has to be refused.
    const blocked = await sql
      .query(`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'manager')`, [
        'content-smoke-test-blocked@example.invalid',
        'x',
      ])
      .then(() => false)
      .catch((error) => /only be created by/.test(String(error.message)));
    if (!blocked) throw new Error('Self test: the manager guard let a public signup through.');

    const post = await sql.query(
      `INSERT INTO posts (slug, title, excerpt, body, category_id, status, author_id)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6) RETURNING id, status, published_at`,
      ['smoke-test-post', 'Smoke Test Post', 'An excerpt.', 'Body text.', insertedA.id, managerRows[0].id],
    );
    if (post.length !== 1 || post[0].published_at !== null) {
      throw new Error('Self test: a draft post should have no published_at.');
    }

    // Publishing stamps published_at; unpublishing clears it again.
    const published = await sql.query(
      `UPDATE posts SET status = 'published', published_at = now(), updated_at = now()
        WHERE id = $1 RETURNING status, published_at`,
      [post[0].id],
    );
    if (published[0].status !== 'published' || published[0].published_at === null) {
      throw new Error('Self test: publishing did not stamp published_at.');
    }

    // A slug collision is refused rather than silently suffixed.
    const duplicateSlug = await sql
      .query(`INSERT INTO posts (slug, title, category_id) VALUES ($1, $2, $3)`, [
        'smoke-test-post',
        'Another',
        insertedB.id,
      ])
      .then(() => false)
      .catch((error) => error.code === '23505');
    if (!duplicateSlug) throw new Error('Self test: duplicate slugs are not being rejected.');

    // An unknown status is refused by the check constraint.
    const badStatus = await sql
      .query(`UPDATE posts SET status = 'archived' WHERE id = $1`, [post[0].id])
      .then(() => false)
      .catch((error) => error.code === '23514');
    if (!badStatus) throw new Error('Self test: the posts status check is missing.');

    // Reassigning a category moves its posts, which is what unblocks deletion.
    await sql.query('UPDATE posts SET category_id = $2 WHERE id = $1', [post[0].id, insertedB.id]);
    const stillReferenced = await sql.query(
      'SELECT count(*)::int AS count FROM posts WHERE category_id = $1',
      [insertedA.id],
    );
    if (stillReferenced[0].count !== 0) throw new Error('Self test: reassigning a post failed.');

    // ... and the foreign key refuses to delete a category that still has posts.
    // ON DELETE RESTRICT raises 23001 (restrict_violation), not the 23503 that
    // NO ACTION raises. Both are accepted so the test holds if the constraint
    // is ever restated the other way.
    const restricted = await sql
      .query('DELETE FROM categories WHERE id = $1', [insertedB.id])
      .then(() => false)
      .catch((error) => error.code === '23001' || error.code === '23503');
    if (!restricted) throw new Error('Self test: a category with posts could be deleted.');

    console.log(
      '  ok  content self test passed (manager guard, draft/publish, slug uniqueness, status check, reassign, delete restricted)',
    );
  } finally {
    await sql.query('DELETE FROM posts WHERE slug LIKE $1', ['smoke-test-%']);
    await sql.query('DELETE FROM categories WHERE slug = ANY($1)', [[categoryA, categoryB]]);
    await sql.query('DELETE FROM users WHERE email = $1', [managerEmail]);
    await sql.query('DELETE FROM users WHERE email = $1', ['content-smoke-test-blocked@example.invalid']);
  }
}

/* ── Run ────────────────────────────────────────────────────────────────── */

loadEnvFiles();
const sql = neon(connectionString());

console.log('Creating content tables and indexes...');
for (const [label, statement] of STATEMENTS) {
  await sql.query(statement);
  console.log(`  ok  ${label}`);
}

console.log('Adding the manager role...');
await allowManagerRole(sql);
await installManagerGuard(sql);

console.log('Seeding default categories...');
await seedCategories(sql);

console.log('Checking the result...');
await verify(sql);

console.log('\nDatabase ready. Promote a manager with:  node scripts/promote-manager.mjs you@example.com');
