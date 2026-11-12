import { ApiError, clientIp, endpoint, parseJsonBody, sendJson } from '../../http.js';
import { eventRegistrationSchema, parseInput } from '../../validation.js';
import { insertEventRegistration } from '../../db.js';
import { appUrl, sendLeadNotification } from '../../email.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAuthEvent } from '../../audit.js';
import { scheduleBestEffort } from '../../best-effort.js';
import { syncEventRegistration } from '../../sheets-sync.js';

/**
 * An event registration is stored first and the team is told about it second.
 * The event is named by its slug, the same one the site uses, so nothing the
 * browser sends is taken as the title of an event.
 */

const shown = (value?: string | null) => value?.trim() || 'Not given';

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  const data = parseInput(eventRegistrationSchema, parseJsonBody(req));

  await enforceRateLimit({
    name: 'event-register-ip',
    identifier: ip,
    limit: 10,
    windowSeconds: 3600,
  });
  await enforceRateLimit({
    name: 'event-register-email',
    identifier: data.email,
    limit: 3,
    windowSeconds: 3600,
  });

  const id = await insertEventRegistration({
    eventSlug: data.eventSlug,
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    organisation: data.organisation,
    role: data.role || null,
    question: data.question || null,
  });

  // If the row could not be written the visitor is told, rather than shown a
  // confirmation for a place that does not exist.
  if (!id) {
    throw new ApiError(
      500,
      'lead_not_stored',
      'We could not save your details. Try again in a moment.',
    );
  }

  await sendLeadNotification({
    kind: 'Event registration',
    replyTo: data.email,
    lines: [
      `Event: ${data.eventSlug} (${appUrl()}/events)`,
      `Lead id: ${id}`,
      '',
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Phone: ${shown(data.phone)}`,
      `Organisation: ${data.organisation}`,
      `Role: ${shown(data.role)}`,
      '',
      `Question for the speaker: ${shown(data.question)}`,
    ],
  });

  await recordAuthEvent('event_registration_received', { ip });

  // Background sync to Google Sheets
  scheduleBestEffort(
    () =>
      syncEventRegistration({
        id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        organisation: data.organisation || null,
        role: data.role || null,
        question: data.question || null,
        eventSlug: data.eventSlug,
        createdAt: new Date(),
      }),
    'sheets-sync',
  );

  sendJson(res, 201, { ok: true });
});
