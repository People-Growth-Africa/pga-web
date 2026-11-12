import { neon } from '@neondatabase/serverless';
import type { MutationAuditField } from './audit.js';
import type { Permission } from './permissions.js';
import { trafficClassificationCtes } from './traffic-bots.js';

/**
 * Every statement in the app lives in this module. User input is only ever sent
 * as a bind parameter, never interpolated into SQL text, and table or column
 * names are chosen here on the server rather than taken from a request.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Run `vercel env pull .env.development.local` before starting.',
  );
}

const sql = neon(connectionString);

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = await sql.query(text, params);
  return rows as T[];
}

export async function queryOne<T>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

/**
 * A delete refused because a row still references it.
 *
 * ON DELETE RESTRICT raises 23001 (restrict_violation); a constraint stated as
 * NO ACTION raises 23503 instead, so both count. The category handler checks
 * the post count before deleting, which is what the manager sees - this is the
 * narrower window where a post is added between that check and the delete. It
 * has to read as "still in use", not as a server error, because that is what
 * happened.
 */
export function isRestrictViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = error.code;
  return code === '23001' || code === '23503';
}

/**
 * Account roles.
 *
 * 'manager' is a legacy role kept only so the migration script can find and map
 * old rows. It is not an administrator any more: no guard or page accepts it.
 * Talent and employer are the only roles public signup may write; the rest are
 * staff roles, guarded by a trigger.
 *
 * `content_manager` is deliberately not an administrator. It has its own login,
 * cookie and API guard, and can only reach the content tools; data exports,
 * staff accounts and the dashboard stay behind the administrator portal.
 *
 * `data_admin` is an administrator-portal role with a read-only remit: the
 * dashboard and the personal-data lists, including the account directory. It
 * cannot publish content, edit email templates or manage staff accounts.
 */
export type Role =
  | 'talent'
  | 'employer'
  | 'manager'
  | 'admin'
  | 'project_manager'
  | 'hr_manager'
  | 'content_manager'
  | 'data_admin';

export type AuthPortal = 'public' | 'admin' | 'content';

export type ServerSessionRow = {
  id: string;
  user_id: string;
  portal: AuthPortal;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
};

export async function createServerSession(input: {
  id: string;
  userId: string;
  portal: AuthPortal;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO sessions (id, user_id, portal, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6)`,
    [input.id, input.userId, input.portal, input.expiresAt, input.ip, input.userAgent],
  );
}

export async function touchServerSession(input: {
  id: string;
  userId: string;
  portal: AuthPortal;
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE sessions SET last_seen_at = now()
      WHERE id = $1 AND user_id = $2 AND portal = $3
        AND revoked_at IS NULL AND expires_at > now()
      RETURNING id`,
    [input.id, input.userId, input.portal],
  );
  return rows.length > 0;
}

export async function extendServerSession(input: {
  id: string;
  userId: string;
  portal: AuthPortal;
  expiresAt: string;
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE sessions SET last_seen_at = now(), expires_at = $4::timestamptz
      WHERE id = $1 AND user_id = $2 AND portal = $3
        AND revoked_at IS NULL AND expires_at > now()
      RETURNING id`,
    [input.id, input.userId, input.portal, input.expiresAt],
  );
  return rows.length > 0;
}

export async function listServerSessions(userId: string): Promise<ServerSessionRow[]> {
  return query<ServerSessionRow>(
    `SELECT id, user_id, portal,
            ${isoTimestamp('sessions', 'created_at')} AS created_at,
            ${isoTimestamp('sessions', 'last_seen_at')} AS last_seen_at,
            ${isoTimestamp('sessions', 'expires_at')} AS expires_at,
            ip, user_agent,
            ${isoTimestamp('sessions', 'revoked_at')} AS revoked_at
       FROM sessions WHERE user_id = $1
      ORDER BY last_seen_at DESC LIMIT 100`,
    [userId],
  );
}

export async function revokeServerSession(userId: string, sessionId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE sessions SET revoked_at = now()
      WHERE id = $2 AND user_id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [userId, sessionId],
  );
  return rows.length > 0;
}

export async function revokeUserServerSessions(userId: string, exceptId?: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE sessions SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL
        AND ($2::uuid IS NULL OR id <> $2)
      RETURNING id`,
    [userId, exceptId ?? null],
  );
  return rows.length;
}

export async function listLoginEvents(userId: string): Promise<{
  id: string;
  email_attempted: string;
  success: boolean;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}[]> {
  return query(
    `SELECT id, email_attempted, success, ip, user_agent,
            ${isoTimestamp('login_events', 'created_at')} AS created_at
       FROM login_events WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 100`,
    [userId],
  );
}

export async function insertLoginEvent(input: {
  userId: string | null;
  emailAttempted: string;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO login_events (user_id, email_attempted, success, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, input.emailAttempted, input.success, input.ip, input.userAgent],
  );
}

export type StaffRole =
  | 'admin'
  | 'project_manager'
  | 'hr_manager'
  | 'content_manager'
  | 'data_admin';

export const MANAGER_ROLE: Role = 'manager';

/**
 * Administrator-portal accounts. The legacy 'manager' role is deliberately not
 * here: it may still appear on an old row until the migration script maps it,
 * but it no longer opens any admin endpoint or page.
 */
export function isAdminPortalRole(role: Role): boolean {
  return (
    role === 'admin' ||
    role === 'project_manager' ||
    role === 'hr_manager' ||
    role === 'data_admin'
  );
}

/** The content desk is for content managers only. Administrators have their
 * own oversight routes and never use the content manager's API. */
export function isContentEditorRole(role: Role): boolean {
  return role === 'content_manager';
}

export function isContentManagerRole(role: Role): boolean {
  return role === 'content_manager';
}

/** Every staff account, across both portals. */
export function isStaffRole(role: Role): boolean {
  return isAdminPortalRole(role) || isContentManagerRole(role);
}

/** The one role that may create or disable staff accounts. */
export function isAdminRole(role: Role): boolean {
  return role === 'admin';
}

export type UserRow = {
  id: string;
  /** Null on accounts that were created without one (a legacy or seeded row). */
  name: string | null;
  email: string;
  role: Role;
  password_hash: string;
  email_verified: boolean;
  token_version: number;
  must_change_password: boolean;
  disabled_at: string | null;
  is_super_admin: boolean;
};

async function auditedAccessMutation<T>(input: {
  mutationCtes?: string;
  mutationSql: string;
  mutationParams: unknown[];
  audit: AuditWrite;
  afterFromMutation: readonly MutationAuditField[];
}): Promise<T | null> {
  const [row] = await auditedMutation<T>(input);
  return row ?? null;
}

export async function createAccessRequest(input: {
  requesterId: string;
  permission: Permission;
  reason: string;
  requestedDuration: number | null;
  audit: AuditWrite;
}): Promise<{
  id: string;
  requester_id: string;
  permission: Permission;
  status: string;
  requester_name: string | null;
  requester_email: string;
} | null> {
  return auditedAccessMutation({
    mutationCtes: `created AS (
                     INSERT INTO access_requests
                       (requester_id, permission, reason, requested_duration)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (requester_id, permission) WHERE status = 'pending'
                     DO NOTHING
                     RETURNING id, requester_id, permission, status
                   )`,
    mutationSql: `SELECT created.id, created.requester_id, created.permission, created.status,
                         users.name AS requester_name, users.email AS requester_email
                    FROM created
                    JOIN users ON users.id = created.requester_id`,
    mutationParams: [
      input.requesterId,
      input.permission,
      input.reason,
      input.requestedDuration,
    ],
    audit: input.audit,
    afterFromMutation: ['permission', 'status'],
  });
}

export async function cancelAccessRequest(input: {
  requestId: string;
  requesterId: string;
  audit: AuditWrite;
}): Promise<{ id: string; permission: Permission; status: string } | null> {
  return auditedAccessMutation({
    mutationSql: `UPDATE access_requests
                     SET status = 'cancelled'
                   WHERE id = $1 AND requester_id = $2 AND status = 'pending'
                   RETURNING id, permission, status`,
    mutationParams: [input.requestId, input.requesterId],
    audit: input.audit,
    afterFromMutation: ['permission', 'status'],
  });
}

export async function approveAccessRequest(input: {
  requestId: string;
  decidedBy: string;
  duration: number | null;
  audit: AuditWrite;
}): Promise<{
  id: string;
  permission: Permission;
  status: string;
  expires_at: string | null;
  grant_id: string;
  requester_id: string;
  requester_name: string | null;
  requester_email: string;
} | null> {
  return auditedAccessMutation({
    mutationCtes: `approved AS (
                     UPDATE access_requests
                        SET status = 'approved', decided_by = $2, decided_at = now(),
                            decision_note = NULL
                      WHERE id = $1 AND status = 'pending'
                      RETURNING id, requester_id, permission, status
                   ),
                   new_grant AS (
                     INSERT INTO permission_grants
                       (user_id, permission, granted_by, granted_at, expires_at, request_id)
                     SELECT requester_id, permission, $2, now(),
                            CASE WHEN $3::smallint IS NULL THEN NULL
                                 ELSE now() + make_interval(days => $3::integer)
                            END,
                            id
                       FROM approved
                     RETURNING id, request_id, expires_at
                   )`,
    mutationSql: `SELECT approved.id, approved.requester_id, approved.permission, approved.status,
                         new_grant.expires_at::text AS expires_at, new_grant.id AS grant_id,
                         users.name AS requester_name, users.email AS requester_email
                    FROM approved
                    JOIN new_grant ON new_grant.request_id = approved.id
                    JOIN users ON users.id = approved.requester_id`,
    mutationParams: [input.requestId, input.decidedBy, input.duration],
    audit: input.audit,
    afterFromMutation: ['permission', 'status', 'expires_at'],
  });
}

export async function declineAccessRequest(input: {
  requestId: string;
  decidedBy: string;
  decisionNote: string;
  audit: AuditWrite;
}): Promise<{
  id: string;
  permission: Permission;
  status: string;
  requester_id: string;
  requester_name: string | null;
  requester_email: string;
} | null> {
  return auditedAccessMutation({
    mutationCtes: `declined AS (
                     UPDATE access_requests
                        SET status = 'declined', decided_by = $2, decided_at = now(),
                            decision_note = $3
                      WHERE id = $1 AND status = 'pending'
                      RETURNING id, requester_id, permission, status
                   )`,
    mutationSql: `SELECT declined.id, declined.requester_id, declined.permission, declined.status,
                         users.name AS requester_name, users.email AS requester_email
                    FROM declined
                    JOIN users ON users.id = declined.requester_id`,
    mutationParams: [input.requestId, input.decidedBy, input.decisionNote],
    audit: input.audit,
    afterFromMutation: ['permission', 'status'],
  });
}

export async function revokePermissionGrant(input: {
  grantId: string;
  revokedBy: string;
  audit: AuditWrite;
}): Promise<{
  id: string;
  permission: Permission;
  expires_at: string | null;
  revoked_at: string;
} | null> {
  return auditedAccessMutation({
    mutationSql: `UPDATE permission_grants
                     SET revoked_at = now(), revoked_by = $2
                   WHERE id = $1
                     AND revoked_at IS NULL
                     AND (expires_at IS NULL OR expires_at > now())
                   RETURNING id, permission, expires_at::text AS expires_at,
                             revoked_at::text AS revoked_at, 'revoked'::text AS status`,
    mutationParams: [input.grantId, input.revokedBy],
    audit: input.audit,
    afterFromMutation: ['permission', 'status', 'expires_at', 'revoked_at'],
  });
}

export async function auditExpiredPermissionGrants(): Promise<number> {
  const [row] = await query<{ count: number }>(
    `WITH expired AS (
       UPDATE permission_grants
          SET expiration_audited_at = now()
        WHERE expires_at <= now()
          AND revoked_at IS NULL
          AND expiration_audited_at IS NULL
        RETURNING id, permission, expires_at, expiration_audited_at
     ),
     logged AS (
       INSERT INTO audit_logs (
         actor_id, actor_email, actor_role, action, entity_type, entity_id,
         entity_label, "before", "after", ip, user_agent, request_id
       )
       SELECT NULL, NULL, NULL, 'access.grant_expired', 'permission_grant',
              id::text, permission,
              jsonb_build_object('status', 'active', 'expires_at', expires_at),
              jsonb_build_object(
                'status', 'expired',
                'expires_at', expires_at,
                'expiration_audited_at', expiration_audited_at
              ),
              NULL, NULL, NULL
         FROM expired
       RETURNING id
     )
     SELECT count(*)::int AS count FROM logged`,
  );
  return row?.count ?? 0;
}

