import { endpoint, sendJson } from '../_lib/http.js';
import { query } from '../_lib/db.js';
import { syncEventRegistration, syncRegistration, syncConsultationBooking, syncEnquiry } from '../_lib/sheets-sync.js';

/**
 * One-time backfill endpoint to sync existing database records to Google Sheets.
 * 
 * GET /api/admin/sync-sheets-backfill?secret=YOUR_SECRET
 * 
 * Protected by a secret query parameter to prevent unauthorized access.
 * Set SHEETS_BACKFILL_SECRET in your environment variables.
 * 
 * This endpoint:
 * 1. Reads all existing records from the database
 * 2. Syncs them to Google Sheets
 * 3. Returns a summary of what was synced
 * 
 * Safe to call multiple times, but will create duplicate rows in Sheets.
 */

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  // Simple secret-based protection
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const secret = url.searchParams.get('secret');
  const expectedSecret = process.env.SHEETS_BACKFILL_SECRET;

  if (!expectedSecret) {
    return sendJson(res, 503, {
      error: 'not_configured',
      message: 'SHEETS_BACKFILL_SECRET environment variable is not set',
    });
  }

  if (secret !== expectedSecret) {
    return sendJson(res, 403, {
      error: 'forbidden',
      message: 'Invalid or missing secret parameter',
    });
  }

  const results = {
    registrations: 0, // Old table
    eventRegistrations: 0, // New table
    consultationBookings: 0,
    enquiries: 0,
    errors: [] as string[],
  };

  try {
    // 1. Sync Old Registrations (registrations table - the main one with 31 records)
    const registrations = await query<{
      id: string;
      created_at: Date;
      event_slug: string;
      name: string;
      email: string;
      phone: string;
      organization: string | null;
      notes: string | null;
      answers: unknown | null;
    }>(
      `SELECT id, created_at, event_slug, name, email, phone, organization, notes, answers
       FROM registrations
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC`,
    );

    for (const reg of registrations) {
      try {
        await syncRegistration({
          id: reg.id,
          name: reg.name,
          email: reg.email,
          phone: reg.phone,
          organization: reg.organization,
          notes: reg.notes,
          answers: reg.answers,
          eventSlug: reg.event_slug,
          createdAt: reg.created_at,
        });
        results.registrations++;
      } catch (error: any) {
        results.errors.push(`Registration ${reg.id}: ${error.message}`);
      }
    }

    // 2. Sync New Event Registrations (event_registrations table - the simpler one)
    const eventRegistrations = await query<{
      id: string;
      created_at: Date;
      event_slug: string;
      name: string;
      email: string;
      phone: string | null;
      organisation: string | null;
      role: string | null;
      question: string | null;
    }>(
      `SELECT id, created_at, event_slug, name, email, phone, organisation, role, question
       FROM event_registrations
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC`,
    );

    for (const reg of eventRegistrations) {
      try {
        await syncEventRegistration({
          id: reg.id,
          name: reg.name,
          email: reg.email,
          phone: reg.phone,
          organisation: reg.organisation,
          role: reg.role,
          question: reg.question,
          eventSlug: reg.event_slug,
          createdAt: reg.created_at,
        });
        results.eventRegistrations++;
      } catch (error: any) {
        results.errors.push(`Event registration ${reg.id}: ${error.message}`);
      }
    }

    // 3. Sync Consultation Bookings
    const consultationBookings = await query<{
      id: string;
      created_at: Date;
      name: string;
      email: string;
      phone: string | null;
      organisation: string | null;
      team_size: string | null;
      service: string | null;
      meeting_format: string;
      preferred_date: string | null;
      preferred_slot: string | null;
      notes: string | null;
      status: string | null;
      assigned_to: string | null;
    }>(
      `SELECT id, created_at, name, email, phone, organisation, team_size, 
              service, meeting_format, preferred_date, preferred_slot, notes,
              status, assigned_to
       FROM consultation_bookings
       ORDER BY created_at ASC`,
    );

    for (const booking of consultationBookings) {
      try {
        await syncConsultationBooking({
          id: booking.id,
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          organisation: booking.organisation,
          teamSize: booking.team_size,
          service: booking.service || 'Not specified',
          meetingFormat: booking.meeting_format,
          preferredDate: booking.preferred_date,
          preferredSlot: booking.preferred_slot,
          notes: booking.notes,
          status: booking.status || 'pending',
          assignedTo: booking.assigned_to,
          createdAt: booking.created_at,
        });
        results.consultationBookings++;
      } catch (error: any) {
        results.errors.push(`Consultation booking ${booking.id}: ${error.message}`);
      }
    }

    // 4. Sync Enquiries
    const enquiries = await query<{
      id: string;
      created_at: Date;
      name: string;
      email: string;
      phone: string | null;
      subject: string;
      message: string;
      source: string;
    }>(
      `SELECT id, created_at, name, email, phone, subject, message, source
       FROM enquiries
       ORDER BY created_at ASC`,
    );

    for (const enq of enquiries) {
      try {
        await syncEnquiry({
          id: enq.id,
          name: enq.name,
          email: enq.email,
          phone: enq.phone,
          subject: enq.subject,
          message: enq.message,
          source: enq.source,
          createdAt: enq.created_at,
        });
        results.enquiries++;
      } catch (error: any) {
        results.errors.push(`Enquiry ${enq.id}: ${error.message}`);
      }
    }

    const total = results.registrations + results.eventRegistrations + results.consultationBookings + results.enquiries;

    return sendJson(res, 200, {
      success: true,
      message: `Backfill complete! Synced ${total} records to Google Sheets`,
      results: {
        registrations: results.registrations,
        eventRegistrations: results.eventRegistrations,
        consultationBookings: results.consultationBookings,
        enquiries: results.enquiries,
        total,
      },
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: any) {
    console.error('[Sheets Backfill] Failed:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'backfill_failed',
      message: error.message || 'Failed to complete backfill',
    });
  }
});
