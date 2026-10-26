import { z } from 'zod';
import { ApiError } from './http.js';
import { registrationFormSaveSchema } from './registration-form.js';

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

/* ── Content admin ──────────────────────────────────────────────────────── */

const SLUG_MAX = 120;
const TITLE_MAX = 160;
const EXCERPT_MAX = 400;
const BODY_MAX = 100_000;
const CATEGORY_NAME_MAX = 60;
const COVER_IMAGE_MAX = 2048;
const LINK_LABEL_MAX = 80;
const POST_ID_MAX = 40;

/**
 * Slugs are the public URL, so they are kept to lowercase words joined by
 * single hyphens: no slashes, no dots, no percent signs. That rules out a slug
 * that could escape /blog/ or /events/ into another path or read as an escape
 * sequence.
 */
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter a slug.')
  .max(SLUG_MAX, `Slug must be ${SLUG_MAX} characters or fewer.`)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens.');

const id = z
  .string()
  .trim()
  .max(POST_ID_MAX)
  .regex(/^[0-9a-f-]+$/i, 'That record could not be found.');

/**
 * A cover this deployment stored in its own Blob store.
 *
 * An upload answers with a path rather than a URL when the store is private (see
 * api/_lib/cover-url.ts), so that path has to be accepted here or the panel could
 * not save a cover it had just uploaded itself.
 */
const OWN_COVER_PATH = /^\/api\/media\/covers\/(?:full|thumb)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:webp|jpe?g|png)$/;

/**
 * Cover images are URLs, http(s) or one of our own media paths. A `javascript:`
 * or `data:` value here would be written into an <img src> on a public page, and
 * anything else is refused for the same reason.
 */
const coverImageUrl = z
  .string()
  .trim()
  .max(COVER_IMAGE_MAX, `Cover image URL must be ${COVER_IMAGE_MAX} characters or fewer.`)
  .refine(
    (value) => value === '' || /^https?:\/\//.test(value) || OWN_COVER_PATH.test(value),
    'Enter a full http(s) image URL.',
  )
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const linkUrl = z
  .string()
  .trim()
  .max(COVER_IMAGE_MAX, `Link URL must be ${COVER_IMAGE_MAX} characters or fewer.`)
  .refine((value) => value === '' || /^https?:\/\//.test(value), 'Enter a full http(s) link URL.')
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const linkLabel = z
  .string()
  .trim()
  .max(LINK_LABEL_MAX, `Link label must be ${LINK_LABEL_MAX} characters or fewer.`)
  .refine(
    (value) => value === '' || value.length > 0,
    'Give the link a label, or leave the URL empty too.',
  )
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const POST_STATUS = ['draft', 'published'] as const;
const POST_TYPES = ['blog', 'event'] as const;

export type PostTypeInput = (typeof POST_TYPES)[number];

const LOCATION_MAX = 160;

/**
 * An instant the manager picked, normalised to UTC.
 *
 * The form works in Africa/Lagos and the browser hands over an ISO string
 * already converted, so all this has to do is refuse nonsense and fix the
 * format. Storing UTC is what makes the same row print correctly for a reader
 * anywhere, and the rendering side is the only place that knows Lagos exists.
 */
const eventInstant = z
  .string()
  .trim()
  .max(40, 'That date is not valid.')
  .refine(
    (value) => value === '' || !Number.isNaN(Date.parse(value)),
    'Enter a valid date and time.',
  )
  .transform((value) => (value === '' ? null : new Date(value).toISOString()))
  .nullable()
  .optional();

/** An optional line of text: empty becomes null so the column stays clean. */
const optionalLine = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const postFields = {
  type: z.enum(POST_TYPES),
  slug,
  title: requiredText(TITLE_MAX, 'title'),
  excerpt: z.string().trim().max(EXCERPT_MAX, `Excerpt must be ${EXCERPT_MAX} characters or fewer.`),
  body: z.string().max(BODY_MAX, `Body must be ${BODY_MAX} characters or fewer.`),
  /** Required for a blog post, absent from an event. */
  categoryId: id.nullable().optional(),
  coverImageUrl,
  coverImageThumbUrl: coverImageUrl,
  linkLabel,
  linkUrl,
  eventStart: eventInstant,
  eventEnd: eventInstant,
  locationText: optionalLine(LOCATION_MAX, 'Location'),
  isOnline: z.boolean().optional(),
  registrationUrl: linkUrl,
  registrationIntro: optionalLine(500, 'Registration intro'),
  registrationButtonLabel: optionalLine(60, 'Button label'),
  registrationForm: registrationFormSaveSchema.nullable().optional(),
  status: z.enum(POST_STATUS),
};

type PostValues = {
  type: PostTypeInput;
  categoryId?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  locationText?: string | null;
  isOnline?: boolean;
};

/**
 * The rules that only make sense across two fields.
 *
 * These are here rather than in the handler so a bad request is answered with a
 * message under the field that caused it, the same shape every other endpoint
 * returns, instead of a 500 from a database constraint the manager cannot read.
 * The database enforces the same rules as a backstop.
 */
function checkPostType(value: PostValues, ctx: z.RefinementCtx): void {
  if (value.type === 'event') {
    if (!value.eventStart) {
      ctx.addIssue({ code: 'custom', path: ['eventStart'], message: 'Enter when the event starts.' });
    } else if (value.eventEnd && value.eventEnd <= value.eventStart) {
      ctx.addIssue({ code: 'custom', path: ['eventEnd'], message: 'The end must be after the start.' });
    }
    if (!value.isOnline && !value.locationText) {
      ctx.addIssue({
        code: 'custom',
        path: ['locationText'],
        message: 'Enter a venue, or mark the event as online.',
      });
    }
    return;
  }

  if (!value.categoryId) {
    ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category.' });
  }
}

/**
 * Fields belonging to the other type are cleared, not refused.
 *
 * Switching a post from Event to Blog and back is a normal thing to do in the
 * form, and every one of those switches would otherwise fail on a leftover
 * field the manager can no longer see. Clearing is the only behaviour that
 * makes the switcher feel like one form.
 */
function normalisePost<T extends PostValues>(value: T): T {
  if (value.type === 'event') {
    return { ...value, categoryId: null, linkLabel: null, linkUrl: null, isOnline: Boolean(value.isOnline) };
  }
  return {
    ...value,
    eventStart: null,
    eventEnd: null,
    locationText: null,
    isOnline: false,
    registrationUrl: null,
    registrationIntro: null,
    registrationButtonLabel: null,
    registrationForm: null,
  };
}

export const postCreateSchema = z
  .strictObject({ ...postFields })
  .superRefine(checkPostType)
  .transform(normalisePost);

/** The id is the one field an edit carries that a create does not. */
export const postUpdateSchema = z
  .strictObject({ id, ...postFields })
  .superRefine(checkPostType)
  .transform(normalisePost);

export const postByIdSchema = z.strictObject({ id });

/** The query string of the admin list. Everything optional, all values capped. */
export const postListQuerySchema = z.strictObject({
  type: z.enum(POST_TYPES).optional(),
  status: z.enum(POST_STATUS).optional(),
  categoryId: id.optional(),
  search: z.string().trim().max(120).optional(),
});

export const categoryCreateSchema = z.strictObject({
  name: requiredText(CATEGORY_NAME_MAX, 'category name'),
  slug,
});

export const categoryUpdateSchema = z.strictObject({
  id,
  name: requiredText(CATEGORY_NAME_MAX, 'category name'),
  slug,
});

/**
 * `moveTo` is required by the handler when the category still has posts, and
 * refused here when it names the category being deleted - moving a category's
 * posts to itself would delete them along with it.
 */
export const categoryDeleteSchema = z
  .strictObject({
    id,
    moveTo: id.optional(),
  })
  .refine((value) => value.moveTo !== value.id, {
    message: 'Choose a different category to move these posts to.',
    path: ['moveTo'],
  });

export const postStatusSchema = z.strictObject({
  id,
  status: z.enum(POST_STATUS),
});

/**
 * Event registration, stored in its own table rather than the shared lead
 * tables: a manager filters and exports these by event, and the same address is
 * only allowed once per event.
 *
 * `website` is the honeypot. It is a real key in the schema so a bot that fills
 * every input is accepted by validation and then dropped by the handler, rather
 * than being told which field gave it away.
 */
/**
 * A registration, either against an event's editable form or - for a page
 * cached before forms existed - the fixed fields. `answers` is keyed by the id
 * of the question that asked it; the handler checks those against the form the
 * event actually carries, which is the only place the rules live.
 */
export const registrationSchema = z.strictObject({
  eventSlug,
  answers: z
    .record(
      z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'That question could not be found.'),
      z.union([z.string().max(5000), z.array(z.string().max(500)).max(20)]),
    )
    .optional(),
  name: optionalText(NAME_MAX, 'full name'),
  email: email.optional(),
  phone: optionalText(PHONE_MAX, 'phone'),
  organization: optionalText(ORGANISATION_MAX, 'organisation'),
  notes: optionalText(1000, 'notes'),
  website: z.string().trim().max(200).optional(),
});

