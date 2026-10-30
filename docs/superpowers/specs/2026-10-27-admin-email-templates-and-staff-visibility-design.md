# Admin email templates and staff visibility design

**Date:** 2026-10-27  
**Status:** For user review before implementation

## Goal

Let administrators customize transactional email copy and links/buttons, and ensure only the configured super administrator can see staff accounts. The finished changes are intended for a production deployment.

## Confirmed requirements

- Cover every transactional email the application sends: account verification, password reset/change notices, staff invitations, newsletter confirmation, event registration receipts, lead notifications, and existing-account notices.
- Keep the branded HTML email layout in code. Administrators edit structured fields, not arbitrary HTML or CSS.
- Support additional links and customization of the call-to-action label and appearance.
- For messages whose action establishes or recovers access (verification, reset, staff invitation, newsletter confirmation), the destination remains the generated, one-time system link. Its label and constrained brand style may be edited.
- Other buttons and additional links can have editable destinations, subject to strict URL validation and safe HTML escaping.
- Only accounts matching the configured super-admin identity can retrieve the staff list or open the staff page. This is enforced by both server API and interface; staff records are not returned to other administrators.
- Email-template editing is available to accounts with the `admin` role, not just the super admin. The server enforces this role.
- Deploy the completed changes to production after checks.

## Design

### Email template data and rendering

Store admin overrides in the existing PostgreSQL database, keyed by an explicit allowlist of template identifiers. Structured fields include subject, preheader, heading, body copy, action label, safe action destination (only for non-security actions), additional labeled links, and a constrained brand button style. Keep generated token URLs, expiration behavior, personalized values, recipients, reply-to behavior, and delivery logic under server control.

The server reads the stored overrides and merges them with existing built-in defaults. Existing email flows remain usable when no override row is present. Apply the same copy to plain-text and branded HTML output. Escape all user-authored text and validate URL schemes/destinations before rendering. Unknown template identifiers/fields and invalid destinations are rejected. Admin save operations are authenticated, same-origin-protected, validated, and audited.

A new administrator-panel screen presents the available email types, structured fields, link editor, CTA customization, save feedback, and a preview. Security-sensitive destinations are read-only. Keep the editor within the existing admin visual conventions.

### Staff visibility

Change the staff-list handler to require the super-admin identity before querying or serializing staff accounts; do not disclose the staff list or a `canManage`-only alternative response to other admins. Guard the UI route with a super-admin check based on the authenticated user's email and adjust the page/navigation accordingly. The API remains authoritative even if the client route is bypassed. Existing super-admin invite/disable/edit rules remain intact.

### Persistence and migration

Add one additive, idempotent SQL setup/migration step for the email template override table, following the existing script conventions. Avoid running migrations against a database until the feature has built and the user has authorized production rollout. The migration must not overwrite existing site data.

### Error handling and audit

Invalid template input returns field-level validation feedback without saving. Database failures use the existing endpoint error handling. A failed template save leaves the prior stored configuration intact. Audit successful edits with the acting account and template identifier, not rendered message content or secrets/tokens.

### Verification

- TypeScript production build and focused lint/API checks.
- Focused automated checks for role-based staff-list denial and template read/write validation, covering secure action destinations, custom links, and HTML escaping.
- Verify production deployment status and test safe public/admin route behavior on the deployed origin. A complete authenticated admin flow or schema migration is only reported as verified if the required production credentials/environment are available and the migration was explicitly run.

## Out of scope

- Arbitrary HTML/CSS template authoring.
- Editing token generation, expiry durations, recipient selection, sender configuration, authentication flows, or arbitrary Resend provider settings.
- Staff data access for any non-super administrator.
- Publishing, pushing, or committing repository changes.
