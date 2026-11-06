# Admin Audit Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a strict, append-only audit log for existing sensitive staff actions and a permission-guarded admin viewer/export.

**Architecture:** Add an additive PostgreSQL migration for `audit_logs`, with a database trigger enforcing append-only behavior. Centralize permissions and a strict `logAudit` helper in the API library; couple every audited database mutation to its audit insert in one Neon/PostgreSQL transaction. Add a paginated audit API and React page, then exercise the flow using the repository's existing Node/API integration-test conventions.

**Tech Stack:** TypeScript, React, Vite, Vercel API handlers, Neon serverless PostgreSQL, Node.js integration scripts.

## Global Constraints

- "Each database mutation and its audit row must succeed or fail together."
- "Install a database trigger that rejects UPDATE and DELETE."
- "Centralize role-to-permission assignments and check permissions on the server."
- "The configured super-admin identity has full viewer/export capability; other administrators are read-only."
- "Instrument existing admin mutations and exports only."
- "Email-template editing remains admin-only."
- "Do not run the migration against a real database or deploy unless separately authorized."
- Preserve unrelated existing dirty changes; work only on `feat/audit-logging` and do not push.

---

### Task 1: Add append-only audit schema and migration

**Files:**
- Create: `scripts/migrate-audit-logs.mjs`
- Modify: `package.json`
- Test: `scripts/test-audit-log.mjs`

**Interfaces:**
- Produces: idempotent `npm run migrate:audit-logs` setup for `audit_logs`, its four indexes, and an append-only trigger.
- Produces: a test assertion that PostgreSQL rejects both UPDATE and DELETE for an audit row.

- [ ] **Step 1: Add the migration test expectations**

Add a DB-backed test setup in `scripts/test-audit-log.mjs` that inserts one fixture row and verifies attempted UPDATE and DELETE both fail. The test must delete test fixtures only by cleaning the disposable test database before installing the trigger; after the trigger exists, leave the fixture row in place or use a dedicated disposable database.

```js
for (const statement of [
  `UPDATE audit_logs SET action = 'tampered' WHERE id = $1`,
  `DELETE FROM audit_logs WHERE id = $1`,
]) {
  await assert.rejects(() => sql.query(statement, [auditId]));
}
```

- [ ] **Step 2: Run the focused test before the migration**

Run: `node scripts/test-audit-log.mjs --append-only`
Expected: FAIL because `audit_logs` does not exist.

- [ ] **Step 3: Implement the idempotent migration**

Create `audit_logs` with UUID `id DEFAULT gen_random_uuid()`, `created_at timestamptz NOT NULL DEFAULT now()`, nullable `actor_id uuid`, nullable `actor_email` and `actor_role` snapshots, required `action` and `entity_type`, nullable `entity_id` and `entity_label`, nullable JSONB `before` and `after`, `ip`, `user_agent`, and `request_id`. Do not add a foreign key on `actor_id`.

Add indexes on `created_at DESC`, `actor_id`, `action`, and `(entity_type, entity_id)`. Create or replace a trigger function that raises an exception and attach a `BEFORE UPDATE OR DELETE` trigger to `audit_logs`. Follow the `.env` loading and Neon setup conventions in `scripts/migrate-staff-and-stats.mjs`; never run this migration automatically during build/deploy.

Add `"migrate:audit-logs": "node scripts/migrate-audit-logs.mjs"` and `"test:audit-log": "node scripts/test-audit-log.mjs"` to `package.json`.

- [ ] **Step 4: Run schema checks**

Run: `npm run check:api`
Expected: PASS; migration script syntax and route imports remain valid.

Run only against an explicitly configured disposable test database: `npm run migrate:audit-logs` then `node scripts/test-audit-log.mjs --append-only`.
Expected: migration succeeds twice; both row-mutation attempts are rejected.

### Task 2: Centralize permissions and strict audit writing

**Files:**
- Modify: `api/_lib/staff.ts`
- Modify: `api/_lib/content-auth.ts`
- Modify: `api/_lib/db.ts`
- Modify: `api/_lib/audit.ts`
- Create: `api/_lib/permissions.ts`
- Test: `scripts/test-staff-roles.mjs`
- Test: `scripts/test-audit-log.mjs`

