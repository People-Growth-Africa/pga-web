# Dashboard design notes

Companion to `docs/dashboard-design-brief.md`. The brief is what was planned; this
is what was built, why, and what the review found.

---

## 1. Point of entry per screen (as built)

**Talent dashboard**

1. **First:** the "Your next step" card. It sits directly under the greeting, it is
   the largest isolated surface, it holds the only saturated colour on the page,
   and its button is the only primary action (skill 2, 5.2).
2. **Second:** the current stage in the journey strip, read as "Stage 1 of 5:
   Profile" over a filled track (9.3).
3. **Third:** "Your details", where the eye goes when the first two say there is
   nothing to do. It is a read back list, one figure at most ("3 of 4 details").

**Employer dashboard**

1. **First:** the same card, with "Book a consultation" as the one accent.
2. **Second:** "Find talent", because it is the employer's real question and it
   answers honestly that it is not open yet, with the reason (9.5).
3. **Third:** what they asked us for, then their next consultation, which is real
   data when they have requested one.

Both greeting panels above the card stay quiet on purpose: no accent, no button,
one short supporting line. They are identity, not the entry point.

---

## 2. Three decisions, with the sections that justified them

**One saturated accent per screen, so "Find talent" is not a second primary
button.** The starting direction asked for two primary actions on the employer
screen. Only one of them can actually be performed today, and the skill is
explicit that spending the brightest colour evenly means nothing wins (2, 5.2,
16 "oversaturated colour used everywhere"). So "Book a consultation" owns the
accent, and "Find talent" keeps a prominent top third position as a disabled
control with a visible, written reason (9.5, 14.1).

**One editor for the profile, at the place the eye already is.** Availability and
country are edited inside the "Your next step" card, not in a separate settings
form, and the details card below is strictly read only. That keeps a single
primary action per screen (7.1), keeps related things together (3), and keeps the
primary control in one predictable place as the card steps from availability to
country to done (7.1: a primary action that does not relocate).

**Empty states are the design, not the fallback.** Every region without a data
source (matched roles, shortlist, open requests, next consultation) is rendered as
a real empty state: short headline, one line of explanation, one clear next action
(9.5). The three future data sources live in `src/lib/dashboard.ts` as
`PlannedData<T>` with an empty list and a TODO naming the endpoint that will fill
them. That type cannot hold rows, so a screenshot can never show a real visitor an
invented number or an invented person.

---

## 3. Deliberate deviations from the skill

- **Nested corner radii (3).** The formula is inner radius ≈ outer radius −
  padding, which for a 20px card padded 20px means a near square inner element.
  The built page uses the site's existing 12 to 16px radii for controls and inner
  panels instead, because consistency with the rest of the product is the stronger
  rule here (13.6, 14.8).
- **Uppercase (4).** The account panel's eyebrow and the detail labels were
  uppercase. The skill allows uppercase for very short eyebrow text, but the
  request for this task was sentence case and no all caps, so both are now
  sentence case. Nothing else on the screens is uppercase.
- **Country is a native select, not a searchable combobox (6).** The skill prefers
  a searchable combobox for lists longer than 10 to 15 items, and the country list
  is 190. The signup form already uses the shared `Select` component, which is a
  native select, so the dashboard reuses it rather than inventing a second control
  for the same field (13.6). On phones the native select opens the platform
  picker, which supports scrolling and type ahead, so the practical gap is small.
- **Availability is a radio group, not a select (6, 15).** The same value is a
  select at signup. On the dashboard it is the whole task, and three visible
  options means no tap to open a menu and nothing hidden, which suits a person who
  may only see this screen twice (13.4, low frequency favours guidance over
  density). A genuine mutually exclusive set is what radios are for (6).
- **Booking opens the site's existing consultation modal.** The dashboard uses the
  same modal every other call to action on the site uses, rather than a bespoke
  booking screen (13.6). It is a real task with real consequences, so a modal is
  not the low stakes interruption the skill warns about (7.5).
- **The leaf corner appears on one card per dashboard.** The brief said the next
  step card; the employer dashboard has the equivalent card (its single primary
  action), so the signature moment is spent once per screen, not once per product
  (1, 12).

---

## 4. Self review (skill 14), ranked by impact on the user's task

Fixed, highest impact first.

1. **A long unbroken value broke the mobile layout.** With a 102 character name on
   the account, the grid's implicit column (and the detail list's implicit column)
   sized itself from the widest unbreakable word, so the cards grew to 700px on a
   360px screen and `body { overflow-x: hidden }` silently clipped their right
   edge. Fixed by giving both grids an explicit `grid-cols-1` (a definite
   `minmax(0,1fr)` track), `min-w-0` on the columns and rows, and `break-words` on
   the greeting and the intro. Re-measured with the same 102 character name:
   document width 352 at a 360 viewport, every card 312, no clipping (13.7, 14.2).
