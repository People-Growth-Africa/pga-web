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
await sql.query(`ALTER TABLE consultation_bookings
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS internal_notes text NOT NULL DEFAULT ''`);
await sql.query(`UPDATE consultation_bookings SET status = 'new'
  WHERE status NOT IN ('new', 'contacted', 'scheduled', 'done')`);
await sql.query('ALTER TABLE consultation_bookings DROP CONSTRAINT IF EXISTS consultation_bookings_status_check');
await sql.query(`ALTER TABLE consultation_bookings ADD CONSTRAINT consultation_bookings_status_check
  CHECK (status IN ('new', 'contacted', 'scheduled', 'done'))`);
await sql.query(`CREATE INDEX IF NOT EXISTS consultation_bookings_assigned_status_idx
  ON consultation_bookings (assigned_to, status, created_at DESC) WHERE deleted_at IS NULL`);
console.log('Consultation pipeline migration complete.');
