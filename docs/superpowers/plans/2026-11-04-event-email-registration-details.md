# Event Registration Details in Email Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add event schedule/location/link and the recipient's submitted registration answers as optional placeholders in the event-registration email template.

**Architecture:** Build a server-side placeholder map from the published event loaded by the registration endpoint and the validated answer/question-label pairs. Feed it through the existing template interpolator, and update the admin email-template editor to document and preview all available placeholders.

**Tech Stack:** TypeScript, Node.js, React, existing email template renderer, Node.js built-in assertions.

## Global Constraints

- Additional details are optional tokens in the `event_registration` template only.
- Event values come from the server-loaded published event; question labels and answers come from the validated registration.
- Only the recipient's own submitted answers go into their confirmation email; do not send other registrants' data or put these answers into the team notification template.
- Email rendering continues to HTML-escape interpolated values, and the plain-text version uses the same resolved content.
- No schema migration, new dependency, or per-event template is required.

---

## File map

- Create `api/_lib/registration-email.ts` to format event details and validated answers into the template-variable record.
- Modify `api/_lib/db.ts` to return event start/end timestamps, location, and online status from `findEventForRegistration`.
- Modify `api/_lib/routes/registrations.ts` to build the variable record from the loaded event and validated answers.
- Modify `api/_lib/email.ts` to pass registration variables to `resolveEmailTemplate`.
- Modify `scripts/test-email-templates.mjs` to cover event variable formatting, interpolation, and escaping with the existing unit suite.
- Modify `src/pages/admin/AdminEmailTemplates.tsx` to show the event-token reference and substitute sample values throughout the preview.

### Task 1: Build and test registration email variables

**Files:**
- Create: `api/_lib/registration-email.ts`
- Modify: `scripts/test-email-templates.mjs`

**Interfaces:**
- Consumes: `StoredAnswer[]` from `api/_lib/registration-form.ts`.
- Produces:

```ts
export type RegistrationEmailEvent = {
  slug: string;
  title: string;
  event_start: string | null;
  event_end: string | null;
  location_text: string | null;
  is_online: boolean;
};

export function buildRegistrationEmailVariables(
  event: RegistrationEmailEvent,
  answers: StoredAnswer[],
  siteUrl: string,
): Record<string, string>;
```

- The variable map includes `eventName`, `eventDate`, `eventTime`, `eventLocation`, `eventFormat`, `eventUrl`, and `registrationAnswers`.

- [x] **Step 1: Add failing assertions to the email-template test**

In `scripts/test-email-templates.mjs`, import `buildRegistrationEmailVariables` and add these assertions before the final success log:

```js
const { buildRegistrationEmailVariables } = await import('../api/_lib/registration-email.ts');
const registrationVariables = buildRegistrationEmailVariables(
  {
    slug: 'career-advancement',
    title: 'Career Advancement',
    event_start: '2026-11-15T19:00:00.000Z',
    event_end: '2026-11-15T21:00:00.000Z',
    location_text: 'Accra Centre',
    is_online: false,
  },
  [
    { questionId: 'name', label: 'Full name', type: 'short_text', value: 'Ada Okafor' },
    { questionId: 'interests', label: 'Areas of interest', type: 'checkboxes', value: ['Mentorship', 'Hiring'] },
    { questionId: 'notes', label: 'Additional notes', type: 'paragraph', value: '', skipped: true },
  ],
  'https://www.peoplegrowthafrica.com',
);
assert.deepEqual(registrationVariables, {
  eventName: 'Career Advancement',
  eventDate: '15 November 2026',
  eventTime: '8:00 PM–10:00 PM WAT',
  eventLocation: 'Accra Centre',
  eventFormat: 'In person',
  eventUrl: 'https://www.peoplegrowthafrica.com/events/career-advancement',
  registrationAnswers: 'Full name: Ada Okafor; Areas of interest: Mentorship, Hiring',
});

const onlineWithoutDetails = buildRegistrationEmailVariables(
  {
    slug: 'online-event',
    title: 'Online Event',
    event_start: null,
    event_end: null,
    location_text: null,
    is_online: true,
  },
  [],
  'https://www.peoplegrowthafrica.com',
);
assert.equal(onlineWithoutDetails.eventDate, 'Not specified');
assert.equal(onlineWithoutDetails.eventTime, 'Not specified');
assert.equal(onlineWithoutDetails.eventLocation, 'Online');
assert.equal(onlineWithoutDetails.registrationAnswers, '');
```

