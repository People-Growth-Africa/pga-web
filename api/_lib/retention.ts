import type { VercelRequest } from '@vercel/node';

import { prepareAuditWrite } from './audit.js';
import { query, queryOne } from './db.js';
import { RETENTION_DEFAULTS } from './retention-config.js';

type RetentionDatasetSpec = {
  name: string;
  table: string;
  candidates: string;
  idColumn?: 'id' | 'hit_id';
};

const DATASETS: readonly RetentionDatasetSpec[] = [
  {
    name: 'registrations',
    table: 'registrations',
    candidates: `SELECT r.id FROM registrations r
      WHERE NOT r.legal_hold AND (
        (r.deleted_at IS NOT NULL AND r.deleted_at < now() - interval '${RETENTION_DEFAULTS.softDeletedRecords.days} days')
        OR EXISTS (
          SELECT 1 FROM posts p
           WHERE p.type = 'event' AND p.slug = r.event_slug
             AND p.event_start < now() - interval '${RETENTION_DEFAULTS.eventRegistrations.monthsAfterEvent} months'
             AND NOT p.legal_hold
        )
      ) AND NOT EXISTS (
        SELECT 1 FROM posts p
         WHERE p.type = 'event' AND p.slug = r.event_slug AND p.legal_hold
      )`,
  },
  {
    name: 'event_registrations',
    table: 'event_registrations',
    candidates: `SELECT r.id FROM event_registrations r
      WHERE NOT r.legal_hold AND (
        (r.deleted_at IS NOT NULL AND r.deleted_at < now() - interval '${RETENTION_DEFAULTS.softDeletedRecords.days} days')
        OR EXISTS (
          SELECT 1 FROM posts p
           WHERE p.type = 'event' AND p.slug = r.event_slug
             AND p.event_start < now() - interval '${RETENTION_DEFAULTS.eventRegistrations.monthsAfterEvent} months'
             AND NOT p.legal_hold
        )
      ) AND NOT EXISTS (
        SELECT 1 FROM posts p
         WHERE p.type = 'event' AND p.slug = r.event_slug AND p.legal_hold
      )`,
  },
  {
    name: 'newsletter_subscribers',
    table: 'newsletter_subscribers',
    candidates: `SELECT id FROM newsletter_subscribers
      WHERE NOT legal_hold AND (
        (deleted_at IS NOT NULL AND deleted_at < now() - interval '${RETENTION_DEFAULTS.softDeletedRecords.days} days')
        OR (status = 'unsubscribed' AND unsubscribed_at < now() - interval '${RETENTION_DEFAULTS.unsubscribedEmails.days} days')
      )`,
  },
  {
    name: 'consultation_bookings',
    table: 'consultation_bookings',
    candidates: `SELECT id FROM consultation_bookings
      WHERE NOT legal_hold AND (
        (deleted_at IS NOT NULL AND deleted_at < now() - interval '${RETENTION_DEFAULTS.softDeletedRecords.days} days')
        OR (status = 'done' AND done_at < now() - interval '${RETENTION_DEFAULTS.completedConsultations.monthsAfterDone} months')
      )`,
  },
  {
    name: 'posts',
    table: 'posts',
    candidates: `SELECT id FROM posts
      WHERE NOT legal_hold
        AND deleted_at IS NOT NULL
        AND deleted_at < now() - interval '${RETENTION_DEFAULTS.softDeletedRecords.days} days'
        AND (
          type <> 'event'
          OR (
            NOT EXISTS (
              SELECT 1 FROM registrations r
               WHERE r.event_slug = posts.slug AND r.legal_hold
            )
            AND NOT EXISTS (
              SELECT 1 FROM event_registrations r
               WHERE r.event_slug = posts.slug AND r.legal_hold
            )
          )
        )`,
  },
  {
    name: 'failed_login_events',
    table: 'auth_events',
    candidates: `SELECT id FROM auth_events
      WHERE event ILIKE '%login_failed%'
        AND created_at < now() - interval '${RETENTION_DEFAULTS.failedLoginEvents.days} days'`,
  },
  {
    name: 'sessions',
    table: 'sessions',
    candidates: `SELECT id FROM sessions
      WHERE coalesce(revoked_at, expires_at) < now() - interval '${RETENTION_DEFAULTS.expiredOrRevokedSessions.days} days'`,
  },
  {
    name: 'traffic_hits',
    table: 'traffic_hits',
    idColumn: 'hit_id',
    candidates: `SELECT hit_id AS id FROM traffic_hits
      WHERE created_at < now() - ($12::integer * interval '1 day')`,
  },
  {
    name: 'alerts',
    table: 'alerts',
    candidates: `SELECT id FROM alerts
      WHERE NOT legal_hold
        AND created_at < now() - interval '${RETENTION_DEFAULTS.alerts.months} months'`,
  },
  {
    name: 'notifications',
    table: 'notifications',
    candidates: `SELECT id FROM notifications
      WHERE NOT legal_hold AND (
        (read_at IS NOT NULL AND read_at < now() - interval '${RETENTION_DEFAULTS.readNotifications.days} days')
        OR (read_at IS NULL AND created_at < now() - interval '${RETENTION_DEFAULTS.unreadNotifications.months} months')
      )`,
  },
];

