import { endpoint, sendJson, parseJsonBody } from '../_lib/http.js';
import { createCalendarEventWithMeet } from '../_lib/google-calendar.js';
import { parseInput } from '../_lib/validation.js';
import { z } from 'zod';

/**
 * POST /api/admin/create-meet-link
 * 
 * Generates a Google Meet link for an event by creating a Calendar event.
 * Protected by a secret query parameter.
 * 
 * The generated Meet link can be saved to the event's link_url field in the admin panel.
 */

const schema = z.object({
  eventSlug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  startTime: z.string(), // ISO 8601
  endTime: z.string(), // ISO 8601
  location: z.string().nullable().optional(),
  isOnline: z.boolean(),
  secret: z.string(),
});

export default endpoint({ methods: ['POST'] }, async (req, res) => {
  const data = parseInput(schema, parseJsonBody(req));

  // Simple secret-based protection
  const expectedSecret = process.env.GOOGLE_CALENDAR_SECRET || process.env.SHEETS_BACKFILL_SECRET;

  if (!expectedSecret) {
    return sendJson(res, 503, {
      error: 'not_configured',
      message: 'GOOGLE_CALENDAR_SECRET or SHEETS_BACKFILL_SECRET environment variable is not set',
    });
  }

  if (data.secret !== expectedSecret) {
    return sendJson(res, 403, {
      error: 'forbidden',
      message: 'Invalid or missing secret',
    });
  }

  if (!data.isOnline) {
    return sendJson(res, 400, {
      error: 'not_online_event',
      message: 'Google Meet links can only be created for online events',
    });
  }

  try {
    const result = await createCalendarEventWithMeet({
      eventSlug: data.eventSlug,
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      isOnline: data.isOnline,
    });

    if (!result) {
      return sendJson(res, 503, {
        error: 'calendar_not_configured',
        message: 'Google Calendar integration is not configured. Add GOOGLE_CALENDAR_ID to environment variables.',
      });
    }

    return sendJson(res, 200, {
      success: true,
      meetingLink: result.meetingLink,
      calendarLink: result.calendarLink,
      eventId: result.eventId,
    });
  } catch (error: any) {
    console.error('[create-meet-link] Failed:', error);
    return sendJson(res, 500, {
      error: 'meet_creation_failed',
      message: error?.message || 'Failed to create Google Meet link',
    });
  }
});
