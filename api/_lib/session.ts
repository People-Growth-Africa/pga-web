import { SignJWT, jwtVerify } from 'jose';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError, headerValue } from './http.js';
import type { Role } from './db.js';

/**
 * Sessions are a signed JWT in an httpOnly cookie. The token carries the user's
 * id, role and token_version; the version is re-checked against the database on
 * every authenticated request, so bumping it ends every existing session.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
/**
 * Manager sessions are not ordinary sessions. The content admin can publish to
 * the live site and upload files, so one left open on a shared laptop is worth
 * more to an attacker than a talent dashboard nobody else can use. Two limits
 * apply to it, and to nothing else:
 *
 *   - `MANAGER_IDLE_SECONDS` is how long a manager may leave the panel alone
 *     before the session stops working. It slides: every authenticated admin
 *     request (`requireManager`) reissues the cookie, and the panel pings on
 *     real interaction, so typing an article never trips it.
 *   - `MANAGER_ABSOLUTE_SECONDS` is the hard ceiling on one sign-in, however
 *     busy the session is. It is carried in the token as `abs`, so refreshing
 *     the idle window cannot walk past it.
 */
export const MANAGER_IDLE_SECONDS = 30 * 60;
export const MANAGER_ABSOLUTE_SECONDS = 60 * 60 * 8;
/**
 * How stale a manager token may get before a request replaces it. Reissuing on
 * every call would set a cookie on every keystroke-sized request; five minutes
 * keeps the window true to within one request without that chatter.
 */
const SESSION_TOUCH_SECONDS = 5 * 60;
const ISSUER = 'peoplegrowthafrica.com';
const AUDIENCE = 'pga-auth';
const MIN_SECRET_LENGTH = 32;

/**
 * The `__Host-` prefix makes the browser refuse the cookie unless it is Secure,
 * has Path=/ and carries no Domain, which stops a subdomain from overwriting
 * it. It also means plain http would lose the cookie, so the live deployment
 * uses it and local development uses the plain name. Vercel sets
 * VERCEL_ENV=production on the production deployment only.
 */
export const SESSION_COOKIE_NAME = process.env.VERCEL_ENV === 'production' ? '__Host-session' : 'session';

/**
 * Read once at module load so a misconfigured deployment fails immediately and
 * loudly rather than signing sessions with a guessable secret. A short secret
 * is as bad as a missing one: HS256 with a few characters is brute forceable.
 */
const JWT_SECRET = loadJwtSecret();

function loadJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long. Run \`npm run setup:auth\` to generate one, or add it in the Vercel dashboard.`,
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionClaims = {
  userId: string;
  role: Role;
  tokenVersion: number;
  /** When this sign-in began. The idle window slides; this does not. */
  absoluteStart: number;
  /** When this token was minted, so a refresh can be spaced out. */
  issuedAt: number;
};

/** How long a fresh session for this role should live, in seconds. */
export function sessionTtlSeconds(role: Role): number {
  return role === 'manager' ? MANAGER_IDLE_SECONDS : SESSION_TTL_SECONDS;
}

/** The longest one sign-in may last, however active it is. */
function absoluteLimitSeconds(role: Role): number {
  return role === 'manager' ? MANAGER_ABSOLUTE_SECONDS : SESSION_TTL_SECONDS;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Kept so an endpoint can check the configuration up front and answer 500 with
 * a readable message instead of failing at module load. The real check already
 * happened above.
 */
export function assertSessionConfigured(): void {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new ApiError(
      500,
      'server_misconfigured',
      'Sessions are not configured on the server. Run `npm run setup:auth` to set JWT_SECRET.',
    );
  }
}

export async function createSessionToken(claims: {
  userId: string;
  role: Role;
  tokenVersion: number;
  /** Carried through a refresh so the absolute limit still holds. */
  absoluteStart?: number;
}): Promise<string> {
  const issuedAt = nowSeconds();
  return new SignJWT({
    role: claims.role,
    ver: claims.tokenVersion,
    abs: claims.absoluteStart ?? issuedAt,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + sessionTtlSeconds(claims.role))
    .sign(JWT_SECRET);
}

/**
 * Reissues a manager's session so its idle window restarts, without ever moving
 * the `abs` claim that ends the sign-in for good. At most one cookie per five
 * minutes, and nothing at all for the talent and employer sessions, which are
 * fixed for seven days.
 */
export async function refreshManagerSession(
  req: VercelRequest,
  res: VercelResponse,
  session: SessionClaims,
): Promise<void> {
  if (session.role !== 'manager') return;
  if (nowSeconds() - session.issuedAt < SESSION_TOUCH_SECONDS) return;

  const token = await createSessionToken({
    userId: session.userId,
    role: session.role,
    tokenVersion: session.tokenVersion,
    absoluteStart: session.absoluteStart,
  });
  setSessionCookie(req, res, token, MANAGER_IDLE_SECONDS);
}

/**
 * Whether the request arrived with a session cookie at all. It is what separates
 * "signed out" from "signed in, then expired": only the second one needs to tell
 * the manager their session ended rather than that they never signed in.
 */
export function hasSessionCookie(req: VercelRequest): boolean {
  return readCookie(req, SESSION_COOKIE_NAME) !== null;
}

export async function readSession(req: VercelRequest): Promise<SessionClaims | null> {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;

  try {
    // Pinning the algorithm stops a token that claims "none" or a different
    // algorithm from ever being accepted. The issuer and audience checks stop a
    // token minted for another purpose from being replayed here.
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    const role = payload.role;
    const ver = payload.ver;
    if (typeof payload.sub !== 'string' || typeof ver !== 'number') return null;
    // An allow list rather than a lookup: a token carrying any other value is
    // refused outright. 'manager' belongs here or a signed in manager cannot
    // reach anything - the admin endpoints read the role from this claim.
    if (role !== 'talent' && role !== 'employer' && role !== 'manager') return null;

    // Tokens minted before this limit existed carry no `abs`; their `iat` is the
    // closest true answer, and it is the same day the token was made.
    const issuedAt = typeof payload.iat === 'number' ? payload.iat : 0;
    const absoluteStart = typeof payload.abs === 'number' ? payload.abs : issuedAt;
    // The idle limit is already enforced by the expiry above. This is the one
    // that stops a manager from working around it by staying busy for days.
    if (nowSeconds() - absoluteStart > absoluteLimitSeconds(role)) return null;

    return { userId: payload.sub, role, tokenVersion: ver, absoluteStart, issuedAt };
  } catch {
    return null;
  }
}

function cookieHeader(req: VercelRequest, value: string, maxAge: number): string {
  const secure = (headerValue(req.headers['x-forwarded-proto']) ?? 'https') === 'https';
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function setSessionCookie(
  req: VercelRequest,
  res: VercelResponse,
  token: string,
  maxAgeSeconds: number = SESSION_TTL_SECONDS,
): void {
  res.setHeader('Set-Cookie', cookieHeader(req, token, maxAgeSeconds));
}

export function clearSessionCookie(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
}

function readCookie(req: VercelRequest, name: string): string | null {
  const header = headerValue(req.headers.cookie);
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
