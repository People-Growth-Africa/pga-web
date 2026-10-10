import type { VercelRequest, VercelResponse } from '@vercel/node';

import { DATABASE_CONFIGURED } from '../../db-gate.js';
import { endpoint, sendJson } from '../../http.js';

/**
 * Whether the public forms have somewhere to write.
 *
 * Event registration, consultation booking, written enquiry and the newsletter
 * signup are all gated on `DATABASE_URL` at the route table, so without one they
 * answer 503. That used to be discovered only after a visitor had filled the
 * form in and pressed send. This endpoint hands the client the same flag the
 * gate reads, so a form can say "not available right now" before it asks for
 * anything. Reading `DATABASE_CONFIGURED` rather than the environment directly
 * is what keeps the two in step: the notice a visitor sees up front and the
 * answer the handler would give are the same fact.
 *
 * It touches no database, no session and no rate limit, so it answers while the
 * rest of the API is shut.
 */
export default endpoint({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  sendJson(res, 200, { available: DATABASE_CONFIGURED });
});
