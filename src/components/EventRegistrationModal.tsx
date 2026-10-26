import { useState, useEffect, useId, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EventItem } from '../data/events';
import { leadFailureMessage, submitRegistration } from '../lib/leadClient';
import { useFormsAvailability } from '../hooks/useFormsAvailability';
import FormsUnavailableNotice, { FormAvailabilityPending } from './FormsUnavailableNotice';
import {
  ANSWER_LIMITS,
  coerceRegistrationForm,
  defaultRegistrationForm,
  formWindow,
  validateAnswers,
  visibleQuestionIds,
  type RegistrationAnswers,
  type RegistrationForm,
  type RegistrationQuestion,
} from '../lib/registrationForm';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all';

/** `2026-11-02T09:00:00Z` -> `2 November 2026 at 10:00`, read in Lagos. */
function describeInstant(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function text(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** The fixed columns the lead table keeps, derived from the answers. */
function deriveContact(form: RegistrationForm, answers: RegistrationAnswers) {
  const first = (types: RegistrationQuestion['type'][]): string => {
    for (const question of form.questions) {
      if (types.includes(question.type)) {
        const value = text(answers[question.id]);
        if (value) return value;
      }
    }
    return '';
  };

  const emailQuestion = form.questions.find((question) => question.type === 'email');
  const nameQuestion = form.questions.find((question) => question.id === 'name');
  const phoneQuestion = form.questions.find((question) => question.type === 'phone');
  const notesQuestion = form.questions.find((question) => question.id === 'notes');

  return {
    name: text(answers[nameQuestion?.id ?? '']) || first(['short_text']) || text(answers[emailQuestion?.id ?? '']).split('@')[0] || '',
    email: text(answers[emailQuestion?.id ?? '']) || first(['email']),
    phone: text(answers[phoneQuestion?.id ?? '']),
    organization: text(answers.organisation ?? answers.organization ?? '') || '',
    notes: text(answers[notesQuestion?.id ?? '']) || first(['paragraph']),
  };
}

/** One question as the visitor sees it: the input that matches its type. */
function AnswerField({
  question,
  formId,
  value,
  error,
  onChange,
}: {
  question: RegistrationQuestion;
  formId: string;
  value: string | string[] | undefined;
  error?: string;
  onChange: (next: string | string[]) => void;
}) {
  const id = `${formId}-${question.id}`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : undefined;
  const shared = {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    className: inputClass,
  };
  const maxLength = ANSWER_LIMITS[question.type];

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-charcoal/70 mb-1">
        {question.label}
        {question.required ? ' *' : ''}
      </label>

      {question.type === 'paragraph' ? (
        <textarea
          {...shared}
          rows={3}
          maxLength={maxLength}
          value={text(value)}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} resize-none`}
        />
      ) : question.type === 'dropdown' ? (
        <select
          {...shared}
          value={text(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose an option…</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : question.type === 'choice' ? (
        <div
          id={id}
          role="radiogroup"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="space-y-2 pt-1"
        >
          {question.options.map((option) => (
            <label
              key={option}
              className="flex items-start gap-2.5 text-sm text-charcoal/80 cursor-pointer"
            >
              <input
                type="radio"
                name={id}
                value={option}
                checked={text(value) === option}
                onChange={() => onChange(option)}
                className="mt-0.5 h-4 w-4 accent-[#0B4B3C]"
              />
              {option}
            </label>
          ))}
        </div>
      ) : question.type === 'checkboxes' ? (
        <div
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="space-y-2 pt-1"
        >
          {question.options.map((option) => {
            const list = Array.isArray(value) ? value : [];
            const checked = list.includes(option);
            return (
              <label
                key={option}
                className="flex items-start gap-2.5 text-sm text-charcoal/80 cursor-pointer"
              >
                <input
                  type="checkbox"
                  value={option}
                  checked={checked}
                  onChange={() =>
                    onChange(checked ? list.filter((item) => item !== option) : [...list, option])
                  }
                  className="mt-0.5 h-4 w-4 accent-[#0B4B3C]"
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : (
        <input
          {...shared}
          type={
            question.type === 'email'
              ? 'email'
              : question.type === 'phone'
                ? 'tel'
                : question.type === 'number'
                  ? 'number'
                  : question.type === 'date'
                    ? 'date'
                    : 'text'
          }
          step={question.type === 'number' ? 'any' : undefined}
          maxLength={question.type === 'date' ? undefined : maxLength}
          autoComplete={
            question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'off'
          }
          required={question.required}
          aria-required={question.required}
          value={text(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

interface EventRegistrationModalProps {
  event: EventItem | null;
  onClose: () => void;
}

export default function EventRegistrationModal({ event, onClose }: EventRegistrationModalProps) {
  const formId = useId();
  const [answers, setAnswers] = useState<RegistrationAnswers>({});
  const [website, setWebsite] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Asked once on open, so the form is not put in front of someone only to
  // refuse their submission afterwards.
  const formsAvailability = useFormsAvailability();

  /** The saved form, or the fixed questions the site has always asked. */
  const form = useMemo<RegistrationForm>(
    () => coerceRegistrationForm(event?.registrationForm) ?? defaultRegistrationForm(),
    [event?.registrationForm],
  );
  const windowState = useMemo(() => formWindow(form), [form]);
  // Which questions the conditions currently show. Recomputed on every answer
  // so a change of mind shows and hides follow-up questions live.
  const visible = useMemo(() => visibleQuestionIds(form, answers), [form, answers]);

  useEffect(() => {
    // A question hidden after being answered must not leak its stale value into
    // the submission or the confirmation screen — the server would drop it
    // anyway, and dropping it here keeps both sides saying the same thing.
    setAnswers((current) => {
      const kept = Object.entries(current).filter(([id]) => visible.has(id));
      return kept.length === Object.keys(current).length
        ? current
        : Object.fromEntries(kept);
    });
    setFieldErrors((current) => {
      const kept = Object.entries(current).filter(([id]) => visible.has(id));
      return kept.length === Object.keys(current).length
        ? current
        : Object.fromEntries(kept);
    });
  }, [visible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    // A different event means different questions and a fresh form.
    setAnswers({});
    setFieldErrors({});
    setError('');
    setIsConfirmed(false);
  }, [event?.slug]);

  if (!event) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Client side first, so a typo is answered without a round trip. The server
    // checks the same rules against the form it stored and is the source of
    // truth.
    const errors = validateAnswers(form, answers);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('');
      return;
    }

    setFieldErrors({});
    setError('');
    setIsSubmitting(true);

    const contact = deriveContact(form, answers);
    const result = await submitRegistration({
      eventSlug: event.slug,
      answers,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      organization: contact.organization,
      notes: contact.notes,
      website,
    });

    setIsSubmitting(false);
    if (result.ok) {
      setIsConfirmed(true);
      return;
    }

    if (result.failure.fields) setFieldErrors(result.failure.fields);
    setError(leadFailureMessage(result.failure));
  };

  const downloadCalendarFile = () => {
    const icsDate = event.isoDate.replace(/-/g, '');
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//People Growth Africa//Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${event.subtitle}\\n\\nSpeaker: ${event.speaker.name}, ${event.speaker.title}`,
      `LOCATION:${event.format}`,
      `DTSTART:${icsDate}T140000Z`,
      `DTEND:${icsDate}T153000Z`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${event.slug}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const emailAnswer =
    form.questions.find((question) => question.type === 'email')?.id ?? '';
  const nameAnswer = form.questions.find((question) => question.id === 'name')?.id ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/70 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative z-10 bg-white rounded-[24px] max-w-[620px] w-full max-h-[90vh] overflow-y-auto shadow-elevated border border-charcoal/10"
      >
        {/* Close Button: sticky so it stays reachable while the form scrolls.
            The wrapper has no height, so the button floats over the header
            instead of pushing it down. */}
        <div className="pointer-events-none sticky top-0 z-30 flex h-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="pointer-events-auto mt-4 mr-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-deep-green shadow-md ring-1 ring-charcoal/10 transition-colors motion-reduce:transition-none hover:bg-mint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green cursor-pointer"
          >
            <svg
              className="h-4 w-4 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Header */}
        <div className="bg-deep-green p-6 md:p-8 text-white relative">
          <span className="inline-block px-3 py-1 rounded-full bg-mint text-deep-green text-xs font-semibold uppercase tracking-wider mb-2">
            {event.typeLabel}
          </span>
          <h3 className="font-[family-name:var(--font-heading)] text-xl md:text-2xl font-semibold leading-snug mb-1">
            {event.title}
          </h3>
          <p className="text-xs md:text-sm text-white/80 font-medium">
            {event.date} &bull; {event.time}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8">
          <AnimatePresence mode="wait">
            {formsAvailability !== 'available' ? (
              <motion.div
                key="availability"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                {formsAvailability === 'unavailable' ? (
                  <FormsUnavailableNotice />
                ) : (
                  <FormAvailabilityPending className="py-4 text-center" />
                )}
              </motion.div>
            ) : isConfirmed ? (
              <motion.div
                key="confirmed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-6"
              >
                <div className="w-14 h-14 rounded-full bg-mint text-deep-green flex items-center justify-center mx-auto mb-4 border border-brand-green">
                  <svg className="w-7 h-7 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h4 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal mb-2">
                  Registration received
                </h4>
                {form.confirmationMessage ? (
                  <p className="text-charcoal/70 text-sm leading-relaxed mb-6 whitespace-pre-line">
                    {form.confirmationMessage}
                  </p>
                ) : (
                  <p className="text-charcoal/70 text-sm leading-relaxed mb-6">
                    Thank you, <strong>{text(answers[nameAnswer]) || 'friend'}</strong>. Your place
                    is saved and our team has your details. A confirmation email is on its way to{' '}
                    <strong>{text(answers[emailAnswer]) || 'your inbox'}</strong>, and we will send
                    your joining link before the session.
                  </p>
                )}

                <div className="bg-cream/70 rounded-[14px] p-5 text-left text-xs mb-6 space-y-2 border border-charcoal/10">
                  <div><strong>Event:</strong> {event.title}</div>
                  <div><strong>Schedule:</strong> {event.date} at {event.time}</div>
                  <div><strong>Platform:</strong> {event.format}</div>
                  <div><strong>Speaker:</strong> {event.speaker.name} ({event.speaker.title})</div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={downloadCalendarFile}
                    className="px-6 py-2.5 bg-deep-green text-white text-xs font-semibold rounded-full hover:bg-brand-green transition-all"
                  >
                    Add to calendar (.ics)
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 bg-cream text-charcoal text-xs font-semibold rounded-full hover:bg-charcoal/10 transition-all border border-charcoal/15"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            ) : windowState !== 'open' ? (
              <motion.div
                key="window"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-4 text-center"
              >
                <h4 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mb-2">
                  {windowState === 'closed' ? 'Registration has closed' : 'Registration is not open yet'}
                </h4>
                <p className="text-charcoal/70 text-sm leading-relaxed mb-6">
                  {windowState === 'closed'
                    ? form.closesAt
                      ? `This form closed on ${describeInstant(form.closesAt)}.`
                      : 'This event is no longer accepting registrations.'
                    : form.opensAt
                      ? `This form opens on ${describeInstant(form.opensAt)}.`
                      : 'This event is not accepting registrations yet.'}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-cream text-charcoal text-xs font-semibold rounded-full hover:bg-charcoal/10 transition-all border border-charcoal/15"
                >
                  Close
                </button>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={handleSubmit}
                className="space-y-4"
                noValidate
              >
                <div className="mb-4">
                  <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal">
                    {form.title}
                  </p>
                  <p className="mt-1 text-xs md:text-sm text-charcoal/70 leading-relaxed">
                    {event.registrationIntro?.trim() ||
                      'Fill in the short form below to reserve your place and receive the agenda.'}
                  </p>
                </div>

                <div className="space-y-4">
                  {form.questions
                    .filter((question) => visible.has(question.id))
                    .map((question) => (
                    <AnswerField
                      key={question.id}
                      question={question}
                      formId={formId}
                      value={answers[question.id]}
                      error={fieldErrors[question.id]}
                      onChange={(next) =>
                        setAnswers((current) => ({ ...current, [question.id]: next }))
                      }
                    />
                  ))}
                </div>

                {/* Honeypot: off screen and skipped by the keyboard. A real
                    visitor never sees or fills it; a bot that fills every field
                    is accepted and then silently dropped by the server. */}
                <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                  <label htmlFor={`${formId}-website`}>Website</label>
                  <input
                    id={`${formId}-website`}
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-[10px] border border-terracotta/30 bg-terracotta/10 px-3.5 py-2.5 text-xs text-terracotta"
                  >
                    {error}
                  </p>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-6 bg-brand-green text-white font-semibold rounded-full hover:bg-terracotta transition-all text-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting
                      ? 'Saving your place…'
                      : event.registrationButtonLabel?.trim() ||
                        (event.type === 'mentorship' ? 'Apply for a place' : 'Reserve my free place')}
                  </button>
                  <p className="text-center text-[0.7rem] text-charcoal/50 mt-2">
                    We will email your joining link before the session.
                  </p>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