export const registrationListQuerySchema = z.strictObject({
  event: eventSlug.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type RegistrationListQuery = z.infer<typeof registrationListQuerySchema>;

export type PostCreateInput = z.infer<typeof postCreateSchema>;
export type PostUpdateInput = z.infer<typeof postUpdateSchema>;
export type PostListQuery = z.infer<typeof postListQuerySchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

/* ── Staff ──────────────────────────────────────────────────────────────── */

export const STAFF_ROLE_VALUES = [
  'admin',
  'project_manager',
  'hr_manager',
  'content_manager',
] as const;

export const staffCreateSchema = z.strictObject({
  name: requiredText(NAME_MAX, 'full name'),
  email,
  role: z.enum(STAFF_ROLE_VALUES),
});

export const staffUpdateSchema = z.strictObject({
  id: z.string().uuid('Choose a staff account.'),
  disabled: z.boolean(),
});

export const staffInviteAcceptSchema = z.strictObject({
  token: z.string().trim().min(20, 'That invitation link is not valid.').max(200),
  password,
});

export const staffChangePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, 'Enter your current password.').max(PASSWORD_MAX),
  password,
});

/* ── Dashboard filters ─────────────────────────────────────────────────── */

export const DATE_VALUE = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in the form YYYY-MM-DD.');

export const statsQuerySchema = z.strictObject({
  range: z.enum(['7', '30', '90', 'all']).default('30'),
});

export const dataQuerySchema = z.strictObject({
  type: z.enum(['registrations', 'subscriptions', 'consultations']),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  search: z.string().trim().max(120).optional(),
  from: DATE_VALUE.optional(),
  to: DATE_VALUE.optional(),
  event: eventSlug.optional(),
});

export const trackSchema = z.strictObject({
  path: z.string().trim().min(1).max(300),
  referrer: z.string().trim().max(300).optional(),
  utmSource: z.string().trim().max(80).optional(),
});

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type DataQuery = z.infer<typeof dataQuerySchema>;
