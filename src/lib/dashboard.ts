/**
 * The rules behind the two dashboards, kept out of the components so they can be
 * read and changed in one place.
 *
 * Nothing here invents data. A region whose data source does not exist yet is
 * described by `PlannedData` with an empty list and a TODO naming what will fill
 * it, and the screens render that as an honest empty state. There is
 * deliberately no way to pass sample rows to a "pending" region, so a screenshot
 * can never show a real visitor an invented number or an invented person.
 */
import type { AuthUser, EmployerProfile, TalentProfile } from './authClient';

export function talentProfileOf(user: AuthUser | null): TalentProfile | null {
  if (!user || user.role !== 'talent') return null;
  const profile = user.profile;
  return profile && 'field' in profile ? profile : null;
}

export function employerProfileOf(user: AuthUser | null): EmployerProfile | null {
  if (!user || user.role !== 'employer') return null;
  const profile = user.profile;
  return profile && 'company' in profile ? profile : null;
}

/* ------------------------------------------------------------------ *
 * Talent journey
 * ------------------------------------------------------------------ */

export type TalentStageId = 'profile' | 'verified' | 'matched' | 'interview' | 'placed';

export type TalentStage = {
  id: TalentStageId;
  label: string;
  /** One line, printed only under the stage the talent is standing on. */
  detail: string;
};

/**
 * The five stages in the order they happen. The first two are real today: the
 * profile is complete when the four details exist, and Verification comes
 * straight from `users.email_verified`. The last three are the work the
 * matching desk will do, so they are never marked as reached or in progress.
 */
export const TALENT_STAGES: readonly TalentStage[] = [
  {
    id: 'profile',
    label: 'Profile',
    detail: 'Your name, field and availability.',
  },
  {
    id: 'verified',
    label: 'Verified',
    // Written as the instruction it is, because a detail is only ever printed
    // for the stage the talent is standing on. The old past tense ("We
    // confirmed your email address") printed under an unconfirmed account and
    // contradicted the notice directly above it.
    detail: 'Confirm your email address from the link we sent you.',
  },
  {
    id: 'matched',
    label: 'Matched',
    detail: 'Matching is not open yet, so nothing is being reviewed today.',
  },
  {
    id: 'interview',
    label: 'Interview',
    detail: 'You are talking to an employer about a role.',
  },
  {
    id: 'placed',
    label: 'Placed',
    detail: 'You started the role.',
  },
];

export type StageState = 'complete' | 'current' | 'upcoming';

export type JourneyStage = { stage: TalentStage; state: StageState };

/** The details a profile is read from, in the order the account form asks for them. */
export const PROFILE_DETAIL_FIELDS = [
  { key: 'name', label: 'Full name' },
  { key: 'field', label: 'Field or main skill' },
  { key: 'country', label: 'Country' },
  { key: 'availability', label: 'Availability' },
] as const;

export type ProfileDetailKey = (typeof PROFILE_DETAIL_FIELDS)[number]['key'];

export type ProfileStrength = {
  /** How many of the four profile answers are present. */
  filled: number;
  total: number;
  /**
   * The answer to ask for next. Availability comes first because it is the
   * signal an employer acts on, then country. Name and field are required at
   * signup, so they are only ever missing if the profile row is incomplete.
   */
  missing: ProfileDetailKey | null;
};

/** Which of the four answers is filled in, read straight off the profile row. */
export function profileDetailValues(profile: TalentProfile | null): Record<ProfileDetailKey, boolean> {
  return {
    name: Boolean(profile?.name?.trim()),
    field: Boolean(profile?.field?.trim()),
    country: Boolean(profile?.country?.trim()),
    availability: Boolean(profile?.availability?.trim()),
  };
}

/**
 * Availability first, then country: the order of value to an employer, not the
 * order of the signup form. Email confirmation is not counted here, because it
 * is a stage of its own in the journey and it has its own banner, and adding it
 * to both would print the same progress twice.
 */
const MISSING_ORDER: readonly ProfileDetailKey[] = ['availability', 'country', 'name', 'field'];

export function profileStrength(profile: TalentProfile | null): ProfileStrength {
  const values = profileDetailValues(profile);
  const present = PROFILE_DETAIL_FIELDS.filter((field) => values[field.key]).length;
  const missing = MISSING_ORDER.find((key) => !values[key]) ?? null;

  return { filled: present, total: PROFILE_DETAIL_FIELDS.length, missing };
}

/**
 * The answers a profile needs before matching can use it. Country is left out on
 * purpose: the signup form calls it optional, so the dashboard cannot turn it
 * into a requirement after the fact. It still counts in the strength figure,
 * where it is only reporting what has been filled in.
 */
export const REQUIRED_PROFILE_DETAILS = ['name', 'field', 'availability'] as const;

export function profileIsMatchReady(profile: TalentProfile | null): boolean {
  const values = profileDetailValues(profile);
  return REQUIRED_PROFILE_DETAILS.every((key) => values[key]);
}

/**
 * Which stages can actually be reached today. Profile and Verified are real
 * states of a real account; the last three are the work the matching desk will
 * do, so they are always "upcoming" and never the stage someone is standing on.
 * Marking an unopened stage as current would tell a talent that something was
 * being reviewed when nothing is (14.1, 9.4).
 */
