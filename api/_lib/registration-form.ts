import { z } from 'zod';

/**
 * The registration form an event carries.
 *
 * There is one shape for the builder, the public form and the stored answers:
 * a list of questions with stable ids. An answer is always stored against the
 * id of the question that asked it, together with a copy of the label and type,
 * so a later edit to the form cannot make an old response unreadable.
 *
 * The form itself is deliberately small: one optional condition per question
 * ("show this when that question answered X") and nothing more — no sections,
 * no multi-condition logic, no file uploads. Those are follow-ups, not hidden
 * features.
 */

export const REGISTRATION_QUESTION_TYPES = [
  'short_text',
  'paragraph',
  'email',
  'phone',
  'number',
  'date',
  'choice',
  'checkboxes',
  'dropdown',
] as const;

export type RegistrationQuestionType = (typeof REGISTRATION_QUESTION_TYPES)[number];

/** Choice-style questions need options; every other type must not have any. */
const CHOICE_TYPES: ReadonlySet<RegistrationQuestionType> = new Set([
  'choice',
  'checkboxes',
  'dropdown',
]);

export function isChoiceQuestion(type: RegistrationQuestionType): boolean {
  return CHOICE_TYPES.has(type);
}

/**
 * "Show this question only when an earlier choice question answered one of
 * these." `questionId` names a question above this one and `anyOf` holds
 * options that question still offers.
 *
 * Reading a stored form tolerates a condition that has gone stale — the
 * question then fails open and stays visible — so a broken rule can never swap
 * the organiser's questions for the defaults. Saves refuse it outright: see
 * `registrationFormSaveSchema`.
 */
export type RegistrationShowIf = {
  questionId: string;
  anyOf: string[];
};

export type RegistrationQuestion = {
  id: string;
  type: RegistrationQuestionType;
  label: string;
  required: boolean;
  options: string[];
  /** Null means the question always shows. */
  showIf: RegistrationShowIf | null;
};

export type RegistrationForm = {
  version: 1;
  title: string;
  /** UTC ISO instants, or null for "no bound". */
  opensAt: string | null;
  closesAt: string | null;
  confirmationMessage: string;
  questions: RegistrationQuestion[];
};

/** One answer, kept with the question it belongs to as it read at the time. */
export type StoredAnswer = {
  questionId: string;
  label: string;
  type: RegistrationQuestionType;
  value: string | string[];
  /**
   * Set when the form hid this question for the visitor. The value (if any)
   * was dropped; the marker keeps the question readable in the Data table and
   * CSV as "Not applicable" rather than looking like a column went missing.
   */
  skipped?: boolean;
};

/**
 * What the site collected before forms were editable: name, email, phone,
 * company and a note. An event with no saved form answers exactly these
 * questions, so nothing changes for events that were never edited.
 */
export const DEFAULT_REGISTRATION_FORM: RegistrationForm = {
  version: 1,
  title: 'Register for this event',
  opensAt: null,
  closesAt: null,
  confirmationMessage: '',
  questions: [
    { id: 'name', type: 'short_text', label: 'Full name', required: true, options: [], showIf: null },
    { id: 'email', type: 'email', label: 'Email', required: true, options: [], showIf: null },
    { id: 'phone', type: 'phone', label: 'Phone / WhatsApp', required: true, options: [], showIf: null },
    {
      id: 'organisation',
      type: 'short_text',
      label: 'Organisation / company',
      required: false,
      options: [],
      showIf: null,
    },
    { id: 'notes', type: 'paragraph', label: 'Notes', required: true, options: [], showIf: null },
  ],
};

const QUESTION_ID = /^[A-Za-z0-9_-]{1,40}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const instant = z
  .string()
  .trim()
  .regex(INSTANT, 'Use a UTC date and time.')
  .nullable()
  .default(null);

