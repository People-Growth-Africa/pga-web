# Dashboard skill audit

Second pass over the talent and employer dashboards against
`docs/uiux-design-skill.txt`, on top of the round two work recorded in
`docs/design-notes.md`.

Evidence is measured, not asserted. Every size, ratio and word in this document
was read off the running build (`dist/` served with the real API against the real
database) at 360x760 and 1280x900, or read from the source named beside it. Where
a rule does not apply, or two rules conflict, the reason is written out with the
section numbers.

Statuses: **passes**, **fixed** (found broken this round, now fixed), **N/A** (does
not apply to this product, with the reason), **conflict resolved** (two rules
pulled against each other; the one that won and why).

---

## 0. Three questions before every decision (top of the skill)

Answered once, because both screens answer them the same way.

| Question | Answer for these screens |
| --- | --- |
| What is the user's task? | Talent: finish a profile and know where they stand. Employer: reach people to hire. Both are **acting**, not monitoring, so the layout leads with one action and pushes everything else below it. |
| Where is the eye, and what is urgent? | The next step card, first in the reading order, the largest isolated surface, the only place the accent and the leaf corner are spent. Nothing else competes for that role. |
| What is at stake, and is it reversible? | Nothing here is irreversible except account deletion, which is therefore the last row on the page, behind a disclosure, with the password confirmation and the alternative to it (log out) above it. |

---

## Section by section

### 1. Philosophy (prioritisation, restraint, repeat user, no work pushed onto the user)

**passes**

- Decoration: the only ornament is the leaf, used once per screen (1 corner, 1
  empty state mark, measured `leafCorners: 1`, `leafGlyphs: 1` on both screens).
  The contour wash lives inside the greeting panel alone.
- No work pushed onto the user. Fixed this round: the talent screen said the same
  thing twice (a banner and a next step card), so the reader had to work out which
  one was the real step. The banner is off for that screen and the card carries
  the action (`DashboardPanel.tsx` `emailNotice`, `EmailConfirmation.tsx`).
- Repeat user: the dashboard is opened repeatedly, so the fixed frame (greeting,
  details, account, deletion) is identical on both screens and never moves.
- Consistency beats novelty: same button weights, same card padding, same notice
  components on both screens; the country field remains the site's one `Select`
  rather than a second control invented for the dashboard.

### 2. Hierarchy (one entry point, then second and third; no flat hierarchy)

**passes**

Named from the measured block order (`top` and font size, live DOM), not from
intention.

Talent, 360px: **first** the "Your next step" card (heading 21.6px, the only
accent, the leaf corner, top of the column); **second** "Your journey" (20px, the
strip plus one caption line); **third** "Matched roles" (20px, honest empty
state). The aside ("Your details") follows the primary column on a phone, which
is correct: it is read, not acted on. At 1280px: first the same card (27.2px,
572px wide), second "Your journey", third either "Matched roles" or the aside,
and the aside keeps one left edge at x=752.

Employer, 360px: **first** "Talk to our advisory team" (21.6px, accent, leaf);
**second** "Find talent" (the employer's actual question, grey "Opens soon"
chip); **third** "Your requests" (real data when a request exists). At 1280px the
same order with the aside at x=752.

No flat hierarchy: the greeting is identity (its own dark panel, no button, no
accent), the entry point is one card with one accent, and the read back regions
are plain white cards with outline actions.

Fixed this round: the employer screen carried four regions of equal weight
(Find talent, Shortlist, Open requests, Next consultation), two of them empty
states with their own primary button. See 7.

### 3. Layout and spacing (proximity, one alignment edge, single column, radii, button padding)

**passes**, with one **conflict resolved**

- One left edge: every card's content starts at the same x inside the card
  (measured: all blocks at x=160 on desktop, one padding token per card).
- Proximity: 20px between cards, 24 to 32px between a heading and the content it
  owns, dividers only inside a card (`border-t border-charcoal/10`), never a
  divider between two things that belong together.
- Single column on mobile: `grid-cols-1` up to 900px, two columns from 900px
  (`DashboardPanel.tsx`), measured 352 wide document at a 360 viewport.
- Button padding about 2:1: primary 14px/28px, secondary 12px/24px, log out
  12px/24px, chips now 10px/20px (this round raised the chips from `px-4` to
  `px-5`).
