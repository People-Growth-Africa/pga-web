# Admin audit logging design

**Date:** 2026-11-06  
**Status:** Approved design; awaiting spec review before implementation

## Goal and scope

Add a durable, append-only audit trail to the administrator area. Record the actor identity and role as snapshots, action, affected entity, a safe field-level before/after diff, request metadata, and timestamp. Each database mutation and its audit row must succeed or fail together.

Instrument existing admin mutations and exports only. The admin data lists for registrations, newsletter subscriptions, and consultation bookings are currently read-only; do not introduce new edit/delete/restore/purge functionality. Email-template editing remains admin-only. There is no 2FA feature to instrument. Leave the existing `audit_log` and `auth_events` tables in place; create a new `audit_logs` table and do not rewrite unrelated code.

## Database and helper

Add an idempotent migration, `scripts/migrate-audit-logs.mjs`, and a matching package script. Create `audit_logs` with UUID primary key, UTC `timestamptz` creation time, nullable actor UUID plus email/role snapshots, action and entity fields, JSONB before/after values, IP, user agent, and request ID. Add indexes on creation time, actor, action, and `(entity_type, entity_id)`. Do not foreign-key the actor snapshot to `users`, so account deletion cannot erase history. Install a database trigger that rejects UPDATE and DELETE.

Add a centralized strict `logAudit`/audited-mutation abstraction in `api/_lib`. Mutation handlers must couple their write and audit insert in one database transaction; audit failure rolls back the mutation and failed mutations do not produce success events. Use allowlisted changed fields, never serialize full records, and redact credentials, secrets, tokens, and unnecessary personal data. Snapshot only `id`, name, and event for any destructive registration event if one is introduced later.

## Permissions and viewer

Centralize role-to-permission assignments and check permissions on the server. Add `audit_log.view`; grant it to admin-role accounts, with other roles receiving HTTP 403. The configured super-admin identity has full viewer/export capability; other administrators are read-only. Do not rely on hidden navigation for authorization.

Add an Audit Log item and page in the existing admin design system. Show date/time in `Africa/Lagos` with the UTC timestamp available on hover, actor email and role, action, record, and expandable before/after details. Provide server-side date, actor, role, action, and entity filters and pagination. CSV export must include the same filtered result and row count and itself produce an audit event. Never expose a password, token, API key, hash, or full personal record in the UI or export.

## Existing actions to instrument

- Email template update, with old and new subject/body fields. The current catalog is fixed and only supports updates, so do not add create/delete template operations.
- Posts/events: create, edit, publish, unpublish, delete.
- Staff accounts: create/invite, role or detail changes, disable, enable, and existing password reset/change flows.
- Data CSV exports: dataset, safe filters, and row count.
- Staff/admin authentication: successful and failed login, logout; failed login records attempted email only.

Do not claim registration/subscription/consultation edit, status, deletion, restore, purge, or 2FA coverage because those features do not exist. Preserve existing authentication telemetry unless changes are required to add the new staff-facing snapshots.

## Verification

Add focused tests for an audited template update and diff, an existing destructive audited action where available, rollback/no success log on failed mutation, database rejection of audit-row update/delete, and 403 for a role lacking `audit_log.view`. Cover redaction, request metadata and export row counts. Run targeted API/database tests plus the project build/typecheck. Do not run the migration against a real database or deploy unless separately authorized.

## Known repository constraints

The current checkout has unrelated uncommitted changes on `main`, and `main` was two commits behind its upstream at inspection time. Work is on `feat/audit-logging`; preserve those existing changes and do not push. Existing `recordAudit` is best-effort and writes the legacy table outside mutation transactions; replace it only at the touched call sites.
