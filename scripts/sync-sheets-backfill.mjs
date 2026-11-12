/**
 * Backfills existing database records to Google Sheets.
 *
 *   npm run sync:sheets-backfill
 *
 * Reads all event registrations, consultation bookings, and enquiries from the
 * database and syncs them to Google Sheets. Run this once after configuring
 * the Google Sheets integration to populate historical data.
 *
 * Requirements:
 * - GOOGLE_SHEETS_SPREADSHEET_ID environment variable
 * - GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL environment variable
 * - GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY environment variable
 * - DATABASE_URL environment variable
 *
 * The script:
 * 1. Connects to PostgreSQL database
 * 2. Queries all existing records from each table
 * 3. Syncs them to respective Google Sheets in batches
 * 4. Shows progress and summary
 *
 * Safe to run multiple times: Google Sheets will just have duplicate rows.
 * If you need to clear and re-sync, manually delete rows from the sheets first.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { google } from 'googleapis';

const root = path.resolve(import.meta.dirname, '..');
const ENV_FILES = ['.env.development.local', '.env.local', '.env'];

// Load environment variables
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
  console.log(`✓ Loaded ${file}`);
}

// Check required environment variables
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
const serviceAccountPrivateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!databaseUrl) {
  console.error('');
  console.error('❌ DATABASE_URL is not set.');
  console.error('');
  console.error('Pull the Vercel environment first:');
  console.error('  npx vercel env pull .env.development.local --yes');
  console.error('');
  process.exit(1);
}

if (!spreadsheetId || !serviceAccountEmail || !serviceAccountPrivateKey) {
  console.error('');
  console.error('❌ Google Sheets credentials are not configured.');
  console.error('');
  console.error('Required environment variables:');
  console.error('  GOOGLE_SHEETS_SPREADSHEET_ID');
  console.error('  GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL');
  console.error('  GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY');
  console.error('');
  console.error('See docs/google-sheets-setup.md for setup instructions.');
  console.error('');
  process.exit(1);
}

// Initialize database connection
const sql = neon(databaseUrl);

// Initialize Google Sheets client
let sheetsClient;
try {
  const authClient = new google.auth.JWT({
    email: serviceAccountEmail,
    key: serviceAccountPrivateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  console.log('✓ Google Sheets client initialized');
} catch (error) {
  console.error('');
  console.error('❌ Failed to initialize Google Sheets client:');
  console.error(error.message);
  console.error('');
  process.exit(1);
}

/**
 * Append rows to a Google Sheet in batches
 */
async function appendRows(sheetName, rows) {
  if (rows.length === 0) {
    console.log(`  ℹ No data to sync for ${sheetName}`);
    return 0;
  }

  try {
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:A`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    });

    return rows.length;
  } catch (error) {
    console.error(`  ❌ Failed to sync to ${sheetName}:`, error.message);
    throw error;
  }
}

/**
 * Main backfill function
 */
async function backfill() {
  console.log('');
  console.log('🔄 Starting Google Sheets backfill...');
  console.log('');

  let totalSynced = 0;

  // 1. Sync Event Registrations
  try {
    console.log('📋 Fetching event registrations...');
    const eventRegistrations = await sql`
      SELECT 
        id,
        created_at,
        event_slug,
        name,
        email,
        phone,
        organisation,
        role,
        question
      FROM event_registrations
      ORDER BY created_at ASC
    `;

    console.log(`  Found ${eventRegistrations.length} event registrations`);

    if (eventRegistrations.length > 0) {
      const rows = eventRegistrations.map((reg) => [
        reg.id,
        reg.created_at.toISOString(),
        reg.event_slug,
        reg.name,
        reg.email,
        reg.phone || '',
        reg.organisation || '',
        reg.role || '',
        reg.question || '',
      ]);

      const synced = await appendRows('Event Registrations', rows);
      console.log(`  ✓ Synced ${synced} event registrations`);
      totalSynced += synced;
    }
  } catch (error) {
    console.error(`  ❌ Error syncing event registrations:`, error.message);
  }

  console.log('');

  // 2. Sync Consultation Bookings
  try {
    console.log('📋 Fetching consultation bookings...');
    const consultationBookings = await sql`
      SELECT 
        id,
        created_at,
        name,
        email,
        phone,
        organisation,
        team_size,
        service,
        meeting_format,
        preferred_date,
        preferred_slot,
        notes,
        status,
        assigned_to
      FROM consultation_bookings
      ORDER BY created_at ASC
    `;

    console.log(`  Found ${consultationBookings.length} consultation bookings`);

    if (consultationBookings.length > 0) {
      const rows = consultationBookings.map((booking) => [
        booking.id,
        booking.created_at.toISOString(),
        booking.name,
        booking.email,
        booking.phone || '',
        booking.organisation || '',
        booking.team_size || '',
        booking.service || '',
        booking.meeting_format,
        booking.preferred_date || '',
        booking.preferred_slot || '',
        booking.notes || '',
        booking.status || 'pending',
        booking.assigned_to || '',
      ]);

      const synced = await appendRows('Consultation Bookings', rows);
      console.log(`  ✓ Synced ${synced} consultation bookings`);
      totalSynced += synced;
    }
  } catch (error) {
    console.error(`  ❌ Error syncing consultation bookings:`, error.message);
  }

  console.log('');

  // 3. Sync Enquiries
  try {
    console.log('📋 Fetching enquiries...');
    const enquiries = await sql`
      SELECT 
        id,
        created_at,
        name,
        email,
        phone,
        subject,
        message,
        source
      FROM enquiries
      ORDER BY created_at ASC
    `;

    console.log(`  Found ${enquiries.length} enquiries`);

    if (enquiries.length > 0) {
      const rows = enquiries.map((enq) => [
        enq.id,
        enq.created_at.toISOString(),
        enq.name,
        enq.email,
        enq.phone || '',
        enq.subject,
        enq.message,
        enq.source,
      ]);

      const synced = await appendRows('Enquiries', rows);
      console.log(`  ✓ Synced ${synced} enquiries`);
      totalSynced += synced;
    }
  } catch (error) {
    console.error(`  ❌ Error syncing enquiries:`, error.message);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Backfill complete! Total records synced: ${totalSynced}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📊 Check your Google Spreadsheet:');
  console.log(`   https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  console.log('');
}

// Run backfill
backfill()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('❌ Backfill failed:');
    console.error(error);
    console.error('');
    process.exit(1);
  });