export type SessionUserRow = Omit<UserRow, 'password_hash'>;

const USER_COLUMNS =
  'id, name, email, role, password_hash, email_verified, token_version, must_change_password, disabled_at, is_super_admin';
const SESSION_USER_COLUMNS =
  'id, name, email, role, email_verified, token_version, must_change_password, disabled_at, is_super_admin';

export async function createTalentUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  field: string;
  country: string | null;
  availability: string | null;
}): Promise<{ id: string; role: Role } | null> {
  // One statement, so a user row can never exist without its profile row.
  const row = await queryOne<{ id: string }>(
    `WITH new_user AS (
       INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'talent')
       RETURNING id
     )
     INSERT INTO talent_profiles (user_id, name, field, country, availability)
     SELECT id, $3, $4, $5, $6 FROM new_user
     RETURNING user_id AS id`,
    [input.email, input.passwordHash, input.name, input.field, input.country, input.availability],
  );
  return row ? { id: row.id, role: 'talent' } : null;
}

export async function createEmployerUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  company: string;
  needs: string[];
}): Promise<{ id: string; role: Role } | null> {
  const row = await queryOne<{ id: string }>(
    `WITH new_user AS (
       INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'employer')
       RETURNING id
     )
     INSERT INTO employer_profiles (user_id, name, company, needs)
     SELECT id, $3, $4, $5 FROM new_user
     RETURNING user_id AS id`,
    [input.email, input.passwordHash, input.name, input.company, input.needs],
  );
  return row ? { id: row.id, role: 'employer' } : null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
}

export async function findSessionUserById(id: string): Promise<SessionUserRow | null> {
  return queryOne<SessionUserRow>(
    `SELECT ${SESSION_USER_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );
}

export async function listActiveGrantedPermissions(userId: string): Promise<Permission[]> {
  const rows = await query<{ permission: Permission }>(
    `SELECT permission
       FROM permission_grants
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())`,
    [userId],
  );
  return rows.map(({ permission }) => permission);
}

export type AccessRequestRow = {
  id: string;
  permission: Permission;
  reason: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  requested_duration: number | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  grant_expires_at: string | null;
};

export async function listAccessRequestsByRequester(
  requesterId: string,
): Promise<AccessRequestRow[]> {
  return query<AccessRequestRow>(
    `SELECT r.id, r.permission, r.reason, r.status, r.requested_duration,
            r.created_at::text AS created_at, r.decided_at::text AS decided_at,
            r.decision_note, g.expires_at::text AS grant_expires_at
       FROM access_requests r
       LEFT JOIN permission_grants g ON g.request_id = r.id
      WHERE r.requester_id = $1
      ORDER BY r.created_at DESC, r.id DESC`,
    [requesterId],
  );
}

export async function listPendingAccessRequests(): Promise<
  (AccessRequestRow & {
    requester_id: string;
    requester_name: string | null;
    requester_email: string;
    requester_role: Role;
    grant_expires_at: null;
  })[]
> {
  return query(
    `SELECT r.id, r.permission, r.reason, r.status, r.requested_duration,
            r.created_at::text AS created_at, r.decided_at::text AS decided_at,
            r.decision_note, NULL::text AS grant_expires_at,
            u.id AS requester_id, u.name AS requester_name, u.email AS requester_email,
            u.role AS requester_role
       FROM access_requests r
       JOIN users u ON u.id = r.requester_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC, r.id ASC`,
  );
}

export async function listActivePermissionGrants(): Promise<
  {
    id: string;
    user_id: string;
    user_name: string | null;
    user_email: string;
    user_role: Role;
    grantor_name: string | null;
    grantor_email: string;
    permission: Permission;
    granted_by: string;
    granted_at: string;
    expires_at: string | null;
    request_id: string | null;
  }[]
> {
  return query(
    `SELECT g.id, g.user_id, u.name AS user_name, u.email AS user_email,
            u.role AS user_role, granted_by_user.name AS grantor_name,
            granted_by_user.email AS grantor_email, g.permission, g.granted_by,
            g.granted_at::text AS granted_at, g.expires_at::text AS expires_at,
            g.request_id
       FROM permission_grants g
       JOIN users u ON u.id = g.user_id
       JOIN users granted_by_user ON granted_by_user.id = g.granted_by
      WHERE g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
      ORDER BY g.granted_at DESC, g.id DESC`,
  );
}

export type NotificationRow = {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export async function listNotificationRecipientIds(
  audience: 'super_admin' | 'admin_portal' | 'consultation_update',
): Promise<string[]> {
  const rows = audience === 'super_admin'
    ? await query<{ id: string }>(
      `SELECT id FROM users
        WHERE is_super_admin AND role = 'admin' AND disabled_at IS NULL`,
    )
    : audience === 'admin_portal'
      ? await query<{ id: string }>(
      `SELECT id FROM users
        WHERE role IN ('admin', 'project_manager', 'hr_manager', 'data_admin')
          AND disabled_at IS NULL`,
      )
      : await query<{ id: string }>(
        `SELECT DISTINCT u.id
           FROM users u
          WHERE u.disabled_at IS NULL
            AND u.role IN ('admin', 'project_manager', 'hr_manager', 'data_admin')
            AND EXISTS (
              SELECT 1 FROM permission_grants g
               WHERE g.user_id = u.id
                 AND g.permission = 'consultation.update'
                 AND g.revoked_at IS NULL
                 AND (g.expires_at IS NULL OR g.expires_at > now())
            )`,
      );
  return rows.map(({ id }) => id);
}

export async function createNotification(input: {
  userId: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  href: string | null;
  dedupeSeconds?: number;
  dedupeKey?: string;
}): Promise<boolean> {
  let row: { id: string } | null;
  if (input.dedupeSeconds) {
    row = await queryOne<{ id: string }>(
      `INSERT INTO notifications
         (user_id, type, severity, title, body, href, dedupe_key, dedupe_until)
       VALUES ($1, $2, $3, $4, $5, $6, $2, now() + make_interval(secs => $7::integer))
       ON CONFLICT (user_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL
       DO UPDATE SET severity = EXCLUDED.severity, title = EXCLUDED.title, body = EXCLUDED.body, href = EXCLUDED.href,
                     read_at = NULL, created_at = now(), dedupe_until = EXCLUDED.dedupe_until
         WHERE notifications.dedupe_until <= now()
       RETURNING id`,
      [input.userId, input.type, input.severity, input.title, input.body, input.href, input.dedupeSeconds],
    );
  } else if (input.dedupeKey) {
    row = await queryOne<{ id: string }>(
       `INSERT INTO notifications (user_id, type, severity, title, body, href, dedupe_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        RETURNING id`,
       [input.userId, input.type, input.severity, input.title, input.body, input.href, input.dedupeKey],
    );
  } else {
    row = await queryOne<{ id: string }>(
       `INSERT INTO notifications (user_id, type, severity, title, body, href)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
       [input.userId, input.type, input.severity, input.title, input.body, input.href],
    );
  }
  return row !== null;
}

export async function markStaleConsultationsNotified(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `UPDATE consultation_bookings
        SET stale_notified_at = now()
      WHERE status = 'new'
        AND created_at <= now() - interval '48 hours'
        AND stale_notified_at IS NULL
      RETURNING id`,
  );
  return rows.map(({ id }) => id);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM notifications
      WHERE user_id = $1 AND read_at IS NULL AND deleted_at IS NULL`,
    [userId],
  );
  return Number(row?.count ?? 0);
}

export async function countNotifications(
  userId: string,
  unreadOnly: boolean,
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM notifications
      WHERE user_id = $1 AND deleted_at IS NULL
        AND ($2::boolean = false OR read_at IS NULL)`,
    [userId, unreadOnly],
  );
  return Number(row?.count ?? 0);
}

export async function listNotifications(input: {
  userId: string;
  limit: number;
  offset: number;
  unreadOnly: boolean;
}): Promise<NotificationRow[]> {
  return query<NotificationRow>(
    `SELECT id, type, severity, title, body, href, read_at::text AS read_at,
            created_at::text AS created_at
       FROM notifications
      WHERE user_id = $1 AND deleted_at IS NULL
        AND ($2::boolean = false OR read_at IS NULL)
      ORDER BY created_at DESC, id DESC
      LIMIT $3 OFFSET $4`,
    [input.userId, input.unreadOnly, input.limit, input.offset],
  );
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE notifications SET read_at = now()
      WHERE user_id = $1 AND id = $2 AND read_at IS NULL AND deleted_at IS NULL
      RETURNING id`,
    [userId, notificationId],
  );
  return row !== null;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE notifications SET read_at = now()
      WHERE user_id = $1 AND read_at IS NULL AND deleted_at IS NULL
      RETURNING id`,
    [userId],
  );
  return rows.length;
}

/**
 * The session-safe view of one account by id, for checks that need to know a
 * fact about the account rather than act on it - whether an email was already
 * verified, say - without ever reading the password hash.
 */
export async function findUserById(id: string): Promise<SessionUserRow | null> {
  return findSessionUserById(id);
}

export async function deleteUser(id: string): Promise<void> {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

export async function markEmailVerified(id: string): Promise<void> {
  await query('UPDATE users SET email_verified = true WHERE id = $1', [id]);
}

/**
 * Ends every session for this account, including the current one. Used by "log
 * out everywhere" and by the password reset flow.
 */
export async function bumpTokenVersion(id: string): Promise<void> {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
}

/** Bumping token_version invalidates every session issued before it. */
export async function setPassword(
  id: string,
  passwordHash: string,
  options: { clearMustChange?: boolean } = {},
  audit?: AuditWrite,
): Promise<void> {
  const mutationSql = `UPDATE users
        SET password_hash = $2,
            must_change_password = CASE WHEN $3::boolean THEN false ELSE must_change_password END,
            token_version = token_version + 1
      WHERE id = $1
      RETURNING id`;
  const mutationParams = [id, passwordHash, options.clearMustChange ?? false];
  if (audit) {
    await auditedMutation<{ id: string }>({ mutationSql, mutationParams, audit });
    return;
  }
  await query(mutationSql, mutationParams);
}

export type TalentProfile = {
  name: string;
  field: string;
  country: string | null;
  availability: string | null;
};

export type EmployerProfile = {
  name: string;
  company: string;
  needs: string[];
};

export async function getTalentProfile(userId: string): Promise<TalentProfile | null> {
  return queryOne<TalentProfile>(
    'SELECT name, field, country, availability FROM talent_profiles WHERE user_id = $1',
    [userId],
  );
}

export async function getEmployerProfile(userId: string): Promise<EmployerProfile | null> {
  return queryOne<EmployerProfile>(
    'SELECT name, company, needs FROM employer_profiles WHERE user_id = $1',
    [userId],
  );
}

/**
 * Saves the two talent fields the dashboard owns. Each column is written only
 * when the caller supplied it, so changing availability cannot blank a country
 * the talent set earlier, and an undefined value is not the same instruction as
 * an empty one: an empty country clears the column (see talentProfileSchema).
 * The user id always comes from the session, never from a request body. Returns
 * the row as it now stands, or null when the account has no talent profile.
 */
export async function updateTalentProfile(input: {
  userId: string;
  availability?: string;
  country?: string;
}): Promise<TalentProfile | null> {
  return queryOne<TalentProfile>(
    `UPDATE talent_profiles
        SET availability = CASE WHEN $2::boolean THEN $3 ELSE availability END,
            country = CASE WHEN $4::boolean THEN $5 ELSE country END
      WHERE user_id = $1
      RETURNING name, field, country, availability`,
    [
      input.userId,
      input.availability !== undefined,
      input.availability ?? null,
      input.country !== undefined,
      input.country ? input.country : null,
    ],
  );
}

export type TokenType = 'verify' | 'reset';

export async function insertAuthToken(input: {
  userId: string;
  type: TokenType;
  tokenHash: string;
  ttlSeconds: number;
}): Promise<void> {
  await query(
    `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [input.userId, input.type, input.tokenHash, input.ttlSeconds],
  );
}

/**
 * Marks a token used and returns its owner, in a single statement, so a token
 * cannot be redeemed twice even if two requests arrive at the same moment.
 */
export async function consumeAuthToken(tokenHash: string, type: TokenType): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE auth_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND type = $2
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id`,
    [tokenHash, type],
  );
  return row?.user_id ?? null;
}

/**
 * The owner of a token that has already been redeemed. A link works once, but
 * the person holding it deserves to be told "this was already done" rather
 * than "expired", and only the stored hash is needed to recognise their link.
 */
export async function findSpentAuthToken(
  tokenHash: string,
  type: TokenType,
): Promise<{ userId: string } | null> {
  const row = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM auth_tokens WHERE token_hash = $1 AND type = $2 AND used_at IS NOT NULL',
    [tokenHash, type],
  );
  return row ? { userId: row.user_id } : null;
}