- [x] **Step 2: Run the email-template test to confirm it fails**

Run:

```text
npm run test:email-templates
```

Expected: FAIL because `api/_lib/registration-email.ts` does not exist yet.

- [x] **Step 3: Implement the variable builder**

Create `api/_lib/registration-email.ts`. Format dates with `Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' })`; return `Not specified` for missing or invalid timestamps. Format each valid time with `Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true })`; combine a start and end as `<start>–<end> WAT`, a lone start as `<start> WAT`, and return `Not specified` if there is no valid start. Format answer entries as `label: value`, joining checkbox values with `, ` and answer entries with `; `; omit skipped or empty values. Set online location to `Online`, missing in-person location to `Not specified`, and format to `Online` or `In person`. Build the URL as `${siteUrl}/events/${event.slug}`.

- [x] **Step 4: Run the email-template test**

Run `npm run test:email-templates`.

Expected: PASS, including the new variable-formatting assertions and all existing template checks.

### Task 2: Pass server-validated event and answer data into the email

**Files:**
- Modify: `api/_lib/db.ts`
- Modify: `api/_lib/routes/registrations.ts`
- Modify: `api/_lib/email.ts`
- Test: `scripts/test-email-templates.mjs`

**Interfaces:**
- Consumes: `buildRegistrationEmailVariables(event, answers, siteUrl)` from Task 1.
- `findEventForRegistration(slug)` returns its existing `slug`, `title`, and `status` plus `event_start`, `event_end`, `location_text`, `is_online`, and `registration_form`.
- `sendRegistrationConfirmationEmail(to, variables)` receives `Record<string, string>` and resolves the `event_registration` template with those values.

- [x] **Step 1: Test replacement and escaping with the new variables**

In `scripts/test-email-templates.mjs`, import `interpolateTemplate` from `api/_lib/email-templates.ts` and assert the added placeholders resolve:

```js
assert.equal(
  interpolateTemplate('{{eventName}} on {{eventDate}}: {{registrationAnswers}}', registrationVariables),
  'Career Advancement on 15 November 2026: Full name: Ada Okafor; Areas of interest: Mentorship, Hiring',
);
const unsafeVariables = {
  ...registrationVariables,
  registrationAnswers: '<script>alert(1)</script>',
};
const answerHtml = renderEmail({
  preheader: 'Registration details',
  heading: 'Your registration',
  paragraphs: [`Answers: ${interpolateTemplate('{{registrationAnswers}}', unsafeVariables)}`],
  reason: 'Reason',
  site: 'https://www.peoplegrowthafrica.com',
});
assert.match(answerHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(answerHtml, /<script>/);
```

- [x] **Step 2: Extend the event lookup**

Update the return type and SQL for `findEventForRegistration` in `api/_lib/db.ts` to select the event's start and end timestamps using the existing `isoTimestamp` helper, plus `location_text` and `is_online`. Keep the lookup restricted to `type = 'event'` and preserve the current `slug`, `title`, `status`, and `registration_form` values.

- [x] **Step 3: Build variables only from loaded event data and validated answers**

In `api/_lib/routes/registrations.ts`, after `validateAnswers` succeeds and the recipient `name` is known, call `buildRegistrationEmailVariables` with the loaded event, `answers` returned by `validateAnswers`, and `appUrl()`. Add `name` to the returned variable record and pass that record to `sendRegistrationConfirmationEmail`. Do not use any event title, question label, or answer label sent independently by the browser.

- [x] **Step 4: Update the confirmation email function**

In `api/_lib/email.ts`, change `sendRegistrationConfirmationEmail` to accept the recipient and variable record, remove slug-derived title generation, and call:

