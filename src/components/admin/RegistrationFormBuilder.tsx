import {
  QUESTION_TYPE_LABELS,
  REGISTRATION_QUESTION_TYPES,
  conditionWarning,
  isChoiceQuestion,
  newQuestionId,
  type RegistrationForm,
  type RegistrationQuestion,
  type RegistrationQuestionType,
} from '../../lib/registrationForm';
import { isoToLagosInput, lagosInputToIso } from '../../lib/published';

type Props = {
  value: RegistrationForm;
  onChange: (next: RegistrationForm) => void;
  /** Responses already collected, when the editor was opened on a saved event. */
  responseCount: number | null;
  disabled?: boolean;
};

const inputClass =
  'w-full rounded-xl border border-charcoal/15 bg-white px-3.5 py-2.5 font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal placeholder:text-charcoal/35 transition-colors focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/25';

const smallButton =
  'inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-full border border-charcoal/15 bg-white px-3 font-[family-name:var(--font-body)] text-[0.8rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint disabled:cursor-not-allowed disabled:opacity-40';

const label =
  'mb-1.5 block font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-charcoal/75';

/**
 * The event's registration form, edited in place.
 *
 * Up and down buttons rather than dragging: no dependency, and a keyboard can
 * reorder the list. Each question can carry one condition — show it only when
 * an earlier choice question answered one of the ticked options. Sections,
 * multi-condition logic, file uploads and response limits are deliberately
 * absent; this is the shape a Google Form takes when it only needs to collect a
 * place at an event.
 *
 * A condition that has gone stale (deleted driver, renamed option, a question
 * moved below its driver) is never cleared behind the editor's back: it stays,
 * an amber warning names the problem, and the server refuses to save until it
 * is fixed or set back to Always.
 */
