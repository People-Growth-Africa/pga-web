import { timingSafeEqual } from 'node:crypto';

import { ApiError, endpoint, headerValue, sendJson } from '../http.js';
import { cleanupTrafficHashes } from '../db.js';

/**
 * GET /api/cron/traffic-cleanup
 *
 * Vercel Cron calls this once a day. `CRON_SECRET` is compared in constant time
 * style by simply requiring the exact bearer value; without it the endpoint is
 * closed rather than open. Visitor hashes only need to survive long enough to
 * deduplicate a daily visitor, so anything older than two days goes.
 */
export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new ApiError(503, 'cron_not_configured', 'CRON_SECRET is not set.');
  }
  const authorization = headerValue(req.headers.authorization) ?? '';
  const expected = `Bearer ${secret}`;
  const supplied = Buffer.from(authorization);
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    throw new ApiError(401, 'unauthorized', 'Not allowed.');
  }

  const deleted = await cleanupTrafficHashes();
  sendJson(res, 200, { ok: true, deleted });
});
