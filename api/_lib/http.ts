import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Bodies on these endpoints are small JSON objects. Anything larger is either a
 * mistake or an attempt to exhaust memory, so it is refused before parsing.
 */
const MAX_BODY_BYTES = 8 * 1024;

/**
 * The ceiling for an admin post or category write. An article body is one JSON
 * string and blows past 8 KB on its first few paragraphs, so those endpoints
 * pass this larger limit while every other endpoint keeps the tight default.
 */
export const MAX_ADMIN_BODY_BYTES = 512 * 1024;

/** Origins that are allowed to send credentialed auth requests. */
const EXTRA_ALLOWED_ORIGINS = (process.env.APP_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export class ApiError extends Error {
  status: number;
  code: string;
  /** Per field messages, so the client can mark the exact input at fault. */
  fields?: Record<string, string>;
  /** Extra response headers this error needs, for example Retry-After. */
  headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }
}

/**
 * Where a signed in user may be sent after an auth action. Redirect targets are
 * fixed paths chosen here, never a value taken from the request, so a crafted
 * link cannot bounce a visitor to another site.
 */
const ALLOWED_REDIRECTS = new Set([
  '/',
  '/auth#login',
  '/talent/dashboard',
  '/employer/dashboard',
  '/admin/content',
]);

export function safeRedirect(path: string): string {
  return ALLOWED_REDIRECTS.has(path) ? path : '/';
}

/**
 * Turns any thrown value into one log line. Emails and anything else that looks
 * like an address are masked, and the line is truncated, so a database error
 * cannot smuggle personal data or a token into the logs.
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const line = `${error.name}${code ? ` (${code})` : ''}: ${error.message}`;
  return line.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').slice(0, 300);
}

/** Headers arrive as string, string[] or undefined depending on the header. */
export function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Auth responses are per user and must never be stored by a browser or CDN.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(JSON.stringify(body));
}

/**
 * A public JSON answer the CDN may keep.
 *
 * sendJson above is for anything that belongs to a signed in visitor and is
 * never stored. The updates feed is the other case: the same answer for
 * everyone, read from a sheet that changes rarely. `s-maxage` is the closest
 * thing this deployment has to ISR - Vercel serves the stored copy for `seconds`
 * without invoking the function, then serves one stale copy while the next is
 * built for up to `staleSeconds` more. `max-age=0` keeps browsers out of it, so
 * a visitor never sits on an old copy of a page they are actively reading.
 */
export function sendPublicJson(
  res: VercelResponse,
  status: number,
  body: unknown,
  seconds: number,
  staleSeconds: number = seconds * 2,
): void {
  if (res.headersSent) return;
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(JSON.stringify(body));
}

export function parseJsonBody(req: VercelRequest, maxBytes: number = MAX_BODY_BYTES): unknown {
  const raw =
    typeof req.body === 'string'
      ? req.body
      : req.body === undefined || req.body === null
        ? ''
        : JSON.stringify(req.body);

  if (raw.length > maxBytes) {
    throw new ApiError(413, 'body_too_large', 'That request was too large.');
  }
  if (raw.trim() === '') {
    throw new ApiError(400, 'empty_body', 'Send a JSON object in the request body.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}

function isLocalOrPreview(host: string): boolean {
  const name = host.split(':')[0] ?? host;
  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '[::1]' ||
    name === '::1' ||
    name.endsWith('.vercel.app')
  );
}

/**
 * Cross site request forgery guard. The session cookie is SameSite=Lax, which
 * already blocks it from being attached to cross site requests; this is the
 * second layer, applied to every request that can change state. Browser
 * requests must come from the same host (or an explicitly allowed origin).
 * Requests without an Origin header cannot carry a borrowed cookie, so
 * non browser callers such as curl are left alone.
 */
export function assertTrustedOrigin(req: VercelRequest): void {
  const origin = headerValue(req.headers.origin);
  if (!origin) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, 'bad_origin', 'Request blocked.');
  }

  const requestHost = headerValue(req.headers['x-forwarded-host']) ?? headerValue(req.headers.host) ?? '';
  if (originHost === requestHost) return;
  if (EXTRA_ALLOWED_ORIGINS.includes(origin)) return;
  if (isLocalOrPreview(originHost) && isLocalOrPreview(requestHost)) return;

  throw new ApiError(403, 'bad_origin', 'Request blocked.');
}

/** Client IP as seen through Vercel's proxy. Used for rate limits and audit. */
export function clientIp(req: VercelRequest): string {
  const forwarded = headerValue(req.headers['x-forwarded-for']);
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PUT';
type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

/**
 * Wraps a handler with method checking, the CSRF guard and error translation.
 * Every endpoint in api/auth is defined through this so no route can forget.
 */
export function endpoint(
  config: { methods: HttpMethod[]; csrf?: boolean },
  handler: RouteHandler,
): RouteHandler {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const method = (req.method ?? 'GET').toUpperCase();
    try {
      if (!config.methods.includes(method as HttpMethod)) {
        res.setHeader('Allow', config.methods.join(', '));
        throw new ApiError(405, 'method_not_allowed', `Use ${config.methods.join(' or ')} on this endpoint.`);
      }
      if (config.csrf && method !== 'GET') {
        assertTrustedOrigin(req);
      }
      await handler(req, res);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [name, value] of Object.entries(error.headers ?? {})) {
          res.setHeader(name, value);
        }
        sendJson(res, error.status, {
          error: error.message,
          code: error.code,
          ...(error.fields ? { fields: error.fields } : {}),
        });
        return;
      }
      // Never leak an internal message or stack to the client.
      console.error('[auth] unhandled error', method, req.url, describeError(error));
      sendJson(res, 500, {
        error: 'Something went wrong on our side. Try again in a moment.',
        code: 'server_error',
      });
    }
  };
}
