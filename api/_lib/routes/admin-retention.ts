import { auditActorForUser, auditedMutation } from '../audit.js';
import { findUserByEmail, isStaffRole, queryOne } from '../db.js';
import { ApiError, endpoint, parseJsonBody, sendJson } from '../http.js';
import { getRetentionSettings, listLegalHolds, runRetentionSweep } from '../retention.js';
import { RETENTION_DEFAULTS } from '../retention-config.js';
import { requireSuperAdmin } from '../staff.js';
import { parseInput, retentionActionSchema } from '../validation.js';

const LEGAL_HOLD_TABLES = {
  registrations: 'registrations',
  event_registrations: 'event_registrations',
  newsletter_subscribers: 'newsletter_subscribers',
  consultation_bookings: 'consultation_bookings',
  posts: 'posts',
  events: 'posts',
  users: 'users',
  enquiries: 'enquiries',
} as const;

export default endpoint({ methods: ['GET', 'POST'], csrf: true }, async (req, res) => {
  const { user } = await requireSuperAdmin(req, res);
  if (req.method === 'GET') {
    const [settings, legalHolds] = await Promise.all([getRetentionSettings(), listLegalHolds()]);
    sendJson(res, 200, { settings, defaults: RETENTION_DEFAULTS, legalHolds });
    return;
  }

  const data = parseInput(retentionActionSchema, parseJsonBody(req));
  if (data.action === 'dry_run') {
    sendJson(res, 200, { dryRun: true, counts: await runRetentionSweep(false, req) });
    return;
  }

  const actor = await auditActorForUser(user.id);
  if (data.action === 'set_raw_traffic_days') {
    const updated = await auditedMutation<{ id: number }>({
      mutationSql: `UPDATE retention_settings
                       SET raw_traffic_retention_days = $1,
                           updated_at = now(), updated_by = $2
                     WHERE id = 1
                     RETURNING id`,
      mutationParams: [data.days, user.id],
      actor,
      action: 'retention.raw_traffic_period_change',
      entity: { type: 'retention_settings', label: 'raw traffic retention period' },
      after: { days: data.days },
      req,
    });
    if (!updated[0]) throw new Error('Retention settings row is missing.');
    sendJson(res, 200, { settings: await getRetentionSettings() });
    return;
  }
  if (data.action === 'delete_person') {
    const hold = await queryOne<{ legal_hold: boolean }>(
      'SELECT legal_hold FROM users WHERE lower(email) = lower($1)',
      [data.email],
    );
    if (hold?.legal_hold) {
      throw new ApiError(
        409,
        'legal_hold_active',
        'This account is on legal hold; the associated personal data was not deleted.',
      );
    }
    const account = await findUserByEmail(data.email);
    if (account && isStaffRole(account.role)) {
      throw new ApiError(
        409,
        'staff_data_deletion_requires_review',
        'Staff account data must be reviewed through the staff offboarding process.',
      );
    }
    const [result] = await auditedMutation<{
      counts: Record<string, number>;
      row_count: number;
    }>({
      mutationSql: `WITH target_users AS MATERIALIZED (
          SELECT id FROM users
           WHERE lower(email) = lower($1)
             AND role IN ('talent', 'employer')
             AND NOT legal_hold
        ),
        deleted_registrations AS (
          DELETE FROM registrations r
           WHERE lower(r.email) = lower($1)
             AND NOT r.legal_hold
             AND NOT EXISTS (
               SELECT 1 FROM posts p
                WHERE p.type = 'event' AND p.slug = r.event_slug AND p.legal_hold
             )
          RETURNING r.id
        ),
        deleted_event_registrations AS (
          DELETE FROM event_registrations r
           WHERE lower(r.email) = lower($1)
             AND NOT r.legal_hold
             AND NOT EXISTS (
               SELECT 1 FROM posts p
                WHERE p.type = 'event' AND p.slug = r.event_slug AND p.legal_hold
             )
          RETURNING r.id
        ),
        deleted_newsletter AS (
          DELETE FROM newsletter_subscribers
           WHERE lower(email) = lower($1) AND NOT legal_hold
          RETURNING id
        ),
        deleted_consultations AS (
          DELETE FROM consultation_bookings
           WHERE lower(email) = lower($1) AND NOT legal_hold
          RETURNING id
        ),
        deleted_enquiries AS (
          DELETE FROM enquiries
           WHERE lower(email) = lower($1) AND NOT legal_hold
          RETURNING id
        ),
        deleted_auth_events AS (
          DELETE FROM auth_events
           WHERE user_id IN (SELECT id FROM target_users)
          RETURNING id
        ),
        deleted_auth_tokens AS (
          DELETE FROM auth_tokens
           WHERE user_id IN (SELECT id FROM target_users)
          RETURNING id
        ),
        deleted_talent_profiles AS (
          DELETE FROM talent_profiles
           WHERE user_id IN (SELECT id FROM target_users)
          RETURNING user_id
        ),
        deleted_employer_profiles AS (
          DELETE FROM employer_profiles
           WHERE user_id IN (SELECT id FROM target_users)
          RETURNING user_id
        ),
        deleted_users AS (
          DELETE FROM users
           WHERE id IN (SELECT id FROM target_users)
          RETURNING id
        ),
        counts AS (
          SELECT jsonb_build_object(
            'registrations', (SELECT count(*)::int FROM deleted_registrations),
            'event_registrations', (SELECT count(*)::int FROM deleted_event_registrations),
            'newsletter_subscribers', (SELECT count(*)::int FROM deleted_newsletter),
            'consultation_bookings', (SELECT count(*)::int FROM deleted_consultations),
            'enquiries', (SELECT count(*)::int FROM deleted_enquiries),
            'auth_events', (SELECT count(*)::int FROM deleted_auth_events),
            'auth_tokens', (SELECT count(*)::int FROM deleted_auth_tokens),
            'talent_profiles', (SELECT count(*)::int FROM deleted_talent_profiles),
            'employer_profiles', (SELECT count(*)::int FROM deleted_employer_profiles),
            'accounts', (SELECT count(*)::int FROM deleted_users)
          ) AS counts
        )
        SELECT counts,
               (SELECT coalesce(sum(value::int), 0)::int
                  FROM jsonb_each_text(counts)) AS row_count
          FROM counts`,
      mutationParams: [data.email],
      afterFromMutation: ['counts', 'rowCount'],
      actor,
      action: 'retention.personal_data_delete',
      entity: { type: 'data_request', label: 'personal data deletion request' },
      req,
    });
    if (!result) throw new Error('Personal data deletion did not return a summary.');
    sendJson(res, 200, { counts: result.counts, rowCount: result.row_count });
    return;
  }

  if (data.action === 'set_purge') {
    if (data.enabled && !data.confirmDefaults) {
      throw new ApiError(
        400,
        'retention_defaults_unconfirmed',
        'Confirm the proposed retention periods before enabling real purges.',
      );
    }
    const changed = await auditedMutation<{ id: number }>({
      mutationSql: `UPDATE retention_settings
                       SET real_purging_enabled = $1,
                           defaults_confirmed_at = CASE WHEN $3 THEN now() ELSE defaults_confirmed_at END,
                           defaults_confirmed_by = CASE WHEN $3 THEN $2 ELSE defaults_confirmed_by END,
                           updated_at = now(), updated_by = $2
                     WHERE id = 1
                     RETURNING id`,
      mutationParams: [data.enabled, user.id, data.confirmDefaults],
      actor,
      action: 'retention.settings_update',
      entity: { type: 'retention_settings', label: 'retention purge setting' },
      after: { enabled: data.enabled },
      req,
    });
    if (!changed[0]) throw new Error('Retention settings row is missing.');
    sendJson(res, 200, { settings: await getRetentionSettings() });
    return;
  }

  const table = LEGAL_HOLD_TABLES[data.dataset];
  const eventFilter = data.dataset === 'events' ? "AND type = 'event'" : '';
  const changed = await auditedMutation<{ id: string }>({
    mutationSql: `UPDATE ${table}
                     SET legal_hold = $1
                   WHERE id = $2 ${eventFilter}
                   RETURNING id`,
    mutationParams: [data.enabled, data.id],
    actor,
    action: 'retention.legal_hold',
    entity: { type: data.dataset, id: data.id, label: data.dataset },
    after: { dataset: data.dataset, enabled: data.enabled },
    req,
  });
  if (!changed[0]) throw new ApiError(404, 'record_not_found', 'The record was not found.');
  sendJson(res, 200, { ok: true, dataset: data.dataset, enabled: data.enabled });
});