export async function logAuthEvent(input: {
  userId: string | null;
  event: string;
  ipHash: string | null;
}): Promise<void> {
  await query('INSERT INTO auth_events (user_id, event, ip_hash) VALUES ($1, $2, $3)', [
    input.userId,
    input.event,
    input.ipHash,
  ]);
}

export type NewsletterStatus = 'pending' | 'confirmed' | 'unsubscribed';

export type LeadContact = {
  name: string;
  email: string;
  phone: string | null;
  organisation: string;
};

/**
 * A stored lead. The id comes back so the notification email can name the row
 * the team will find, and so a caller can tell a write from a no-op.
 */
export async function insertEventRegistration(
  input: LeadContact & {
    eventSlug: string;
    role: string | null;
    question: string | null;
  },
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO event_registrations (event_slug, name, email, phone, organisation, role, question)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.eventSlug,
      input.name,
      input.email,
      input.phone,
      input.organisation,
      input.role,
      input.question,
    ],
  );
  return row?.id ?? null;
}

/**
 * The event a registration is for, read from the database rather than trusted
 * from the request: its published state, title and the form that asked the
 * questions all come from here. A draft event accepts no registrations.
 */
export async function findEventForRegistration(slug: string): Promise<{
  slug: string;
  title: string;
  status: PostStatus;
  event_start: string | null;
  event_end: string | null;
  location_text: string | null;
  is_online: boolean;
  registration_form: unknown | null;
} | null> {
  return queryOne(
    `SELECT slug, title, status,
            ${isoTimestamp('posts', 'event_start')} AS event_start,
            ${isoTimestamp('posts', 'event_end')} AS event_end,
            location_text, is_online, registration_form
       FROM posts WHERE slug = $1 AND type = 'event'`,
    [slug],
  );
}

export async function insertConsultationBooking(
  input: LeadContact & {
    teamSize: string | null;
    service: string | null;
    meetingFormat: string;
    preferredDate: string;
    preferredSlot: string;
    notes: string | null;
  },
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO consultation_bookings
       (name, email, phone, organisation, team_size, service, meeting_format,
        preferred_date, preferred_slot, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      input.name,
      input.email,
      input.phone,
      input.organisation,
      input.teamSize,
      input.service,
      input.meetingFormat,
      input.preferredDate,
      input.preferredSlot,
      input.notes,
    ],
  );
  return row?.id ?? null;
}

/**
 * The signed in employer's own most recent consultation request.
 *
 * Matched on the address the account signed up with, so a caller cannot name a
 * row: the only input is the session's own email. There is no status column on
 * consultation_bookings and nothing here reads the team's diary, so the caller
 * presents this as a request the team confirms by email, never as a booked
 * meeting. The date is formatted in SQL so it arrives as a plain calendar day
 * rather than as a driver-specific Date.
 */
const CONSULTATION_SUMMARY = `SELECT organisation,
         meeting_format,
         to_char(preferred_date, 'YYYY-MM-DD') AS preferred_date,
         preferred_slot,
         to_char(created_at, 'YYYY-MM-DD') AS requested_on`;

export type ConsultationRequestRow = {
  organisation: string;
  meeting_format: string;
  preferred_date: string;
  preferred_slot: string;
  requested_on: string;
};

export async function findLatestConsultationByEmail(
  email: string,
): Promise<ConsultationRequestRow | null> {
  return queryOne<ConsultationRequestRow>(
    `${CONSULTATION_SUMMARY}
       FROM consultation_bookings
      WHERE email = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [email],
  );
}

export async function insertEnquiry(input: {
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  source: string;
}): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO enquiries (name, email, phone, subject, message, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.name, input.email, input.phone, input.subject, input.message, input.source],
  );
  return row?.id ?? null;
}

/**
 * Adds an address to the list, or refreshes its confirmation link when the row
 * has not been confirmed yet. A confirmed row is left alone and no row comes
 * back, which is the signal not to send another confirmation email. One
 * statement, so two simultaneous signups cannot create two rows for one address
 * and the returned row is always the one that was actually written.
 */
export async function upsertNewsletterSubscriber(input: {
  email: string;
  tokenHash: string;
  ttlSeconds: number;
}): Promise<{ status: NewsletterStatus } | null> {
  return queryOne<{ status: NewsletterStatus }>(
    `INSERT INTO newsletter_subscribers (email, status, confirm_token_hash, confirm_expires_at)
     VALUES ($1, 'pending', $2, now() + make_interval(secs => $3))
     ON CONFLICT (email) DO UPDATE
       SET status = 'pending',
           confirm_token_hash = EXCLUDED.confirm_token_hash,
           confirm_expires_at = EXCLUDED.confirm_expires_at
       WHERE newsletter_subscribers.status <> 'confirmed'
     RETURNING status`,
    [input.email, input.tokenHash, input.ttlSeconds],
  );
}

/**
 * The subscription a confirmation link belongs to, whatever its state. The link
 * itself is never stored - only this hash - so answering a replayed link needs
 * the hash to still be here after success.
 */
export async function findNewsletterSubscriberByTokenHash(
  tokenHash: string,
): Promise<{ email: string; status: NewsletterStatus } | null> {
  return queryOne<{ email: string; status: NewsletterStatus }>(
    'SELECT email, status FROM newsletter_subscribers WHERE confirm_token_hash = $1',
    [tokenHash],
  );
}

/**
 * The state of one address, for telling a confirmed subscriber that they are
 * already on the list instead of sending them into a confirmation loop.
 */
export async function findNewsletterSubscriberByEmail(
  email: string,
): Promise<{ status: NewsletterStatus } | null> {
  return queryOne<{ status: NewsletterStatus }>(
    'SELECT status FROM newsletter_subscribers WHERE email = $1',
    [email],
  );
}

/**
 * Turns a pending subscription into a confirmed one. Single statement, so a
 * link cannot be redeemed twice even if two requests arrive at the same moment,
 * and an expired link confirms nothing. The link's hash is deliberately kept
 * rather than cleared: it is one-way, and a row that still carries it is how a
 * replayed link is answered with "already confirmed" instead of an error.
 */
export async function confirmNewsletterSubscriber(tokenHash: string): Promise<string | null> {
  const row = await queryOne<{ email: string }>(
    `UPDATE newsletter_subscribers
        SET status = 'confirmed',
            confirmed_at = now(),
            confirm_expires_at = NULL
      WHERE confirm_token_hash = $1
        AND status = 'pending'
        AND confirm_expires_at > now()
      RETURNING email`,
    [tokenHash],
  );
  return row?.email ?? null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Content admin: categories and posts.

   Timestamps come back as ISO-8601 UTC strings rather than driver Date
   objects, because these rows are serialized straight into public JSON and
   into the admin UI, and one format everywhere means no consumer has to
   guess what it is holding.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Postgres -> `2026-10-21T09:30:00.000Z`, safe to JSON.stringify.
 *
 * Each takes the table's alias on purpose: `created_at` exists on both `posts`
 * and `categories`, and the admin list joins the two, so an unqualified column
 * is ambiguous and the query fails outright rather than picking one.
 */
const isoTimestamp = (table: string, column: string): string =>
  `to_char(${table}.${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export type PostStatus = 'draft' | 'published' | 'scheduled';

export type PostType = 'blog' | 'event';

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  post_count: number;
};

export type PostRow = {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  /** Null on an event: a category is a topic on a written piece. */
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  cover_image_url: string | null;
  cover_image_thumb_url: string | null;
  link_label: string | null;
  link_url: string | null;
  event_start: string | null;
  event_end: string | null;
  location_text: string | null;
  is_online: boolean;
  registration_url: string | null;
  registration_intro: string | null;
  registration_button_label: string | null;
  /** The event's editable registration form, or null for the built-in fields. */
  registration_form: unknown | null;
  status: PostStatus;
  published_at: string | null;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

const POST_COLUMNS = `p.id, p.type, p.slug, p.title, p.excerpt, p.body, p.category_id,
         c.name AS category_name, c.slug AS category_slug,
         p.cover_image_url, p.cover_image_thumb_url, p.link_label, p.link_url,
         ${isoTimestamp('p', 'event_start')} AS event_start,
         ${isoTimestamp('p', 'event_end')} AS event_end,
         p.location_text, p.is_online, p.registration_url,
         p.registration_intro, p.registration_button_label, p.registration_form, p.status,
         ${isoTimestamp('p', 'published_at')} AS published_at,
         ${isoTimestamp('p', 'publish_at')} AS publish_at,
         ${isoTimestamp('p', 'created_at')} AS created_at,
         ${isoTimestamp('p', 'updated_at')} AS updated_at,
         p.author_id, ${isoTimestamp('p', 'deleted_at')} AS deleted_at, p.deleted_by`;

// LEFT JOIN, not JOIN: an event carries no category, and an inner join would
// quietly drop every event from every list.
const POST_FROM = `FROM posts p LEFT JOIN categories c ON c.id = p.category_id`;

export async function listCategories(): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    `SELECT c.id, c.name, c.slug, ${isoTimestamp('c', 'created_at')} AS created_at,
            (SELECT count(*) FROM posts p WHERE p.category_id = c.id AND p.deleted_at IS NULL)::int AS post_count
       FROM categories c
      ORDER BY c.name`,
  );
}

export async function findCategoryBySlug(slug: string): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>('SELECT id FROM categories WHERE slug = $1', [slug]);
}

export async function findCategoryById(id: string): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>(
    `SELECT c.id, c.name, c.slug, ${isoTimestamp('c', 'created_at')} AS created_at,
            (SELECT count(*) FROM posts p WHERE p.category_id = c.id AND p.deleted_at IS NULL)::int AS post_count
       FROM categories c WHERE c.id = $1`,
    [id],
  );
}

export async function insertCategory(input: {
  name: string;
  slug: string;
}): Promise<{ id: string } | null> {
  const row = await queryOne<{ id: string }>(
    'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id',
    [input.name, input.slug],
  );
  return row;
}

/** A rename is a plain update: the slug may change, and posts keep their row. */
export async function updateCategory(input: {
  id: string;
  name: string;
  slug: string;
}): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>(
    'UPDATE categories SET name = $2, slug = $3 WHERE id = $1 RETURNING id',
    [input.id, input.name, input.slug],
  );
}

/**
 * Move every post in one category to another, then the caller deletes the
 * emptied one. Two statements, so a post cannot appear in neither category
 * between them; the foreign key refuses the delete if any row was left behind.
 */
export async function movePostsToCategory(fromId: string, toId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    'UPDATE posts SET category_id = $2, updated_at = now() WHERE category_id = $1 AND deleted_at IS NULL RETURNING id',
    [fromId, toId],
  );
  return rows.length;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

export type PostListFilter = {
  type?: PostType;
  status?: PostStatus;
  categoryId?: string;
  search?: string;
  deletedOnly?: boolean;
};

