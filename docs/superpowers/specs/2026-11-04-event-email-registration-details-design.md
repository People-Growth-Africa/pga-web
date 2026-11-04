# Event registration details in email templates

Approved 4 November 2026.

## Goal

Allow the global event-registration email template to include saved event details
and answers from the recipient's own registration form submission.

## Template placeholders

The `event_registration` template supports these placeholders in its existing
text fields:

- `{{eventName}}`: saved event title.
- `{{eventDate}}`: event start date in `day month year` form
  (for example, `15 November 2026`).
- `{{eventTime}}`: event start and end times in 12-hour `Africa/Lagos` time,
  including the `WAT` zone label (for example, `8:00 PM–10:00 PM WAT`).
- `{{eventLocation}}`: saved event location; online events use `Online`.
- `{{eventFormat}}`: `Online` or `In person`, based on the saved event.
- `{{eventUrl}}`: canonical public URL for the event.
- `{{registrationAnswers}}`: non-empty submitted answers, each paired with the
  saved question label. Pairs are joined with `; ` (for example,
  `Organisation: PGA; Areas of interest: Mentorship, Hiring`); checkbox answers
  retain all selected values separated by `, `.

These are optional tokens: template authors decide where they appear in the
subject, preheader, heading, paragraphs, notes, button label/destination, and
extra-link labels/URLs. Empty answers are omitted. Missing optional event
details use a clear `Not specified` value rather than a misleading claim.
Existing placeholders, including `{{name}}`, continue to work.

## Admin editor

When `event_registration` is selected, show an available-placeholder reference
alongside the existing template fields. Explain that registration answers refer
only to the recipient's own submission. Update the preview to substitute sample
values in the subject, preheader, heading, paragraphs, notes, button, and extra
links for all supported placeholders, so administrators can see how the copy
will read.

Other template types keep their current placeholder guidance. The existing
template content schema and override storage do not change.

## Data flow and safety

The registration endpoint already loads the published event by slug and
validates answers against its saved registration form before sending the
confirmation. Extend the event lookup with the saved start/end timestamps,
location, online status, and slug needed for the placeholders. Build the public
event URL as `${appUrl()}/events/${slug}`. Build answer pairs from the validated
answers and saved question labels; never accept event details or question labels
from client-provided placeholder variables. An online event's location is
`Online`; an in-person event without a saved location uses `Not specified`.

Pass the additional values to the existing template interpolator. Email
rendering continues to HTML-escape interpolated values, and the plain-text
version uses the same resolved content. Do not send other registrants' data or
put these answers into the team notification template.

No schema migration, new dependency, or per-event template is required.

## Validation

Add focused coverage for event-registration interpolation, Lagos date/time
formatting, URL and format/location fallback values, labeled single- and
multi-select answers, omitted unanswered fields, existing placeholders, and
HTML escaping. Run the existing email-template tests, type-check, and lint.