export default function RegistrationFormBuilder({
  value,
  onChange,
  responseCount,
  disabled = false,
}: Props) {
  function update(patch: Partial<RegistrationForm>) {
    onChange({ ...value, ...patch });
  }

  function updateQuestion(index: number, patch: Partial<RegistrationQuestion>) {
    const questions = value.questions.map((question, position) =>
      position === index ? { ...question, ...patch } : question,
    );
    onChange({ ...value, questions });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.questions.length) return;
    const questions = [...value.questions];
    const [moved] = questions.splice(index, 1);
    questions.splice(target, 0, moved);
    onChange({ ...value, questions });
  }

  function remove(index: number) {
    onChange({ ...value, questions: value.questions.filter((_, position) => position !== index) });
  }

  function add(type: RegistrationQuestionType = 'short_text') {
    const question: RegistrationQuestion = {
      id: newQuestionId(),
      type,
      label: '',
      required: false,
      options: [],
      showIf: null,
    };
    onChange({ ...value, questions: [...value.questions, question] });
  }

  function changeType(index: number, type: RegistrationQuestionType) {
    const question = value.questions[index];
    const needsOptions = isChoiceQuestion(type) && question.options.length < 2;
    updateQuestion(index, {
      type,
      options: isChoiceQuestion(type)
        ? needsOptions
          ? ['Option 1', 'Option 2']
          : question.options
        : [],
    });
  }

  /** Ticks or unticks one option in the condition of question `index`. */
  function toggleConditionOption(index: number, option: string) {
    const condition = value.questions[index].showIf;
    if (!condition) return;
    const anyOf = condition.anyOf.includes(option)
      ? condition.anyOf.filter((existing) => existing !== option)
      : [...condition.anyOf, option];
    updateQuestion(index, { showIf: { ...condition, anyOf } });
  }

  const hasEmailQuestion = value.questions.some((question) => question.type === 'email');

  return (
    <section
      aria-labelledby="registration-form-heading"
      className="rounded-[18px] border border-charcoal/10 bg-[#FAF8F3] p-5 sm:p-6"
    >
      <div className="mb-4">
        <h3
          id="registration-form-heading"
          className="font-[family-name:var(--font-heading)] text-[1.15rem] font-semibold text-charcoal"
        >
          Registration form
        </h3>
        <p className="mt-1 font-[family-name:var(--font-body)] text-[0.85rem] leading-relaxed text-charcoal/60">
          The questions people answer to register. Without a form here, the page asks for name,
          email, phone, organisation and notes.
        </p>
      </div>

      {responseCount !== null && responseCount > 0 && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-[family-name:var(--font-body)] text-[0.82rem] leading-relaxed text-amber-900"
        >
          <strong>{responseCount}</strong> {responseCount === 1 ? 'response has' : 'responses have'}{' '}
          already been collected. Changes apply to new responses only — past answers keep the
          question they were asked under and stay readable in Data.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={label}>Form title</span>
          <input
            type="text"
            value={value.title}
            onChange={(event) => update({ title: event.target.value })}
            maxLength={120}
            disabled={disabled}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={label}>Opens</span>
          <input
            type="datetime-local"
            value={isoToLagosInput(value.opensAt)}
            onChange={(event) => update({ opensAt: lagosInputToIso(event.target.value) })}
            disabled={disabled}
            className={inputClass}
          />
          <span className="mt-1 block font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/45">
            Leave empty to accept entries immediately.
          </span>
        </label>
        <label className="block">
          <span className={label}>Closes</span>
          <input
            type="datetime-local"
            value={isoToLagosInput(value.closesAt)}
            onChange={(event) => update({ closesAt: lagosInputToIso(event.target.value) })}
            disabled={disabled}
            className={inputClass}
          />
          <span className="mt-1 block font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/45">
            Leave empty to keep the form open.
          </span>
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Confirmation message</span>
          <textarea
            value={value.confirmationMessage}
            onChange={(event) => update({ confirmationMessage: event.target.value })}
            rows={2}
            maxLength={600}
            disabled={disabled}
            placeholder="Thank you. Your place is saved and a joining link is on its way."
            className={inputClass}
          />
        </label>
      </div>

      <ol className="mt-6 space-y-3">
        {value.questions.map((question, index) => {
          const optionsText = question.options.join('\n');
          const condition = question.showIf;
          const driver = condition
            ? value.questions.find((candidate) => candidate.id === condition.questionId)
            : undefined;
          const driverAbove =
            condition &&
            value.questions
              .slice(0, index)
              .some(
                (candidate) =>
                  candidate.id === condition.questionId && isChoiceQuestion(candidate.type),
              );
          const warning = conditionWarning(value, index);
          return (
            <li
              key={question.id}
              className="rounded-[14px] border border-charcoal/10 bg-white p-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className="mt-2 font-[family-name:var(--font-body)] text-[0.75rem] font-semibold text-charcoal/40">
                  {index + 1}
                </span>
                <label className="min-w-[180px] flex-1">
                  <span className={label}>Question</span>
                  <input
                    type="text"
                    value={question.label}
                    onChange={(event) => updateQuestion(index, { label: event.target.value })}
                    maxLength={160}
                    disabled={disabled}
                    placeholder="e.g. Job title"
                    className={inputClass}
                  />
                </label>
                <label className="w-full sm:w-[190px]">
                  <span className={label}>Answer type</span>
                  <select
                    value={question.type}
                    onChange={(event) =>
                      changeType(index, event.target.value as RegistrationQuestionType)
                    }
                    disabled={disabled}
                    className={inputClass}
                  >
                    {REGISTRATION_QUESTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {QUESTION_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2 pt-6">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 font-[family-name:var(--font-body)] text-[0.8rem] font-semibold text-charcoal/70">
                    <input
                      type="checkbox"
                      checked={question.required}
                      onChange={(event) =>
                        updateQuestion(index, { required: event.target.checked })
                      }
                      disabled={disabled}
                      className="h-4 w-4 accent-[#0B4B3C]"
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                    className={smallButton}
                    aria-label={`Move question ${index + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === value.questions.length - 1}
                    className={smallButton}
                    aria-label={`Move question ${index + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={disabled}
                    className={`${smallButton} border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50`}
                    aria-label={`Remove question ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {isChoiceQuestion(question.type) && (
                <label className="mt-3 block">
                  <span className={label}>Options, one per line</span>
                  <textarea
                    value={optionsText}
                    onChange={(event) =>
                      updateQuestion(index, {
                        options: event.target.value.split('\n').map((line) => line.trim()),
                      })
                    }
                    rows={Math.min(6, Math.max(2, question.options.length + 1))}
                    disabled={disabled}
                    className={inputClass}
                  />
                  {question.options.filter(Boolean).length < 2 && (
                    <span className="mt-1 block font-[family-name:var(--font-body)] text-[0.75rem] text-red-600">
                      Add at least two options before saving.
                    </span>
                  )}
                </label>
              )}

              {/* Skip logic. A condition is never cleared behind the editor's
                  back: a stale one stays, warns, and blocks the save. An email
                  question shows the row only while a condition is stuck on it,
                  because it can never be hidden. */}
              {(question.type !== 'email' || condition) && (
                <div className="mt-3 rounded-xl border border-charcoal/10 bg-[#FAF8F3] px-3.5 py-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="w-full sm:w-[300px]">
                      <span className={label}>Show this question only when</span>
                      <select
                        value={condition?.questionId ?? ''}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (!next) {
                            updateQuestion(index, { showIf: null });
                            return;
                          }
                          const source = value.questions.find(
                            (candidate) => candidate.id === next,
                          );
                          updateQuestion(index, {
                            showIf: { questionId: next, anyOf: source ? [...source.options] : [] },
                          });
                        }}
                        disabled={disabled}
                        className={inputClass}
                      >
                        <option value="">Always</option>
                        {value.questions
                          .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
                          .filter(
                            ({ candidate, candidateIndex }) =>
                              candidateIndex < index && isChoiceQuestion(candidate.type),
                          )
                          .map(({ candidate }) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.label || 'Untitled question'}
                            </option>
                          ))}
                        {/* A condition whose driver is gone or no longer above
                            stays selectable so its warning stays on screen. */}
                        {condition && !driverAbove && (
                          <option value={condition.questionId}>
                            {driver ? driver.label || 'Untitled question' : 'A deleted question'}
                          </option>
                        )}
                      </select>
                    </label>

                    {condition && driver && (
                      <fieldset className="min-w-[220px] flex-1">
                        <legend className={label}>Shown when it includes any of these</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                          {[...new Set([...driver.options, ...condition.anyOf])].map((option) => (
                            <label
                              key={option}
                              className="inline-flex cursor-pointer items-center gap-1.5 font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/70"
                            >
                              <input
                                type="checkbox"
                                checked={condition.anyOf.includes(option)}
                                onChange={() => toggleConditionOption(index, option)}
                                disabled={disabled}
                                className="h-4 w-4 accent-[#0B4B3C]"
                              />
                              {option || '(empty option)'}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>

                  {warning ? (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-[family-name:var(--font-body)] text-[0.78rem] leading-relaxed text-amber-900">
                      {warning} Fix it before saving, or choose Always.
                    </p>
                  ) : (
                    condition &&
                    driver && (
                      <p className="mt-2 font-[family-name:var(--font-body)] text-[0.75rem] text-charcoal/45">
                        Hidden until “
                        {driver.label || 'this question'}” is answered with one of the ticked
                        options.
                      </p>
                    )
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {value.questions.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-charcoal/20 bg-white px-4 py-6 text-center font-[family-name:var(--font-body)] text-[0.85rem] text-charcoal/50">
          No questions yet. Add the first one below.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => add('short_text')}
          disabled={disabled || value.questions.length >= 40}
          className="inline-flex min-h-[40px] cursor-pointer items-center rounded-full border border-deep-green bg-deep-green px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add question
        </button>
        <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
          {value.questions.length} of 40
        </span>
      </div>

      {!hasEmailQuestion && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-[family-name:var(--font-body)] text-[0.8rem] text-amber-900">
          Add an email question: it is how the team replies and how a place is confirmed.
        </p>
      )}
    </section>
  );
}