- Expanded view keeps the same grouping: the profile editor opens inside the same
  card at the same place, the employer's merged "Your requests" card shows the
  real consultation in the same slot the empty state occupied.

**Conflict resolved (3 vs 1.5, 14.8).** The nested radius formula (inner radius
approximately outer minus padding) would give about 0 to 4px for a 20px card
padded 20px, i.e. a hard square panel inside a soft card. The build keeps the
site's radius family instead (20px cards, 16px inner panels, 12px message
strips), applied consistently, because consistency with the rest of the product
is the stronger rule here. Recorded rather than silently changed.

### 4. Typography (weight and contrast, no all caps, scannable, the important word legible)

**passes**

- No uppercase text in either dashboard's content area (measured: zero elements
  with `text-transform: uppercase` inside `main`). The footer's "SERVICES" style
  eyebrows are site chrome outside these screens, and are short label uppercase,
  which the section allows.
- Sentence case headings, sentence case buttons, sentence case labels.
- Scannable repeated structures: detail rows are label (12px semibold,
  charcoal/65) over value (16px, charcoal), identical on both screens through
  `DetailList`.
- The most important word on the screen is the largest heading inside the card
  (the step itself), and the state word ("Email confirmed", "Opens soon") is
  always written, never colour alone.

### 5. Colour (one accent, semantic mapping, distinct states, no pure black or white, dark mode)

**fixed** for the semantic map, **passes** elsewhere, one site-wide item remains.

- One accent: the saturated brand green is spent on the primary action only
  (measured 2 green buttons on the employer screen, down from 5 in round two: the
  entry point card and "Find talent"). The reporting card uses the outline
  secondary for the same action so the accent is not spent three times (5.2
  against 14.8, see the decisions list).
- Semantic map, fixed this round: "Opens soon" was amber, which is the colour the
  product uses for "needs attention" (unconfirmed address, refused save, error).
  Two meanings on one colour is the inconsistency the section names. The chip is
  now neutral grey (charcoal/8 tint, charcoal/75 label, 6.3:1). Amber now means
  needs attention and nothing else on these screens: the unconfirmed email notice,
  the dependency note, the error message, the navbar dot.
- Green and red as declared: green for confirmed and for success, deep terracotta
  (`#9B4F1C`, white at 5.95:1) for the destructive button, red focus ring on it.
- Distinct states on every control: default, hover, focus-visible ring, pressed
  (same as default for buttons, since no pressed style exists site wide) and
  disabled (`opacity-70`, plus `cursor-not-allowed`), all present in the class
  tokens in `DashboardButtons.tsx`.
- No pure black or pure white *text*: body text is `#1A1E1B` on `#FFFFFF` cards
  over `#F2EDE4` page. Pure white surfaces on a cream page are a product token
  (below).
- Dark mode: **N/A.** The site has no dark mode (no `prefers-color-scheme` rules
  anywhere in `src/`). Adding one for the dashboards alone would break the
  consistency the section's own introduction asks for.

### 6. Forms (labels, placeholder vs entered, optional, semantics, validation, destructive copy)

**passes**, one **conflict resolved**

- Persistent labels everywhere: the country field and the delete password field
  both carry a real `<label>`; no placeholder-only field exists on either screen.
- Placeholder distinct from entered text: placeholders render at charcoal/40,
  entered text at full charcoal. (Contrast of the placeholder itself is listed
  below as a site-wide item.)
- Optional is marked, never an asterisk: "Country (Optional)".
- Correct semantics: availability is a three option radio group (a genuine
  mutually exclusive set, all three visible without opening a menu), the terms
  agreement is a checkbox, the country is a select.
- Validation attached to its field, fixed this round: the delete refusal used to
  render above the form, unconnected. It now sits directly under the password
  input at `#delete-password-error`, with `aria-invalid` and `aria-describedby`
  pointing at it from the input (verified in the DOM after submitting empty).
- Destructive copy restates the action: "Delete my account", with the consequence
  sentence and a password step; log out above it is the reversible alternative.
