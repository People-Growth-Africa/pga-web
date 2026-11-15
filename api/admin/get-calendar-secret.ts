import { endpoint, sendJson } from '../_lib/http.js';
import { requireContentManager } from '../_lib/content-auth.js';

/**
 * GET /api/admin/get-calendar-secret
 * 
 * Returns the Google Calendar secret for authenticated content managers.
 * Protected by content manager authentication.
 */

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  await requireContentManager(req, res);

  const secret = process.env.GOOGLE_CALENDAR_SECRET || process.env.SHEETS_BACKFILL_SECRET;

  if (!secret) {
    return sendJson(res, 503, {
      error: 'not_configured',
      message: 'GOOGLE_CALENDAR_SECRET or SHEETS_BACKFILL_SECRET environment variable is not set',
    });
  }

  return sendJson(res, 200, { secret });
});
