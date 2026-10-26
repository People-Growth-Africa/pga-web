/**
 * The event registration form, as the browser builds it and as the public page
 * renders it.
 *
 * The shape is mirrored on the server (`api/_lib/registration-form.ts`), which
 * is the authority: the editor's save and every submission are checked there.
 * Keeping the same rules here is only so a mistake is answered without a round
 * trip.
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

export const QUESTION_TYPE_LABELS: Record<RegistrationQuestionType, string> = {
  short_text: 'Short text',
  paragraph: 'Paragraph',
  email: 'Email',
  phone: 'Phone',
  number: 'Number',
  date: 'Date',
  choice: 'Multiple choice',
  checkboxes: 'Checkboxes',
  dropdown: 'Dropdown',
};

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
 * these." Mirrors `RegistrationShowIf` on the server.
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
  /** UTC ISO instants, or null for no bound. */
  opensAt: string | null;
  closesAt: string | null;
  confirmationMessage: string;
  questions: RegistrationQuestion[];
};

export type RegistrationAnswers = Record<string, string | string[]>;

/**
 * A question id that stays the same across edits, so answers collected before a
 * change keep pointing at the question that asked them.
 */
export function newQuestionId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `q_${random}`;
}

/** The fields the site collected before forms were editable. */
export function defaultRegistrationForm(): RegistrationForm {
  return {
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
}

/**
 * Reads a condition off the wire without discarding one that has merely gone
 * stale — the builder needs to see it to warn about it, and silently clearing
 * it is exactly what the editor must not do. Only shape-broken payloads (no
 * usable question id) collapse to null, which fails open: the question shows.
 */
function coerceShowIf(value: unknown): RegistrationShowIf | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as { questionId?: unknown; anyOf?: unknown };
  if (typeof raw.questionId !== 'string' || raw.questionId === '') return null;
  return {
    questionId: raw.questionId,
    anyOf: Array.isArray(raw.anyOf)
      ? raw.anyOf.filter((option): option is string => typeof option === 'string')
      : [],
  };
}

/**
 * Reads a form from an API response. Anything that is not the expected shape
 * falls back to the built-in fields rather than breaking the registration
 * modal for one malformed row.
 */
export function coerceRegistrationForm(value: unknown): RegistrationForm | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<RegistrationForm>;
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;

  const questions: RegistrationQuestion[] = [];
  for (const entry of raw.questions) {
    if (!entry || typeof entry !== 'object') return null;
    const question = entry as Partial<RegistrationQuestion>;
    if (
      typeof question.id !== 'string' ||
      typeof question.label !== 'string' ||
      !REGISTRATION_QUESTION_TYPES.includes(question.type as RegistrationQuestionType)
    ) {
      return null;
    }
    const type = question.type as RegistrationQuestionType;
    questions.push({
      id: question.id,
      type,
      label: question.label,
      required: Boolean(question.required),
      options: isChoiceQuestion(type)
        ? Array.isArray(question.options)
          ? question.options.filter((option): option is string => typeof option === 'string')
          : []
        : [],
      showIf: coerceShowIf(question.showIf),
    });
  }

  return {
    version: 1,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Register for this event',
    opensAt: typeof raw.opensAt === 'string' ? raw.opensAt : null,
    closesAt: typeof raw.closesAt === 'string' ? raw.closesAt : null,
    confirmationMessage:
      typeof raw.confirmationMessage === 'string' ? raw.confirmationMessage : '',
    questions,
  };
}

/**
 * Whether one question shows, given the answers already accepted for the
 * questions above it. Verbatim mirror of the server's version in
 * `api/_lib/registration-form.ts` — the server is the authority, this only
 * spares a round trip.
 *
 * A broken condition fails open — the question shows — so a rule that has gone
 * stale can never make a question silently vanish.
 */
export function isQuestionVisible(
  form: RegistrationForm,
  index: number,
  values: Record<string, string | string[]>,
): boolean {
  const condition = form.questions[index].showIf;
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
    if (Array.isArray(value) ? value.length > 0 : value) shown[question.id] = value;
  });
  return visible;
}