const STAGE_IS_OPEN: readonly boolean[] = [true, true, false, false, false];

/**
 * THE RULE THAT DECIDES WHAT A STAGE SAYS, including the unconfirmed email case.
 *
 * 1. A stage's state is decided by one fact and no other: Profile by
 *    `profileIsMatchReady`, Verified by `emailVerified`, and the last three by
 *    `STAGE_IS_OPEN`, which is false, so they can never be reached or current.
 * 2. A stage's `detail` line is printed in exactly one place, under the stage the
 *    talent is standing on (the strip label itself is just a word). Nothing else
 *    on either screen prints a stage detail.
 * 3. Therefore the Verified line can only ever appear while Verified is current,
 *    which happens only while `emailVerified` is false. So that line is written
 *    as the instruction it is, and the sentence that claims a confirmation
 *    ("We confirmed your email address") no longer exists anywhere: an
 *    unconfirmed account cannot read a past-tense claim next to the notice that
 *    contradicts it (9.4, 14.1).
 * 4. `emailVerified` is read from `users.email_verified` through the session, the
 *    same field the notice, the email detail row and the navbar flag read, so the
 *    four of them cannot disagree.
 */
export type Journey = {
  stages: JourneyStage[];
  /** The stage the talent is standing on, or -1 when every open stage is done. */
  currentIndex: number;
  /** One sentence for under the strip, written for the state the talent is in. */
  caption: string;
};

/**
 * Walks the stages in order: everything already reached is complete, the first
 * open stage that is not reached becomes current, and the rest wait.
 */
export function talentJourney(input: {
  profileComplete: boolean;
  emailVerified: boolean;
}): Journey {
  const reached = [input.profileComplete, input.emailVerified, false, false, false];
  const currentIndex = reached.findIndex((done, index) => !done && STAGE_IS_OPEN[index]);

  const stages: JourneyStage[] = TALENT_STAGES.map((stage, index) => ({
    stage,
    state: reached[index]
      ? 'complete'
      : index === currentIndex
        ? 'current'
        : 'upcoming',
  }));

  const current = currentIndex >= 0 ? stages[currentIndex] : null;
  const caption = current
    ? `Stage ${currentIndex + 1} of ${stages.length}: ${current.stage.label}. ${current.stage.detail}`
    : 'Your profile and your email address are both done. Matched, Interview and Placed open when our matching desk starts, so nothing is waiting on you today.';

  return { stages, currentIndex, caption };
}

/**
 * Everything the journey strip can put in front of the visitor: the caption under
 * it, plus the detail line of whichever stage is current, because that is the
 * only stage whose detail is printed. Gathered in one place so a test can assert
 * what a given account actually reads (see scripts/test-dashboard-rules.mjs).
 */
export function journeyText(journey: Journey): string {
  const parts = [journey.caption];
  for (const stage of journey.stages) {
    if (stage.state !== 'current') continue;
    // The caption already carries the current stage's detail, so it is only added
    // for a screen that prints the two separately.
    if (!journey.caption.includes(stage.stage.detail)) parts.push(stage.stage.detail);
  }
  return parts.join(' ');
}

/* ------------------------------------------------------------------ *
 * Regions whose data source does not exist yet
 * ------------------------------------------------------------------ */

/**
 * A region with no data source yet. It cannot hold rows by construction: a
 * screen has to handle `status: 'planned'` before it can render anything, which
 * is what keeps an invented figure or an invented name off a real dashboard.
 */
export type PlannedData<T> = { status: 'planned'; items: readonly T[] };

export type MatchedRole = {
  id: string;
  title: string;
  employer: string;
  country: string;
  /** The line explaining why this role was matched, written by the matching desk. */
  matchedOn: string;
};

export type ShortlistEntry = {
  id: string;
  talentName: string;
  field: string;
  addedOn: string;
};

/**
 * A consultation the employer asked for, as `GET /api/employer/consultation`
 * sends it. This is a request the team confirms by email: the table has no
 * status column, so nothing here can say a meeting is booked.
 */
export type ConsultationRequest = {
  organisation: string;
  meetingFormat: string;
  preferredDate: string;
  preferredSlot: string;
  requestedOn: string;
};

/** TODO(matching): replace with `/api/talent/matches` once the matching desk exists. */
export const MATCHED_ROLES: PlannedData<MatchedRole> = { status: 'planned', items: [] };

/** TODO(shortlist): replace with `/api/employer/shortlist` once shortlisting exists. */
export const SHORTLIST_ENTRIES: PlannedData<ShortlistEntry> = { status: 'planned', items: [] };

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * A calendar day as a person reads it, for example "14 October 2026". The value
 * always arrives as `YYYY-MM-DD` from the API, so it is pinned to UTC midnight
 * and formatted in UTC: a date must not slide a day for anyone east or west of
 * the server.
 */
export function formatCalendarDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

/** "virtual" reads as "Online" for a person; anything else is shown as written. */
export function formatMeetingFormat(value: string): string {
  return value === 'virtual' ? 'Online' : value === 'in-person' ? 'In person' : value;
}
