/**
 * The rules a published post obeys in the browser, tested without one.
 *
 *   npm run test:published
 *
 * These are the calculations that decide what a reader sees: which section a
 * post lives in, what a UTC instant reads as in Lagos, and whether an event is
 * "upcoming" or "past". All of them are pure, so they run here in Node against
 * the module the pages import - no build, no database, no browser.
 *
 * This file imports the TypeScript module directly; Node 24 strips the types
 * (the same way scripts/test-dashboard-rules.mjs does). src/lib/published.ts is
 * deliberately import-free, which is what makes that possible: an extensionless
 * relative import would not resolve here, and Node's resolver is the same one
 * the deployed API uses.
 */
import {
  displayTime,
  formatEventDay,
  formatPostDate,
  isoToLagosInput,
  lagosDate,
  lagosInputToIso,
  lagosTime,
  livePostPath,
  slugify,
  splitEvents,
} from '../src/lib/published.ts';

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  console.log(
    `${passed ? 'PASS' : 'FAIL'}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`,
  );
}

/* ── A post lives under the section its type names ────────────────────────── */

check(1, 'a blog post lives at /blog/<slug>', livePostPath({ type: 'blog', slug: 'a-post' }) === '/blog/a-post');
check(
  2,
  'an event lives at /events/<slug>',
  livePostPath({ type: 'event', slug: 'a-meetup' }) === '/events/a-meetup',
);
check(
  3,
  'the same slug is a different URL for each type',
  livePostPath({ type: 'blog', slug: 'x' }) !== livePostPath({ type: 'event', slug: 'x' }),
);

/* ── Slugs ────────────────────────────────────────────────────────────────── */

// An apostrophe closes up rather than becoming a hyphen: "Nigeria's" is one
// word, and `nigeria-s` would read as two.
check(4, 'a title becomes a slug', slugify("Nigeria's Labour Act, 2026") === 'nigerias-labour-act-2026', slugify("Nigeria's Labour Act, 2026"));
check(5, 'accents fold to their base letters', slugify('Café Culture') === 'cafe-culture', slugify('Café Culture'));
check(6, 'runs of punctuation collapse to one hyphen', slugify('HR -- 2026') === 'hr-2026', slugify('HR -- 2026'));
check(7, 'no leading or trailing hyphen survives', slugify('  -- Hello --  ') === 'hello', slugify('  -- Hello --  '));
check(8, 'an empty title has an empty slug', slugify('!!!') === '', slugify('!!!'));
check(9, 'the server regex accepts every slug this produces', /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugify('Ọ̀rẹ́ 2026 — launch!')));
check(10, 'a slug never exceeds the column cap', slugify('a'.repeat(200)).length <= 120, String(slugify('a'.repeat(200)).length));

/* ── Lagos wall-clock <-> UTC instants ───────────────────────────────────── */

// Lagos is UTC+1 all year, so 09:00 typed by a manager is 08:00Z. Storing the
// instant and reading it back in Lagos has to be lossless.
check(
  11,
  'a Lagos wall-clock time is stored as the matching UTC instant',
  lagosInputToIso('2027-03-18T09:00') === '2027-03-18T08:00:00.000Z',
  String(lagosInputToIso('2027-03-18T09:00')),
);
check(
  12,
  'a stored instant fills the Lagos input again',
  isoToLagosInput('2027-03-18T08:00:00.000Z') === '2027-03-18T09:00',
  isoToLagosInput('2027-03-18T08:00:00.000Z'),
);
check(
  13,
  'a UTC instant late at night stays on the right Lagos day',
  lagosDate('2027-03-18T23:30:00.000Z') === '2027-03-19',
  lagosDate('2027-03-18T23:30:00.000Z'),
);
check(14, 'the Lagos clock is printed without a zone suffix', lagosTime('2027-03-18T08:05:00.000Z') === '09:05', lagosTime('2027-03-18T08:05:00.000Z'));
check(15, 'a malformed input is refused rather than guessed', lagosInputToIso('18/03/2027 09:00') === null);
check(16, 'an empty input is an absent date', lagosInputToIso('') === null && isoToLagosInput(null) === '');
check(17, '12:00 and 00:00 read correctly', displayTime('12:00') === '12:00 PM' && displayTime('00:30') === '12:30 AM', `${displayTime('12:00')} / ${displayTime('00:30')}`);
check(18, 'a long date is written the way the site writes it', formatEventDay('2027-03-18T08:00:00.000Z').includes('18 March 2027'), formatEventDay('2027-03-18T08:00:00.000Z'));
check(19, 'a blog post prints its Lagos date', formatPostDate('2026-10-21T23:30:00.000Z') === '22 October 2026', formatPostDate('2026-10-21T23:30:00.000Z'));

/* ── Upcoming / past ─────────────────────────────────────────────────────── */

const events = [
  { id: 'later', isoDate: '2027-05-01', isPast: false },
  { id: 'past-old', isoDate: '2025-01-01', isPast: true },
  { id: 'sooner', isoDate: '2026-12-01', isPast: false },
  { id: 'past-recent', isoDate: '2026-06-01', isPast: true },
];

const { upcoming, past } = splitEvents(events);

check(20, 'everything upcoming stays upcoming', upcoming.length === 2, `${upcoming.length}`);
check(21, 'everything past goes to past', past.length === 2, `${past.length}`);
check(
  22,
  'upcoming is soonest first',
  upcoming.map((event) => event.id).join(',') === 'sooner,later',
  upcoming.map((event) => event.id).join(','),
);
check(
  23,
  'past is most recent first',
  past.map((event) => event.id).join(',') === 'past-recent,past-old',
  past.map((event) => event.id).join(','),
);
check(24, 'the input list is not mutated', events[0].id === 'later');
check(25, 'an empty list splits into two empty lists', splitEvents([]).upcoming.length === 0 && splitEvents([]).past.length === 0);

console.log(`\n${results.length} checks, ${failures} failed.`);
if (failures > 0) {
  console.log('\nFailing checks:');
  for (const result of results.filter((entry) => !entry.passed)) {
    console.log(`  ${result.number}. ${result.description} (${result.detail})`);
  }
}
process.exit(failures > 0 ? 1 : 0);
