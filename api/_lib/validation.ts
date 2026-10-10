import { z } from 'zod';
import { ApiError } from './http.js';

/**
 * Server side validation is the real check. These schemas are strict, so a
 * request carrying any key that is not listed here is rejected outright, and
 * every string is trimmed and length capped before it reaches the database.
 */

const NAME_MAX = 100;
const EMAIL_MAX = 254;
const COMPANY_MAX = 150;
const FIELD_MAX = 100;
const COUNTRY_MAX = 60;
const PASSWORD_MAX = 128;
const PHONE_MAX = 40;
const ORGANISATION_MAX = 150;
const ROLE_MAX = 100;
const SUBJECT_MAX = 150;
const MESSAGE_MAX = 2000;
const TEAM_SIZE_MAX = 40;
const SERVICE_MAX = 80;
const SLOT_MAX = 20;
const EVENT_SLUG_MAX = 120;

function requiredText(max: number, label: string, message?: string): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, message ?? `Enter your ${label}.`)
    .max(max, `${label.charAt(0).toUpperCase()}${label.slice(1)} must be ${max} characters or fewer.`);
}

function optionalText(max: number, label: string): z.ZodOptional<z.ZodString> {
  return z
    .string()
    .trim()
    .max(max, `${label.charAt(0).toUpperCase()}${label.slice(1)} must be ${max} characters or fewer.`)
    .optional();
}

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX, `Email must be ${EMAIL_MAX} characters or fewer.`)
  .pipe(z.email('Enter an email address in the form name@example.com.'));