```ts
const template = await resolveEmailTemplate('event_registration', variables);
```

Leave the template action/link behavior, send tag, plain-text rendering, HTML rendering, and failure handling unchanged.

- [x] **Step 5: Run the focused email-template tests**

Run `npm run test:email-templates`.

Expected: PASS for placeholder interpolation, escaped HTML, and the existing email-template behavior.

### Task 3: Document placeholders and preview their resolved values

**Files:**
- Modify: `src/pages/admin/AdminEmailTemplates.tsx`

**Interfaces:**
- Consumes no new API shape; template data continues to use the existing `/api/admin/email-templates` response.
- The preview substitutes sample values for all recognized template placeholders in the subject, preheader, heading, paragraphs, notes, button label/destination, and extra-link labels/URLs.

- [x] **Step 1: Add preview sample values**

Define a local preview map near the existing editor constants:

```ts
const PREVIEW_VARIABLES: Record<string, string> = {
  name: 'Ada Okafor',
  email: 'ada@example.com',
  kind: 'New enquiry',
  eventName: 'Career Advancement in Agriculture',
  eventDate: '15 November 2026',
  eventTime: '8:00 PM–10:00 PM WAT',
  eventLocation: 'Accra Centre',
  eventFormat: 'In person',
  eventUrl: 'https://www.peoplegrowthafrica.com/events/career-advancement',
  registrationAnswers: 'Full name: Ada Okafor; Areas of interest: Mentorship, Hiring',
};
```

Add a local `previewText(value: string)` that replaces `/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g` with the corresponding sample value and leaves unknown tokens unchanged, so templates with future or intentionally unsupported placeholders remain visibly diagnosable.

- [x] **Step 2: Show the event-registration token guide**

When `selected.id === 'event_registration'`, show a helper panel listing the exact tokens `{{eventName}}`, `{{eventDate}}`, `{{eventTime}}`, `{{eventLocation}}`, `{{eventFormat}}`, `{{eventUrl}}`, and `{{registrationAnswers}}`. Explain that `{{registrationAnswers}}` contains only the current registrant's non-empty answers. Keep existing generic placeholder guidance for other template types.

- [x] **Step 3: Apply sample interpolation throughout the preview**

Use `previewText` for the preview subject and preheader, heading, each paragraph, notes, action label and destination, and each extra-link label and URL. The current preview does not show the preheader or button destination; show the interpolated preheader beneath the subject and show the interpolated button URL as small text beneath a preview button that has a destination. Leave editable form values and values sent to the API unchanged.

- [x] **Step 4: Run type-check, tests, and lint**

Run:

```text
npm run test:email-templates
npx tsc -b
npm run lint
```

Expected: tests and type-check pass. Lint may report existing repository warnings; confirm there are no new errors attributable to the changed files.

- [x] **Step 5: Review the final diff**

Run `git --no-pager diff --check` and inspect the planned feature files. Confirm the event-registration email gets only that registrant's validated answers, other template types are unchanged, and no schema or migration files were added.

- [x] **Step 6: Commit only the approved feature files**

Stage the feature files from this task (`api/_lib/registration-email.ts`, the event lookup/route/email changes, `scripts/test-email-templates.mjs`, and `src/pages/admin/AdminEmailTemplates.tsx`) and the already implemented confirmation-link feature files from the previous request (`src/lib/confirmationMessage.ts`, `src/components/EventRegistrationModal.tsx`, `src/components/admin/RegistrationFormBuilder.tsx`, `scripts/test-registration-confirmation.mjs`, and `package.json`). Do not stage unrelated existing worktree files, including `src/components/Layout.tsx`, `src/components/MonthGreetingPopover.tsx`, or unrelated untracked directories/files. Commit with a message such as `feat: add event details to registration emails`.

- [x] **Step 7: Push the committed changes to `main`**

After confirming the current branch is `main` and the target commit is a fast-forward of `origin/main`, run `git push origin main`. If the push is rejected or the remote has diverged, stop and report the exact result; do not force-push.