/**
 * The admin list. Includes drafts, because that is the point of the panel; the
 * public query below is the only one that may read a draft, and it never does.
 */
export async function listPostsForAdmin(filter: PostListFilter = {}): Promise<PostRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.type) {
    params.push(filter.type);
    where.push(`p.type = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`p.status = $${params.length}`);
  }
  if (filter.categoryId) {
    params.push(filter.categoryId);
    where.push(`p.category_id = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    where.push(`(p.title ILIKE $${params.length} OR p.excerpt ILIKE $${params.length})`);
  }
  where.push(filter.deletedOnly ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL');

  return query<PostRow>(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.updated_at DESC`,
    params,
  );
}

/**
 * What the public site reads. Drafts are excluded in SQL rather than filtered
 * out afterwards, so there is no code path that could forget: a draft row never
 * leaves the database through this function.
 */
export async function listPublishedPosts(type?: PostType): Promise<PostRow[]> {
  return query<PostRow>(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
      WHERE p.deleted_at IS NULL
        AND (p.status = 'published' OR (p.status = 'scheduled' AND p.publish_at <= now()))
      ${type ? 'AND p.type = $1' : ''}
      ORDER BY coalesce(p.published_at, p.publish_at) DESC`,
    type ? [type] : [],
  );
}

export async function findPublishedPostBySlug(slug: string): Promise<PostRow | null> {
  return queryOne<PostRow>(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
      WHERE p.slug = $1 AND p.deleted_at IS NULL
        AND (p.status = 'published' OR (p.status = 'scheduled' AND p.publish_at <= now()))`,
    [slug],
  );
}

/** A public registration may only name an event that is actually live. */
export async function isPublishedEventSlug(slug: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM posts WHERE slug = $1 AND type = 'event' AND deleted_at IS NULL
      AND (status = 'published' OR (status = 'scheduled' AND publish_at <= now())) LIMIT 1`,
    [slug],
  );
  return Boolean(row);
}

export async function findPostById(id: string): Promise<PostRow | null> {
  return queryOne<PostRow>(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = $1`, [id]);
}

export async function insertPost(input: {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId: string | null;
  coverImageUrl: string | null;
  coverImageThumbUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  locationText: string | null;
  isOnline: boolean;
  registrationUrl: string | null;
  registrationIntro: string | null;
  registrationButtonLabel: string | null;
  registrationForm: unknown | null;
  status: PostStatus;
  publishAt: string | null;
  authorId: string;
  audit?: AuditWrite;
}): Promise<string | null> {
  const mutationSql = `INSERT INTO posts
       (type, slug, title, excerpt, body, category_id, cover_image_url, cover_image_thumb_url,
        link_label, link_url, event_start, event_end, location_text, is_online, registration_url,
        registration_intro, registration_button_label, registration_form, status, publish_at, published_at,
        author_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17, $18::jsonb, $19, $20,
             CASE WHEN $19 = 'published' THEN now() ELSE NULL END, $21)
     RETURNING id, type, slug, title, status`;
  const params = [
      input.type,
      input.slug,
      input.title,
      input.excerpt,
      input.body,
      input.categoryId,
      input.coverImageUrl,
      input.coverImageThumbUrl,
      input.linkLabel,
      input.linkUrl,
      input.eventStart,
      input.eventEnd,
      input.locationText,
      input.isOnline,
      input.registrationUrl,
      input.registrationIntro,
      input.registrationButtonLabel,
      input.registrationForm === null ? null : JSON.stringify(input.registrationForm),
      input.status,
      input.publishAt,
      input.authorId,
  ];
  if (input.audit) {
    const [row] = await auditedMutation<{ id: string }>({
      mutationSql,
      mutationParams: params,
      audit: input.audit,
    });
    return row?.id ?? null;
  }
  const row = await queryOne<{ id: string }>(mutationSql, params);
  return row?.id ?? null;
}

/**
 * Publish stamps published_at; unpublish clears it. Both are written from the
 * server rather than sent by the client, so the published date is always the
 * moment the change happened and never a value a request made up.
 */
export async function updatePost(input: {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId: string | null;
  coverImageUrl: string | null;
  coverImageThumbUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  locationText: string | null;
  isOnline: boolean;
  registrationUrl: string | null;
  registrationIntro: string | null;
  registrationButtonLabel: string | null;
  registrationForm: unknown | null;
  status: PostStatus;
  publishAt: string | null;
  audit?: AuditWrite;
}): Promise<{ id: string } | null> {
  const mutationSql = `UPDATE posts
        SET type = $2,
            slug = $3,
            title = $4,
            excerpt = $5,
            body = $6,
            category_id = $7,
            cover_image_url = $8,
            cover_image_thumb_url = $9,
            link_label = $10,
            link_url = $11,
            event_start = $12,
            event_end = $13,
            location_text = $14,
            is_online = $15,
            registration_url = $16,
            registration_intro = $17,
            registration_button_label = $18,
            registration_form = $19::jsonb,
            status = $20,
            publish_at = $21,
            published_at = CASE
              WHEN $20 = 'published' THEN coalesce(published_at, now())
              ELSE NULL END,
            updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, type, slug, title, status`;
  const params = [
      input.id,
      input.type,
      input.slug,
      input.title,
      input.excerpt,
      input.body,
      input.categoryId,
      input.coverImageUrl,
      input.coverImageThumbUrl,
      input.linkLabel,
      input.linkUrl,
      input.eventStart,
      input.eventEnd,
      input.locationText,
      input.isOnline,
      input.registrationUrl,
      input.registrationIntro,
      input.registrationButtonLabel,
      input.registrationForm === null ? null : JSON.stringify(input.registrationForm),
      input.status,
      input.publishAt,
  ];
  if (input.audit) {
    const [row] = await auditedMutation<{ id: string }>({
      mutationSql,
      mutationParams: params,
      audit: input.audit,
    });
    return row ? { id: row.id } : null;
  }
  return queryOne<{ id: string }>(mutationSql, params);
}

export async function deletePost(id: string, audit?: AuditWrite): Promise<boolean> {
  const mutationSql = `UPDATE posts SET deleted_at = now(), deleted_by = $2
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, type, slug, title, status`;
  const rows = audit
    ? await auditedMutation<{ id: string }>({
      mutationSql,
      mutationParams: [id, audit.actor.id],
      audit,
    })
    : await query<{ id: string }>(mutationSql, [id, null]);
  return rows.length > 0;
}

export async function restorePost(id: string, audit?: AuditWrite): Promise<boolean> {
  const mutationSql = `UPDATE posts SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
    WHERE id = $1 AND deleted_at IS NOT NULL
    RETURNING id, type, slug, title, status`;
  const rows = audit
    ? await auditedMutation<{ id: string }>({ mutationSql, mutationParams: [id], audit })
    : await query<{ id: string }>(mutationSql, [id]);
  return rows.length > 0;
}

export async function permanentlyDeletePost(id: string, audit?: AuditWrite): Promise<boolean> {
  const mutationSql = `DELETE FROM posts WHERE id = $1 AND deleted_at IS NOT NULL
    RETURNING id, type, slug, title, status`;
  const rows = audit
    ? await auditedMutation<{ id: string }>({ mutationSql, mutationParams: [id], audit })
    : await query<{ id: string }>(mutationSql, [id]);
  return rows.length > 0;
}

/**
 * The published slugs, for the sitemap. No bodies, so this stays small.
 *
 * The type travels with each slug because the public path depends on it now:
 * a blog post lives at /blog/<slug> and an event at /events/<slug>.
 *
 * `updated_at` travels too: it is a real modification date the row carries, so
 * the sitemap can state one instead of leaving lastmod out or stamping the build
 * clock onto every URL.
 */
export async function listPublishedSlugs(): Promise<
  { slug: string; type: PostType; updated_at: string }[]
> {
  return query<{ slug: string; type: PostType; updated_at: string }>(
    `SELECT slug, type, ${isoTimestamp('posts', 'updated_at')} AS updated_at
       FROM posts WHERE deleted_at IS NULL
         AND (status = 'published' OR (status = 'scheduled' AND publish_at <= now()))
       ORDER BY slug`,
  );
}

/** The current slug for an old one, so a shared link keeps working. */
export async function findPostSlugRedirect(
  type: PostType,
  oldSlug: string,
): Promise<{ slug: string } | null> {
  return queryOne<{ slug: string }>(
    `SELECT p.slug
       FROM post_slug_redirects r
       JOIN posts p ON p.id = r.post_id
      WHERE r.type = $1 AND r.old_slug = $2 AND p.status = 'published' AND p.deleted_at IS NULL`,
    [type, oldSlug],
  );
}

export async function listDueScheduledPosts(): Promise<{
  id: string;
  type: PostType;
  slug: string;
  title: string;
  publish_at: string;
  author_id: string | null;
}[]> {
  return query(
    `SELECT id, type, slug, title, ${isoTimestamp('posts', 'publish_at')} AS publish_at, author_id
       FROM posts
      WHERE status = 'scheduled' AND publish_at <= now() AND deleted_at IS NULL
      ORDER BY publish_at, id`,
  );
}

export async function publishScheduledPost(id: string, audit: AuditWrite): Promise<boolean> {
  const rows = await auditedMutation<{ id: string }>({
    mutationSql: `UPDATE posts
       SET status = 'published', published_at = publish_at, publish_at = NULL, updated_at = now()
       WHERE id = $1 AND status = 'scheduled' AND publish_at <= now() AND deleted_at IS NULL
       RETURNING id, type, slug, title, status`,
    mutationParams: [id],
    audit,
  });
  return rows.length > 0;
}

/** Remember the old URL when a manager changes a published slug. */
export async function recordPostSlugRedirect(
  type: PostType,
  oldSlug: string,
  postId: string,
): Promise<void> {
  await query(
    `INSERT INTO post_slug_redirects (type, old_slug, post_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (type, old_slug) DO UPDATE SET post_id = EXCLUDED.post_id`,
    [type, oldSlug, postId],
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Event registrations.

   Separate from the shared lead tables because a manager reads and exports
   these by event, and the same address is allowed once per event only. Public
   callers never reach these functions except through the write-only endpoint.
   ══════════════════════════════════════════════════════════════════════════ */

export type RegistrationRow = {
  id: string;
  event_slug: string;
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  notes: string | null;
  /** Answers to the event's form, each carrying the question it answered. */
  answers: unknown | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};



export type RegistrationFilter = {
  eventSlug?: string;
  search?: string;
  from?: string;
  to?: string;
  deletedOnly?: boolean;
};

export async function insertRegistration(input: {
  eventSlug: string;
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  notes: string;
  /** Every answer, with the question id and label it was given under. */
  answers?: unknown;
}): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO registrations (event_slug, name, email, phone, organization, notes, answers)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [
      input.eventSlug,
      input.name,
      input.email,
      input.phone,
      input.organization,
      input.notes,
      input.answers === undefined ? null : JSON.stringify(input.answers),
    ],
  );
  return row?.id ?? null;
}

/**
 * The admin list's WHERE clause, built with bind parameters only. `search` is
 * wrapped in wildcards here, never interpolated.
 */
function registrationWhere(filter: RegistrationFilter): { where: string; params: unknown[] } {
  const where: string[] = [filter.deletedOnly ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filter.eventSlug) {
    params.push(filter.eventSlug);
    where.push(`event_slug = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (filter.from) {
    params.push(filter.from);
    where.push(`created_at >= $${params.length}::date`);
  }
  if (filter.to) {
    params.push(filter.to);
    where.push(`created_at < ($${params.length}::date + interval '1 day')`);
  }

  return { where: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params };
}

const REGISTRATION_COLUMNS = `id, event_slug, name, email, phone, organization, notes, answers,
         ${isoTimestamp('registrations', 'created_at')} AS created_at,
         ${isoTimestamp('registrations', 'deleted_at')} AS deleted_at, deleted_by`;

export async function listRegistrations(
  filter: RegistrationFilter & { limit: number; offset: number },
): Promise<RegistrationRow[]> {
  const { where, params } = registrationWhere(filter);
  return query<RegistrationRow>(
    `SELECT ${REGISTRATION_COLUMNS}
       FROM registrations
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit, filter.offset],
  );
}

export async function countRegistrations(filter: RegistrationFilter = {}): Promise<number> {
  const { where, params } = registrationWhere(filter);
  const row = await queryOne<{ total: number }>(
    `SELECT count(*)::int AS total FROM registrations ${where}`,
    params,
  );
  return row?.total ?? 0;
}

/** One row per event that has registrations, with its total. */
export async function listRegistrationEventCounts(): Promise<
  { event_slug: string; total: number }[]
> {
  return query<{ event_slug: string; total: number }>(
    `SELECT event_slug, count(*)::int AS total
       FROM registrations
      WHERE deleted_at IS NULL
      GROUP BY event_slug
      ORDER BY event_slug`,
  );
}

/**
 * Everything matching the filter, newest first, for the CSV export. Capped at
 * 5000 rows so one request cannot pull an unbounded table into memory; a bigger
 * set is exported by filtering per event.
 */
export async function listRegistrationsForExport(
  filter: RegistrationFilter = {},
): Promise<RegistrationRow[]> {
  const { where, params } = registrationWhere(filter);
  return query<RegistrationRow>(
    `SELECT ${REGISTRATION_COLUMNS}
       FROM registrations
       ${where}
      ORDER BY created_at DESC
      LIMIT 10000`,
    params,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Staff accounts, invites and the audit log.

   Staff roles are never written by a public signup. The insert below runs in a
   transaction that relaxes the guard trigger for that one statement; nothing a
   request sends can set that switch.
   ══════════════════════════════════════════════════════════════════════════ */

export type StaffAccountRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  is_super_admin: boolean;
  disabled_at: string | null;
  must_change_password: boolean;
  created_at: string;
};

export async function listStaffAccounts(): Promise<StaffAccountRow[]> {
  return query<StaffAccountRow>(
    `SELECT id, name, email, role, is_super_admin, disabled_at, must_change_password,
            ${isoTimestamp('users', 'created_at')} AS created_at
       FROM users
      WHERE role IN ('manager', 'admin', 'project_manager', 'hr_manager', 'content_manager', 'data_admin')
      ORDER BY created_at ASC`,
  );
}

export type EmailTemplateOverrideRow = {
  template_id: string;
  content: unknown;
};

export async function getEmailTemplateOverride(
  templateId: string,
): Promise<EmailTemplateOverrideRow | null> {
  return queryOne<EmailTemplateOverrideRow>(
    'SELECT template_id, content FROM email_template_overrides WHERE template_id = $1',
    [templateId],
  );
}

export async function listEmailTemplateOverrides(): Promise<EmailTemplateOverrideRow[]> {
  return query<EmailTemplateOverrideRow>(
    'SELECT template_id, content FROM email_template_overrides ORDER BY template_id',
  );
}

export async function saveEmailTemplateOverride(input: {
  templateId: string;
  content: unknown;
  updatedBy: string;
  audit?: AuditWrite;
}): Promise<void> {
  const mutationSql = `INSERT INTO email_template_overrides (template_id, content, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (template_id) DO UPDATE
       SET content = EXCLUDED.content,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`;
  const params = [input.templateId, JSON.stringify(input.content), input.updatedBy];
  if (input.audit) {
    await auditedMutation<{ template_id: string }>({
      mutationSql: `${mutationSql} RETURNING template_id`,
      mutationParams: params,
      audit: input.audit,
    });
    return;
  }
  await query(mutationSql, params);
}

export async function createStaffAccount(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: StaffRole;
  audit?: AuditWrite;
}): Promise<string | null> {
  if (input.audit) {
    const [row] = await auditedMutation<{ id: string }>({
      mutationSql: `WITH staff_write AS (
                      SELECT set_config('pga.staff_write', 'on', true)
                    )
                    INSERT INTO users (name, email, password_hash, role, email_verified, must_change_password)
                    SELECT $1, $2, $3, $4, true, true FROM staff_write
                    RETURNING id, role`,
      mutationParams: [input.name, input.email, input.passwordHash, input.role],
      audit: input.audit,
    });
    return row?.id ?? null;
  }
  const result = await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`INSERT INTO users (name, email, password_hash, role, email_verified, must_change_password)
        VALUES (${input.name}, ${input.email}, ${input.passwordHash}, ${input.role}, true, true)
        RETURNING id`,
  ]);
  const rows = result[1] as { id: string }[] | undefined;
  return rows?.[0]?.id ?? null;
}

export async function setStaffDisabled(id: string, disabled: boolean, audit?: AuditWrite): Promise<boolean> {
  const mutationSql = `WITH revoked_sessions AS (
        UPDATE sessions SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL AND ${disabled ? 'true' : 'false'}
      )
      UPDATE users
        SET disabled_at = ${disabled ? 'now()' : 'NULL'},
            token_version = token_version + 1
      WHERE id = $1
        AND role IN ('manager', 'admin', 'project_manager', 'hr_manager', 'content_manager', 'data_admin')
      RETURNING id, role, (disabled_at IS NOT NULL) AS disabled`;
  const rows = audit
    ? await auditedMutation<{ id: string }>({ mutationSql, mutationParams: [id], audit })
    : await query<{ id: string }>(mutationSql, [id]);
  const row = rows[0] ?? null;
  return Boolean(row);
}

export async function setStaffRole(id: string, role: StaffRole): Promise<boolean> {
  const result = await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`UPDATE users SET role = ${role}, token_version = token_version + 1
         WHERE id = ${id} RETURNING id`,
  ]);
  const rows = result[1] as { id: string }[] | undefined;
  return Boolean(rows?.[0]);
}

/** One staff row by id, for the edit endpoint to compare against. */
export async function findStaffAccount(id: string): Promise<StaffAccountRow | null> {
  return queryOne<StaffAccountRow>(
    `SELECT id, name, email, role, is_super_admin, disabled_at, must_change_password,
            ${isoTimestamp('users', 'created_at')} AS created_at
       FROM users
      WHERE id = $1
        AND role IN ('manager', 'admin', 'project_manager', 'hr_manager', 'content_manager', 'data_admin')`,
    [id],
  );
}

/**
 * Edits the details an administrator may change on another staff account.
 *
 * Runs in the same staff-write transaction as `createStaffAccount` and
 * `setStaffRole`: the trigger on `users` refuses a role written from anywhere
 * else, so the switch is what lets a role change through at all.
 *
 * `token_version` always moves, because every one of these edits ends the
 * account's existing sessions — a rename is harmless, but a role or address
 * change must not leave a cookie in the old role's hands. `resetPassword` sets
 * the flag the portal reads to force the set-password screen; the caller sends
 * the invitation that makes it reachable.
 */
export async function updateStaffAccount(input: {
  id: string;
  name: string | null;
  email: string;
  role: StaffRole;
  isSuperAdmin: boolean;
  resetPassword: boolean;
  audit?: AuditWrite;
}): Promise<boolean> {
  if (input.audit) {
    const rows = await auditedMutation<{ id: string }>({
      mutationSql: `WITH staff_write AS (
                      SELECT set_config('pga.staff_write', 'on', true)
                    )
                    UPDATE users
                       SET name = $1,
                           email = $2,
                           role = $3,
                           is_super_admin = $4,
                           token_version = token_version + 1,
                           must_change_password = CASE WHEN $5 THEN true ELSE must_change_password END
                     WHERE id = $6
                       AND role IN ('manager', 'admin', 'project_manager', 'hr_manager', 'content_manager', 'data_admin')
                       AND EXISTS (SELECT 1 FROM staff_write)
                    RETURNING id, role, is_super_admin`,
      mutationParams: [input.name, input.email, input.role, input.isSuperAdmin, input.resetPassword, input.id],
      audit: input.audit,
    });
    return rows.length > 0;
  }
  const result = await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`UPDATE users
           SET name = ${input.name},
               email = ${input.email},
               role = ${input.role},
               is_super_admin = ${input.isSuperAdmin},
               token_version = token_version + 1,
               must_change_password = CASE
                 WHEN ${input.resetPassword} THEN true
                 ELSE must_change_password END
         WHERE id = ${input.id}
           AND role IN ('manager', 'admin', 'project_manager', 'hr_manager', 'content_manager', 'data_admin')
         RETURNING id`,
  ]);
  const rows = result[1] as { id: string }[] | undefined;
  return Boolean(rows?.[0]);
}

export async function listActiveSuperAdminEmails(): Promise<string[]> {
  const rows = await query<{ email: string }>(
    `SELECT email FROM users
      WHERE is_super_admin AND role = 'admin' AND disabled_at IS NULL
      ORDER BY lower(email), id`,
  );
  return rows.map(({ email }) => email);
}

export function isLastActiveSuperAdminViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === '23514' &&
    'constraint' in error && error.constraint === 'last_active_super_admin_guard';
}

export async function createStaffInvite(input: {
  email: string;
  role: StaffRole;
  tokenHash: string;
  expiresAt: string;
  createdBy: string;
}): Promise<void> {
  await query(
    `INSERT INTO staff_invites (email, role, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.email, input.role, input.tokenHash, input.expiresAt, input.createdBy],
  );
}

export async function findOpenStaffInvite(
  tokenHash: string,
): Promise<{ id: string; email: string; role: StaffRole } | null> {
  return queryOne<{ id: string; email: string; role: StaffRole }>(
    `SELECT id, email, role
       FROM staff_invites
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      LIMIT 1`,
    [tokenHash],
  );
}

export async function useStaffInvite(id: string): Promise<void> {
  await query('UPDATE staff_invites SET used_at = now() WHERE id = $1', [id]);
}

export async function finishStaffPasswordSetup(
  email: string,
  passwordHash: string,
  audit?: AuditWrite,
): Promise<string | null> {
  const mutationSql = `UPDATE users
        SET password_hash = $2,
            must_change_password = false,
            email_verified = true,
            token_version = token_version + 1
      WHERE email = $1 AND disabled_at IS NULL
      RETURNING id, role`;
  if (audit) {
    const [row] = await auditedMutation<{ id: string }>({
      mutationSql,
      mutationParams: [email, passwordHash],
      audit,
    });
    return row?.id ?? null;
  }
  const row = await queryOne<{ id: string }>(mutationSql, [email, passwordHash]);
  return row?.id ?? null;
}

export async function setOwnPassword(
  id: string,
  passwordHash: string,
  audit?: AuditWrite,
): Promise<void> {
  const mutationSql = `UPDATE users
        SET password_hash = $2,
            must_change_password = false,
            token_version = token_version + 1
      WHERE id = $1
      RETURNING id`;
  if (audit) {
    await auditedMutation<{ id: string }>({
      mutationSql,
      mutationParams: [id, passwordHash],
      audit,
    });
    return;
  }
  await query(mutationSql, [id, passwordHash]);
}

export type AuditActor = {
  id: string | null;
  email: string | null;
  role: Role | null;
};

export type AuditWrite = {
  actor: AuditActor;
  action: string;
  entity: { type: string; id?: string | null; label?: string | null };
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export async function insertAuditLogRow(input: AuditWrite): Promise<void> {
  await query(
    `INSERT INTO audit_logs (
       actor_id, actor_email, actor_role, action, entity_type, entity_id,
       entity_label, "before", "after", ip, user_agent, request_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)`,
    [
      input.actor.id,
      input.actor.email,
      input.actor.role,
      input.action,
      input.entity.type,
      input.entity.id ?? null,
      input.entity.label ?? null,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.ip ?? null,
      input.userAgent ?? null,
      input.requestId ?? null,
    ],
  );
}

/**
 * Runs data-modifying CTEs and writes their audit row from the returned
 * mutation row in the same SQL statement. A no-op mutation produces no audit
 * row and no successful result.
 */
export async function auditedMutation<T>(input: {
  mutationCtes?: string;
  mutationSql: string;
  mutationParams: unknown[];
  audit: AuditWrite;
  afterFromMutation?: readonly MutationAuditField[];
}): Promise<T[]> {
  const offset = input.mutationParams.length;
  const p = (index: number) => `$${offset + index}`;
  const audit = input.audit;
  const mutationAuditColumns: Record<MutationAuditField, string> = {
    permission: 'permission',
    status: 'status',
    expires_at: 'expires_at',
    revoked_at: 'revoked_at',
    expiration_audited_at: 'expiration_audited_at',
    counts: 'counts',
    rowCount: 'row_count',
  };
  const dynamicAfter = input.afterFromMutation?.length
    ? `COALESCE(jsonb_build_object(${input.afterFromMutation
        .map((field) => `'${field}', changed.${mutationAuditColumns[field]}`)
        .join(', ')}), ${p(9)}::jsonb)`
    : `${p(9)}::jsonb`;
  const text = `WITH ${input.mutationCtes ? `${input.mutationCtes},` : ''}
    changed AS (${input.mutationSql}),
    logged AS (
      INSERT INTO audit_logs (
        actor_id, actor_email, actor_role, action, entity_type, entity_id,
        entity_label, "before", "after", ip, user_agent, request_id
      )
      SELECT ${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)},
             COALESCE(${p(6)}, to_jsonb(changed)->>'id'),
           ${p(7)}, ${p(8)}::jsonb, ${dynamicAfter}, ${p(10)}, ${p(11)}, ${p(12)}
        FROM changed
      RETURNING id
    )
    SELECT changed.* FROM changed CROSS JOIN logged`;
  return query<T>(text, [
    ...input.mutationParams,
    audit.actor.id,
    audit.actor.email,
    audit.actor.role,
    audit.action,
    audit.entity.type,
    audit.entity.id ?? null,
    audit.entity.label ?? null,
    audit.before ? JSON.stringify(audit.before) : null,
    audit.after ? JSON.stringify(audit.after) : null,
    audit.ip ?? null,
    audit.userAgent ?? null,
    audit.requestId ?? null,
  ]);
}

export type AuditLogFilter = {
  from?: string;
  to?: string;
  actor?: string;
  role?: string;
  action?: string;
  entityType?: string;
  page: number;
  pageSize: number;
};

export type AuditLogRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
};

function auditFilterSql(filter: AuditLogFilter): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (placeholder: string) => string, value: unknown) => {
    params.push(value);
    clauses.push(clause(`$${params.length}`));
  };
  if (filter.from) add((p) => `created_at >= ${p}::date`, filter.from);
  if (filter.to) add((p) => `created_at < (${p}::date + interval '1 day')`, filter.to);
  if (filter.actor) add((p) => `actor_email ILIKE ${p}`, `%${filter.actor}%`);
  if (filter.role) add((p) => `actor_role = ${p}`, filter.role);
  if (filter.action) add((p) => `action = ${p}`, filter.action);
  if (filter.entityType) add((p) => `entity_type = ${p}`, filter.entityType);
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function listAuditLogs(
  filter: AuditLogFilter,
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const { where, params } = auditFilterSql(filter);
  const offset = (filter.page - 1) * filter.pageSize;
  const [rows, count] = await Promise.all([
    query<AuditLogRow>(auditLogSelect(where, `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`), [
      ...params,
      filter.pageSize,
      offset,
    ]),
    queryOne<{ total: string }>(
      `SELECT count(*)::text AS total FROM audit_logs ${where}`,
      params,
    ),
  ]);
  return { rows, total: Number(count?.total ?? 0) };
}

export async function listAuditLogsForExport(filter: AuditLogFilter): Promise<AuditLogRow[]> {
  const { where, params } = auditFilterSql(filter);
  return query<AuditLogRow>(auditLogSelect(where, ''), params);
}

function auditLogSelect(where: string, paging: string): string {
  return `SELECT id, created_at::text AS created_at, actor_id, actor_email, actor_role,
                 action, entity_type, entity_id, entity_label, "before" AS before, "after" AS after,
                 ip, user_agent, request_id
            FROM audit_logs ${where}
           ORDER BY created_at DESC, id DESC ${paging}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Staff data lists. Every filter is a bind parameter; the table is chosen by
   the handler, never by the request.
   ══════════════════════════════════════════════════════════════════════════ */

export type DataFilter = {
  search?: string;
  from?: string;
  to?: string;
  eventSlug?: string;
  deletedOnly?: boolean;
  status?: 'new' | 'contacted' | 'scheduled' | 'done';
  ownerId?: string | 'unassigned';
};

export type DeletableDataType = 'registrations' | 'subscriptions' | 'consultations';

const DELETABLE_DATA_TABLES: Record<DeletableDataType, string> = {
  registrations: 'registrations',
  subscriptions: 'newsletter_subscribers',
  consultations: 'consultation_bookings',
};

export async function setDataRecordDeleted(input: {
  type: DeletableDataType;
  id: string;
  actorId: string;
  deleted: boolean;
  audit: AuditWrite;
}): Promise<boolean> {
  const table = DELETABLE_DATA_TABLES[input.type];
  const existing = await queryOne<{ id: string; name: string | null; event_slug: string | null }>(
    input.type === 'registrations'
      ? 'SELECT id, name, event_slug FROM registrations WHERE id = $1 AND deleted_at IS NULL'
      : input.type === 'consultations'
        ? 'SELECT id, name, NULL::text AS event_slug FROM consultation_bookings WHERE id = $1 AND deleted_at IS NULL'
        : 'SELECT id, NULL::text AS name, NULL::text AS event_slug FROM newsletter_subscribers WHERE id = $1 AND deleted_at IS NULL',
    [input.id],
  );
  if (!input.deleted) {
    const deletedRecord = await queryOne<{ id: string }>(
      `SELECT id FROM ${table} WHERE id = $1 AND deleted_at IS NOT NULL`,
      [input.id],
    );
    if (!deletedRecord) return false;
  } else if (!existing) {
    return false;
  }
  const before = input.deleted
    ? {
        id: input.id,
        ...(existing?.name ? { name: existing.name } : {}),
        ...(existing?.event_slug ? { event: existing.event_slug } : {}),
      }
    : { id: input.id, deleted: true };
  const mutationSql = input.deleted
    ? `UPDATE ${table} SET deleted_at = now(), deleted_by = $2
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`
    : `UPDATE ${table} SET deleted_at = NULL, deleted_by = NULL
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`;
  const rows = await auditedMutation<{ id: string }>({
    mutationSql,
    mutationParams: input.deleted ? [input.id, input.actorId] : [input.id],
    audit: {
      ...input.audit,
      before,
      after: input.deleted ? { deleted: true } : { deleted: false },
    },
  });
  return rows.length > 0;
}

export async function permanentlyDeleteDataRecord(input: {
  type: DeletableDataType;
  id: string;
  audit: AuditWrite;
}): Promise<boolean> {
  const table = DELETABLE_DATA_TABLES[input.type];
  const rows = await auditedMutation<{ id: string }>({
    mutationSql: `DELETE FROM ${table} WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
    mutationParams: [input.id],
    audit: { ...input.audit, before: { id: input.id, deleted: true }, after: null },
  });
  return rows.length > 0;
}

function dataWhere(
  filter: DataFilter,
  searchColumns = 'name, email',
): { where: string; params: unknown[] } {
  const clauses: string[] = [filter.deletedOnly ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filter.eventSlug) {
    params.push(filter.eventSlug);
    clauses.push(`event_slug = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    const columns = searchColumns.split(',').map((column) => `${column.trim()} ILIKE $${params.length}`);
    clauses.push(`(${columns.join(' OR ')})`);
  }
  if (filter.from) {
    params.push(filter.from);
    clauses.push(`created_at >= $${params.length}::date`);
  }
  if (filter.to) {
    params.push(filter.to);
    clauses.push(`created_at < ($${params.length}::date + interval '1 day')`);
  }
  if (filter.status) {
    params.push(filter.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filter.ownerId) {
    if (filter.ownerId === 'unassigned') clauses.push('assigned_to IS NULL');
    else {
      params.push(filter.ownerId);
      clauses.push(`assigned_to = $${params.length}`);
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export type SubscriptionRow = {
  id: string;
  email: string;
  status: string;
  source: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export async function listSubscriptions(
  filter: DataFilter & { limit: number; offset: number },
): Promise<SubscriptionRow[]> {
  const { where, params } = dataWhere(filter, 'email');
  return query<SubscriptionRow>(
    `SELECT id, email, status, source, ${isoTimestamp('newsletter_subscribers', 'created_at')} AS created_at,
            ${isoTimestamp('newsletter_subscribers', 'deleted_at')} AS deleted_at, deleted_by
       FROM newsletter_subscribers
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit, filter.offset],
  );
}

export async function countSubscriptions(filter: DataFilter = {}): Promise<number> {
  const { where, params } = dataWhere(filter, 'email');
  const row = await queryOne<{ total: number }>(
    `SELECT count(*)::int AS total FROM newsletter_subscribers ${where}`,
    params,
  );
  return row?.total ?? 0;
}

export async function listSubscriptionsForExport(
  filter: DataFilter = {},
): Promise<SubscriptionRow[]> {
  const { where, params } = dataWhere(filter, 'email');
  return query<SubscriptionRow>(
    `SELECT id, email, status, source, ${isoTimestamp('newsletter_subscribers', 'created_at')} AS created_at,
            ${isoTimestamp('newsletter_subscribers', 'deleted_at')} AS deleted_at, deleted_by
       FROM newsletter_subscribers ${where}
      ORDER BY created_at DESC LIMIT 10000`,
    params,
  );
}

export type ConsultationRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organisation: string;
  service: string | null;
  meeting_format: string;
  preferred_date: string;
  preferred_slot: string;
  notes: string | null;
  status: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  assigned_to: string | null;
  status_changed_at: string;
  internal_notes: string;
};

