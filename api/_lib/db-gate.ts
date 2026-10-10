import type { VercelResponse } from '@vercel/node';

import { sendJson } from './http.js';

/**
 * Whether the public forms that take submissions have a database behind them.
 *
 * Event registration, consultation booking, written enquiry and the newsletter
 * signup all read and write rows, so they cannot work without `DATABASE_URL`.
 * The site is deployed without one for now, which used to mean the whole
 * function failed to import the moment it loaded - the database module throws
 * when the connection string is missing. The route table in `routes/index.ts`
 * loads them on demand instead, and this flag stops a request ever getting that
 * far.
 *
 * There is no separate switch to remember: putting `DATABASE_URL` back is all
 * it takes to turn these features on again, because that is exactly the thing
 * they were missing.
 */
export const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_URL);

/**
 * The honest answer when a form has nowhere to write. 503 says "not right now"
 * rather than pretending the endpoint was never there, and it names a way to
 * reach a person in the meantime. Nothing here touches the database, Redis or
 * Resend.
 */
export function databaseUnavailable(res: VercelResponse): void {
  sendJson(res, 503, {
    error:
      'This form is not available right now. Email hello@peoplegrowthafrica.com and we will take it from there.',
    code: 'temporarily_unavailable',
  });
}
