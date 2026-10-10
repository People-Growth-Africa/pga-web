/**
 * The rules the talent dashboard's journey strip is drawn from, tested without a
 * browser and without a database.
 *
 * The bug this suite exists for: the Verified stage used to be written in the
 * past tense ("We confirmed your email address"), and a stage's detail line is
 * printed under whichever stage the talent is standing on. So an account whose
 * email was *not* confirmed read a claim that it was, directly above the page's
 * notice saying the opposite. The rule that fixes it lives in
 * src/lib/dashboard.ts (see the comment above journeyText): a stage's state is
 * decided by `users.email_verified`, and only the current stage's detail line is
 * ever printed, so the Verified line is an instruction and no text anywhere
 * claims a confirmation.
 *
 *   npm run test:dashboard:rules
 *
 * This file imports the TypeScript module directly; Node 24 strips the types.
 */
import {
  TALENT_STAGES,
  journeyText,
  profileDetailValues,
  profileIsMatchReady,
  profileStrength,
  talentJourney,
} from '../src/lib/dashboard.ts';

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
}

/** The four accounts the strip can be drawn for: profile done or not, email done or not. */
const ACCOUNTS = [
  { name: 'profile done, email unconfirmed', profileComplete: true, emailVerified: false },
  { name: 'profile missing, email unconfirmed', profileComplete: false, emailVerified: false },
  { name: 'profile done, email confirmed', profileComplete: true, emailVerified: true },
  { name: 'profile missing, email confirmed', profileComplete: false, emailVerified: true },
];

const journeys = ACCOUNTS.map((account) => ({ account, journey: talentJourney(account) }));

// Anything that reads as a claim that the address is already confirmed. The
// words "Confirm your email address", which is an instruction, are allowed.
const CLAIMS_CONFIRMATION = /we confirmed|email confirmed|confirmed your email/i;

console.log('\nJourney strip rules\n');

check(
  1,
  'The Verified line is an instruction, never a claimed outcome',
  TALENT_STAGES[1].id === 'verified' &&
    /^Confirm your email address/.test(TALENT_STAGES[1].detail) &&
    !CLAIMS_CONFIRMATION.test(TALENT_STAGES[1].detail),
  `"${TALENT_STAGES[1].detail}"`,
);

const unconfirmedComplete = journeys[0].journey;
check(
  2,
  'An unconfirmed account with a complete profile stands on Verified, and Verified is not marked complete',
  unconfirmedComplete.currentIndex === 1 &&
    unconfirmedComplete.stages[1].state === 'current' &&
    !unconfirmedComplete.stages.some((stage) => stage.state === 'complete' && stage.stage.id === 'verified'),
  `current index ${unconfirmedComplete.currentIndex}`,
);

check(
  3,
  'The words an unconfirmed account actually reads never say the address is confirmed',
  !CLAIMS_CONFIRMATION.test(journeyText(unconfirmedComplete)),
  journeyText(unconfirmedComplete),
);

check(
  4,
  'The words an unconfirmed account reads say what to do instead',
  journeyText(unconfirmedComplete).includes('Confirm your email address'),
  journeyText(unconfirmedComplete),
);

const unconfirmedIncomplete = journeys[1].journey;
check(
  5,
  'An unconfirmed account still filling in the profile stands on Profile, and never sees the Verified line',
  unconfirmedIncomplete.currentIndex === 0 &&
    unconfirmedIncomplete.stages[1].state === 'upcoming' &&
    !unconfirmedIncomplete.stages.some((stage) => stage.state === 'complete'),
  `current index ${unconfirmedIncomplete.currentIndex}`,
);

check(
  6,
  'A confirmed account with a complete profile has nothing left open, and is told so',
  journeys[2].journey.currentIndex === -1 &&
    journeys[2].journey.stages[1].state === 'complete' &&
    !journeys[2].journey.stages.some((stage) => stage.state === 'current') &&
    journeys[2].journey.caption.startsWith('Your profile and your email address are both done'),
  journeys[2].journey.caption,
);

check(
  7,
  'No combination of profile and email state can print a confirmation claim',
  journeys.every(({ journey }) => !CLAIMS_CONFIRMATION.test(journeyText(journey))),
  ACCOUNTS.map((account, index) => `${account.name}: ${journeyText(journeys[index].journey)}`).join(' | '),
);

check(
  8,
  'Matched, Interview and Placed are never reached or current, whatever the account says',
  journeys.every(({ journey }) =>
    journey.stages.slice(2).every((stage) => stage.state === 'upcoming'),
  ),
);

check(
  9,
  'Exactly one stage is current while an open stage is unfinished, and none when both are done',
  journeys.every(({ journey }) => {
    const current = journey.stages.filter((stage) => stage.state === 'current').length;
    const openStagesDone = journey.stages
      .filter((stage) => stage.stage.id === 'profile' || stage.stage.id === 'verified')
      .every((stage) => stage.state === 'complete');
    return current === (openStagesDone ? 0 : 1);
  }),
  journeys.map(({ journey }) => journey.currentIndex).join(', '),
);

// --- the profile rules the strip's first stage is read from -------------------

const withoutCountry = {
  name: 'Ada Lovelace',
  field: 'IT & Software',
  country: null,
  availability: 'available_now',
};

check(
  10,
  'A missing country never blocks the Profile stage, because the signup form calls it optional',
  profileIsMatchReady(withoutCountry) === true &&
    profileDetailValues(withoutCountry).country === false &&
    profileStrength(withoutCountry).filled === 3 &&
    profileStrength(withoutCountry).total === 4 &&
    profileStrength(withoutCountry).missing === 'country',
  `strength ${profileStrength(withoutCountry).filled} of ${profileStrength(withoutCountry).total}, next missing ${profileStrength(withoutCountry).missing}`,
);

check(
  11,
  'Availability is the first thing asked for when it is missing, then country',
  profileStrength({ ...withoutCountry, availability: null }).missing === 'availability' &&
    profileStrength(withoutCountry).missing === 'country',
);

check(
  12,
  'Every stage carries the words the strip prints for it',
  TALENT_STAGES.every((stage) => stage.label.trim().length > 0 && stage.detail.trim().length > 0) &&
    TALENT_STAGES.length === 5,
  `${TALENT_STAGES.length} stages`,
);

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.log('\nFailing checks:');
  for (const result of results.filter((entry) => !entry.passed)) {
    console.log(`  ${result.number}. ${result.description} (${result.detail})`);
  }
}
process.exit(failures > 0 ? 1 : 0);
