import { google } from 'googleapis';

/**
 * Google Sheets synchronization for form submissions
 * Uses service account authentication and best-effort background sync
 */

interface SheetsConfig {
  spreadsheetId: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
}

let sheetsClient: ReturnType<typeof google.sheets> | null = null;
let authClient: any = null;

/**
 * Initialize Google Sheets client with service account credentials
 */
function getGoogleSheetsClient() {
  if (sheetsClient && authClient) {
    return sheetsClient;
  }

  const config = getConfig();
  if (!config) {
    console.warn('[Sheets] Google Sheets credentials not configured, sync disabled');
    return null;
  }

  try {
    // Create JWT auth client with service account
    authClient = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.serviceAccountPrivateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    console.log('[Sheets] Google Sheets client initialized');
    return sheetsClient;
  } catch (error) {
    console.error('[Sheets] Failed to initialize Google Sheets client:', error);
    return null;
  }
}

/**
 * Get sheets configuration from environment variables
 */
function getConfig(): SheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
  const serviceAccountPrivateKey = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!spreadsheetId || !serviceAccountEmail || !serviceAccountPrivateKey) {
    return null;
  }

  return {
    spreadsheetId,
    serviceAccountEmail,
    serviceAccountPrivateKey,
  };
}

/**
 * Append a row to a Google Sheet
 */
async function appendRow(sheetName: string, values: any[]): Promise<boolean> {
  const sheets = getGoogleSheetsClient();
  const config = getConfig();

  if (!sheets || !config) {
    console.warn(`[Sheets] Skipping sync to ${sheetName} - not configured`);
    return false;
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${sheetName}!A:A`, // Auto-detect next empty row
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [values],
      },
    });

    console.log(`[Sheets] Successfully synced row to ${sheetName}`);
    return true;
  } catch (error: any) {
    console.error(`[Sheets] Failed to sync to ${sheetName}:`, error?.message || error);
    return false;
  }
}

/**
 * Sync event registration to Google Sheets (new format - event_registrations table)
 */
export async function syncEventRegistration(data: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organisation: string | null;
  role: string | null;
  question: string | null;
  eventSlug: string;
  createdAt: Date;
}) {
  const values = [
    data.id,
    data.createdAt.toISOString(),
    data.eventSlug,
    data.name,
    data.email,
    data.phone || '',
    data.organisation || '',
    data.role || '',
    data.question || '',
  ];

  return appendRow('Event Registrations', values);
}

/**
 * Sync registration to Google Sheets (old format - registrations table)
 */
export async function syncRegistration(data: {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  notes: string | null;
  answers: unknown | null;
  eventSlug: string;
  createdAt: Date;
}) {
  // Format answers JSON for display
  let answersText = '';
  if (data.answers && typeof data.answers === 'object') {
    try {
      const answersObj = data.answers as Record<string, any>;
      answersText = Object.entries(answersObj)
        .map(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'label' in value && 'answer' in value) {
            return `${value.label}: ${value.answer}`;
          }
          return `${key}: ${JSON.stringify(value)}`;
        })
        .join(' | ');
    } catch {
      answersText = JSON.stringify(data.answers);
    }
  }

  const values = [
    data.id,
    data.createdAt.toISOString(),
    data.eventSlug,
    data.name,
    data.email,
    data.phone,
    data.organization || '',
    data.notes || '',
    answersText,
  ];

  return appendRow('Event Registrations', values);
}

/**
 * Sync consultation booking to Google Sheets
 */
export async function syncConsultationBooking(data: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organisation: string | null;
  teamSize: string | null;
  service: string;
  meetingFormat: string;
  preferredDate: string | null;
  preferredSlot: string | null;
  notes: string | null;
  status: string;
  assignedTo: string | null;
  createdAt: Date;
}) {
  const values = [
    data.id,
    data.createdAt.toISOString(),
    data.name,
    data.email,
    data.phone || '',
    data.organisation || '',
    data.teamSize || '',
    data.service,
    data.meetingFormat,
    data.preferredDate || '',
    data.preferredSlot || '',
    data.notes || '',
    data.status,
    data.assignedTo || '',
  ];

  return appendRow('Consultation Bookings', values);
}

/**
 * Sync enquiry to Google Sheets
 */
export async function syncEnquiry(data: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  source: string;
  createdAt: Date;
}) {
  const values = [
    data.id,
    data.createdAt.toISOString(),
    data.name,
    data.email,
    data.phone || '',
    data.subject,
    data.message,
    data.source,
  ];

  return appendRow('Enquiries', values);
}
