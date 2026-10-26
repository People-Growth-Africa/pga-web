# Event registration forms: conditional (skip) logic

Approved 26 October 2026. Builds on the editable registration forms shipped earlier
in October.

## Scope of this release

- One condition per question: "show this question only when an earlier choice
  question matches any of these options".
- Choice-style drivers only (multiple choice, checkboxes, dropdown), and only
  questions **above** the dependent one — earlier-only makes circular logic
  impossible, so there is no cycle detection to get wrong.
- Typed answers (text, email, number, date) cannot drive conditions: matching on
  free text is brittle.
- The email question can never carry a condition — the team replies and confirms
  by email.
- Out of scope, deliberately: multiple conditions (AND/OR), typed-answer
  matching, jumping/branching order, sections, file upload, response limits.

## Data model

A question may carry an optional condition inside the existing
`posts.registration_form` JSON. **No database migration**:

```
showIf: { questionId: "q_ab12cd34ef56", anyOf: ["In person"] } | null
```

`null` (or absent) means the question always shows, so every form saved before
this change parses and behaves exactly as it did.

Reads are lenient about conditions; writes are strict:

- `registrationFormSchema` (used by `parseRegistrationForm` when reading a
  stored row) checks only the shape of `showIf`. A stored condition that no
  longer lines up cannot make the whole form fall back to the default questions.
- `registrationFormSaveSchema` (used by the admin save endpoints) adds the
  semantic rules and refuses a stale condition:
  - the named question must exist and sit **above** this one,
  - it must be a choice-style question,
  - `anyOf` must be non-empty and every value must be one of its current options,
  - an email question cannot carry a condition.

## Evaluation rules (identical on client and server)

Questions are walked top to bottom, building the set of accepted answers:

1. No condition → visible.
2. Broken condition (driver missing, not choice, below this question, `anyOf`
   empty or with no option left in common) → **visible: fail open**. A broken
   rule must never make a question silently disappear.
3. Driver hidden → dependent hidden (the driver was never answered).
4. Otherwise visible only when the accepted driver answer shares a value with
   `anyOf`. An optional, unanswered driver hides its dependents.

## Builder UI

Per question, a row: "Show this question only when: Always / [earlier choice
question]", then the driver's options as tick-boxes ("includes any of these").
Existing input and checkbox styling; no new dependencies; up/down buttons
already provide reordering.

**Conditions are never silently cleared or rewritten.** Renaming an option,
deleting the driver, moving it below the dependent, or switching a question to
email leaves the condition in place and shows an inline amber warning naming the
problem; the server refuses to save until it is fixed. (Design note: the first
draft auto-cleared stale conditions; the reviewer flagged that silent clearing
could hide a broken form, so warnings won.)

## Public form

Visibility is recomputed on every answer change. Hidden questions are not
rendered and their typed values are pruned from state before submit, so nothing
stale reaches the server or the confirmation screen.

## Server validation

`validateAnswers` walks in the same order:

- Hidden → required **and** format checks are skipped (a hidden required
  question never blocks submission) and any value that arrived anyway is
  dropped — no error, so a stale browser tab keeps working.
- Visible → validated exactly as before.
- Each hidden question stores a marker `{ questionId, label, type, value: "",
  skipped: true }` so responses read "Not applicable" in the Data table and CSV
  instead of looking like a missing column. Markers never enter the legacy
  name/email/phone/notes columns.

## Responses

Unchanged aside from the marker: answers are stored per question id with a copy
of the label, so old responses stay readable after the form changes.

## Verification

- Parity checks covering: hidden required never blocks, hidden value dropped,
  fail-open on a stale driver, chain (driver of a driver), marker storage and
  CSV formatting, save-schema refusals, client/server agreement.
- `npx tsc -b` and one `npm run build`.

No authentication, role, login-route or permission changes.