**Interfaces:**
- `permissions.ts` exports `type Permission`, `permissionsForRole(role)`, and `hasPermission(role, permission)`.
- `staff.ts` exports `requirePermission(req, res, permission)`; existing `requireAdmin`, `requireAdminData`, and `requireSuperAdmin` delegate to explicit permissions without changing current role access.
- `audit.ts` exports `logAudit(input)` and `auditedMutation(input)`. The actor is `{ id, email, role }`; entity and diff fields are typed and sanitized before insertion.
- `db.ts` exports typed `listAuditLogs(filter)` and `insertAuditLogRow(input)` helpers and one transaction helper that runs a data-modifying CTE plus the audit insert atomically.

- [ ] **Step 1: Specify the permission map and denial test**

Add API integration assertions that project manager, HR manager, data administrator, and content manager receive 403 from the audit API; ordinary admin may read but not export; configured super-admin may read and export. Keep the existing staff and portal role tests intact.

- [ ] **Step 2: Run role tests to see the expected failures**

Run: `npm run test:roles`
Expected: existing role checks pass; new audit permission assertions fail until the permission guard and audit route exist.

- [ ] **Step 3: Implement a centralized role permission map**

Add explicit permission sets for the existing roles. Preserve current route behavior by mapping admin-content, admin-data, admin-dashboard, and content-desk permissions to their current role sets. Add `audit_log.view` for `admin` only. Keep the configured super-admin identity as a centralized additional authorization check for audit export; do not scatter role comparisons through route handlers.

```ts
export type Permission =
  | 'admin.dashboard.read'
  | 'admin.data.read'
  | 'admin.content.write'
  | 'content.write'
  | 'audit_log.view';

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
```

`content-auth.ts` must call the same permission checker for `content.write`, preserving its separate content cookie and current 401/403 semantics.

- [ ] **Step 4: Replace best-effort audit writes with strict typed writes**

Extend `db.ts` with a safe audit insert. Implement `logAudit` to validate allowed action/entity identifiers, trim metadata, omit absent values, and reject secret-bearing keys/values rather than accepting arbitrary record dumps. `auditedMutation` must run a SQL data-modifying CTE whose `RETURNING` row feeds the audit insert; return the mutation result only if the audit insert succeeds. Use Neon `sql.transaction(tx => [...])` only where multiple static statements are needed; do not implement a callback that assumes transaction queries execute sequentially in JavaScript.

Replace touched `recordAudit` calls with the new strict helper so one user action does not create duplicate entries in both audit stores. Preserve `recordAuthEvent` telemetry and leave the legacy table/schema unchanged.

The shared input shape is:

```ts
type AuditInput = {
  req: VercelRequest;
  actor: { id: string | null; email: string | null; role: Role | null };
  action: string;
  entity: { type: string; id?: string | null; label?: string | null };
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};
```

For each mutation, use the same statement for change and audit, with the audit insert selecting only from the successful mutation:

```sql
WITH changed AS (
  UPDATE posts SET title = $2 WHERE id = $1
  RETURNING id, type, slug, title
), logged AS (
  INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, entity_label, after)
  SELECT $3, $4, $5, $6, 'post', id::text, title, $7::jsonb FROM changed
  RETURNING id
)
SELECT changed.* FROM changed CROSS JOIN logged;
```

Obtain `request_id` from the trusted Vercel request ID header when available and otherwise generate a UUID. Store only the first `x-forwarded-for` address, and cap/validate user-agent and request ID lengths.

- [ ] **Step 5: Run focused permissions and helper tests**

Run: `npm run test:roles`
Expected: all pre-existing checks pass; new audit API checks remain failing until Task 5.

Run: `node scripts/test-audit-log.mjs --helper`
Expected: successful insert stores snapshots and a safe diff; attempted secret fields are rejected; simulated audit insert failure rolls back the paired database mutation.

### Task 3: Audit existing content and template mutations atomically

**Files:**
- Modify: `api/_lib/routes/admin-email-templates.ts`
- Modify: `api/_lib/routes/admin-posts.ts`
- Modify: `api/_lib/routes/content-posts.ts`
- Modify: `api/_lib/db.ts`
- Test: `scripts/test-content-admin.mjs`
- Test: `scripts/test-email-templates.mjs`
- Test: `scripts/test-audit-log.mjs`

**Interfaces:**
- Route handlers provide actor snapshots and request metadata to `auditedMutation`.
- Audit diffs contain only changed allowlisted fields; template diffs may include prior/new subject and body copy.

