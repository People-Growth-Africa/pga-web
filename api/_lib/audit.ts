import {
  auditedMutation as runAuditedMutation,
  findSessionUserById,
  insertAuditLogRow,
  insertLoginEvent,
  logAuthEvent,
  type AuditWrite,
} from './db.js';
import { hashIp } from './security.js';
import type { VercelRequest } from '@vercel/node';

type AuditInput = Omit<AuditWrite, 'ip' | 'userAgent' | 'requestId'> & {
  req: VercelRequest;
};

const AUDIT_FIELDS: Record<string, readonly string[]> = {
  'email_template.update': ['subject', 'paragraphs'],
  'content.create': ['type', 'slug', 'title', 'status'],
  'content.edit': ['type', 'slug', 'title', 'status'],
  'content.publish': ['type', 'slug', 'title', 'status'],
  'content.unpublish': ['type', 'slug', 'title', 'status'],
  'content.scheduled': ['type', 'slug', 'title', 'status', 'publish_at'],
  'content.rescheduled': ['type', 'slug', 'title', 'status', 'publish_at'],
  'content.unscheduled': ['type', 'slug', 'title', 'status', 'publish_at'],
  'content.auto_published': ['type', 'slug', 'title', 'status', 'publish_at'],
  'content.delete': ['type', 'slug', 'title', 'status'],
  'content.restore': ['type', 'slug', 'title', 'status'],
  'content.purge': ['type', 'slug', 'title', 'status'],
  'staff.create': ['role'],
  'staff.role_change': ['role', 'is_super_admin'],
  'staff.account_update': ['role', 'is_super_admin'],
  'staff.disable': ['disabled'],
  'staff.enable': ['disabled'],
  'staff.super_admin_change': ['role', 'is_super_admin'],
  'staff.password_reset': [],
  'staff.password_change': [],
  'data.export': ['dataset', 'filters', 'rowCount'],
  'registration.delete': ['id', 'name', 'event', 'deleted'],
  'registration.restore': ['id', 'deleted'],
  'registration.purge': ['id', 'deleted'],
  'subscription.delete': ['id', 'deleted'],
  'subscription.restore': ['id', 'deleted'],
  'subscription.purge': ['id', 'deleted'],
  'consultation.delete': ['id', 'name', 'deleted'],
  'consultation.restore': ['id', 'deleted'],
  'consultation.purge': ['id', 'deleted'],
  'consultation.status_change': ['status'],
  'consultation.assignment': ['assigned_to'],
  'consultation.note_edit': ['internal_notes_changed'],
  'auth.login': [],
  'auth.login_failed': [],
  'auth.logout': [],
  'auth.forced_sign_out': [],
  'audit_log.export': ['dataset', 'filters', 'rowCount'],
  'access.request_created': ['permission', 'status'],
  'access.request_approved': ['permission', 'status', 'expires_at'],
  'access.request_declined': ['permission', 'status'],
  'access.request_cancelled': ['permission', 'status'],
  'access.grant_revoked': ['permission', 'status', 'expires_at', 'revoked_at'],
  'access.grant_expired': ['permission', 'status', 'expires_at', 'expiration_audited_at'],
  'traffic.bot_rule.create': ['rule_type', 'pattern', 'classification'],
  'traffic.bot_rule.delete': ['rule_type', 'pattern', 'classification'],
  'retention.dry_run': ['dataset', 'rowCount'],
  'retention.purge': ['dataset', 'rowCount'],
  'retention.settings_update': ['enabled'],
  'retention.raw_traffic_period_change': ['days'],
  'retention.legal_hold': ['dataset', 'enabled'],
  'retention.personal_data_delete': ['counts', 'rowCount'],
};

export type MutationAuditField =
  | 'permission'
  | 'status'
  | 'expires_at'
  | 'revoked_at'
  | 'expiration_audited_at'
  | 'counts'
  | 'rowCount';

function requestMetadata(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  const ipHeader = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const requestId = req.headers['x-vercel-id'] ?? req.headers['x-request-id'];
  const userAgent = req.headers['user-agent'];
  return {
    ip: typeof ipHeader === 'string' ? ipHeader.split(',')[0]?.trim().slice(0, 100) ?? null : null,
    userAgent: (Array.isArray(userAgent) ? userAgent[0] : userAgent)?.slice(0, 500) ?? null,
    requestId: (Array.isArray(requestId) ? requestId[0] : requestId)?.slice(0, 200) ?? null,
  };
}

function safeDiff(
  action: string,
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  const allowed = AUDIT_FIELDS[action] ?? [];
  const clean: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in value)) continue;
    const encoded = JSON.stringify(value[key]);
    if (encoded !== undefined) clean[key] = JSON.parse(encoded) as unknown;
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

export function prepareAuditWrite(input: AuditInput): AuditWrite {
  if (!AUDIT_FIELDS[input.action]) throw new Error(`Unsupported audit action: ${input.action}`);
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(input.entity.type)) {
    throw new Error('Invalid audit entity type.');
  }
  if (input.entity.id && input.entity.id.length > 200) throw new Error('Invalid audit entity id.');
  const metadata = requestMetadata(input.req);
  const before = safeDiff(input.action, input.before);
  const after = safeDiff(input.action, input.after);
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (JSON.stringify(before?.[key]) === JSON.stringify(after?.[key])) continue;
    if (before && key in before) changedBefore[key] = before[key];
    changedAfter[key] = after && key in after ? after[key] : null;
  }
  return {
    actor: input.actor,
    action: input.action,
    entity: {
      type: input.entity.type,
      id: input.entity.id ?? null,
      label: input.entity.label?.slice(0, 300) ?? null,
    },
    before: Object.keys(changedBefore).length ? changedBefore : null,
    after: Object.keys(changedAfter).length ? changedAfter : null,
    ...metadata,
  };
}

export async function logAudit(input: AuditInput): Promise<void> {
  await insertAuditLogRow(prepareAuditWrite(input));
}

export async function auditedMutation<T>(input: AuditInput & {
  mutationSql: string;
  mutationParams: unknown[];
  afterFromMutation?: readonly MutationAuditField[];
}): Promise<T[]> {
  const { mutationSql, mutationParams, afterFromMutation, ...audit } = input;
  return runAuditedMutation<T>({
    mutationSql,
    mutationParams,
    audit: prepareAuditWrite(audit),
    ...(afterFromMutation ? { afterFromMutation } : {}),
  });
}

export async function auditActorForUser(userId: string): Promise<AuditWrite['actor']> {
  const user = await findSessionUserById(userId);
  if (!user || user.disabled_at !== null) throw new Error('Cannot audit an inactive staff account.');
  return { id: user.id, email: user.email, role: user.role };
}

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

export async function recordLoginEvent(
  req: VercelRequest,
  input: {
    userId: string | null;
    emailAttempted: string;
    success: boolean;
  },
): Promise<void> {
  const forwarded = req.headers['x-forwarded-for'];
  const ipHeader = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const userAgent = req.headers['user-agent'];
  try {
    await insertLoginEvent({
      ...input,
      emailAttempted: input.emailAttempted.trim().slice(0, 320),
      ip: typeof ipHeader === 'string' ? ipHeader.split(',')[0]?.trim().slice(0, 100) ?? null : null,
      userAgent: (Array.isArray(userAgent) ? userAgent[0] : userAgent)?.slice(0, 500) ?? null,
    });
  } catch {
    console.error('[auth] login history write failed');
  }
}
