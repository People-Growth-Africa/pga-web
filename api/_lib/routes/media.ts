import { get } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { isCoverPathname } from '../cover-url.js';
import { endpoint } from '../http.js';

/**
 * GET /api/media/covers/... - one cover file, read from Blob with the token.
 *
 * A Blob store created private serves nothing without the read-write token, so a
 * cover URL pointing straight at it would be a broken image everywhere it
 * appeared. This endpoint is the other half of that: the value saved on a post is
 * a path under /api/media/, and the bytes are streamed from the store with the
 * token only the server holds. A store created public never needs this, and its
 * covers are saved as CDN URLs instead - see api/_lib/cover-url.ts.
 *
 * The pathname comes from the URL, so it is checked before it reaches the Blob
 * API (`isCoverPathname`): only `covers/full/` and `covers/thumb/` are readable
 * here, which is also what keeps this from becoming a reader for the rest of the
 * store.
 *
 * Responses are immutable because every stored file name carries a random value
 * and a content hash. Replacing a cover writes a new file, so the same URL never
 * means different bytes, and `s-maxage` lets the CDN answer for the function.
 */
const CACHE_CONTROL = 'public, max-age=31536000, immutable, s-maxage=31536000';

/**
 * The cover pathname asked for.
 *
 * The API entry point hands a subtree route the rest of the path in `path` (it is
 * also where Vercel puts the endpoint for a rewrite), while a request that
 * arrives unprefixed - the local server in scripts/api-server.mjs, or a direct
 * call to the function - carries it in the URL.
 */
function requestedPathname(req: VercelRequest): string {
  const captured = req.query?.path;
  const fromQuery = Array.isArray(captured)
    ? captured.join('/')
    : typeof captured === 'string'
      ? captured
      : '';

  if (fromQuery) return fromQuery.replace(/^\/+/, '');
  const url = (req.url ?? '').split('?')[0] ?? '';
  return url.replace(/^\/api\/media\/?/, '');
}

/**
 * Nothing to show. Answered rather than thrown so an <img> gets a plain 404 with
 * no JSON body, and so the miss is not cached by anything.
 */
function notFound(res: VercelResponse): void {
  if (res.headersSent) return;
  res.status(404);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end();
}

export default endpoint({ methods: ['GET', 'HEAD'] }, async (req: VercelRequest, res: VercelResponse) => {
  const pathname = requestedPathname(req);
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // Without a token nothing can have been stored privately, so a request for one
  // is a miss rather than a configuration error worth a 500 on an image.
  if (!isCoverPathname(pathname) || !token) {
    notFound(res);
    return;
  }

  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(pathname, { access: 'private', token });
  } catch (error) {
    // A store that cannot be read is not something a browser can act on, and a
    // page should still render around a cover that will not load. The reason
    // goes to the log, not into the response.
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
    console.error(`[media] could not read ${pathname}: ${reason.slice(0, 300)}`);
    notFound(res);
    return;
  }

  if (!result || result.stream === null) {
    notFound(res);
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', String(result.blob.size));
  res.setHeader('ETag', result.blob.etag);
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if ((req.method ?? 'GET').toUpperCase() === 'HEAD') {
    res.end();
    return;
  }

  try {
    await pipeStream(result.stream, res);
  } catch (error) {
    // The status line is already sent, so there is no error response left to
    // write; ending the response is what keeps the request from hanging.
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.error(`[media] stream for ${pathname} failed: ${reason.slice(0, 300)}`);
    if (!res.writableEnded) res.end();
  }
});

/**
 * Writes the body out with backpressure.
 *
 * `Readable.fromWeb` would say this in one line, but it needs the Node copy of
 * the stream types and the store hands back the web one, so the reader loop is
 * spelled out instead of cast.
 */
async function pipeStream(body: ReadableStream<Uint8Array>, res: VercelResponse): Promise<void> {
  const reader = body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      if (!res.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => res.once('drain', resolve));
      }
    }
  } finally {
    reader.releaseLock();
  }

  res.end();
}
