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
 * Find and clear a row by ID in a Google Sheet
 */
async function clearRowById(sheetName: string, id: string, columnCount: number): Promise<boolean> {
  const sheets = getGoogleSheetsClient();
  const config = getConfig();

  if (!sheets || !config) {
    console.warn(`[Sheets] Skipping clear row in ${sheetName} - not configured`);
    return false;
  }

  try {
    // First, get all data to find the row with matching ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${sheetName}!A:A`, // Get all IDs in column A
    });

    const rows = response.data.values || [];
    
    // Find the row index (1-based) where the ID matches
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.length > 0 && row[0] === id) {
        rowIndex = i + 1; // Convert to 1-based index
        break;
      }
    }

    if (rowIndex === -1) {
      console.log(`[Sheets] ID ${id} not found in ${sheetName}, nothing to clear`);
      return false;
    }

    // Clear the entire row by setting all cells to empty strings
    const emptyValues = Array(columnCount).fill('');
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${sheetName}!A${rowIndex}:${String.fromCharCode(64 + columnCount)}${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [emptyValues],
      },
    });

    console.log(`[Sheets] Successfully cleared row ${rowIndex} (ID: ${id}) in ${sheetName}`);
    return true;
  } catch (error: any) {
    console.error(`[Sheets] Failed to clear row in ${sheetName}:`, error?.message || error);
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
  // Skip basic fields (name, email, phone) from questions/answers since they have their own columns
  const skipQuestionIds = ['name', 'email', 'phone', 'full_name', 'fullName'];

  // The 4 specific questions we're looking for
  const targetQuestions = {
    'How did you hear about this event?': '',
    'What is your primary area of interest in agriculture?': '',
    'Which of the following topics would you like to see covered during the event?': '',
    'How many years of experience do you have in the agricultural sector?': ''
  };

  if (data.answers && typeof data.answers === 'object') {
    try {
      const answersObj = data.answers as Record<string, any>;

      Object.entries(answersObj).forEach(([key, value]) => {
        // Check if this is a structured question object
        if (typeof value === 'object' && value !== null && 'label' in value) {
          const questionId = value.questionId || key;
          
          // Skip basic identity fields
          if (skipQuestionIds.includes(questionId)) {
            return;
          }

          const question = value.label;
          let answer = '';

          // Handle different answer formats
          if ('value' in value) {
            if (Array.isArray(value.value)) {
              // Checkboxes - join array values
              answer = value.value.join(', ');
            } else {
              answer = String(value.value);
            }
          } else if ('answer' in value) {
            if (Array.isArray(value.answer)) {
              answer = value.answer.join(', ');
            } else {
              answer = String(value.answer);
            }
          }

          // Match the question to our target questions
          if (question in targetQuestions) {
            targetQuestions[question as keyof typeof targetQuestions] = answer;
          }
        }
      });
    } catch (error) {
      console.error('[Sheets] Failed to parse answers:', error);
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
    targetQuestions['How did you hear about this event?'],
    targetQuestions['What is your primary area of interest in agriculture?'],
    targetQuestions['Which of the following topics would you like to see covered during the event?'],
    targetQuestions['How many years of experience do you have in the agricultural sector?']
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

/**
 * Clear a registration row from Google Sheets by ID
 */
export async function syncRegistrationDeletion(data: {
  id: string;
}) {
  // Event Registrations has 12 columns (A through L)
  return clearRowById('Event Registrations', data.id, 12);
}

/**
 * Clear a consultation booking row from Google Sheets by ID
 */
export async function syncConsultationDeletion(data: {
  id: string;
}) {
  // Consultation Bookings has 14 columns
  return clearRowById('Consultation Bookings', data.id, 14);
}

/**
 * Clear an enquiry row from Google Sheets by ID
 */
export async function syncEnquiryDeletion(data: {
  id: string;
}) {
  // Enquiries has 8 columns
  return clearRowById('Enquiries', data.id, 8);
}
