import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ApiError, clientIp, endpoint, headerValue, sendJson } from '../http.js';
import { REVALIDATE_SECONDS, clearSnapshot, getAllEntries } from '../content/source.js';

/**
 * POST /api/revalidate - drop the cached sheet copy and read it again.
 *
 *   curl -X POST https://www.peoplegrowthafrica.com/api/revalidate \
 *        -H "x-revalidate-secret: $REVALIDATE_SECRET"
 *
 * The secret travels in a header rather than the query string, because URLs end
 * up in logs and referrers and a secret must not. Without REVALIDATE_SECRET the
 * endpoint answers 503 rather than accepting anything.
 *
 * What this can and cannot do: it clears this instance's in-memory copy and the
 * next request to this instance re-reads the sheet. The copy Vercel's edge is
 * holding still lives for its s-maxage of five minutes, so a post can take up to
 * that long to reach every visitor. The response says so instead of implying an
 * instant change; nothing here needs to run for normal operation, since the
 * cache turns over on its own.
 */

/**
 * Hashing both sides first makes the comparison constant time *and* makes the
 * two buffers the same length, which `timingSafeEqual` requires. Comparing the
 * raw strings would throw on a length mismatch, and comparing lengths first
 * would leak the secret's length.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/**
 * Reuses the existing Upstash limiter when it is configured. It is imported on
 * demand because it pulls in the audit log and, with it, the database module,
 * which throws when DATABASE_URL is missing - loading it on every cold start
 * would take the whole API down. A limiter that cannot load is a note in the
 * log, not a refused request: the secret is the actual protection.
 */
async function enforceRevalidateLimit(req: VercelRequest): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return;
  try {
    const { enforceRateLimit } = await import('../ratelimit.js');
    await enforceRateLimit({
      name: 'revalidate-ip',
      identifier: clientIp(req),
      limit: 10,
      windowSeconds: 60,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.warn(
      '[updates] rate limiter unavailable for /api/revalidate',
      error instanceof Error ? error.name : 'unknown error',
    );
  }
}

export default endpoint({ methods: ['POST'] }, async (req: VercelRequest, res: VercelResponse) => {
  const expected = process.env.REVALIDATE_SECRET?.trim();
  if (!expected) {
    throw new ApiError(
      503,
      'revalidate_disabled',
      'Revalidation is not configured on this deployment.',
    );
  }

  const provided = headerValue(req.headers['x-revalidate-secret']) ?? '';
  if (!secretsMatch(provided, expected)) {
    throw new ApiError(401, 'invalid_secret', 'That revalidation secret was not accepted.');
  }

  await enforceRevalidateLimit(req);
  clearSnapshot();

  // Read once so the response reports what was actually found, and so this
  // instance leaves the request holding a fresh copy instead of the old one.
  const entries = await getAllEntries();

  sendJson(res, 200, {
    ok: true,
    entries: entries.length,
    revalidated: ['/blog', '/blog/:slug', '/events', '/events/:slug', '/api/content'],
    note: `The in-memory copy is cleared now; edge copies refresh within ${REVALIDATE_SECONDS} seconds.`,
  });
});