- Country list: **conflict resolved (6 vs 1, 13.6).** The section prefers a
  searchable combobox for lists over 10 to 15 items, and the country list is 190.
  The same field on the talent signup form is the site's shared native `Select`,
  and a committed UI test asserts that control (`test-auth-ui.mjs` check 6.2 reads
  `#auth-country` options, 197 of them). Swapping the dashboard's field for a
  custom combobox would make one field behave two ways in the same product flow
  and would put an auth screen in the blast radius of a new control. The native
  select keeps its platform picker on phones and its type ahead on desktop, and
  the dashboard now says so in the field's own hint: "Type the first letters to
  jump through the list, or leave this empty if you would rather not say."

### 7. Components (one primary per section, cards for one unit, labelled, modals)

**fixed** (the merge), otherwise **passes**

- **7.1 One primary action per section.** Every card has exactly one primary
  button; the profile editor is the one place where the primary control changes
  label, and it stays in the same card, in the same position, as the card steps
  from email confirmation to availability to country to settled (a primary action
  that never relocates).
- **7.2 Cards hold one coherent unit.** This is the round's main fix on the
  employer screen. "Find talent" and "Shortlist" are one job (find people, keep
  the ones worth returning to) and are now one card with one action and one empty
  state. "Open requests" and "Your next consultation" described one request read
  from one endpoint, so they are now one card, "Your requests", holding the
  stated needs and the consultation the account actually has. Four regions became
  two.
- **7.3 Carousels:** **N/A.** No carousel exists on either dashboard.
- **7.4 Bottom nav:** **N/A.** The product is a desktop and mobile web app with a
  fixed top navigation; there is no bottom tab bar to configure.
- **7.5 Modals only for blocking decisions.** The dashboards open the site's one
  consultation modal, which is a real task with a real consequence (a request that
  the team then confirms by email), not low stakes content. Nothing else on the
  dashboards is modal.
- Wording, fixed this round: "Find talent" no longer explains the team's internal
  consent reasoning. It says what an employer can do today and what opens later,
  and the plainer card description ("Talent search and shortlists open soon")
  replaces the paragraph about what has to be settled first.

### 8. Navigation (stable nav, clear active state, utility icons right, one tap to overflow)

**passes**

- The top navigation is identical on both dashboards and does not change with
  scroll beyond its existing behaviour.
