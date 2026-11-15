import type { VercelRequest, VercelResponse } from '@vercel/node';

import { endpoint, sendJson } from '../http.js';
import { listEventRegistrationCutoffs } from '../db.js';
import { isRegistrationOpen } from '../../../src/lib/event-registration.js';

export default endpoint({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const rows = await listEventRegistrationCutoffs();
  const serverNow = rows[0]?.server_now ?? new Date().toISOString();
  sendJson(res, 200, {
    serverNow,
    events: rows.map(({ slug, event_start }) => ({
      slug,
      eventStart: event_start,
      open: isRegistrationOpen({ eventStart: event_start }, serverNow),
    })),
  });
});