2. **The journey strip marked an unopened stage as "current step".** With the
   profile complete and the email confirmed, the strip showed "Matched" as the
   stage the talent was standing on, which reads as "something is being reviewed"
   when nothing is. Only Profile and Verified are open today; the strip now marks
   no stage current once both are done, and the caption says the last three open
   when the matching desk starts (14.1, 9.4).
3. **Contrast of the greeting panel's supporting line.** White at 85% over the
   contour artwork dipped below AA where the wash is lightest. It is now solid
   white (14.3).
4. **Small label and detail text at `charcoal/50`.** Raised to at least `/65`
   before measuring: 12px labels come out at 5.25:1 on the white card (14.3).
5. **Duplicate calls to action on the employer screen.** "Find talent" carried its
   own "Book a consultation" button as well as the card above it. Two equal claims
   on the same decision (1, 7.1); the section's paragraph pointed at the card
   instead of repeating the button. **Superseded:** see the round two section
   below, where the same action was given the same weight everywhere on the
   product owner's instruction.
6. **Focus visibility.** Every control on both screens carries a visible
   `focus-visible` ring, verified in the DOM; the disabled "Talent search opens
   soon" control is correctly skipped by the keyboard because it is genuinely
   disabled (11). "Keep your details up to date" now moves focus to the next
   step card's first control rather than only scrolling (8, 11).
7. **Tap targets.** All controls measure at least 44px tall at 360px: the primary
   buttons 52px, secondary 48px, quiet actions and radios 44px.

Remaining, not fixed, with reasons.

1. **White on the brand green primary button is 3.33:1.** This is the site's
   primary button treatment (signup, navbar, booking), it fails AA for 16px text,
   and it is the most important control on these screens. It is a brand wide
   decision, not a dashboard one: darkening the button to `deep-green` reaches
   6.0:1 and a mid green around `#157F5F` reaches about 4.6:1, but either change
   should be made across the whole site at once. Changing it only here would make
   the same action look different on two screens (14.8).
2. **Cards are pure white on a cream page.** The skill asks for off white surfaces
   (5.1). Every card on the site is `#FFFFFF`, so this is a token decision for the
   whole product rather than something to fork in the dashboard.
3. **Inline text links are under 44px tall** ("reset it by email" measures 41px and
   sits inside a sentence). The skill's 44px rule targets controls, and the site
   pattern is a sentence with a link in it, so this is left alone and noted (11).
4. **The navbar's logo link has no visible focus style** anywhere on the site
   (computed outline none on keyboard focus). Pre existing and outside these
   screens, but worth fixing once, in `Navbar.tsx`, for every page.
5. **The journey strip's five labels are tight at exactly 360px** ("Interview"
   measures 51px in a 51px column). They wrap rather than clip below that, and 360
   is the support floor, so this is acceptable, but a shorter word or a slightly
   smaller label would give it headroom (10).

## 5. Verification

- `npx tsc -b`, `npx oxlint` (0 warnings, 0 errors, 102 files), `npm run build`,
  `npm run check:api` (30 modules) all clean.
- `npm run test:dashboard` 11/11 new checks: the two routes, their guards (401,
  403 for the wrong role, 403 for a foreign origin, 405 with Allow), strict schema
  rejection, one column changing without the others, an empty country clearing the
  column, the latest own booking winning, another account's booking never showing
  up, and the rate limit.
- `test:auth` 18/18, `test:newsletter` 15/15, `test:leads` 14/14, `test:auth:ui`
  33/33.
- Browser pass at 360x760 and 1280x900 against a build served from `dist/` with the
  real API and the real database: signup to dashboard, saving availability,
  clearing and re-adding country, the unconfirmed banner retiring after the address
  was confirmed, the journey advancing, the employer screen with and without a
  consultation request, the 500 error state and its "Try again" recovery, and the
  102 character name. Screenshots of the mobile layout were captured early; later
  captures were unavailable because the preview webview stopped compositing, so
  the later checks are measured values from the live DOM rather than pictures.
- Review rows were created with the `dash-review-` prefix and deleted afterwards;
  the one real newsletter row was never touched.

## 6. Decisions wanted

1. Can a talent profile be shown to employers at all, and does a talent opt in per
   profile or per field? Talent search stays disabled until this is settled, and
   the dashboard says so in those words.
2. What does "Matched" mean, and who matches: the advisory team by hand, or a rule
   over field, country and availability?
3. How does consultation booking work past "requested"? Today `GET
   /api/employer/consultation` returns the latest row matched on the account email,
   the table has no status column, and the dashboard therefore says a request is
   not a booking. If the team confirms slots, employers need a status to read.
4. Do these events need in app notifications, or is email enough for now? There is
   no notification system in the repo, so action feedback reuses the existing
   banner and inline message pattern.

