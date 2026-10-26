import { ApiError, clientIp, endpoint, parseJsonBody, sendJson } from '../http.js';
import { parseInput, registrationSchema } from '../validation.js';
import { insertRegistration, isPublishedEventSlug, isUniqueViolation } from '../db.js';
import { sendRegistrationConfirmationEmail } from '../email.js';
import { enforceRateLimit } from '../ratelimit.js';

/**
 * POST /api/registrations - write-only for the public.
 *
 * A registration is stored once per event and address. The handler never
 * returns a row, a count or anything else about other registrants: the only
 * answer is whether this submission was accepted.
 */

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const data = parseInput(registrationSchema, parseJsonBody(req));
  const ip = clientIp(req);

  await enforceRateLimit({
    name: 'registration-ip',
    identifier: ip,
    limit: 10,
    windowSeconds: 3600,
  });

  // The honeypot. Accept it as if it worked, so a bot gains nothing from
  // learning which field was the trap, and write nothing.
  if (data.website) {
    sendJson(res, 201, { ok: true });
    return;
  }

  if (!(await isPublishedEventSlug(data.eventSlug))) {
    throw new ApiError(404, 'event_not_found', 'That event is not open for registration.');
  }

  // The confirmation email budget is per address, so one address cannot be used
  // to flood a third party's inbox through the public form.
  await enforceRateLimit({
    name: 'registration-email',
    identifier: data.email,
    limit: 3,
    windowSeconds: 3600,
  });

  try {
    const id = await insertRegistration({
      eventSlug: data.eventSlug,
      name: data.name,
      email: data.email,
      phone: data.phone,
      organization: data.organization?.trim() || null,
      notes: data.notes,
    });

    if (!id) {
      throw new ApiError(
        500,
        'registration_not_saved',
        'We could not save your registration. Try again in a moment.',
      );
    }

    // Best effort, and after the row is committed: a mail problem must never
    // turn a saved place into an error. Nothing is logged but the fact that it
    // failed, because the message itself is personal data.
    try {
      await sendRegistrationConfirmationEmail(data.email, data.name, data.eventSlug);
    } catch {
      console.error('[registrations] confirmation email failed');
    }

    sendJson(res, 201, { ok: true });
  } catch (error) {
    // The unique index is (event_slug, email). A duplicate is an ordinary
    // answer to the visitor, not a server error.
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'already_registered',
        'You are already registered for this event with that email address.',
      );
    }
    throw error;
  }
});
