import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes } from 'node:crypto';

import { ApiError, endpoint, parseJsonBody, sendJson } from '../http.js';
import { requireManager } from '../manager.js';
import { enforceRateLimit } from '../ratelimit.js';

/**
 * POST /api/admin/upload - store one cover image and return its public URL.
 *
 * The client sends the file as base64 in JSON rather than as multipart. Vercel's
 * multipart parsing differs between runtimes and has no type to hook, whereas a
 * JSON body goes through the same `parseJsonBody` path as every other write and
 * the same size ceiling. It also means the size check happens before a byte is
 * decoded, which is the order that matters.
 *
 * Three checks stand between a request and a stored file, and none of them
 * trust the client:
 *
 *   1. The declared size is capped before the base64 is decoded, so a huge body
 *      costs nothing but a string length.
 *   2. The *magic bytes* decide the type, not the Content-Type header. A file
 *      called photo.png that starts with `<svg` is a rejection, and so is an
 *      HTML file with a PNG header pasted on it.
 *   3. The stored name is generated here from a random value. The client's
 *      filename never reaches the path, so it cannot carry a slash, a `..`, a
 *      null byte or a name that overwrites another manager's cover.
 *
 * Only the URL is written to the database; the file itself lives in Blob.
 */

/**
 * The requested ceiling is 5 MB. Vercel caps a request body at 4.5 MB on every
 * plan, and base64 adds a third on top, so a file over roughly 3.3 MB is turned
 * away by the platform before this code runs. The check below still enforces the
 * 5 MB rule for callers that reach it.
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** base64 expands by 4/3, so the JSON body ceiling has to sit above the image cap. */
const MAX_UPLOAD_BODY_BYTES = 8 * 1024 * 1024;

type UploadBody = {
  filename?: unknown;
  contentType?: unknown;
  data?: unknown;
  /**
   * Which half of the cover pair this file is. The browser compresses one image
   * into two WebP files - the full one for the article and a thumbnail for the
   * grids - and uploads each through this endpoint. The variant only decides the
   * folder it lands in, so a human browsing the store can see the pairing.
   */
  variant?: unknown;
};

/** The extensions we will store, and the bytes that actually identify them. */
const TYPES = {
  jpg: { contentType: 'image/jpeg', extension: 'jpg' },
  png: { contentType: 'image/png', extension: 'png' },
  webp: { contentType: 'image/webp', extension: 'webp' },
} as const;

type TypeKey = keyof typeof TYPES;

/**
 * Identifies the real format from the file's own leading bytes.
 *
 * JPEG starts FF D8 FF, PNG with its eight byte signature, and WebP is a RIFF
 * container whose fifth word is WEBP. Nothing else is accepted, which is what
 * keeps an uploaded "image" from being served back as HTML or SVG - the two
 * formats that can run script when a browser renders them directly.
 */
export function sniffType(buffer: Buffer): TypeKey | null {
  const jpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (jpeg) return 'jpg';

  const png = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (png) return 'png';

  const webp =
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';
  if (webp) return 'webp';

  return null;
}

function bodyError(field: string, message: string): ApiError {
  return new ApiError(400, 'validation_failed', message, { [field]: message });
}

export default endpoint({ methods: ['POST'], csrf: true }, async (req: VercelRequest, res: VercelResponse) => {
  const manager = await requireManager(req);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(
      503,
      'uploads_disabled',
      'Image uploads are not configured on this deployment. Add BLOB_READ_WRITE_TOKEN in Vercel.',
    );
  }

  await enforceRateLimit({
    name: 'admin-upload',
    identifier: manager.userId,
    limit: 30,
    windowSeconds: 60,
  });

  const body = parseJsonBody(req, MAX_UPLOAD_BODY_BYTES) as UploadBody;

  if (typeof body.data !== 'string' || body.data.length === 0) {
    throw bodyError('file', 'Choose an image to upload.');
  }
  if (typeof body.contentType === 'string' && !/^image\/(jpeg|png|webp)$/.test(body.contentType)) {
    throw bodyError('file', 'Upload a JPG, PNG or WebP image.');
  }

  const estimatedBytes = Math.floor((body.data.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    throw bodyError('file', 'That image is over 5 MB. Choose a smaller one.');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.data, 'base64');
  } catch {
    throw bodyError('file', 'That file could not be read. Try another one.');
  }

  if (buffer.length === 0) throw bodyError('file', 'That file is empty.');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw bodyError('file', 'That image is over 5 MB. Choose a smaller one.');
  }

  const type = sniffType(buffer);
  if (!type) {
    throw bodyError('file', 'That file is not a JPG, PNG or WebP image.');
  }

  const extension = TYPES[type].extension;
  const variant = body.variant === 'thumb' ? 'thumb' : 'full';
  const stem = slugStem(typeof body.filename === 'string' ? body.filename : '');
  // Random suffix plus the content hash: two managers uploading the same photo
  // get two files, and a re-upload of an edited image never serves the old one
  // from a browser or CDN cache.
  const name = `${stem}-${randomBytes(6).toString('hex')}-${createHash('sha256').update(buffer).digest('hex').slice(0, 8)}.${extension}`;

  const blob = await put(`covers/${variant}/${name}`, buffer, {
    access: 'public',
    contentType: TYPES[type].contentType,
    allowOverwrite: false,
  });

  sendJson(res, 201, {
    url: blob.url,
    pathname: blob.pathname,
    variant,
    size: buffer.length,
    contentType: TYPES[type].contentType,
  });
});

/**
 * A short, safe stem for the stored name, purely so a human browsing the Blob
 * store can tell the files apart. It is never used as an identifier and never
 * appears on its own, so anything unexpected in it is simply dropped.
 */
function slugStem(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '');
  const cleaned = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'cover';
}
