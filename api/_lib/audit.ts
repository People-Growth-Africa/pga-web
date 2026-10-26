import { insertAuditLog, logAuthEvent } from './db.js';
import { hashIp } from './security.js';

/**
 * Security relevant events (signup, login, failed login, password reset,
 * account deletion) are recorded in auth_events with a keyed hash of the IP
 * address rather than the address itself.
 */
export async function recordAuthEvent(
  event: string,
  options: {
    userId?: string | null;
    ip?: string | undefined;
    /** Already hashed, for callers that never held the address itself. */
    ipHash?: string | null;
  } = {},
): Promise<void> {
  try {
    await logAuthEvent({
      userId: options.userId ?? null,
      event,
      ipHash: options.ipHash ?? hashIp(options.ip),
    });
  } catch {
    // A missing audit row must never turn into a failed signup or login, but it
    // should be visible in the logs. Do not attach the raw error: a driver
    // message can contain the row values, including an email address.
    console.error('[auth] audit write failed', event);
  }
}

/**
 * The staff-facing audit trail: sign-in, exports, account changes. The detail
 * column never holds a password or a token - only a tab name, an email address
 * or a set of filters.
 */
export async function recordAudit(
  action: string,
  options: { userId?: string | null; detail?: string | null } = {},
): Promise<void> {
  try {
    await insertAuditLog({ userId: options.userId, action, detail: options.detail });
  } catch {
    console.error('[audit] write failed', action);
  }
}