- [ ] **Step 1: Add failing assertions for the template and content audit events**

In `scripts/test-audit-log.mjs`, after an admin changes a template, assert exactly one `email_template.update` row with actor email/role, template identity, prior/new subject and body. For content create/edit/status/delete, assert the correct action and post/event identity, with only changed fields in the diff.

- [ ] **Step 2: Run focused existing integration tests**

Run: `npm run test:email-templates`, `npm run test:content-admin`, and `node scripts/test-audit-log.mjs --content`.
Expected: existing behavior passes; the new audit assertions fail.

- [ ] **Step 3: Make template update and audit insertion atomic**

Read current override before-state, then use an atomic SQL operation to update the override and insert its audit row in the same transaction. Keep security-sensitive action URLs out of both audit versions. Do not add fixed-catalog template create/delete endpoints or permit content managers to edit templates.

The test should compare a changed-field diff, not serialized complete templates:

```js
assert.deepEqual(row.before, { subject: 'Old subject', paragraphs: ['Old body'] });
assert.deepEqual(row.after, { subject: 'New subject', paragraphs: ['New body'] });
```

- [ ] **Step 4: Instrument post and event create/edit/publish/unpublish/delete**

Cover both `/api/admin/*` and `/api/content/*` mutation handlers. Snapshot only `type`, `slug`, `title`, and status as needed. For edits, include only fields whose values changed. Ensure an audit failure prevents a successful database mutation response. Preserve existing cache invalidation, slug redirect, IndexNow, and cover-blob behavior; external side effects remain after the database transaction.

- [ ] **Step 5: Verify content and template behavior**

Run: `npm run test:email-templates`, `npm run test:content-admin`, and `node scripts/test-audit-log.mjs --content`.
Expected: legacy behavior and new exact audit-event assertions pass; invalid or failed writes produce no success event.

### Task 4: Audit staff, authentication, and exports

**Files:**
- Modify: `api/_lib/routes/admin-staff.ts`
- Modify: `api/_lib/routes/admin-data.ts`
- Modify: `api/_lib/routes/admin-registrations.ts`
- Modify: `api/_lib/staff-login.ts`
- Modify: `api/_lib/routes/auth/logout.ts`
- Modify: `api/_lib/routes/auth/logout-all.ts`
- Modify: `api/_lib/routes/auth/forgot-password.ts`
- Modify: `api/_lib/routes/auth/reset-password.ts`
- Modify: `api/_lib/routes/auth/change-password.ts`
- Modify: `api/_lib/routes/auth/set-password.ts`
- Test: `scripts/test-staff-roles.mjs`
- Test: `scripts/test-auth.mjs`
- Test: `scripts/test-audit-log.mjs`

**Interfaces:**
- All audited handlers pass the current staff account snapshot, action/entity identifiers, allowlisted diffs, and the original request to `logAudit` or `auditedMutation`.
- Export audit rows include dataset, safe normalized filters, and actual exported row count.

- [ ] **Step 1: Add failing tests for staff, login/logout, and export events**

Assert staff create, role change, disable/enable, and existing staff password-reset/change flows produce safe events. Assert unknown-email login failures store attempted email but never password; successful login and logout store actor snapshots. Assert each CSV route records the dataset, filters, and returned row count.

- [ ] **Step 2: Run existing focused tests**

Run: `npm run test:roles` and `npm run test:auth`.
Expected: existing behavior passes; new audit assertions fail.

- [ ] **Step 3: Make staff account changes atomic with audit**

For staff create/detail/disable operations, insert the audit row in the same transaction as the account update. Limit detail snapshots to role, enabled state, and explicitly changed non-secret fields. Password operations record only a password-reset/change event; never record password values, hashes, reset tokens, or invite URLs.

- [ ] **Step 4: Add authentication event snapshots**

In `staff-login.ts`, log successful and failed staff portal attempts with actor snapshots when known and attempted email for unknown accounts. Modify logout endpoints to identify the staff portal/session before clearing cookies and log the actor. Retain `auth_events`; add staff-facing rows only for staff roles and never include passwords, hashes, or tokens.

For an unknown address, assert the attempted email is the only login identifier retained:

```js
assert.equal(row.action, 'auth.login_failed');
assert.equal(row.entity_label, attemptedEmail);
assert.equal(JSON.stringify(row).includes(PASSWORD), false);
```

