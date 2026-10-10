# Dashboard design brief

The built result, the self review and its findings are in `docs/design-notes.md`.
Where the notes differ from this brief, the notes are the record of what shipped
and why.

Scope: replace the two placeholder dashboards (`/talent/dashboard`,
`/employer/dashboard`) with real dashboards for signed in users.

Design authority: `docs/uiux-design-skill.txt`. Section numbers below refer to it.
Every number, name and state on these screens is either read from a real column or
rendered as an honest "not yet" state. Nothing is invented.

---

## What data actually exists today

| Fact on screen | Source | Real? |
| --- | --- | --- |
| Greeting, "Your details" rows (name, email, field, country, availability), company, what the employer asked for | `users`, `talent_profiles`, `employer_profiles` via `GET /api/auth/me` | yes |
| Email confirmation state ("Verified" stage, banner) | `users.email_verified` | yes. It is a journey stage and a banner of its own, so it is deliberately not also counted in the strength figure: the same progress is never printed twice |
| Profile strength figure | count of the four filled profile fields (`name`, `field`, `country`, `availability`), printed as "3 of 4 details" | yes, computed |
| Availability and country editing | new `POST /api/talent/profile` | yes |
| Employer's requested consultation | new `GET /api/employer/consultation`, matched on the signed in account email | yes, own row only |
| Matched roles, shortlist entries, incoming requests | no table, no endpoint | **no.** Empty state + typed placeholder + TODO in `src/lib/dashboardData.ts` |
| Talent search results | no endpoint, and building one needs a privacy decision first | **no.** Disabled "opens soon" region on the employer screen |

---

## Talent dashboard

### Section 15 dimensions

- **User goal.** A mix of *act* and *monitor*: complete one profile step, then
  glance at where they are and whether anything has moved. Acting wins when a
  field is missing, monitoring wins once it is not (15, "USER GOAL").
- **Content type and volume.** Tiny, textual, near numeric: a handful of profile
  fields, one status per journey stage, no lists of more than a few rows (15,
  "CONTENT TYPE & VOLUME"). A handful of items means everything can be shown,
  no filtering or pagination.
- **Interaction frequency.** Occasionally, not daily. A talent signs up, fills
  the profile, then returns when something changes or when we email them
  (`15, "INTERACTION FREQUENCY"`, `1, "Design for the repeat user"`).
- **Product type and context.** Consumer facing, plain language, no technical
  vocabulary (15, "PRODUCT TYPE & CONTEXT"). Closer to a guided checklist than
  an admin panel.
- **Device.** Mostly phone, held in one hand, often on mobile data (15, "DEVICE";
  3, single column; 10, explicit degradation).
- **Complexity and risk.** Low risk except for the account actions. Nothing here
  is destructive apart from delete account, which keeps its confirmation (15,
  "COMPLEXITY & RISK"; 9.6).

### Section 13 steps

1. **The user's goal:** "finish my profile so employers can find me" (13.1).
2. **The single primary action or fact:** the one thing their profile is still
   missing, and the control that fixes it (13.2). Falls back to "you are all set"
   once nothing is missing.
3. **Right density:** low. One card at a time, one control in it, everything else
   read only (13.4: used rarely, by people who are not learning an interface they
   know well).
4. **Edge cases:** empty profile fields (the normal first visit), loading, a
   failed save, a failed profile fetch, a 100 character name, a 100 character
   field name, first visit versus hundredth visit (13.7). Handled in the build
   section below.

### Point of entry (section 2)

1. **First:** the "Your next step" card. It is the largest isolated surface on the
   screen, it is the only element carrying the saturated accent colour, and its
   button is the only primary action (2: position, size, saturation; 5.2: one
   saturated accent per screen).
2. **Second:** the current stage in the journey strip, read as "Stage 1 of 5:
   Profile" with a filled track behind it (9.3: show progress, not a label alone).
   Only Profile and Verified can actually be reached today, so once both are done
   no stage is marked as the one the talent is standing on: marking an unopened
   stage "current" would claim something is being reviewed when nothing is.
3. **Third:** the "Your details" summary, which is where the eye goes when the
   first two say "nothing to do" (7.2: one dominant figure, the profile strength
   count, not a wall of equal rows).

