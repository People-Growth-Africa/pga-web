import { useState, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EventItem } from '../data/events';
import { leadFailureMessage, submitRegistration } from '../lib/leadClient';
import { useFormsAvailability } from '../hooks/useFormsAvailability';
import FormsUnavailableNotice, { FormAvailabilityPending } from './FormsUnavailableNotice';

type RegistrationFields = {
  name: string;
  email: string;
  phone: string;
  organization: string;
  notes: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{5,19}$/;

/** The same limits the server enforces, checked here for a faster answer. */
function validateRegistration(values: RegistrationFields): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const phone = values.phone.trim();
  const organization = values.organization.trim();
  const notes = values.notes.trim();

  if (!name) errors.name = 'Enter your full name.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';

  if (!email) errors.email = 'Enter your email address.';
  else if (email.length > 254) errors.email = 'Email must be 254 characters or fewer.';
  else if (!EMAIL_PATTERN.test(email))
    errors.email = 'Enter an email address in the form name@example.com.';

  if (!phone) errors.phone = 'Enter your phone number.';
  else if (phone.length > 20) errors.phone = 'Phone must be 20 characters or fewer.';
  else if (!PHONE_PATTERN.test(phone))
    errors.phone = 'Enter a phone number using digits, spaces, dashes or brackets.';

  if (organization.length > 150)
    errors.organization = 'Organisation must be 150 characters or fewer.';

  if (!notes) errors.notes = 'Tell us what you would like to get from this session.';
  else if (notes.length > 1000) errors.notes = 'Notes must be 1000 characters or fewer.';

  return errors;
}

interface EventRegistrationModalProps {
  event: EventItem | null;
  onClose: () => void;
}

export default function EventRegistrationModal({ event, onClose }: EventRegistrationModalProps) {
  const formId = useId();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    organization: '',
    notes: '',
    website: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Asked once on open, so the form is not put in front of someone only to
  // refuse their submission afterwards.
  const formsAvailability = useFormsAvailability();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!event) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Client side first, so a typo is answered without a round trip. The server
    // checks the same rules again and is the source of truth.
    const errors = validateRegistration(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('');
      return;
    }

    setFieldErrors({});
    setError('');
    setIsSubmitting(true);

    const result = await submitRegistration({
      eventSlug: event.slug,
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      organization: formData.organization,
      notes: formData.notes,
      website: formData.website,
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
                <p className="text-charcoal/70 text-sm leading-relaxed mb-6">
                  Thank you, <strong>{formData.name}</strong>. Your place is saved and our team has your details. A confirmation email is on its way to <strong>{formData.email}</strong>, and we will send your joining link before the session.
                </p>

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
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={handleSubmit}
                className="space-y-4"
                noValidate
              >
                <p className="text-xs md:text-sm text-charcoal/70 leading-relaxed mb-4">
                  Fill in the short form below to reserve your place and receive the agenda.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor={`${formId}-name`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Full name *
                    </label>
                    <input
                      id={`${formId}-name`}
                      type="text"
                      required
                      maxLength={100}
                      autoComplete="name"
                      placeholder="e.g. Oluwaseun Davies"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.name)}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                    />
                    {fieldErrors.name && (
                      <p role="alert" className="mt-1 text-xs text-terracotta">{fieldErrors.name}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={`${formId}-email`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Email *
                    </label>
                    <input
                      id={`${formId}-email`}
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      placeholder="oluwaseun@company.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.email)}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                    />
                    {fieldErrors.email && (
                      <p role="alert" className="mt-1 text-xs text-terracotta">{fieldErrors.email}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={`${formId}-phone`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Phone / WhatsApp *
                    </label>
                    <input
                      id={`${formId}-phone`}
                      type="tel"
                      required
                      maxLength={20}
                      autoComplete="tel"
                      placeholder="+234 800 000 0000"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                    />
                    {fieldErrors.phone && (
                      <p role="alert" className="mt-1 text-xs text-terracotta">{fieldErrors.phone}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={`${formId}-org`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Organisation / company <span className="font-normal">(optional)</span>
                    </label>
                    <input
                      id={`${formId}-org`}
                      type="text"
                      maxLength={150}
                      autoComplete="organization"
                      placeholder="e.g. Sterling Ventures"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.organization)}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                    />
                    {fieldErrors.organization && (
                      <p role="alert" className="mt-1 text-xs text-terracotta">{fieldErrors.organization}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor={`${formId}-notes`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Notes *
                  </label>
                  <textarea
                    id={`${formId}-notes`}
                    rows={3}
                    required
                    maxLength={1000}
                    placeholder="Tell us what you would like to get from the session..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    aria-invalid={Boolean(fieldErrors.notes)}
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all resize-none"
                  />
                  {fieldErrors.notes && (
                    <p role="alert" className="mt-1 text-xs text-terracotta">{fieldErrors.notes}</p>
                  )}
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
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
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
                      : event.type === 'mentorship'
                      ? 'Apply for a place'
                      : 'Reserve my free place'}
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
