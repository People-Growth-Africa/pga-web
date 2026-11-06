# Access Requests and Grants

## Status

Approved design for the access-request/grant workstream. This is intentionally
separate from the other requested workstreams: soft deletion, scheduled
publishing, the consultation pipeline, database-backed sessions, and alerts.

## Context

The application has centralized role permissions in `api/_lib/permissions.ts`
and an audit writer in `api/_lib/audit.ts`. Staff authentication uses separate
signed, httpOnly cookies for the admin and content portals. The admin guard
re-reads the staff account and token version from the database on each request;
there is no server-side per-session table.

The current permission names include `content.write` and
`admin.content.write`. The admin content-oversight UI and API are currently
restricted to administrators. The separate `/content` portal is for
content-manager accounts and uses its own cookie and API guard. Admin pages use
the existing `AdminShell` and shared styling. Resend delivery is centralized
in `api/_lib/email.ts`. Vercel already has one daily cron at 03:00 for traffic
cleanup.

## Goals

- Allow eligible staff to request a bounded set of additional permissions.
- Let only the configured super administrator decide requests and manage
  grants.
- Apply role permissions and active grants on the server for every protected
  request, without storing effective permissions in a token.
- Preserve existing role capabilities while separating content editing from
  publishing.
- Make the request, decision, cancellation, revocation, and expiry lifecycle
  visible in the audit log.
- Follow the existing admin design system and Resend conventions.

## Permission model

The server-side effective permission set is the union of:

1. Permissions from the authenticated user’s current role.
2. Grants for that user where `revoked_at IS NULL` and `expires_at IS NULL OR
   expires_at > now()`.

The grant query runs when a server permission guard evaluates access. No
permission grant or effective permission set is copied into a JWT, cookie, or
other cached authorization token. Existing role permissions remain the source
of current baseline access; the mapping will be updated to use the granular
content capabilities while preserving the existing roles’ current behavior.
An added grant unlocks only that capability inside the portal the account can
already access; it does not change the account’s role or grant a new portal.

Only these permissions can be requested or granted:

- `content.edit`
- `content.publish`
- `email_template.edit`
- `consultation.update`
- `export.data`

The server uses a strict allowlist for request and grant operations. In
particular, the listed administrative, audit, purge, account-export, and access
management capabilities are not grantable. Any permission outside the
allowlist is rejected regardless of the caller or UI.

## Request and grant lifecycle

The additive migration creates:

- `access_requests` with requester, permission, required reason, pending /
  approved / declined / cancelled state, requested duration, decision
  metadata, and creation time.
- `permission_grants` with recipient, permission, grantor, grant and optional
  expiry times, revocation metadata, and the originating request.

The migration adds permission/status constraints, foreign keys, indexes for
the access screens and lookups, and a partial unique index allowing at most
one pending request per requester and permission. It also adds a timestamp
marker to grants so an expiry audit event is written only once.

A requester may submit a reason and a requested duration (permanent, 7, 30, or
90 days). The server rejects a request if the permission is not requestable,
the user already has it through their role or an active grant, or an identical
request is already pending. A requester may cancel their own pending request.

Only the configured super administrator can approve or decline. Approval
records a grant with the selected permanent or 7/30/90-day duration; the
approver may select a duration different from the requester’s preference.
Declines include a decision note. The super administrator can revoke an active
grant. Revocation takes effect on the next guarded request.

The existing daily cron handles expiry auditing. Permission evaluation checks
`expires_at` directly, so an expired grant stops authorizing immediately even
if the audit event is not written until the next cron run. The cron marks each
expired grant as audited and emits one `access.grant_expired` audit event.

## Authorization and content access

The centralized permission service will expose an effective-permission check
that resolves role permissions and active database grants at request time.
Route handlers continue to authorize through server-side guards; UI visibility
is never the security boundary. Request and grant endpoints use the existing
super-administrator identity check, rather than a client-supplied role or
permission.

The admin-cookie `AdminOversight` route is the destination for admin-portal
users who receive `content.edit` or `content.publish`. Its existing admin API
handlers will allow listing for either permission. Create, edit, category, and
upload operations require `content.edit`; publish/unpublish status operations
require `content.publish`. The existing content-manager portal remains
available through its separate content cookie and retains its current
capabilities.

A staff user with `content.edit` but without `content.publish` may save
content as a draft. Per the approved behavior, editing an already-published
item converts that item to a draft, temporarily removing it from public
content. A staff user with `content.publish` but without `content.edit` may
list content and publish or unpublish it, but cannot create or edit it. A user
without either permission cannot access the content workspace. A grant of
`consultation.update` is recorded and enforced where such a route exists, but
this workstream does not create consultation mutation functionality.

## User experience

- Locked requestable features expose a shared “Request access” action, a
  required reason field, optional requested duration, and the current request
  status. Approved status displays the grant expiry, or that it is permanent;
  declined status displays the decision note.
- `/admin/my-access` lets administrator-portal staff see their own requests
  and cancel a pending request. Feature-specific lock states link to the same
  request flow. A user can reach a locked feature shell to request access, but
  its data and mutation APIs continue to deny access until permission is
  granted.
- The new `/admin/access` page is visible and usable only by the configured
  super administrator. It contains pending requests with approve/decline
  actions and active grants with revoke controls.
- Active grants older than 90 days receive a “needs review” indicator.
- Existing `AdminShell`, forms, tables, confirmation patterns, and responsive
  styling are reused.

## Notifications and audit

The existing Resend integration sends a notification to the super
administrator for a new request and to the requester after a decision. Email
content is limited to the person’s name and permission; it does not include
the reason or decision note. Email delivery occurs after the database change
and cannot roll back or block that change. Delivery failures are surfaced using
the existing email logging conventions.

The append-only audit log records:

- `access.request_created`
- `access.request_approved`
- `access.request_declined`
- `access.request_cancelled`
- `access.grant_revoked`
- `access.grant_expired`

Request/grant state changes and their audit inserts are atomic. Audit details
include the permission, state, and relevant expiry/revocation metadata, but not
the request reason or decision-note text.

## Verification

Tests cover:

- A valid request, duplicate-pending rejection, already-authorized rejection,
  cancellation, approval for each supported duration, decline, and revocation.
- Rejection of non-grantable and unknown permissions, including server-side
  attempts that bypass the UI.
- Role-plus-grant resolution and the immediate loss of permission at expiry.
- One-time expiry auditing through the daily cron.
- Server/API denial without the necessary permission and successful
  `AdminOversight` access after a `content.edit` grant.
- Draft save behavior without `content.publish` and publish denial without that
  permission.
- Notification failures not changing the result of a committed request or
  decision.
- Request/decision audit rows and atomicity on failed mutations.

Database-backed tests and migration checks use a disposable test database;
they must not run against production.

## Out of scope

This design does not implement deleted tabs/restore/purge, scheduled
publishing, consultation assignment/status management, login history or
database-backed sessions, or super-admin alerts. It also does not add
consultation mutation endpoints; it only establishes `consultation.update` as
a requestable/grantable permission for a later workflow.