The greeting panel above the card stays deliberately quiet: no accent, no button,
small heading, one line of orientation. It is identity, not the entry point.

### Screen order

Phone, single column, top to bottom:

1. Greeting panel (identity, orientation).
2. **Your next step** (leaf corner, one accent button).
3. Your journey (five stages).
4. Your details (read only summary + profile strength).
5. Matched roles (empty state until matching exists).
6. Account and security (unchanged behaviour from today's shell).

Desktop, at 900px and up: two columns, primary column on the left (next step,
journey, matched roles) and secondary on the right (details, account and
security). The primary action keeps the top-left position it has on the phone
(7.1: fixed position, muscle memory).

---

## Employer dashboard

### Section 15 dimensions

- **User goal.** Mainly *act* with a short *monitor* tail: book the consultation
  they came for, then see what happens next (15, "USER GOAL").
- **Content type and volume.** A handful of rows: what they asked for, their
  shortlist, their requests, their next consultation. No data volume yet (15,
  "CONTENT TYPE & VOLUME").
- **Interaction frequency.** Rare, a few times in a hiring cycle. Every visit
  should be readable with no memory of the last one (15, "INTERACTION
  FREQUENCY").
- **Product type and context.** Consumer facing service, not a recruiting ATS.
  Plain language, no pipeline jargon (15, "PRODUCT TYPE & CONTEXT").
- **Device.** Mostly phone. Employers sign up from a phone between meetings
  (15, "DEVICE").
- **Complexity and risk.** Booking is a real commitment, so it gets a clear
  summary of what was requested and what happens next, but nothing here is
  destructive (15, "COMPLEXITY & RISK").

### Section 13 steps

1. **The user's goal:** "get the people I need, starting with a conversation"
   (13.1).
2. **The single primary action or fact:** book a consultation. Talent search is
   the job that has no implementation yet, so it is presented as what it is: not
   open, with the reason (13.2).
3. **Right density:** low; four short sections, each with at most one action
   (13.4).
4. **Edge cases:** no consultation booked, no shortlist, no requests, a failed
   lookup, a 150 character company name, first visit with nothing yet (13.7).

### Point of entry (section 2)

1. **First:** the "Your next step" card, the same leaf cornered card as the
   talent screen, with the one saturated button ("Book a consultation").
2. **Second:** the "Find talent" region, because it is the employer's real
   question and needs an honest answer near the top rather than at the bottom
   (9.5: an empty region explains itself and offers a next action; it is a
   disabled control with a visible reason, not a hidden one).
3. **Third:** "What you asked us for" (their real signup answers) and the next
   consultation, which is where the eye goes when the first two are done.

### Screen order

Phone, single column:

1. Greeting panel, with the company name in the supporting line.
2. **Your next step** (leaf corner, one accent button: book a consultation).
3. Find talent (disabled, honest "opens soon", plus the consent decision it
   waits on).
4. What you asked us for, and open requests (their real `needs`, then the honest
   empty state for requests).
5. Shortlist (empty state, next action).
6. Your next consultation (real booking when there is one, empty state when
   there is not).
7. Account and security.

Desktop: same two column restructure as the talent screen.

---

## Deliberate divergence from the starting direction

The brief asked for two primary actions on the employer screen ("Find talent" and
"Book consultation"). Only one of those can actually be performed today, and
sections 2 and 5.2 are explicit that one saturated accent per screen is what makes
the primary action findable. So "Find talent" keeps a prominent top-third position
and a full explanation, but it is a disabled control, and the single accent
belongs to "Book a consultation". Two equally saturated buttons would tell the eye
nothing (16, "Oversaturated colour used everywhere").

## Decisions still needed from the product owner

1. Can a talent profile be shown to employers at all, and does the talent opt in
   per profile or per field?
2. What does "Matched" mean, and who does the matching: the advisory team by
   hand, or a rule over field, country and availability?
3. How does consultation booking work beyond a request: does the team confirm a
   slot by email, and does a confirmed consultation change the employer's
   screens?
4. Do we want in-app notifications for these events, and is email enough for now?
