import { createHmac, timingSafeEqual } from 'node:crypto';

import { ApiError, endpoint, parseJsonBody } from '../http.js';
import { parseInput, trafficHitSchema } from '../validation.js';
import { recordTrafficHit } from '../db.js';
import { trafficHitInput } from './track.js';

export default endpoint({ methods: ['POST'] }, async (req, res) => {
  const data = parseInput(trafficHitSchema, parseJsonBody(req));
  const secret =
    process.env.TRAFFIC_CAPTURE_SECRET ??
    process.env.TRAFFIC_HASH_SALT ??
    process.env.AUDIT_HASH_SECRET ??
    process.env.JWT_SECRET;
  if (!secret) throw new ApiError(503, 'traffic_capture_not_configured', 'Traffic capture is not configured.');
  const canonical = [
    data.hitId,
    data.path,
    data.referrer ?? '',
    data.utmSource ?? '',
    data.ip ?? '',
    data.userAgent ?? '',
    data.country ?? '',
  ].join('\n');
  const expected = createHmac('sha256', secret).update(canonical).digest();
  const supplied = Buffer.from(data.signature, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ApiError(401, 'invalid_traffic_capture', 'Not allowed.');
  }
  await recordTrafficHit(
    trafficHitInput({
      hitId: data.hitId,
      path: data.path,
      referrer: data.referrer,
      utmSource: data.utmSource,
      ip: data.ip ?? '',
      userAgent: data.userAgent ?? '',
      country: data.country,
      javascriptExecuted: false,
    }),
  );
  res.status(204).end();
});
