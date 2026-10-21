import type { VercelRequest, VercelResponse } from '@vercel/node';

import { endpoint, sendPublicJson } from '../http.js';
import { REVALIDATE_SECONDS, getAllEntries } from '../content/source.js';

/**
 * The sheet's entries, in one response: blog rows and event rows together, each
 * carrying its `type`.
 *
 * The site is a Vite single page app with no server rendering, so the sheet is
 * read here - server side, behind the same single serverless function as the
 * rest of the API - and the existing blog and events pages merge the result with
 * their built-in content. The whole list is sent rather than a page at a time
 * because the copy is cached at the edge for five minutes and a detail page then
 * needs no second request.
 *
 * Never an error status: a sheet that is unreachable or empty answers 200 with
 * the last good list (or none), which is what keeps the pages from crashing.
 */
export default endpoint({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const entries = await getAllEntries();
  sendPublicJson(res, 200, { entries }, REVALIDATE_SECONDS);
});