const questionSchema = z.strictObject({
  id: z.string().trim().regex(QUESTION_ID, 'Question ids must be short and simple.'),
  type: z.enum(REGISTRATION_QUESTION_TYPES),
  label: z
    .string()
    .trim()
    .min(1, 'Give the question a label.')
    .max(160, 'Question labels must be 160 characters or fewer.'),
  required: z.boolean(),
  options: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Options cannot be empty.')
        .max(120, 'Options must be 120 characters or fewer.'),
    )
    .max(20, 'A question can offer at most 20 options.')
    .default([]),
  showIf: z
    .strictObject({
      // Shape only, and deliberately lenient: a stored condition that no
      // longer lines up must not make the whole form fail to parse and fall
      // back to the default questions. The relational rules live in
      // `registrationFormSaveSchema`, which only saves pass through.
      questionId: z.string().max(60),
      anyOf: z.array(z.string().max(120)).max(20).default([]),
    })
    .nullable()
    .default(null),
});

export const registrationFormSchema = z
  .strictObject({
    version: z.literal(1).default(1),
    title: z
      .string()
      .trim()
      .min(1, 'Give the form a title.')
      .max(120, 'The form title must be 120 characters or fewer.'),
    opensAt: instant,
    closesAt: instant,
    confirmationMessage: z
      .string()
      .trim()
      .max(600, 'The confirmation message must be 600 characters or fewer.')
      .default(''),
    questions: z
      .array(questionSchema)
      .min(1, 'Add at least one question.')
      .max(40, 'A form can hold at most 40 questions.'),
  })
  .superRefine((form, ctx) => {
    const seen = new Set<string>();
    form.questions.forEach((question, index) => {
      if (seen.has(question.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'id'],
          message: 'Two questions share an id.',
        });
      }
      seen.add(question.id);

      if (isChoiceQuestion(question.type)) {
        if (question.options.length < 2) {
          ctx.addIssue({
            code: 'custom',
            path: ['questions', index, 'options'],
            message: 'Add at least two options.',
          });
        }
      } else if (question.options.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'options'],
          message: 'Only choice questions take options.',
        });
      }
    });

    if (
      form.opensAt &&
      form.closesAt &&
      Date.parse(form.closesAt) <= Date.parse(form.opensAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: 'The form must close after it opens.',
      });
    }

    // The email answer is how the team replies and how a place is confirmed,
    // so a form without one could never send a confirmation.
    if (!form.questions.some((question) => question.type === 'email')) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Add an email question so the team can reply.',
      });
    }
  });

/**
 * The rules that only hold across questions, checked when a form is saved.
 *
 * Deliberately separate from `registrationFormSchema`: reading a stored row
 * must never reject a form because one condition has gone stale — that would
 * silently swap the organiser's questions for the defaults and break
 * registration outright. A save may not introduce or carry one of those
 * forward, so writes go through this stricter schema instead. The messages are
 * mirrored in the editor (`conditionWarning` in `src/lib/registrationForm.ts`).
 */
function conditionIssues(form: RegistrationForm, ctx: z.RefinementCtx): void {
  const position = new Map(form.questions.map((question, index) => [question.id, index]));

  form.questions.forEach((question, index) => {
    const condition = question.showIf;
    if (!condition) return;
    const path: (string | number)[] = ['questions', index, 'showIf'];

    const refuse = (message: string): void => {
      ctx.addIssue({ code: 'custom', path, message });
    };

    if (question.type === 'email') {
      refuse('An email question cannot be hidden by a condition.');
    }

    const driverIndex = position.get(condition.questionId);
    if (driverIndex === undefined) {
      refuse('This condition refers to a question that no longer exists.');
      return;
    }
    if (driverIndex >= index) {
      refuse('A condition can only refer to a question above it.');
      return;
    }

    const driver = form.questions[driverIndex];
    if (!driver) {
      refuse('This condition refers to a question that no longer exists.');
      return;
    }
    if (!isChoiceQuestion(driver.type)) {
      refuse('Conditions can only depend on multiple choice, checkboxes or dropdown questions.');
      return;
    }

    const driverOptions = driver.options;
    const wanted = condition.anyOf.filter((option) => option.trim() !== '');
    if (wanted.length === 0) {
      refuse('Choose at least one option for this condition.');
      return;
    }
    if (wanted.some((option) => !driverOptions.includes(option))) {
      refuse('This condition refers to an option that no longer exists.');
    }
  });
}

