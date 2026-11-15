import { google } from 'googleapis';

/**
 * Google Calendar integration for event registrations
 * Creates calendar events and generates shareable links for attendees
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
 * Create a Google Calendar event for an event registration
 */
export async function createCalendarEvent(data: {
  eventSlug: string;
  title: string;
  description: string;
  startTime: string; // ISO 8601 format
  endTime: string; // ISO 8601 format
  meetingLink?: string | null;
  location?: string | null;
}): Promise<{ eventId: string; calendarLink: string } | null> {
  const calendar = getGoogleCalendarClient();
  const config = getConfig();

  if (!calendar || !config) {
    console.warn('[Calendar] Skipping calendar event creation - not configured');
    return null;
  }

  try {
    // Build event description
    let eventDescription = data.description;
    if (data.meetingLink) {
      eventDescription += `\n\nJoin the meeting: ${data.meetingLink}`;
    }

    // Create the event
    const response = await calendar.events.insert({
      calendarId: config.calendarId,
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
        location: data.meetingLink || data.location || 'Online',
        status: 'confirmed',
        // Make it visible to anyone with the link
        visibility: 'public',
        // Allow guests to see other guests and modify event
        guestsCanSeeOtherGuests: true,
        guestsCanInviteOthers: false,
        guestsCanModify: false,
      },
    });

    const eventId = response.data.id;
    if (!eventId) {
      console.error('[Calendar] Event created but no ID returned');
      return null;
    }

    // Generate public link to the event
    const calendarLink = `https://calendar.google.com/calendar/event?eid=${encodeEventId(eventId, config.calendarId)}`;

    console.log(`[Calendar] Created event ${eventId} for ${data.eventSlug}`);

    return {
      eventId,
      calendarLink,
    };
  } catch (error: any) {
    console.error(`[Calendar] Failed to create calendar event:`, error?.message || error);
    return null;
  }
}

/**
 * Get or create a calendar event for an event registration
 * Returns existing event if one was already created for this slug
 */
export async function getOrCreateCalendarEvent(data: {
  eventSlug: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  meetingLink?: string | null;
  location?: string | null;
}): Promise<{ eventId: string; calendarLink: string } | null> {
  const calendar = getGoogleCalendarClient();
  const config = getConfig();

  if (!calendar || !config) {
    return null;
  }

  try {
    // Search for existing event with this slug in the summary or description
    const searchResponse = await calendar.events.list({
      calendarId: config.calendarId,
      q: data.eventSlug,
      timeMin: new Date(data.startTime).toISOString(),
      timeMax: new Date(new Date(data.endTime).getTime() + 24 * 60 * 60 * 1000).toISOString(), // +1 day
      singleEvents: true,
      maxResults: 10,
    });

    // Check if we found a matching event
    const existingEvent = searchResponse.data.items?.find(
      (event) =>
        event.summary?.includes(data.title) ||
        event.description?.includes(data.eventSlug)
    );

    if (existingEvent && existingEvent.id) {
      console.log(`[Calendar] Found existing event ${existingEvent.id} for ${data.eventSlug}`);
      const calendarLink = `https://calendar.google.com/calendar/event?eid=${encodeEventId(existingEvent.id, config.calendarId)}`;
      return {
        eventId: existingEvent.id,
        calendarLink,
      };
    }

    // No existing event, create a new one
    return await createCalendarEvent(data);
  } catch (error: any) {
    console.error(`[Calendar] Failed to get or create calendar event:`, error?.message || error);
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
 * This is a simplified version - Google uses base64-like encoding
 */
function encodeEventId(eventId: string, calendarId: string): string {
  // Google Calendar uses a special encoding for event IDs in public links
  // For now, return the event ID directly - Google Calendar will handle it
  // In production, you might need proper base64 encoding
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
