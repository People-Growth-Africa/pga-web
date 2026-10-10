import { ApiError, endpoint, sendJson } from '../../http.js';
import { requireSession } from '../../current-user.js';
import { findLatestConsultationByEmail } from '../../db.js';

/**
 * The signed in employer's own latest consultation request.
 *
 * No identifier is accepted from the request: the address is read from the
 * session, so an employer can only ever see a booking they made with the email
 * on their own account. The answer is the row exactly as it was written, which
 * is a request the team confirms by email, not a booked meeting, and the client
 * says so in those words. `consultation` is null when there is nothing yet, and
 * that is a normal answer rather than an error.
 */
export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const user = await requireSession(req, res);

  if (user.role !== 'employer') {
    throw new ApiError(403, 'wrong_role', 'This endpoint is for employer accounts.');
  }

  const booking = await findLatestConsultationByEmail(user.email);

  // Sent in the same camelCase shape as the rest of the API, so no client has
  // to know a column name.
  sendJson(res, 200, {
    ok: true,
    consultation: booking
      ? {
          organisation: booking.organisation,
          meetingFormat: booking.meeting_format,
          preferredDate: booking.preferred_date,
          preferredSlot: booking.preferred_slot,
          requestedOn: booking.requested_on,
        }
      : null,
  });
});