const CONSULTATION_COLUMNS = `id, name, email, phone, organisation, service,
  meeting_format, preferred_date, preferred_slot, notes, status,
  ${isoTimestamp('consultation_bookings', 'created_at')} AS created_at,
  ${isoTimestamp('consultation_bookings', 'deleted_at')} AS deleted_at, deleted_by,
  assigned_to, ${isoTimestamp('consultation_bookings', 'status_changed_at')} AS status_changed_at,
  internal_notes`;

export async function listConsultations(
  filter: DataFilter & { limit: number; offset: number },
): Promise<ConsultationRow[]> {
  const { where, params } = dataWhere(filter);
  return query<ConsultationRow>(
    `SELECT ${CONSULTATION_COLUMNS}
       FROM consultation_bookings ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit, filter.offset],
  );
}

export async function countConsultations(filter: DataFilter = {}): Promise<number> {
  const { where, params } = dataWhere(filter);
  const row = await queryOne<{ total: number }>(
    `SELECT count(*)::int AS total FROM consultation_bookings ${where}`,
    params,
  );
  return row?.total ?? 0;
}

export async function listConsultationsForExport(
  filter: DataFilter = {},
): Promise<ConsultationRow[]> {
  const { where, params } = dataWhere(filter);
  return query<ConsultationRow>(
    `SELECT ${CONSULTATION_COLUMNS}
       FROM consultation_bookings ${where}
      ORDER BY created_at DESC LIMIT 10000`,
    params,
  );
}

export async function updateConsultationField(input: {
  id: string;
  actorId: string;
  change:
    | { type: 'status'; status: 'new' | 'contacted' | 'scheduled' | 'done' }
    | { type: 'assignment'; assignedTo: string | null }
    | { type: 'note'; internalNotes: string };
  audit: AuditWrite;
}): Promise<{ changed: boolean; previousAssignee: string | null; assignedTo: string | null }> {
  const existing = await queryOne<{ status: string; assigned_to: string | null }>(
    'SELECT status, assigned_to FROM consultation_bookings WHERE id = $1 AND deleted_at IS NULL',
    [input.id],
  );
  if (!existing) return { changed: false, previousAssignee: null, assignedTo: null };
  const mutation = input.change.type === 'status'
    ? {
        sql: `UPDATE consultation_bookings SET status = $2, status_changed_at = now()
          WHERE id = $1 AND deleted_at IS NULL AND status IS DISTINCT FROM $2
          RETURNING id, status`,
        params: [input.id, input.change.status],
        action: 'consultation.status_change',
        before: { status: existing.status },
        after: { status: input.change.status },
      }
    : input.change.type === 'assignment'
      ? {
          sql: `UPDATE consultation_bookings SET assigned_to = $2
            WHERE id = $1 AND deleted_at IS NULL AND assigned_to IS DISTINCT FROM $2
            RETURNING id, assigned_to`,
          params: [input.id, input.change.assignedTo],
          action: 'consultation.assignment',
          before: { assigned_to: existing.assigned_to },
          after: { assigned_to: input.change.assignedTo },
        }
      : {
          sql: `UPDATE consultation_bookings SET internal_notes = $2
            WHERE id = $1 AND deleted_at IS NULL AND internal_notes IS DISTINCT FROM $2
            RETURNING id`,
          params: [input.id, input.change.internalNotes],
          action: 'consultation.note_edit',
          before: { internal_notes_changed: false },
          after: { internal_notes_changed: true },
        };
  const rows = await auditedMutation<{ id: string }>({
    mutationSql: mutation.sql,
    mutationParams: mutation.params,
    audit: { ...input.audit, action: mutation.action, before: mutation.before, after: mutation.after },
  });
  return {
    changed: rows.length > 0,
    previousAssignee: existing.assigned_to,
    assignedTo: input.change.type === 'assignment' ? input.change.assignedTo : existing.assigned_to,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   The account directory: talent and employer accounts, with the profile
   fields that make a row useful without opening the database.

   Staff rows are deliberately excluded in SQL: this list belongs to the data
   administrator's read-only remit, and the staff list has its own super
   administrator endpoint. The two profile tables are joined separately because
   an account holds one or the other, never both.
   ══════════════════════════════════════════════════════════════════════════ */

export type UserAccountRow = {
  id: string;
  name: string | null;
  email: string;
  role: 'talent' | 'employer';
  email_verified: boolean;
  company: string | null;
  field: string | null;
  country: string | null;
  availability: string | null;
  needs: string[] | null;
  created_at: string;
};

export type UserAccountFilter = {
  search?: string;
  role?: 'talent' | 'employer';
  from?: string;
  to?: string;
};

const USER_ACCOUNT_COLUMNS = `u.id,
         coalesce(tp.name, ep.name) AS name,
         u.email,
         u.role,
         u.email_verified,
         ep.company,
         tp.field,
         tp.country,
         tp.availability,
         ep.needs,
         ${isoTimestamp('u', 'created_at')} AS created_at`;

const USER_ACCOUNT_FROM = `FROM users u
       LEFT JOIN talent_profiles tp ON tp.user_id = u.id
       LEFT JOIN employer_profiles ep ON ep.user_id = u.id`;

/** Bind parameters only; the public account roles are fixed in this string. */
function userAccountWhere(filter: UserAccountFilter): { where: string; params: unknown[] } {
  const clauses: string[] = ["u.role IN ('talent', 'employer')"];
  const params: unknown[] = [];

  if (filter.role) {
    params.push(filter.role);
    clauses.push(`u.role = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    clauses.push(
      `(coalesce(tp.name, ep.name) ILIKE $${params.length}
        OR u.email ILIKE $${params.length}
        OR ep.company ILIKE $${params.length})`,
    );
  }
  if (filter.from) {
    params.push(filter.from);
    clauses.push(`u.created_at >= $${params.length}::date`);
  }
  if (filter.to) {
    params.push(filter.to);
    clauses.push(`u.created_at < ($${params.length}::date + interval '1 day')`);
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

export async function listUserAccounts(
  filter: UserAccountFilter & { limit: number; offset: number },
): Promise<UserAccountRow[]> {
  const { where, params } = userAccountWhere(filter);
  return query<UserAccountRow>(
    `SELECT ${USER_ACCOUNT_COLUMNS}
       ${USER_ACCOUNT_FROM}
       ${where}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit, filter.offset],
  );
}

export async function countUserAccounts(filter: UserAccountFilter = {}): Promise<number> {
  const { where, params } = userAccountWhere(filter);
  const row = await queryOne<{ total: number }>(
    `SELECT count(*)::int AS total ${USER_ACCOUNT_FROM} ${where}`,
    params,
  );
  return row?.total ?? 0;
}

/** Everything matching the filters, newest first, for the CSV export. */
export async function listUserAccountsForExport(
  filter: UserAccountFilter = {},
): Promise<UserAccountRow[]> {
  const { where, params } = userAccountWhere(filter);
  return query<UserAccountRow>(
    `SELECT ${USER_ACCOUNT_COLUMNS}
       ${USER_ACCOUNT_FROM}
       ${where}
      ORDER BY u.created_at DESC LIMIT 10000`,
    params,
  );
}

/* ── Dashboard counts ───────────────────────────────────────────────────── */

export type CategoryStats = {
  total: number;
  /** Rows created inside the selected range. */
  current: number;
  /** Rows in the equally long window before it, or null when there is none. */
  previous: number | null;
  /** The oldest row this category has, so a comparison can say when tracking began. */
  historyStart: string | null;
};

type CountWindow = { from: string; to: string };

async function categoryCounts(
  table: 'registrations' | 'newsletter_subscribers' | 'consultation_bookings' | 'users',
  current: CountWindow,
  previous: CountWindow | null,
  extraWhere = '',
): Promise<CategoryStats> {
  const clauses: string[] = [];
  if (table !== 'users') clauses.push('deleted_at IS NULL');
  if (extraWhere) clauses.push(extraWhere);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const params: (string | number)[] = [current.from, current.to];
  let previousSql = 'null::int';
  if (previous) {
    params.push(previous.from, previous.to);
    previousSql = `count(*) FILTER (WHERE created_at >= $3::date
                     AND created_at < $4::date + interval '1 day')::int`;
  }
  const row = await queryOne<CategoryStats>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at >= $1::date
                               AND created_at < $2::date + interval '1 day')::int AS current,
            ${previousSql} AS previous,
            min(created_at)::date::text AS "historyStart"
       FROM ${table} ${where}`,
    params,
  );
  return row ?? { total: 0, current: 0, previous: null, historyStart: null };
}

export async function getDashboardCounts(
  current: CountWindow,
  previous: CountWindow | null,
): Promise<{
  registrations: CategoryStats;
  subscriptions: CategoryStats;
  consultations: CategoryStats;
  talent: CategoryStats;
  employers: CategoryStats;
}> {
  const [registrations, subscriptions, consultations, talent, employers] = await Promise.all([
    categoryCounts('registrations', current, previous),
    categoryCounts('newsletter_subscribers', current, previous, "status <> 'unsubscribed'"),
    categoryCounts('consultation_bookings', current, previous),
    categoryCounts('users', current, previous, "role = 'talent'"),
    categoryCounts('users', current, previous, "role = 'employer'"),
  ]);
  return { registrations, subscriptions, consultations, talent, employers };
}

export async function getConsultationPipelineCounts(): Promise<{
  new: number;
  contacted: number;
  scheduled: number;
  done: number;
  newOlderThan48Hours: number;
}> {
  const row = await queryOne<{
    new: number;
    contacted: number;
    scheduled: number;
    done: number;
    new_older_than_48_hours: number;
  }>(`SELECT
      count(*) FILTER (WHERE status = 'new')::int AS new,
      count(*) FILTER (WHERE status = 'contacted')::int AS contacted,
      count(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
      count(*) FILTER (WHERE status = 'done')::int AS done,
      count(*) FILTER (WHERE status = 'new' AND created_at < now() - interval '48 hours')::int
        AS new_older_than_48_hours
    FROM consultation_bookings WHERE deleted_at IS NULL`);
  return {
    new: row?.new ?? 0,
    contacted: row?.contacted ?? 0,
    scheduled: row?.scheduled ?? 0,
    done: row?.done ?? 0,
    newOlderThan48Hours: row?.new_older_than_48_hours ?? 0,
  };
}

export async function dailyCounts(
  table: 'registrations' | 'newsletter_subscribers' | 'consultation_bookings' | 'users',
  from: string,
  extraWhere = '',
): Promise<{ day: string; total: number }[]> {
  const clauses = ['created_at >= $1::date'];
  if (table !== 'users') clauses.push('deleted_at IS NULL');
  if (extraWhere) clauses.push(extraWhere);
  return query<{ day: string; total: number }>(
    `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*)::int AS total
       FROM ${table}
      WHERE ${clauses.join(' AND ')}
      GROUP BY 1 ORDER BY 1`,
    [from],
  );
}

export async function registrationCountsByEvent(
  from: string,
): Promise<{ event_slug: string; total: number }[]> {
  return query<{ event_slug: string; total: number }>(
    `SELECT event_slug, count(*)::int AS total
       FROM registrations
      WHERE created_at >= $1::date AND deleted_at IS NULL
      GROUP BY event_slug ORDER BY total DESC`,
    [from],
  );
}
/* ── First-party traffic ────────────────────────────────────────────────── */

export async function recordPageView(input: {
  date: string;
  path: string;
  referrerHost: string;
  utmSource: string;
  country: string;
  device: string;
  visitorHash: string;
}): Promise<void> {
  await query(
    `WITH page AS (
       INSERT INTO page_views_daily
         (date, path, referrer_host, utm_source, country, device, views)
       VALUES ($1, $2, $3, $4, $5, $6, 1)
       ON CONFLICT (date, path, referrer_host, utm_source, country, device)
       DO UPDATE SET views = page_views_daily.views + 1
     ), visitor AS (
       INSERT INTO visitor_hashes_daily (date, hash)
       VALUES ($1, $7)
       ON CONFLICT DO NOTHING
       RETURNING hash
     )
     INSERT INTO traffic_uniques_daily (date, uniques)
     SELECT $1, 1 WHERE EXISTS (SELECT 1 FROM visitor)
     ON CONFLICT (date) DO UPDATE SET uniques = traffic_uniques_daily.uniques + 1`,
    [
      input.date,
      input.path,
      input.referrerHost,
      input.utmSource,
      input.country,
      input.device,
      input.visitorHash,
    ],
  );
}

export type TrafficHitInput = {
  hitId: string;
  path: string;
  referrerHost: string;
  utmSource: string;
  country: string;
  device: string;
  ipHash: string | null;
  visitorHash: string | null;
  userAgent: string;
  javascriptExecuted: boolean;
};

export async function recordTrafficHit(input: TrafficHitInput): Promise<void> {
  await query(
    `WITH recent AS (
       -- The same visitor on the same path within half an hour is one view:
       -- a reload, a back button or a shared link opened twice must not inflate
       -- the count. The current hit is excluded so its own upsert still works.
       SELECT 1 FROM traffic_hits
        WHERE visitor_hash = $8
          AND path = $2
          AND hit_id <> $1::uuid
          AND created_at > now() - interval '30 minutes'
        LIMIT 1
     ),
     stored AS (
       INSERT INTO traffic_hits (
         hit_id, path, referrer_host, utm_source, country, device, ip_hash,
         visitor_hash, user_agent, javascript_executed
       )
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (hit_id) DO UPDATE
         SET javascript_executed =
               traffic_hits.javascript_executed OR EXCLUDED.javascript_executed,
             referrer_host = CASE WHEN EXCLUDED.javascript_executed
                                  THEN EXCLUDED.referrer_host ELSE traffic_hits.referrer_host END,
             utm_source = CASE WHEN EXCLUDED.javascript_executed
                               THEN EXCLUDED.utm_source ELSE traffic_hits.utm_source END
       RETURNING *, (xmax = 0) AS was_inserted
     ),
     counted AS (
       SELECT * FROM stored
        WHERE was_inserted AND NOT EXISTS (SELECT 1 FROM recent)
     ),
     page AS (
       INSERT INTO page_views_daily
         (date, path, referrer_host, utm_source, country, device, views)
       SELECT created_at::date, path, referrer_host, utm_source, country, device, 1
         FROM counted
       ON CONFLICT (date, path, referrer_host, utm_source, country, device)
       DO UPDATE SET views = page_views_daily.views + 1
     ),
     visitor AS (
       INSERT INTO visitor_hashes_daily (date, hash)
       SELECT created_at::date, visitor_hash
         FROM counted
        WHERE visitor_hash IS NOT NULL
       ON CONFLICT DO NOTHING
       RETURNING date
     )
     INSERT INTO traffic_uniques_daily (date, uniques)
     SELECT date, 1 FROM visitor
     ON CONFLICT (date) DO UPDATE SET uniques = traffic_uniques_daily.uniques + 1`,
    [
      input.hitId,
      input.path,
      input.referrerHost,
      input.utmSource,
      input.country,
      input.device,
      input.ipHash,
      input.visitorHash,
      input.userAgent,
      input.javascriptExecuted,
    ],
  );
}

export async function cleanupTrafficHashes(): Promise<number> {
  const rows = await query<{ hash: string }>(
    `DELETE FROM visitor_hashes_daily
      WHERE date < current_date - 2
      RETURNING hash`,
  );
  return rows.length;
}

/**
 * Unconfirmed newsletter signups are housekeeping, not history.
 *
 * The confirmation link is only good for 48 hours, so a row still pending a
 * week after the address first asked can never be confirmed by the mail that
 * was sent; it only misleads whoever reads the subscriber list. A week leaves
 * room for a weekend away, and an address that signs up again afterwards simply
 * starts a fresh row.
 */
export async function cleanupPendingNewsletterSubscribers(): Promise<number> {
  const rows = await query<{ email: string }>(
    `DELETE FROM newsletter_subscribers
      WHERE status = 'pending'
        AND created_at < now() - interval '7 days'
      RETURNING email`,
  );
  return rows.length;
}

export async function trafficTotals(
  from: string,
  to: string,
): Promise<{ views: number; uniques: number }> {
  const [views, uniques] = await Promise.all([
    queryOne<{ total: number }>(
      `SELECT coalesce(sum(views), 0)::int AS total
         FROM page_views_daily WHERE date >= $1::date AND date <= $2::date`,
      [from, to],
    ),
    queryOne<{ total: number }>(
      `SELECT coalesce(sum(uniques), 0)::int AS total
         FROM traffic_uniques_daily WHERE date >= $1::date AND date <= $2::date`,
      [from, to],
    ),
  ]);
  return { views: views?.total ?? 0, uniques: uniques?.total ?? 0 };
}

export async function trafficDaily(
  from: string,
  to: string,
): Promise<{ day: string; views: number; uniques: number }[]> {
  return query<{ day: string; views: number; uniques: number }>(
    `WITH days AS (
       SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            coalesce((SELECT sum(v.views) FROM page_views_daily v WHERE v.date = d.day), 0)::int AS views,
            coalesce((SELECT u.uniques FROM traffic_uniques_daily u WHERE u.date = d.day), 0)::int AS uniques
       FROM days d ORDER BY d.day`,
    [from, to],
  );
}

export async function trafficTop(
  column: 'path' | 'referrer_host' | 'country' | 'device',
  from: string,
  to: string,
  limit = 10,
): Promise<{ label: string; views: number }[]> {
  const allowed = new Set(['path', 'referrer_host', 'country', 'device']);
  if (!allowed.has(column)) throw new Error('Unsupported traffic column');
  return query<{ label: string; views: number }>(
    `SELECT ${column} AS label, sum(views)::int AS views
       FROM page_views_daily
      WHERE date >= $1::date AND date <= $2::date
      GROUP BY ${column}
      ORDER BY views DESC
      LIMIT $3`,
    [from, to, limit],
  );
}

export type TrafficAnalytics = {
  totals: { views: number; uniques: number };
  daily: { day: string; views: number; uniques: number; botViews: number }[];
  pages: { label: string; views: number }[];
  referrers: { label: string; views: number }[];
  countries: {
    label: string;
    views: number;
    humanViews: number;
    suspectedBotViews: number;
  }[];
  devices: { label: string; views: number }[];
  suspectedBots: { hits: number; reasons: { reason: string; hits: number }[] };
}

/**
 * Combines the historic daily aggregates with newly captured raw hits. New hits
 * are also written to the old aggregates during rollout; subtracting the raw
 * dimensions keeps them from being counted twice. The old rows remain the
 * estimated-human baseline because the previous collector already discarded
 * several bot classes.
 */
export async function trafficAnalytics(
  from: string,
  to: string,
  hideBots: boolean,
  chartFrom = from,
): Promise<TrafficAnalytics> {
  const row = await queryOne<{ analytics: TrafficAnalytics }>(
    `WITH ${trafficClassificationCtes()},
     raw_groups AS (
       SELECT created_at::date AS date, path, referrer_host, utm_source, country, device,
              count(*)::int AS all_hits,
              count(*) FILTER (WHERE NOT is_suspected_bot)::int AS human_hits,
              count(*) FILTER (WHERE is_suspected_bot)::int AS bot_hits
         FROM classified_hits
        GROUP BY created_at::date, path, referrer_host, utm_source, country, device
     ),
     legacy_groups AS (
       SELECT old.date, old.path, old.referrer_host, old.utm_source, old.country, old.device,
              greatest(old.views - coalesce(raw.all_hits, 0), 0)::int AS legacy_views
         FROM page_views_daily old
         LEFT JOIN raw_groups raw
           ON raw.date = old.date
          AND raw.path = old.path
          AND raw.referrer_host = old.referrer_host
          AND raw.utm_source = old.utm_source
          AND raw.country = old.country
          AND raw.device = old.device
        WHERE old.date >= $1::date AND old.date <= $2::date
     ),
     raw_daily AS (
       SELECT created_at::date AS date,
              count(*)::int AS all_hits,
              count(*) FILTER (WHERE NOT is_suspected_bot)::int AS human_hits,
              count(*) FILTER (WHERE is_suspected_bot)::int AS bot_hits,
              count(DISTINCT visitor_hash)::int AS all_uniques,
              count(DISTINCT visitor_hash) FILTER (WHERE NOT is_suspected_bot)::int AS human_uniques
         FROM classified_hits
        GROUP BY created_at::date
     ),
     legacy_daily AS (
       SELECT old.date,
              coalesce(sum(legacy.legacy_views), 0)::int AS views,
              greatest(old.uniques - coalesce(raw.all_uniques, 0), 0)::int AS uniques
         FROM traffic_uniques_daily old
         LEFT JOIN legacy_groups legacy ON legacy.date = old.date
         LEFT JOIN raw_daily raw ON raw.date = old.date
        WHERE old.date >= $1::date AND old.date <= $2::date
        GROUP BY old.date, old.uniques, raw.all_uniques
     ),
     daily_metrics AS (
       SELECT days.day,
              (coalesce(legacy.views, 0) +
                CASE WHEN $3::boolean THEN coalesce(raw.human_hits, 0)
                     ELSE coalesce(raw.all_hits, 0) END)::int AS views,
              (coalesce(legacy.uniques, 0) +
                CASE WHEN $3::boolean THEN coalesce(raw.human_uniques, 0)
                     ELSE coalesce(raw.all_uniques, 0) END)::int AS uniques,
              coalesce(raw.bot_hits, 0)::int AS bot_views
         FROM generate_series($1::date, $2::date, interval '1 day') days(day)
         LEFT JOIN legacy_daily legacy ON legacy.date = days.day
         LEFT JOIN raw_daily raw ON raw.date = days.day
     ),
     dimensions AS (
       SELECT 'path'::text AS kind, path AS label, legacy_views, 0::int AS human_hits,
              0::int AS bot_hits, 0::int AS all_hits FROM legacy_groups
       UNION ALL
       SELECT 'path', path, 0, human_hits, bot_hits, all_hits FROM raw_groups
       UNION ALL
       SELECT 'referrer', referrer_host, legacy_views, 0, 0, 0 FROM legacy_groups
       UNION ALL
       SELECT 'referrer', referrer_host, 0, human_hits, bot_hits, all_hits FROM raw_groups
       UNION ALL
       SELECT 'country', country, legacy_views, 0, 0, 0 FROM legacy_groups
       UNION ALL
       SELECT 'country', country, 0, human_hits, bot_hits, all_hits FROM raw_groups
       UNION ALL
       SELECT 'device', device, legacy_views, 0, 0, 0 FROM legacy_groups
       UNION ALL
       SELECT 'device', device, 0, human_hits, bot_hits, all_hits FROM raw_groups
     ),
     dimension_totals AS (
       SELECT kind, label, sum(legacy_views)::int AS legacy_views,
              sum(human_hits)::int AS human_hits, sum(bot_hits)::int AS bot_hits,
              sum(all_hits)::int AS all_hits
         FROM dimensions
        GROUP BY kind, label
     ),
     ranked_dimensions AS (
       SELECT kind, label,
              (legacy_views + CASE WHEN $3::boolean THEN human_hits ELSE all_hits END)::int AS views,
              (legacy_views + human_hits)::int AS human_views,
              bot_hits AS suspected_bot_views,
              row_number() OVER (
                PARTITION BY kind
                ORDER BY legacy_views + CASE WHEN $3::boolean THEN human_hits ELSE all_hits END DESC,
                         label
              ) AS position
         FROM dimension_totals
     ),
     reasons AS (
       SELECT reason, count(*)::int AS hits
         FROM classified_hits
         CROSS JOIN LATERAL unnest(bot_reasons) AS r(reason)
        WHERE is_suspected_bot
        GROUP BY reason
     )
     SELECT jsonb_build_object(
       'totals', (SELECT jsonb_build_object(
         'views', coalesce(sum(views), 0)::int,
         'uniques', coalesce(sum(uniques), 0)::int
       ) FROM daily_metrics),
       'daily', coalesce((SELECT jsonb_agg(jsonb_build_object(
         'day', to_char(day, 'YYYY-MM-DD'), 'views', views, 'uniques', uniques,
         'botViews', bot_views
       ) ORDER BY day) FROM daily_metrics WHERE day >= $4::date), '[]'::jsonb),
       'pages', coalesce((SELECT jsonb_agg(jsonb_build_object('label', label, 'views', views) ORDER BY views DESC)
         FROM ranked_dimensions WHERE kind = 'path' AND position <= 10), '[]'::jsonb),
       'referrers', coalesce((SELECT jsonb_agg(jsonb_build_object('label', label, 'views', views) ORDER BY views DESC)
         FROM ranked_dimensions WHERE kind = 'referrer' AND position <= 10), '[]'::jsonb),
       'countries', coalesce((SELECT jsonb_agg(jsonb_build_object(
         'label', label, 'views', views, 'humanViews', human_views,
         'suspectedBotViews', suspected_bot_views
       ) ORDER BY views DESC) FROM ranked_dimensions WHERE kind = 'country' AND position <= 10), '[]'::jsonb),
       'devices', coalesce((SELECT jsonb_agg(jsonb_build_object('label', label, 'views', views) ORDER BY views DESC)
         FROM ranked_dimensions WHERE kind = 'device' AND position <= 10), '[]'::jsonb),
       'suspectedBots', jsonb_build_object(
         'hits', coalesce((SELECT sum(bot_hits)::int FROM raw_daily), 0),
         'reasons', coalesce((SELECT jsonb_agg(jsonb_build_object('reason', reason, 'hits', hits) ORDER BY hits DESC)
           FROM reasons), '[]'::jsonb)
       )
     ) AS analytics`,
    [from, to, hideBots, chartFrom],
  );
  if (!row) throw new Error('Traffic analytics query returned no result.');
  return row.analytics;
}

export type TrafficBotRuleRow = {
  id: string;
  rule_type: 'user_agent' | 'path';
  pattern: string;
  classification: 'bot' | 'human';
  created_at: string;
};

export async function listTrafficBotRules(): Promise<TrafficBotRuleRow[]> {
  return query<TrafficBotRuleRow>(
    `SELECT id, rule_type, pattern, classification, created_at::text AS created_at
       FROM traffic_bot_rules
      ORDER BY created_at DESC, id`,
  );
}

export async function findTrafficBotRule(id: string): Promise<TrafficBotRuleRow | null> {
  return queryOne<TrafficBotRuleRow>(
    `SELECT id, rule_type, pattern, classification, created_at::text AS created_at
       FROM traffic_bot_rules WHERE id = $1`,
    [id],
  );
}