/** Saves only: the stored form plus the rules that span questions. */
export const registrationFormSaveSchema = registrationFormSchema.superRefine(conditionIssues);

/**
 * Whether one question shows, given the answers already accepted for the
 * questions above it. Mirrored verbatim in `src/lib/registrationForm.ts` so the
 * browser and the server render and validate the same set of questions.
 *
 * A broken condition fails open — the question shows — so a rule that has gone
 * stale can never make a question silently vanish.
 */
export function isQuestionVisible(
  form: RegistrationForm,
  index: number,
  values: Record<string, string | string[]>,
): boolean {
  const condition = form.questions[index]?.showIf ?? null;
  if (!condition) return true;

  const driverIndex = form.questions.findIndex(
    (candidate) => candidate.id === condition.questionId,
  );
  const driver = driverIndex === -1 ? null : form.questions[driverIndex];
  if (
    !driver ||
    driverIndex >= index ||
    !isChoiceQuestion(driver.type) ||
    condition.anyOf.length === 0 ||
    !condition.anyOf.some((option) => driver.options.includes(option))
  ) {
    return true;
  }

  const answer = values[driver.id];
  const picks = Array.isArray(answer) ? answer : answer ? [answer] : [];
  if (picks.length === 0) return false;
  return picks.some((pick) => condition.anyOf.includes(pick));
}

/** Every question id that shows for the answers so far, in list order. */
export function visibleQuestionIds(
  form: RegistrationForm,
  values: Record<string, string | string[]>,
): Set<string> {
  const shown: Record<string, string | string[]> = {};
  const visible = new Set<string>();
  form.questions.forEach((question, index) => {
    if (!isQuestionVisible(form, index, shown)) return;
    visible.add(question.id);
    const value = values[question.id];
    if (value !== undefined && (Array.isArray(value) ? value.length > 0 : value !== '')) {
      shown[question.id] = value;
    }
  });
  return visible;
}