---

## 7. Round two: targeted fixes (product owner's list)

Applied to both dashboards, since they share the same components.

1. **One weight for "Book a consultation".** The action is now the solid brand
   green button everywhere it appears: the next step card, and the Find talent,
   Open requests, Shortlist and next consultation regions. The underlined text
   variant is gone. On an employer account with nothing booked that is five
   identical green buttons on one screen, which is more green than the
   one-accent-per-screen rule would spend (5.2). It is what was asked for, so it
   is what shipped; the alternative, if the green reads as heavy in use, is one
   primary button plus a consistent secondary button in the other four places.
2. **The destructive button is the warning colour.** "Delete my account" is now
   filled with a new `terracotta-deep` token (#9B4F1C, white label at about
   5.9:1) instead of charcoal, and its focus ring is terracotta. The deeper shade
   exists because white on plain terracotta is only 3.5:1, and a destructive
   action is the last place to save legibility. Hover darkens to charcoal. The
   password confirmation step and the button copy are unchanged.
3. **The email dependency is stated where the gated card is.** Chosen the less
   invasive option: the notice keeps its current weight, and the next step card
   now carries one line, in the same amber tone, that says the address has to be
   confirmed first and why (2, 14.1).
4. **The two log outs are told apart.** "Log out" is unchanged. "Log out on all
   devices" now sits below a divider, with a solid charcoal border instead of a
   faded one and a line of its own under it ("Ends every device, including
   phones and shared computers."), so it reads as the stronger action without
   borrowing the destructive colour (1, 14.8).
5. **The contradictory email status is fixed, and there is one source.** The
   journey strip's Verified stage was written in the past tense ("We confirmed
   your email address") and that sentence is printed under the stage the talent is
   standing on, so an unconfirmed account read it next to the notice saying the
   opposite. It now reads as the instruction it is: "Confirm your email address
   from the link we sent you." The notice, the detail row and the strip all read
   the same field, `users.email_verified` through `GET /api/auth/me`, and the
   notice was already hidden the moment that field turns true. Re-checked after
   confirming an address: notice gone, strip caption moves to the settled
   sentence, no contradiction.
6. **"Confirmed" now means the email only.** The detail row says "Email
   confirmed" / "Email not confirmed yet" (rendered by one shared
   `EmailStatusNote`, so the two dashboards cannot drift). Employer visibility has
   its own row with its own words: "Visible to employers: Not yet. Talent search
   is not open." It has a TODO to read the talent's own consent setting once
   that exists.
7. **The account icon carries a pending flag.** The dot on the account icon used
   to be a solid green "you are signed in" marker; it is now amber and appears
   only while a required action is open, starting with an unconfirmed email, on
   every page. It clears itself from the same session field. The icon's
   accessible name gains ", Email not confirmed yet", and because phones never
   see the icon, the mobile menu entry carries the same flag as a small badge in
   words.
8. **The profile controls look like controls.** "Change your availability", "Add
   your country" and their siblings are now a light chip button (44px tall,
   visible border, hover to deep green) instead of underlined text (11, 14.7).
   They are deliberately quieter than the primary button because they are not the
   screen's main task.

Still open after this round: the white-on-brand-green label contrast reported in
section 4, which now applies to five buttons on the employer screen and still
needs one site wide decision.

---

## 8. Round three: second review pass against the skill

The full pass over both dashboards, section by section, with the measured
evidence for each rule, lives in `docs/dashboard-skill-audit.md`. It also records
the rule that decides what the journey strip says (and the new
`test-dashboard-rules` suite that holds the unconfirmed email case), the six
fixes asked for in this round, the conflicts resolved in writing, and the
remaining problems ranked by impact.

Where round two is superseded:

- The email dependency note on the talent card is gone: confirming the address
  **is** that card's step now, with the primary button, and the page notice is off
  for that screen (supersedes round two item 3).
- "Opens soon" is neutral grey rather than amber, so amber means needs attention
  and nothing else (supersedes the round one note that calls amber the pending
  colour).
- The employer screen's five repeated green buttons are down to two: the merge of
  Find talent with Shortlist and of Open requests with the consultation removed
  three regions and their buttons.
- "Delete your account" moved from the account column to the bottom of the page,
  behind a disclosure.

Section 4's inline link item is closed (the link is 44px tall now) and section
5's journey label item stands.

Also in this round, at the product owner's request: the public site answers
`/auth` with a coming soon page, while localhost and every `*.vercel.app`
deployment keep the real sign up and log in forms so the flow can be shown before
launch. The rule is `src/lib/accountGate.ts`, it mirrors the API's
`isLocalOrPreview` host list, and `npm run test:auth:gate` holds it (13 checks).
It is a presentation rule, not a security control: the API's own guards are
unchanged, and a signed in session is redirected to its dashboard before the gate
is ever consulted.