const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`);

const acceptedTerms = z
  .boolean()
  .refine((value) => value === true, 'Agree to the terms and privacy policy to continue.');

export const AVAILABILITY_OPTIONS = ['available_now', 'within_30_days', 'just_exploring'] as const;
export const NEED_OPTIONS = ['find_talent', 'book_consultation'] as const;

export const talentSignupSchema = z.strictObject({
  role: z.literal('talent'),
  name: requiredText(NAME_MAX, 'full name'),
  email,
  password,
  field: requiredText(FIELD_MAX, 'field', 'Enter your field or main skill.'),
  country: optionalText(COUNTRY_MAX, 'country'),
  availability: z.enum(AVAILABILITY_OPTIONS).optional(),
  acceptedTerms,
});

export const employerSignupSchema = z.strictObject({
  role: z.literal('employer'),
  name: requiredText(NAME_MAX, 'full name'),
  company: requiredText(COMPANY_MAX, 'company or organisation'),
  email,
  password,
  needs: z
    .array(z.enum(NEED_OPTIONS))
    .min(1, 'Choose at least one: find talent or book a consultation.')
    .max(NEED_OPTIONS.length),
  acceptedTerms,
});

export const signupSchema = z.discriminatedUnion('role', [
  talentSignupSchema,
  employerSignupSchema,
]);

/**
 * The two fields the talent dashboard owns, and only these two.
 *
 * Availability is the signal an employer acts on and the one thing the signup
 * form lets a talent skip, so it is editable after signup. Country rides along
 * because it is the other optional answer from signup and the dashboard already
 * prints it. Both keys are optional so a caller can change one without
 * resending the other, and at least one has to be present: an empty save is a
 * no-op the client should not be sending. `strictObject` refuses anything else,
 * so no other column can be reached from a request.
 *
 * An empty country is accepted on purpose: it is how a talent clears an answer
 * they no longer want on their profile.
 */
export const talentProfileSchema = z
  .strictObject({
    availability: z.enum(AVAILABILITY_OPTIONS).optional(),
    country: optionalText(COUNTRY_MAX, 'country'),
  })
  .refine((value) => value.availability !== undefined || value.country !== undefined, {
    message: 'Choose an availability or add your country.',
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.strictObject({
  email,
  password: z
    .string()
    .min(1, 'Enter your password.')
    .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.strictObject({ email });

export const resetPasswordSchema = z.strictObject({
  token: z.string().trim().min(20, 'That reset link is not valid.').max(200),
  password,
});

export const verifyEmailSchema = z.strictObject({
  token: z.string().trim().min(20, 'That verification link is not valid.').max(200),
});

const optionalPhone = optionalText(PHONE_MAX, 'phone');

const organisation = requiredText(
  ORGANISATION_MAX,
  'organisation',
  'Enter your organisation or company name.',
);

/** Slugs are chosen in src/data/events.ts, so only that shape is accepted. */
const eventSlug = z
  .string()
  .trim()
  .min(1, 'Choose an event.')
  .max(EVENT_SLUG_MAX, `Event must be ${EVENT_SLUG_MAX} characters or fewer.`)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'That event could not be found.');

export const MEETING_FORMATS = ['virtual', 'in-person'] as const;
export const ENQUIRY_SOURCES = ['consultation-modal', 'consultation-page'] as const;

/** The three public lead forms: registration, booking and written enquiry. */
export const eventRegistrationSchema = z.strictObject({
  eventSlug,
  name: requiredText(NAME_MAX, 'full name'),
  email,
  phone: optionalPhone,
  organisation,
  role: optionalText(ROLE_MAX, 'role'),
  question: optionalText(MESSAGE_MAX, 'question'),
});

export const consultationBookingSchema = z.strictObject({
  name: requiredText(NAME_MAX, 'full name'),
  email,
  phone: optionalPhone,
  organisation,
  teamSize: optionalText(TEAM_SIZE_MAX, 'team size'),
  service: optionalText(SERVICE_MAX, 'service'),
  meetingFormat: z.enum(MEETING_FORMATS),
  // A calendar day, not a timestamp: the slot carries the time.
  preferredDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date for the consultation.'),
  preferredSlot: z
    .string()
    .trim()
    .min(1, 'Choose a time.')
    .max(SLOT_MAX, 'That time is not available.'),
  notes: optionalText(MESSAGE_MAX, 'notes'),
});

export const enquirySchema = z.strictObject({
  name: requiredText(NAME_MAX, 'full name'),
  email,
  phone: optionalPhone,
  subject: requiredText(SUBJECT_MAX, 'subject'),
  message: requiredText(MESSAGE_MAX, 'message', 'Tell us how we can help.'),
  source: z.enum(ENQUIRY_SOURCES),
});

/**
 * The booking calendar offers the next fortnight, weekdays and Saturdays. A
 * request outside that is a client bug or a deliberate probe, so it is refused
 * with the same field message shape the rest of the app uses.
 */
export function assertBookableDate(value: string): void {
  const picked = new Date(`${value}T00:00:00Z`);
  const roundTrips = !Number.isNaN(picked.getTime()) && picked.toISOString().slice(0, 10) === value;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysAhead = roundTrips ? (picked.getTime() - todayUtc) / 86_400_000 : -1;

  const field = (message: string) => {
    throw new ApiError(400, 'validation_failed', message, { preferredDate: message });
  };

  if (!roundTrips || daysAhead < 0 || daysAhead > 90) {
    field('Choose a date within the next three months.');
  }
  if (picked.getUTCDay() === 0) {
    field('Our office is closed on Sundays. Choose a weekday or a Saturday.');
  }
}

export const newsletterSubscribeSchema = z.strictObject({ email });

export const newsletterConfirmSchema = z.strictObject({
  token: z.string().trim().min(20, 'That confirmation link is not valid.').max(200),
});

/**
 * Actions with no inputs still take a body check, so an unexpected key is
 * rejected instead of silently ignored.
 */
export const emptyBodySchema = z.strictObject({});

export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1, 'Enter your password to confirm.').max(PASSWORD_MAX),
});

export type TalentProfileInput = z.infer<typeof talentProfileSchema>;

/**
 * Turns a schema result into either validated data or a 400 carrying the exact
 * fields at fault, so the client can point at the input instead of apologising.
 */
export function parseInput<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : 'form';
    if (!(key in fields)) fields[key] = issue.message;
  }

  const first = result.error.issues[0]?.message ?? 'Check the highlighted fields.';
  throw new ApiError(400, 'validation_failed', first, fields);
}
