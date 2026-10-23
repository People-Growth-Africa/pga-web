import { createHash, createHmac, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Password and token primitives. Nothing here reads request data directly, so
 * the rules (cost factor, token size, hashing algorithm) live in one place.
 */

/** 12 rounds is roughly 250 ms on Vercel's runtime: slow for attackers, fine for users. */
const BCRYPT_ROUNDS = 12;

/**
 * bcrypt silently ignores everything past 72 bytes, so two long passwords that
 * share a 72 byte prefix would be interchangeable. Hashing first turns any
 * password into a fixed 44 character digest, so the whole password counts.
 */
function preHash(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('base64');
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(preHash(plain), BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(preHash(plain), hash);
  } catch {
    return false;
  }
}

/**
 * Whether a stored hash was made with a weaker setting than the current one.
 * Only bcrypt counts rise over time, so this is checked at login and the
 * password is re-hashed then - the one moment it exists in plain text.
 */
export function passwordNeedsUpgrade(hash: string): boolean {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  if (!match) return true;
  const rounds = Number(match[1]);
  return !Number.isFinite(rounds) || rounds < BCRYPT_ROUNDS;
}

let dummyHash: Promise<string> | null = null;

/**
 * Compared against when an email has no account, so a failed login costs the
 * same time whether or not the address exists. Without it, response time alone
 * would reveal which emails are registered.
 */
export async function spendPasswordTime(plain: string): Promise<void> {
  dummyHash ??= bcrypt.hash(preHash(randomBytes(32).toString('hex')), BCRYPT_ROUNDS);
  await bcrypt.compare(preHash(plain), await dummyHash);
}

/**
 * Have I Been Pwned range API, k-anonymity style: only the first five
 * characters of the SHA-1 hash leave the server, so the service never learns
 * the password or the full hash. A response is padded to a fixed size and
 * padded rows carry a count of zero.
 *
 * Unreachable or slow API means the password is allowed through. Rejecting a
 * signup because a third party is down would be a worse failure than letting
 * one weak password past, and the rest of the password rules still apply.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;

    for (const line of (await response.text()).split('\n')) {
      const separator = line.indexOf(':');
      if (separator === -1) continue;
      if (line.slice(0, separator).trim().toUpperCase() !== suffix) continue;
      return Number(line.slice(separator + 1).trim()) > 0;
    }
    return false;
  } catch {
    return false;
  }
}

/** 32 random bytes, URL safe: not guessable and safe to put in an email link. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Only the hash is stored. A leaked database therefore cannot be used to redeem
 * a reset or verification link.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Keyed hash of an IP address for the audit log, so no raw address is stored. */
export function hashIp(ip: string | undefined): string | null {
  if (!ip || ip === 'unknown') return null;
  const salt = process.env.AUDIT_HASH_SECRET ?? process.env.JWT_SECRET;
  if (!salt) return null;
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}

/**
 * Pseudonym for a rate limit counter. Counting only needs a value that is
 * stable for the same email, IP or token, so the identifiers are hashed before
 * they are sent to the limiter and the limiter never stores an address.
 */
export function counterKey(value: string): string {
  const salt = process.env.AUDIT_HASH_SECRET ?? process.env.JWT_SECRET;
  const hash = salt ? createHmac('sha256', salt) : createHash('sha256');
  return hash.update(value).digest('hex').slice(0, 32);
}
