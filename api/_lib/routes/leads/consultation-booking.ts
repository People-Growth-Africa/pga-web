import { ApiError, clientIp, endpoint, parseJsonBody, sendJson } from '../../http.js';
import {
  assertBookableDate,
  consultationBookingSchema,
  parseInput,
} from '../../validation.js';
import { insertConsultationBooking } from '../../db.js';
import { sendLeadNotification } from '../../email.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAuthEvent } from '../../audit.js';
import { createBestEffortNotification } from '../../notifications.js';
import { scheduleBestEffort } from '../../best-effort.js';
import { syncConsultationBooking } from '../../sheets-sync.js';

/**
 * A booking request. Nothing here checks the team's diary, so the visitor is
 * told their slot is requested and the team confirms it, rather than that the
 * meeting is booked.
 */

const shown = (value?: string | null) => value?.trim() || 'Not given';

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  const data = parseInput(consultationBookingSchema, parseJsonBody(req));
  assertBookableDate(data.preferredDate);

  await enforceRateLimit({
    name: 'consultation-book-ip',
    identifier: ip,
    limit: 6,
    windowSeconds: 3600,
  });
  await enforceRateLimit({
    name: 'consultation-book-email',
    identifier: data.email,
    limit: 3,
    windowSeconds: 3600,
  });

  const id = await insertConsultationBooking({
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    organisation: data.organisation,
    teamSize: data.teamSize || null,
    service: data.service || null,
    meetingFormat: data.meetingFormat,
    preferredDate: data.preferredDate,
    preferredSlot: data.preferredSlot,
    notes: data.notes || null,
  });

  if (!id) {
    throw new ApiError(
      500,
      'lead_not_stored',
      'We could not save your request. Try again in a moment.',
    );
  }

  scheduleBestEffort(
    () => createBestEffortNotification({ event: 'consultation.created' }),
    'notifications',
  );

  // Background sync to Google Sheets
  scheduleBestEffort(
    () =>
      syncConsultationBooking({
        id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        organisation: data.organisation || null,
        teamSize: data.teamSize || null,
        service: data.service || 'Not specified',
        meetingFormat: data.meetingFormat,
        preferredDate: data.preferredDate || null,
        preferredSlot: data.preferredSlot || null,
        notes: data.notes || null,
        status: 'pending',
        assignedTo: null,
        createdAt: new Date(),
      }),
    'sheets-sync',
  );

  await sendLeadNotification({
    kind: 'Consultation request',
    replyTo: data.email,
    lines: [
      `Requested slot: ${data.preferredDate} at ${data.preferredSlot} (WAT)`,
      `How we meet: ${data.meetingFormat}`,
      `Lead id: ${id}`,
      '',
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Phone: ${shown(data.phone)}`,
      `Organisation: ${data.organisation}`,
      `Team size: ${shown(data.teamSize)}`,
      `Service: ${shown(data.service)}`,
      '',
      `Notes: ${shown(data.notes)}`,
    ],
  });

  await recordAuthEvent('consultation_requested', { ip });

  sendJson(res, 201, { ok: true });
});