/** Reads a stored form. A row written before forms existed reads as the default. */
export function parseRegistrationForm(value: unknown): RegistrationForm | null {
  const parsed = registrationFormSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type FormWindow = 'open' | 'not_open' | 'closed';

/** The open and close dates are UTC instants, so no timezone maths is needed. */
export function formWindow(form: RegistrationForm, now: Date = new Date()): FormWindow {
  const stamp = now.getTime();
  if (form.opensAt && stamp < Date.parse(form.opensAt)) return 'not_open';
  if (form.closesAt && stamp > Date.parse(form.closesAt)) return 'closed';
  return 'open';
}

/** Field limits per answer type; both sides of the wire read the same numbers. */
export const ANSWER_LIMITS: Record<RegistrationQuestionType, number> = {
  short_text: 200,
  paragraph: 5000,
  email: 254,
  phone: 30,
  number: 40,
  date: 10,
  choice: 160,
  checkboxes: 160,
  dropdown: 160,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{5,19}$/;
const NUMBER_PATTERN = /^-?\d{1,12}(?:\.\d{1,6})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Checks one answer against its question, returning the message to show under
 * the field, or null when the answer is usable.
 *
 * Required is checked on the cleaned value, so a field holding only spaces
 * counts as unanswered rather than as an answer.
 */
function answerError(question: RegistrationQuestion, value: unknown): string | null {
  const limit = ANSWER_LIMITS[question.type];

  if (question.type === 'checkboxes') {
    const list = Array.isArray(value) ? value.map(cleanString).filter(Boolean) : [];
    if (list.length === 0) return question.required ? 'Choose at least one option.' : null;
    const unknown = list.filter((item) => !question.options.includes(item));
    if (unknown.length > 0) return 'Choose one of the listed options.';
    return null;
  }

  const text = cleanString(value);
  if (!text) return question.required ? 'This question is required.' : null;
  if (text.length > limit) return `Keep this answer to ${limit} characters or fewer.`;

  switch (question.type) {
    case 'email':
      return EMAIL_PATTERN.test(text) ? null : 'Enter an email address in the form name@example.com.';
    case 'phone':
      return PHONE_PATTERN.test(text) ? null : 'Use digits, spaces, dashes or brackets.';
    case 'number':
      return NUMBER_PATTERN.test(text) ? null : 'Enter a number.';
    case 'date': {
      if (!DATE_PATTERN.test(text)) return 'Choose a date.';
      const stamp = Date.parse(`${text}T00:00:00Z`);
      // 31 February rolls over to March in Date, so the day has to survive a
      // round trip before it counts as a real date.
      if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== text) {
        return 'Choose a real date.';
      }
      return null;
    }
    case 'choice':
    case 'dropdown':
      return question.options.includes(text) ? null : 'Choose one of the listed options.';
    default:
      return null;
  }
}

export type ValidatedAnswers = {
  errors: Record<string, string>;
  answers: StoredAnswer[];
  /** The same trimmed values, keyed by id, for the legacy lead columns. */
  values: Record<string, string | string[]>;
};

/**
 * Validates a whole submission against the form that asked the questions.
 *
 * Unknown question ids are refused rather than dropped: a request carrying them
 * is not a stale browser, it is something else talking to the endpoint.
 */
export function validateAnswers(form: RegistrationForm, raw: unknown): ValidatedAnswers {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const errors: Record<string, string> = {};
  const answers: StoredAnswer[] = [];
  const values: Record<string, string | string[]> = {};

  const known = new Map(form.questions.map((question) => [question.id, question]));
  for (const key of Object.keys(source)) {
    if (!known.has(key)) errors[key] = 'This question is not part of the form.';
  }

  // Walked top to bottom so a question's condition can read the answers
  // accepted for the questions above it — the same order the browser renders
  // in. `accepted` holds only answers that passed, never raw input.
  const accepted: Record<string, string | string[]> = {};

  form.questions.forEach((question, index) => {
    if (!isQuestionVisible(form, index, accepted)) {
      // Hidden: both the required and the format checks are skipped — a
      // condition hiding a required question must never block the submission —
      // and any value that arrived anyway is dropped, so a stale browser tab
      // keeps working. The marker keeps the question readable in the response.
      answers.push({
        questionId: question.id,
        label: question.label,
        type: question.type,
        value: '',
        skipped: true,
      });
      return;
    }

    const value = source[question.id];
    const message = answerError(question, value);
    if (message) {
      errors[question.id] = message;
      return;
    }

    const normalised: string | string[] =
      question.type === 'checkboxes'
        ? (Array.isArray(value) ? [...new Set(value.map(cleanString).filter(Boolean))] : [])
        : cleanString(value);

    const empty = Array.isArray(normalised) ? normalised.length === 0 : normalised === '';
    if (empty) return;

    accepted[question.id] = normalised;
    values[question.id] = normalised;
    answers.push({
      questionId: question.id,
      label: question.label,
      type: question.type,
      value: normalised,
    });
  });

  return { errors, answers, values };
}

/** The answer to one of the built-in questions, if the form still asks it. */
export function answerText(
  values: Record<string, string | string[]>,
  ids: string[],
): string | null {
  for (const id of ids) {
    const value = values[id];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

/**
 * A stored answers column as one readable cell for the CSV export.
 *
 * The label travelled with each answer, so a row stays legible after the form
 * and its questions have changed.
 */
export function formatAnswersForCsv(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const answer = entry as { label?: unknown; value?: unknown; skipped?: unknown };
      const label = typeof answer.label === 'string' ? answer.label : '';
      if (answer.skipped === true) return label ? `${label}: (not applicable)` : '';
      const answerValue = Array.isArray(answer.value)
        ? answer.value.filter((item): item is string => typeof item === 'string').join(', ')
        : typeof answer.value === 'string'
          ? answer.value
          : '';
      return label && answerValue ? `${label}: ${answerValue}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

/** The first answer of a type, for forms whose questions were renamed. */
export function firstAnswerOfType(
  answers: StoredAnswer[],
  type: RegistrationQuestionType,
): string | null {
  for (const answer of answers) {
    if (answer.type === type && typeof answer.value === 'string' && answer.value !== '') {
      return answer.value;
    }
  }
  return null;
}
