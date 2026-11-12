import { ApiError, clientIp, endpoint, parseJsonBody, sendJson } from '../../http.js';
import { enquirySchema, parseInput } from '../../validation.js';
import { insertEnquiry } from '../../db.js';
import { sendLeadNotification } from '../../email.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAuthEvent } from '../../audit.js';
import { scheduleBestEffort } from '../../best-effort.js';
import { syncEnquiry } from '../../sheets-sync.js';

/**
 * A written enquiry from either consultation form. The source says which one,
 * because the two forms differ in who tends to use them, not in what is stored.
 */

const shown = (value?: string | null) => value?.trim() || 'Not given';

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  const data = parseInput(enquirySchema, parseJsonBody(req));

  await enforceRateLimit({
    name: 'enquiry-ip',
    identifier: ip,
    limit: 6,
    windowSeconds: 3600,
  });
  await enforceRateLimit({
    name: 'enquiry-email',
    identifier: data.email,
    limit: 3,
    windowSeconds: 3600,
  });

  const id = await insertEnquiry({
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    subject: data.subject,
    message: data.message,
    source: data.source,
  });

  if (!id) {
    throw new ApiError(
      500,
      'lead_not_stored',
      'We could not save your message. Try again in a moment.',
    );
  }

  await sendLeadNotification({
    kind: 'Written enquiry',
    replyTo: data.email,
    lines: [
      `Subject: ${data.subject}`,
      `Form: ${data.source}`,
      `Lead id: ${id}`,
      '',
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Phone: ${shown(data.phone)}`,
      '',
      'Message:',
      data.message,
    ],
  });

  await recordAuthEvent('enquiry_received', { ip });

  // Background sync to Google Sheets
  scheduleBestEffort(
    () =>
      syncEnquiry({
        id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        subject: data.subject,
        message: data.message,
        source: data.source || 'website',
        createdAt: new Date(),
      }),
    'sheets-sync',
  );

  sendJson(res, 201, { ok: true });
});
