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

/* ── Post types ─────────────────────────────────────────────────────────── */

/**
 * Every post is now one of two things: a blog post or an event.
 *
 * Added rather than restated: the columns arrive with `ADD COLUMN IF NOT
 * EXISTS`, the constraints are dropped and recreated so running this twice is
 * the same as running it once, and no row is rewritten except the backfill that
 * exists precisely to give old rows a type.
 *
 * `category_id` loses NOT NULL here and is instead required of blog posts by a
 * check constraint. That keeps the rule in one place - a category is a topic on
 * a written piece, and an event has none - while the foreign key keeps refusing
 * to delete a category that still has posts.
 */
async function migratePostTypes(sql) {
  const columns = [
    ['posts.type', `ALTER TABLE posts ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'blog'`],
    ['posts.event_start', 'ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_start timestamptz'],
    ['posts.event_end', 'ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_end timestamptz'],
    ['posts.location_text', 'ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_text text'],
    [
      'posts.is_online',
      'ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false',
    ],
    ['posts.registration_url', 'ALTER TABLE posts ADD COLUMN IF NOT EXISTS registration_url text'],
    ['posts.cover_image_thumb_url', 'ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_image_thumb_url text'],
  ];

  for (const [label, statement] of columns) {
    await sql.query(statement);
    console.log(`  ok  ${label}`);
  }

  // The default exists only so the ADD COLUMN above could fill in old rows.
  // Dropping it means a future insert that forgets `type` is refused instead
  // of quietly becoming a blog post.
  await sql.query('ALTER TABLE posts ALTER COLUMN type DROP DEFAULT');

  // Existing rows predate the type column, so they are blog posts by definition:
  // the old /updates feed was the only place they could appear.
  const backfilled = await sql.query(
    `UPDATE posts SET type = 'blog' WHERE type IS NULL OR type = '' RETURNING id`,
  );
  if (backfilled.length > 0) console.log(`  ok  backfilled ${backfilled.length} existing post(s) to blog`);

  // A topic is optional on an event and required on a written piece.
  await sql.query('ALTER TABLE posts ALTER COLUMN category_id DROP NOT NULL');

  const constraints = [
    [
      'posts_type_check',
      `ALTER TABLE posts ADD CONSTRAINT posts_type_check CHECK (type IN ('blog', 'event'))`,
    ],
    [
      'posts_category_by_type_check',
      // One rule, stated once: a written piece has a topic, an event does not.
      `ALTER TABLE posts ADD CONSTRAINT posts_category_by_type_check
         CHECK ((type = 'blog' AND category_id IS NOT NULL)
             OR (type = 'event' AND category_id IS NULL))`,
    ],
    [
      'posts_event_start_check',
      `ALTER TABLE posts ADD CONSTRAINT posts_event_start_check
         CHECK (type <> 'event' OR event_start IS NOT NULL)`,
    ],
    [
      'posts_event_time_check',
      `ALTER TABLE posts ADD CONSTRAINT posts_event_time_check
         CHECK (event_end IS NULL OR event_start IS NULL OR event_end > event_start)`,
    ],
    [
      'posts_event_location_check',
      // An online event has nowhere to be; an in-person one must say where.
      `ALTER TABLE posts ADD CONSTRAINT posts_event_location_check
         CHECK (type <> 'event' OR is_online OR location_text IS NOT NULL)`,
    ],
  ];

  for (const [name, statement] of constraints) {
    await sql.query(`ALTER TABLE posts DROP CONSTRAINT IF EXISTS ${name}`);
    await sql.query(statement);
    console.log(`  ok  ${name}`);
  }

  // The public pages ask for one type at a time, published only.
  await sql.query(
    `CREATE INDEX IF NOT EXISTS posts_type_published_idx
       ON posts (type, published_at DESC) WHERE status = 'published'`,
  );
  console.log('  ok  posts_type_published_idx');
}

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
        ADD CONSTRAINT users_role_check CHECK (role IN ('talent', 'employer', 'manager', 'admin', 'project_manager', 'hr_manager', 'content_manager'))`,
  );
  console.log('  ok  users.role accepts manager, staff and content manager roles');
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
    IF NEW.role NOT IN ('talent', 'employer')
       AND coalesce(current_setting('pga.promote_manager', true), '') <> 'on'
       AND coalesce(current_setting('pga.staff_write', true), '') <> 'on' THEN
      RAISE EXCEPTION 'staff accounts can only be created by an admin endpoint or a setup script';
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
      `INSERT INTO posts (type, slug, title, excerpt, body, category_id, status, author_id)
       VALUES ('blog', $1, $2, $3, $4, $5, 'draft', $6) RETURNING id, status, published_at`,
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
      .query(`INSERT INTO posts (type, slug, title, category_id) VALUES ('blog', $1, $2, $3)`, [
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

    /* ── Post types ───────────────────────────────────────────────────────── */

    // A constraint is working only if it refuses the bad row for its own
    // reason: a 23514 from a different check would otherwise pass silently.
    const refusedBy = async (promise, why) => {
      try {
        await promise;
      } catch (error) {
        if (error.code === '23514') return;
        throw new Error(`Self test: ${why} was refused for another reason (${error.code ?? error.message}).`);
      }
      throw new Error(`Self test: ${why} was accepted.`);
    };

    // An unknown type is refused outright.
    await refusedBy(
      sql.query(`UPDATE posts SET type = 'article' WHERE id = $1`, [post[0].id]),
      'an unknown post type',
    );

    // An event needs a start time...
    await refusedBy(
      sql.query(`UPDATE posts SET type = 'event', category_id = NULL WHERE id = $1`, [post[0].id]),
      'an event without event_start',
    );

    // ...somewhere to be, unless it is online...
    await refusedBy(
      sql.query(
        `UPDATE posts SET type = 'event', category_id = NULL,
           event_start = now() + interval '1 day'
         WHERE id = $1`,
        [post[0].id],
      ),
      'an event with neither a location nor the online flag',
    );

    // ...and an end that comes after the start.
    await refusedBy(
      sql.query(
        `UPDATE posts SET event_start = now() + interval '2 days',
           event_end = now() + interval '1 day', is_online = true
         WHERE id = $1`,
        [post[0].id],
      ),
      'an event that ends before it starts',
    );

    // A well formed online event is accepted, and carries no topic.
    const validEvent = await sql.query(
      `UPDATE posts SET type = 'event', category_id = NULL, event_start = now() + interval '2 days',
         event_end = NULL, is_online = true
        WHERE id = $1 RETURNING type, category_id, is_online`,
      [post[0].id],
    );
    if (validEvent[0].type !== 'event' || validEvent[0].category_id !== null) {
      throw new Error('Self test: a valid online event was not stored as expected.');
    }

    // ...while a written piece still needs its topic.
    await refusedBy(
      sql.query(`UPDATE posts SET type = 'blog' WHERE id = $1`, [post[0].id]),
      'a blog post with no category',
    );

    await sql.query(`UPDATE posts SET type = 'blog', category_id = $2 WHERE id = $1`, [
      post[0].id,
      insertedB.id,
    ]);

    console.log(
      '  ok  content self test passed (manager guard, draft/publish, slug uniqueness, status check, reassign, delete restricted, post types, event fields)',
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

console.log('Adding post types and event fields...');
await migratePostTypes(sql);

console.log('Adding the manager role...');
await allowManagerRole(sql);
await installManagerGuard(sql);

console.log('Seeding default categories...');
await seedCategories(sql);

console.log('Checking the result...');
await verify(sql);

console.log('\nDatabase ready. Promote a manager with:  node scripts/promote-manager.mjs you@example.com');
