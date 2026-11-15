import { google } from 'googleapis';

/**
 * Google Calendar integration for event registrations
 * Creates calendar events with Google Meet links and generates shareable links for attendees
 */

interface CalendarConfig {
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  calendarId: string; // The calendar ID where events will be created
}

let calendarClient: ReturnType<typeof google.calendar> | null = null;
let authClient: any = null;

/**
 * Initialize Google Calendar client with service account credentials
 */
function getGoogleCalendarClient() {
  if (calendarClient && authClient) {
    return calendarClient;
  }

  const config = getConfig();
  if (!config) {
    console.warn('[Calendar] Google Calendar credentials not configured, calendar integration disabled');
    return null;
  }

  try {
    // Create JWT auth client with service account
    authClient = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.serviceAccountPrivateKey.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    });

    calendarClient = google.calendar({ version: 'v3', auth: authClient });
    console.log('[Calendar] Google Calendar client initialized');
    return calendarClient;
  } catch (error) {
    console.error('[Calendar] Failed to initialize Google Calendar client:', error);
    return null;
  }
}

/**
 * Get calendar configuration from environment variables
 */
function getConfig(): CalendarConfig | null {
  const serviceAccountEmail = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
  const serviceAccountPrivateKey = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!serviceAccountEmail || !serviceAccountPrivateKey || !calendarId) {
    return null;
  }

  return {
    serviceAccountEmail,
    serviceAccountPrivateKey,
    calendarId,
  };
}

/**
 * Create a Google Calendar event with an automatic Google Meet link
 * This is used when creating/publishing events in the admin panel
 * 
 * @returns Object containing eventId, meetingLink (Google Meet URL), and calendarLink
 */
export async function createCalendarEventWithMeet(data: {
  eventSlug: string;
  title: string;
  description: string;
  startTime: string; // ISO 8601 format
  endTime: string; // ISO 8601 format
  location?: string | null;
  isOnline?: boolean;
}): Promise<{ eventId: string; meetingLink: string; calendarLink: string } | null> {
  const calendar = getGoogleCalendarClient();
  const config = getConfig();

  if (!calendar || !config) {
    console.warn('[Calendar] Skipping calendar event creation - not configured');
    return null;
  }

  try {
    // Build event description
    const eventDescription = `${data.description}\n\nEvent slug: ${data.eventSlug}`;

    // Create the event with Google Meet conference
    const response = await calendar.events.insert({
      calendarId: config.calendarId,
      conferenceDataVersion: 1, // Required for creating Google Meet
      requestBody: {
        summary: data.title,
        description: eventDescription,
        start: {
          dateTime: data.startTime,
          timeZone: 'Africa/Lagos',
        },
        end: {
          dateTime: data.endTime,
          timeZone: 'Africa/Lagos',
        },
        location: data.location || (data.isOnline ? 'Online' : undefined),
        status: 'confirmed',
        visibility: 'public',
        guestsCanSeeOtherGuests: false,
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        // Request Google Meet conference creation
        conferenceData: data.isOnline ? {
          createRequest: {
            requestId: `pga-${data.eventSlug}-${Date.now()}`, // Unique ID for idempotency
            conferenceSolutionKey: {
              type: 'hangoutsMeet', // Google Meet
            },
          },
        } : undefined,
      },
    });

    const eventId = response.data.id;
    if (!eventId) {
      console.error('[Calendar] Event created but no ID returned');
      return null;
    }

    // Extract the Google Meet link from the conference data
    const meetingLink = response.data.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === 'video'
    )?.uri || '';

    if (data.isOnline && !meetingLink) {
      console.warn('[Calendar] Google Meet link was not created - check that Google Meet is enabled for your calendar');
    }

    // Generate public link to the event
    const calendarLink = `https://calendar.google.com/calendar/event?eid=${encodeEventId(eventId, config.calendarId)}`;

    console.log(`[Calendar] Created event ${eventId} for ${data.eventSlug}${meetingLink ? ` with Meet link: ${meetingLink}` : ''}`);

    return {
      eventId,
      meetingLink,
      calendarLink,
    };
  } catch (error: any) {
    console.error(`[Calendar] Failed to create calendar event:`, error?.message || error);
    return null;
  }
}

/**
 * Generate a shareable "Add to Google Calendar" link for an event
 * This creates a link that users can click to add the event to their own calendar
 */
export function generateAddToCalendarLink(data: {
  title: string;
  description: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  meetingLink?: string | null;
  location?: string | null;
}): string {
  // Format dates for Google Calendar URL (YYYYMMDDTHHmmssZ)
  const formatDate = (isoString: string) => {
    return isoString.replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const startDate = formatDate(data.startTime);
  const endDate = formatDate(data.endTime);

  // Build description
  let description = data.description;
  if (data.meetingLink) {
    description += `\n\nJoin the meeting: ${data.meetingLink}`;
  }

  // Build the URL
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: data.title,
    dates: `${startDate}/${endDate}`,
    details: description,
    location: data.meetingLink || data.location || 'Online',
    ctz: 'Africa/Lagos',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Encode event ID for Google Calendar public link
 */
function encodeEventId(eventId: string, calendarId: string): string {
  return Buffer.from(`${eventId} ${calendarId}`).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const calendar = getGoogleCalendarClient();
  const config = getConfig();

  if (!calendar || !config) {
    return false;
  }

  try {
    await calendar.events.delete({
      calendarId: config.calendarId,
      eventId,
    });

    console.log(`[Calendar] Deleted event ${eventId}`);
    return true;
  } catch (error: any) {
    console.error(`[Calendar] Failed to delete event ${eventId}:`, error?.message || error);
    return false;
  }
}
