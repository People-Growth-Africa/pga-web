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
};

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

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, ver: claims.tokenVersion })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(JWT_SECRET);
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
    return { userId: payload.sub, role, tokenVersion: ver };
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
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function setSessionCookie(req: VercelRequest, res: VercelResponse, token: string): void {
  res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_TTL_SECONDS));
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