export async function getRetentionSettings(): Promise<{
  enabled: boolean;
  defaultsConfirmedAt: string | null;
  rawTrafficRetentionDays: number;
}> {
  const row = await queryOne<{
    real_purging_enabled: boolean;
    defaults_confirmed_at: string | null;
    raw_traffic_retention_days: number;
  }>(
    `SELECT real_purging_enabled, defaults_confirmed_at::text AS defaults_confirmed_at,
            raw_traffic_retention_days
       FROM retention_settings WHERE id = 1`,
  );
  if (!row) throw new Error('Retention settings have not been migrated.');
  return {
    enabled: row.real_purging_enabled,
    defaultsConfirmedAt: row.defaults_confirmed_at,
    rawTrafficRetentionDays: row.raw_traffic_retention_days,
  };
}

export async function retentionSettingsAreEnabled(): Promise<boolean> {
  const settings = await getRetentionSettings();
  return settings.enabled && settings.defaultsConfirmedAt !== null;
}

export async function listLegalHolds(): Promise<{ dataset: string; id: string }[]> {
  const sources = [
    { dataset: 'registrations', table: 'registrations', filter: '' },
    { dataset: 'event_registrations', table: 'event_registrations', filter: '' },
    { dataset: 'newsletter_subscribers', table: 'newsletter_subscribers', filter: '' },
    { dataset: 'consultation_bookings', table: 'consultation_bookings', filter: '' },
    { dataset: 'posts', table: 'posts', filter: "AND type <> 'event'" },
    { dataset: 'events', table: 'posts', filter: "AND type = 'event'" },
    { dataset: 'users', table: 'users', filter: '' },
    { dataset: 'enquiries', table: 'enquiries', filter: '' },
  ] as const;
  const holds: { dataset: string; id: string }[] = [];
  for (const source of sources) {
    if (!(await datasetExists(source.table))) continue;
    const rows = await query<{ id: string }>(
      `SELECT id::text AS id FROM ${source.table}
        WHERE legal_hold ${source.filter}
        ORDER BY id
        LIMIT 500`,
    );
    holds.push(...rows.map((row) => ({ dataset: source.dataset, id: row.id })));
  }
  return holds;
}

async function datasetExists(table: string): Promise<boolean> {
  const row = await queryOne<{ present: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [`public.${table}`],
  );
  return row?.present === true;
}

async function processDataset(
  spec: RetentionDatasetSpec,
  purge: boolean,
  req: VercelRequest,
  rawTrafficRetentionDays: number,
): Promise<{ dataset: string; eligible: number; deleted: number }> {
  const action = purge ? 'retention.purge' : 'retention.dry_run';
  const audit = prepareAuditWrite({
    actor: { id: null, email: 'system:retention', role: null },
    action,
    entity: { type: 'retention', id: spec.name, label: spec.name },
    after: { dataset: spec.name, rowCount: 0 },
    req,
  });
  const parameters = [
    purge,
    audit.actor.id,
    audit.actor.email,
    audit.actor.role,
    action,
    audit.entity.type,
    audit.entity.id,
    audit.entity.label,
    audit.ip,
    audit.userAgent,
    audit.requestId,
    ...(spec.name === 'traffic_hits' ? [rawTrafficRetentionDays] : []),
  ];
  const row = await queryOne<{ eligible: number; deleted: number }>(
    `WITH candidates AS MATERIALIZED (${spec.candidates}),
     removed AS (
       DELETE FROM ${spec.table} target
        USING candidates
        WHERE target.${spec.idColumn ?? 'id'} = candidates.id AND $1::boolean
        RETURNING target.id
     ),
     totals AS (
       SELECT (SELECT count(*)::int FROM candidates) AS eligible,
              (SELECT count(*)::int FROM removed) AS deleted
     ),
     logged AS (
       INSERT INTO audit_logs (
         actor_id, actor_email, actor_role, action, entity_type, entity_id,
         entity_label, "before", "after", ip, user_agent, request_id
       )
       SELECT $2, $3, $4, $5, $6, $7, $8, NULL,
              jsonb_build_object('dataset', $7,
                'rowCount', CASE WHEN $1::boolean THEN totals.deleted ELSE totals.eligible END),
              $9, $10, $11
         FROM totals
       RETURNING id
     )
     SELECT totals.eligible, totals.deleted FROM totals CROSS JOIN logged`,
    parameters,
  );
  if (!row) throw new Error(`Retention ${action} did not return a summary for ${spec.name}.`);
  return { dataset: spec.name, eligible: row.eligible, deleted: row.deleted };
}

export async function runRetentionSweep(
  purge: boolean,
  req: VercelRequest,
): Promise<{ dataset: string; eligible: number; deleted: number }[]> {
  const settings = await getRetentionSettings();
  const results = [];
  for (const spec of DATASETS) {
    if (!(await datasetExists(spec.table))) continue;
    results.push(await processDataset(spec, purge, req, settings.rawTrafficRetentionDays));
  }
  return results;
}