- Active state: the account entry carries `aria-current="page"` while a dashboard
  is on screen (verified in the DOM: `aria-current: page`, accessible name "Your
  dashboard, Email not confirmed yet"). The attention flag is part of the
  accessible name, not a colour only signal.
- Utility icons sit right (account, then the site call to action); the mobile menu
  is one tap from the header at every width, and both dashboards are reachable in
  one tap from the account entry.
- No back or close control belongs to these screens; the only exit is the normal
  navigation, so there is nothing to place against convention.

### 9. Feedback (instant response, skeletons, human errors, empty states, destructive confirmation, no dark patterns)

**passes**

- **9.1 Instant acknowledgement.** Every submit button swaps to "Please wait" with
  `aria-busy` while in flight (profile save, country save, resend link, log out,
  account deletion, and the retry on the consultation read).
- **9.2 Skeletons, not spinners.** The employer's consultation read renders three
  shaped placeholder lines inside a `role="status"` region, and the signed in
  shell renders `DashboardSkeleton` (the real layout in blocks) while the session
  is read back. No spinner appears anywhere on these screens.
- **9.3 Progress.** The five stage journey strip, with the current stage marked
  and the caption naming it ("Stage 2 of 5: Verified."), is the progress
  indicator for the talent flow.
- **9.4 No raw system errors.** The read failure is written as "We could not load
  your consultation requests. Check your connection and try again. Nothing you
  have sent has been lost." with a "Try again" button; form failures use the
  server's human messages, and a 500 is answered by the API with "Something went
  wrong on our side. Try again in a moment." No status code, stack or id is
  rendered.
- **9.5 Real empty states.** Each of the three planned regions explains what will
  appear and offers the next action; nothing is blank space.
- **9.6 Destructive confirmation, no dark patterns.** Deletion is behind a
  disclosure, states its consequence, requires the password, and its button says
  "Delete my account". One step, plain copy, no guilt, and the reversible exit
  (log out) sits above it, so the friction is not reversed between joining and
  leaving.

### 10. Responsive (restructure, not shrink; targets hold after scaling)

**passes**

- The layout restructures at 900px (two columns to one, the aside moving below the
  primary column) rather than shrinking. No table exists to squeeze.
- Measured at 360: document 352 wide, no horizontal overflow, and every card 312
  wide. The long value case (a 102 character name) still wraps rather than
  widening the grid.
- Touch targets re-checked at both widths after the changes: no interactive
  element inside `main` measures under 44px at 360 or at 1280.

### 11. Touch targets (44px minimum, whole rows clickable, nothing hover only)

**fixed**

- The "reset it by email" link was 41px tall. It is now a 44px inline box with
  negative vertical margins, so the sentence it sits in does not move (measured
  44px, paragraph height unchanged at 46px over two lines).
- The delete row is a full width 44px button, so the whole row is the target, and
  expanding it moves focus to the password field.
- Every other control already measured at or above 44px: primary 52, secondary 48,
  chips 44, quiet actions 44, disclosure row 44, availability radios 44 through
  their labels.
- Nothing works only on hover. Every hover style has a focus-visible equivalent.

### 12. Personality and motion (proportional to stakes, continuity, tone)

**fixed** (one glyph per screen), otherwise **passes**

- The leaf is now spent once per screen in an empty state, plus the corner of the
  entry card. The employer screen previously drew a glyph in both of its empty
  states; `EmptyState` now takes a `mark` prop and only a screen's first empty
  state sets it (measured: 1 corner, 1 glyph on both screens).
- Motion confirms rather than decorates: colour transitions on controls only, all
  guarded by `motion-reduce:transition-none`, and the "keep your details up to
  date" link scrolls without motion when reduced motion is requested.
- Nothing playful near deletion: the row is a plain sentence case line, no leaf,
  no colour until the panel is open, and the destructive button is the only red
  thing on the page.

### 13. Decision framework (the seven steps)

**passes**

Run for this round's three real decisions. Goal and frequency (step 1, 2): a
repeatedly visited acting screen, so the entry point keeps the accent and the
read back regions stay quiet. Constraints (step 4): no matching, shortlist,
request or notification backend exists, so every such region stays an honest
empty state and no invented row is possible (`PlannedData<T>` cannot hold rows).
Edge cases (step 7): empty, loading, error, very long value, 360px, and the
unconfirmed email state were each exercised on the running build.

### 14. Review framework (all nine lenses)

| Lens | Finding |
| --- | --- |
| 1 Hierarchy | Passes. Entry point named per screen at both widths (section 2 above). |
| 2 Spacing and alignment | Passes. One left edge, one card gap, radii conflict recorded. |
| 3 Colour | Fixed ("Opens soon" is neutral now); one accent per screen; amber is needs attention only. |
| 4 Forms | Fixed (validation attached to the delete field); country combobox conflict recorded. |
| 5 Feedback | Passes (skeletons, human errors, retry, empty states, disclosure). |
| 6 Navigation | Passes (`aria-current`, one tap overflow, utility icons right). |
| 7 Touch targets | Fixed (the reset link); everything else already 44px or more. |
| 8 Consistency | Passes. Same components, same weights, one action one look. |
| 9 Prioritise by impact | Applied: the duplicate message, the four flat employer regions, the disclosure and the contrast fix came before the chip padding and the leaf count. |

### 15. Idea generation framework

**N/A.** That section governs "build me a dashboard" requests that start from a
vague brief. This round was a review of screens that already exist, so the
directions it asks for were settled in `docs/dashboard-design-brief.md`.

### 16. Anti-pattern checklist

| Anti-pattern | Status |
| --- | --- |
| Flat hierarchy, no point of entry | Not present. Entry point named (section 2). |
| Placeholder as label | Not present. Every field has a persistent label. |
| Placeholder indistinguishable from entered text | Not present (charcoal/40 against full charcoal). |
| Asterisk noise for required fields | Not present. Optional is marked. |
| Mismatched input semantics | Not present. Radios for a mutually exclusive set, checkbox for agreement. |
| Ambiguous confirmation copy | Not present. "Delete my account"; no "Yes / No". |
| Dark patterns in cancellation | Not present. One step, plain copy, reversible exit above it. |
| Silent interactions | Not present. Every action acknowledges immediately. |
| Bare spinner over a blank screen | Not present. Skeletons in both async places. |
| Raw system errors | Not present. Human message plus a next action. |
| Dead-end errors | Not present. "Try again" on the read, inline messages on writes. |
| Empty states with no guidance | Not present. Three regions, each explaining the next action. |
| Primary action relocating between steps | Not present. It stays in the same card position. |
| Carousels with dot-only indicators | N/A, no carousel on these screens. |
| Modal overuse for low stakes content | Not present. One modal, and it is a real task. |
| Misaligned label or field edges | Not present. Single left edge per card. |
| Inconsistent spacing that fails to group | Not present. One gap token, dividers only inside cards. |
| Unbalanced nested radii | Conflict resolved and recorded (section 3 above). |
| All caps buttons and labels | Not present in either dashboard. |
| Oversaturated colour everywhere | Reduced. Two primaries on the employer screen, one on the talent screen. |
| Pure black or white surfaces | White cards on a cream page; a product token, listed below. |
| Light mode colours ported to dark mode | N/A, no dark mode. |
| Inconsistent semantic colour | Fixed for "Opens soon"; the primary button's amber hover is a site wide token (below). |
| Small controls with tiny tap areas | Not present on these screens (all 44px or more). |
| Navigation controls against convention | Not present. Top nav, utility icons right, status flag worded. |
| Responsive shrinking instead of restructuring | Not present. Columns become one at 900px. |

---

## The rule behind the journey strip, and the test that holds it

**The rule** (`src/lib/dashboard.ts`): a stage's state comes from one fact and no
other (Profile from `profileIsMatchReady`, Verified from `emailVerified`, the last
three from a fixed list of stages that are not open). A stage's detail line is
printed in exactly one place, under the stage the talent is standing on. So the
Verified line can only ever appear while Verified is the current stage, which is
only while the address is unconfirmed, and therefore it is written as the
instruction it is. `emailVerified` is read from `users.email_verified` through the
session, which is the same field the notice, the email detail row and the navbar
flag read, so the four cannot disagree.

**The test** (`scripts/test-dashboard-rules.mjs`, `npm run test:dashboard:rules`,
12 checks, also run first by `npm run test:dashboard`):

1. The Verified line is an instruction, proved by pattern (`Confirm your email
   address...`) and by the absence of any past-tense claim.
2. An unconfirmed account with a complete profile stands on Verified, and Verified
   is **not** marked complete.
3. The words that account actually reads (`journeyText`) never match
   `we confirmed|email confirmed|confirmed your email`.
4. The same words do tell them what to do instead.
5. An unconfirmed account with an incomplete profile stands on Profile and never
   sees the Verified line at all.
6. A confirmed account with a complete profile has no current stage and is told
   so, in the settled sentence.
7. No combination of the four profile and email states can print a claim.
8. Matched, Interview and Placed are never reached or current.
9. Exactly one stage is current while an open stage is unfinished, and none when
   both are done.
10 to 12. Country stays optional for matching, availability is asked for first,
    and every stage carries the words the strip prints.

## What changed this round

1. Journey rule named in the source and covered by the new rules suite (above).
2. Talent: when the address is unconfirmed the next step card says "Confirm your
   email" with the primary "Send a new confirmation link", the page banner is off
   for that screen so the message appears once, and the profile controls stay
   reachable below a divider. When it is confirmed the card is unchanged.
3. Employer: "Find talent" and "Shortlist" are one card, "Open requests" and the
   consultation are one "Your requests" card, one primary per card, and the Find
   talent copy now says what an employer can do today with no internal reasoning.
4. Account deletion moved to the bottom of the page behind a disclosure
   (`aria-expanded`, focus moved into the panel, warning inside it) with the red
   "Delete my account" and the password step unchanged.
5. "Opens soon" is neutral grey; amber is needs attention only.
6. Every inline text action is 44px or more (the reset link was 41px), the Select
   helper text was raised from charcoal/60 (4.46:1, a fail) to charcoal/65
   (5.24:1), and the delete field's refusal is now attached to its field.
7. Plus, from the audit: chips to a 2:1 padding ratio, one leaf glyph per screen,
   the employer dependency note no longer repeats the banner's instruction, and
   the "Your requests" empty state uses the secondary weight.
8. The public site answers `/auth` with a coming soon page while every
   environment used to build, review and demonstrate the accounts keeps the real
   forms (asked for during this round, see below).

## The account coming soon gate (added during this round)

**passes** against the skill, as its own small surface.

- Rule: `src/lib/accountGate.ts`. The account forms are open on localhost,
  127.0.0.1, `::1` and any `*.vercel.app` host, and closed on
  `peoplegrowthafrica.com` and `www.peoplegrowthafrica.com`, which answer `/auth`
  with `AuthComingSoon`. The rule mirrors the API's existing
  `isLocalOrPreview` list on purpose: the API's cross site guard only trusts those
  hosts, so opening a host here that the API refuses would print a form that
  cannot submit.
- A signed in visitor never reaches it (the account page redirects to their
  dashboard first), so existing accounts and every dashboard are untouched. The
  API, its guards and its rate limits are unchanged: this decides which page a
  visitor sees, not what the server accepts.
- The page itself: one h1 ("Accounts are coming soon", measured: exactly one h1
  on the page), one primary action (the site's existing consultation modal, which
  opens from it), one way back, the published contact address, no uppercase text,
  no tap target under 44px, and no horizontal overflow at 360px (measured 352).
- Evidence: `npm run test:auth:gate` (13 checks, including both spellings of the
  public domain and a trailing dot, along with the hosts that must stay open), and
  a browser pass at 360 and 1280 with the gate temporarily closed on localhost, so
  the real page was rendered, measured and photographed, then the change was
  reverted and the build repeated.
- The one honest caveat: `*.vercel.app` is treated as a preview, which includes
  the project's own alias if it has one. That host is not the public domain, and
  if it should be closed too its name goes in one line of the gate file.

## Remaining problems, ranked by impact

1. **White on the brand green primary button is 3.39:1** (measured, AA needs 4.5
   for 16px text). This is the most important control on both screens, and it is
   the site's primary button treatment everywhere (signup, navbar, booking). One
   site wide decision fixes it: deep green reaches 6.0:1, a mid green around
   `#157F5F` reaches about 4.6:1. Changing it on the dashboards alone would make
   the same action look different on two screens (14.8).
2. **Form control borders are below the non-text contrast floor.** Field and chip
   borders are charcoal/20 to charcoal/25 over white, measured 1.52:1 and 1.71:1
   against the 3:1 in 5 and 14. A token change to about charcoal/50 (3.3:1)
   fixes every form on the site at once; doing it only in the dashboard would
   make its fields look different from the signup form.
3. **The employer screen still has two identical primary buttons** (screen point
   of entry, and "Find talent"), plus the navbar's own green call to action, so
   green appears three times above the fold. The reporting card is secondary
   now, which is the reduction this round could make without breaking 14.8.
   Deciding between "one primary per screen" and "identical action, identical
   treatment" is a product call (see below).
4. **Placeholder text is 2.5:1** (charcoal/40) site wide. Not a fail of 6's
   distinction rule (the placeholder is visibly lighter than entered text and no
   field relies on it as a label), but it is below AA for text, and it is the
   same token in every form on the site.
5. **Pure white cards on a cream page** (5.1 asks for off white surfaces). A
   product token, not a dashboard one.
6. **The journey strip's five labels are tight at exactly 360px** ("Interview" is
   51px in a 51px column). They wrap below that rather than clip, and 360 is the
   support floor, but a shorter label would give headroom (10).
7. **Site chrome outside the dashboards**: footer links measure 18px tall and
   social icons 36px (11), and the navbar's "Talk to Us" keeps the accent busy on
   a page whose own primary action is the point. Both are shared components
   across every page, so they belong to a site wide pass rather than this one.

## Decisions wanted

1. **Primary buttons on the employer screen**: exactly one (the entry point, with
   the other cards pointing at it), or the same action carrying the same weight
   everywhere it appears? The build currently has two primaries plus a secondary
   repeat.
2. **The two site wide contrast tokens** (primary button label, control borders).
   Both are one line each, both affect every page, and both are cheaper to do once
   than to fork in the dashboard.
3. **Talent visibility consent** (unchanged): can a profile be shown to employers
   at all, and does a talent opt in per profile or per field?
4. **What "Matched" means and who matches**: the advisory team by hand, or a rule
   over field, country and availability.
5. **Consultation status**: the table has no status column, so the dashboard says
   a request is not a booking. If the team confirms slots, employers need a status
   to read.
6. **Notifications**: email only for now, or an in app place for account events.