- [ ] **Step 5: Record exports after obtaining the filtered row count**

In both data export paths, fetch the rows, then audit dataset, validated filters (search presence only; do not store search text), and count before sending CSV. If audit insertion fails, do not send the export response. Do not store exported row contents.

- [ ] **Step 6: Run auth, roles, export, and audit tests**

Run: `npm run test:auth`, `npm run test:roles`, and `node scripts/test-audit-log.mjs --actions`.
Expected: all mutations and exports log exactly once; failed mutations have no success log; no secrets appear in the audit rows.

### Task 5: Add permission-guarded audit API and viewer

**Files:**
- Create: `api/_lib/routes/admin-audit.ts`
- Modify: `api/_lib/routes/index.ts`
- Modify: `api/_lib/validation.ts`
- Modify: `src/App.tsx`
- Modify: `src/routeComponents.ts`
- Modify: `src/SiteShell.tsx`
- Modify: `src/components/admin/AdminShell.tsx`
- Create: `src/pages/admin/AdminAuditLog.tsx`
- Modify: `src/lib/authClient.ts`
- Test: `scripts/test-staff-roles.mjs`
- Test: `scripts/test-audit-log.mjs`

**Interfaces:**
- `GET /api/admin/audit-log` accepts validated `from`, `to`, `actor`, `role`, `action`, `entityType`, and `page`; returns rows, total, page, and page size.
- `GET /api/admin/audit-log-export` accepts the same filters; super-admin only; logs the export before returning CSV.
- The viewer renders the API rows with localized date, UTC title, actor/action/entity, and a details expander.

- [ ] **Step 1: Add failing server permission/filter tests**

Test that non-admin roles receive 403, admin can read but cannot export, super-admin can export, and invalid filters/page values are rejected. Verify pagination is performed in SQL and CSV export is audit logged with row count.

- [ ] **Step 2: Implement the API and route registration**

Add a validated query schema, `admin-audit.ts`, and route entries in `api/_lib/routes/index.ts`. Guard list access with `audit_log.view`; guard export through the centralized super-admin permission check. Query only the requested page and count. Never interpolate request values into SQL identifiers.

The API response is exactly:

```ts
type AuditPage = {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 3: Add the lazy React route and navigation**

Add the lazy route component to `App.tsx` and `routeComponents.ts`, route to `/admin/audit-log` in `SiteShell.tsx`, and navigation visibility in `AdminShell.tsx`. Keep the server API authoritative. Use `Intl.DateTimeFormat` with `timeZone: 'Africa/Lagos'`; set the UTC ISO value on the time element's `title`.

```tsx
<time dateTime={row.created_at} title={row.created_at}>
  {new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(row.created_at))}
</time>
```

- [ ] **Step 4: Implement table, filters, paging, details, and CSV**

Build the page using current admin components and classes. Filters update the query string and cause a server request; pagination never loads the full log. Details show the JSON diff only, with nulls clearly represented. Hide export control from non-super-admin users; the API still denies direct requests.

- [ ] **Step 5: Run focused API and UI checks**

Run: `npm run test:roles` and `node scripts/test-audit-log.mjs --viewer`.
Expected: permissions, pagination, filters, export auditing, and localized timestamp behavior pass.

### Task 6: Final verification and summary

**Files:**
- Verify only; do not alter unrelated files.

- [ ] **Step 1: Run focused test suites**

Run: `npm run test:roles`, `npm run test:auth`, `npm run test:email-templates`, `npm run test:content-admin`, and `node scripts/test-audit-log.mjs`.
Expected: all relevant suites pass against a disposable configured database.

- [ ] **Step 2: Run API checks, lint, and production build**

Run: `npm run check:api`, `npm run lint`, and `npm run build`.
Expected: no API import errors, lint errors, TypeScript errors, or build failures.

- [ ] **Step 3: Review the final change set**

Run: `git diff --check` and `git status --short --branch`.
Expected: changes are on `feat/audit-logging`; unrelated dirty files remain intact; no changes are pushed and no production migration was run.

- [ ] **Step 4: Report coverage and limitations**

Summarize changed files, migration name, actions actually audited, test/build status, and explicitly state that registration/subscription/consultation admin mutations and 2FA were not implemented because no such admin features exist.
