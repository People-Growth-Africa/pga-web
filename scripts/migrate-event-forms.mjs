/**
 * Adds the editable registration form to events, and answer storage to
 * registrations.
 *
 *   npm run migrate:event-forms
 *
 * Purely additive: two nullable columns, no row rewritten, no table moved.
 * Existing events keep their behaviour because a null `registration_form`
 * reads as the built-in questions (name, email, phone, organisation, notes);
 * existing registrations keep their fixed columns and show an empty Answers
 * cell until someone answers a form.
 *
 * ROLLBACK
 *   ALTER TABLE registrations DROP COLUMN answers;
 *   ALTER TABLE posts DROP COLUMN registration_form;
 *   Dropping the columns restores the previous behaviour exactly. Answers
 *   collected while the form existed live only in `answers`, so export them
 *   first if they matter: the panel's Data tab exports the column as
 *   "label: value" pairs.
 *
 * Safe to run as often as you like: every statement is idempotent.
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
    'posts.registration_form',
    'ALTER TABLE posts ADD COLUMN IF NOT EXISTS registration_form jsonb',
  ],
  [
    'registrations.answers',
    'ALTER TABLE registrations ADD COLUMN IF NOT EXISTS answers jsonb',
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

const [events, answers] = await sql.query(
  `SELECT (SELECT count(*) FROM posts WHERE type = 'event')::int AS events,
          (SELECT count(*) FROM registrations WHERE answers IS NOT NULL)::int AS answered`,
);
console.log(
  `\nDone. ${events[0].events} event(s) now read the default form until one is saved; ` +
    `${answers[0].answered} registration(s) already carry answers.`,
);