/**
 * Why a question's condition cannot be saved, or null when it is sound.
 * The messages match `registrationFormSaveSchema` on the server, so the editor
 * shows before saving exactly what the save would have said.
 */
export function conditionWarning(form: RegistrationForm, index: number): string | null {
  const question = form.questions[index];
  const condition = question?.showIf;
  if (!question || !condition) return null;
  if (question.type === 'email') return 'An email question cannot be hidden by a condition.';

  const driverIndex = form.questions.findIndex(
    (candidate) => candidate.id === condition.questionId,
  );
  if (driverIndex === -1) return 'This condition refers to a question that no longer exists.';
  if (driverIndex >= index) return 'A condition can only refer to a question above it.';

  const driver = form.questions[driverIndex];
  if (!isChoiceQuestion(driver.type)) {
    return 'Conditions can only depend on multiple choice, checkboxes or dropdown questions.';
  }

  const wanted = condition.anyOf.filter((option) => option.trim() !== '');
  if (wanted.length === 0) return 'Choose at least one option for this condition.';
  if (wanted.some((option) => !driver.options.includes(option))) {
    return 'This condition refers to an option that no longer exists.';
  }
  return null;
}

export type FormWindow = 'open' | 'not_open' | 'closed';

export function formWindow(form: RegistrationForm, now: Date = new Date()): FormWindow {
  const stamp = now.getTime();
  if (form.opensAt && stamp < Date.parse(form.opensAt)) return 'not_open';
  if (form.closesAt && stamp > Date.parse(form.closesAt)) return 'closed';
  return 'open';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{5,19}$/;
const NUMBER_PATTERN = /^-?\d{1,12}(?:\.\d{1,6})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The same answer rules the server applies, so a typo is answered immediately.
 *
 * Walked top to bottom like the server's version: a hidden question is skipped
 * outright — no required check, no format check, no error — and only an answer
 * that passes feeds the conditions below it.
 */
export function validateAnswers(
  form: RegistrationForm,
  answers: RegistrationAnswers,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const shown: RegistrationAnswers = {};

  form.questions.forEach((question, index) => {
    if (!isQuestionVisible(form, index, shown)) return;

    const value = answers[question.id];
    const limit = ANSWER_LIMITS[question.type];

    if (question.type === 'checkboxes') {
      const list = Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
      if (list.length === 0) {
        if (question.required) errors[question.id] = 'Choose at least one option.';
      } else if (list.some((item) => !question.options.includes(item))) {
        errors[question.id] = 'Choose one of the listed options.';
      } else {
        shown[question.id] = [...new Set(list)];
      }
      return;
    }

    const text = clean(value);
    if (!text) {
      if (question.required) errors[question.id] = 'This question is required.';
      return;
    }
    if (text.length > limit) {
      errors[question.id] = `Keep this answer to ${limit} characters or fewer.`;
      return;
    }

    switch (question.type) {
      case 'email':
        if (!EMAIL_PATTERN.test(text)) {
          errors[question.id] = 'Enter an email address in the form name@example.com.';
        }
        break;
      case 'phone':
        if (!PHONE_PATTERN.test(text)) {
          errors[question.id] = 'Use digits, spaces, dashes or brackets.';
        }
        break;
      case 'number':
        if (!NUMBER_PATTERN.test(text)) errors[question.id] = 'Enter a number.';
        break;
      case 'date': {
        const stamp = Date.parse(`${text}T00:00:00Z`);
        if (
          !DATE_PATTERN.test(text) ||
          !Number.isFinite(stamp) ||
          new Date(stamp).toISOString().slice(0, 10) !== text
        ) {
          errors[question.id] = 'Choose a real date.';
        }
        break;
      }
      case 'choice':
      case 'dropdown':
        if (!question.options.includes(text)) errors[question.id] = 'Choose one of the listed options.';
        break;
      default:
        break;
    }

    if (!errors[question.id]) shown[question.id] = text;
  });

  return errors;
}
