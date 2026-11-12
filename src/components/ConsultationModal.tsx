import { useState, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Select from './Select';
import { useConsultation } from '../hooks/useConsultation';
import { useFormsAvailability } from '../hooks/useFormsAvailability';
import FormsUnavailableNotice, { FormAvailabilityPending } from './FormsUnavailableNotice';
import {
  leadFailureMessage,
  localIsoDate,
  submitConsultationBooking,
  submitWrittenEnquiry,
} from '../lib/leadClient';

interface TimeSlot {
  time: string;
  hour: number;
}

const WEEKDAY_SLOTS: TimeSlot[] = [
  { time: '08:00 AM', hour: 8 },
  { time: '09:00 AM', hour: 9 },
  { time: '10:00 AM', hour: 10 },
  { time: '11:00 AM', hour: 11 },
  { time: '12:00 PM', hour: 12 },
  { time: '01:00 PM', hour: 13 },
  { time: '02:00 PM', hour: 14 },
  { time: '03:00 PM', hour: 15 },
  { time: '04:00 PM', hour: 16 },
  { time: '05:00 PM', hour: 17 },
];

const SATURDAY_SLOTS: TimeSlot[] = [
  { time: '11:00 AM', hour: 11 },
  { time: '12:00 PM', hour: 12 },
  { time: '01:00 PM', hour: 13 },
  { time: '02:00 PM', hour: 14 },
  { time: '03:00 PM', hour: 15 },
];

/** Same calendar day, whatever the time on either. */
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * The slots still open on a given day. Today is the special case: only slots
 * that have not started yet count, so once the last one has begun the day
 * carries nothing and drops off the strip below. Sundays are closed.
 */
function bookableSlots(day: Date, now: Date): TimeSlot[] {
  if (day.getDay() === 0) return [];
  const slots = day.getDay() === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS;
  if (!isSameDay(day, now)) return slots;
  return slots.filter((slot) => slot.hour > now.getHours());
}

/** The next two weeks, today first, each day still carrying at least one slot. */
function bookableDays(now: Date, count = 14): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  }).filter((d) => bookableSlots(d, now).length > 0);
}

const serviceOptions = [
  'HR Advisory & Consulting',
  'Learning & Development',
  'Organisational Design',
  'Culture Development',
  'Performance Management',
  'HR Audits & Compliance',
  'Agribusiness Workforce Development',
  'Agribusiness People Strategy',
  'Career Development Programmes',
  'Recruitment & Talent Management',
  'HR Retainerships',
  'People Strategy for SMEs',
  'Workforce Formalisation',
  'Nigerian Labour Law Compliance',
  'Team Effectiveness',
  'Leadership Development',
  'General Consultation & Diagnostic',
];

const teamSizeOptions = [
  '1 – 10 Employees',
  '11 – 50 Employees',
  '51 – 100 Employees',
  '100+ Employees',
];

export default function ConsultationModal() {
  const { isOpen, closeConsultation, selectedService } = useConsultation();
  const formId = useId();

  const [activeTab, setActiveTab] = useState<'calendar' | 'direct'>('calendar');

  /* The previous default, kept for reference: tomorrow, or Monday when
     tomorrow was Sunday.
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + 1);
    if (nextDay.getDay() === 0) {
      nextDay.setDate(nextDay.getDate() + 1);
    }
    return nextDay;
  });
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('10:00 AM');
  */

  // Start on the first bookable day, today included while it still has slots,
  // and on the first slot that day offers.
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    return bookableDays(new Date())[0] ?? new Date();
  });

  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>(() => {
    const firstDay = bookableDays(new Date())[0] ?? new Date();
    return bookableSlots(firstDay, new Date())[0]?.time ?? '10:00 AM';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBooked, setIsBooked] = useState(false);
  const [isMessageSent, setIsMessageSent] = useState(false);
  const [error, setError] = useState('');
  // Asked once on open, so neither tab asks someone to fill a form it will
  // refuse to accept.
  const formsAvailability = useFormsAvailability();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    teamSize: '11 – 50 Employees',
    service: selectedService || 'HR Advisory & Consulting',
    meetingFormat: 'virtual' as 'virtual' | 'in-person',
    notes: '',
  });

  const [directMessage, setDirectMessage] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConsultation();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeConsultation]);

  if (!isOpen) return null;

  const now = new Date();
  const isSunday = selectedDate.getDay() === 0;
  // Kept for reference; bookableSlots() now decides Saturday's hours.
  // const isSaturday = selectedDate.getDay() === 6;

  /* The fixed slot lists this used to pick from, kept for reference:
  const currentSlots = isSunday
    ? []
    : isSaturday
    ? SATURDAY_SLOTS
    : WEEKDAY_SLOTS;

  const upcomingDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  }).filter((d) => d.getDay() !== 0);
  */

  // Slots still open on the chosen day, and the next two weeks of days that
  // still have one. Today stays on the strip until its last slot has started.
  const currentSlots = bookableSlots(selectedDate, now);
  const upcomingDays = bookableDays(now);

  const formatDateLabel = (d: Date) => {
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const formatFullDate = (d: Date) => {
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');

    const result = await submitConsultationBooking({
      name: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      organisation: formData.companyName,
      teamSize: formData.teamSize,
      service: formData.service,
      meetingFormat: formData.meetingFormat,
      preferredDate: localIsoDate(selectedDate),
      preferredSlot: selectedTimeSlot,
      notes: formData.notes,
    });

    setIsSubmitting(false);
    if (result.ok) {
      setIsBooked(true);
      return;
    }
    setError(leadFailureMessage(result.failure, 'preferredDate'));
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');

    const result = await submitWrittenEnquiry({
      name: directMessage.name,
      email: directMessage.email,
      phone: directMessage.phone,
      subject: directMessage.subject,
      message: directMessage.message,
      source: 'consultation-modal',
    });

    setIsSubmitting(false);
    if (result.ok) {
      setIsMessageSent(true);
      return;
    }
    setError(leadFailureMessage(result.failure, 'email'));
  };

  const downloadICS = () => {
    const dateStr = localIsoDate(selectedDate).replace(/-/g, '');
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//People Growth Africa//Consultation Scheduler//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `SUMMARY:People Growth Africa Consultation - ${formData.fullName || 'Client'}`,
      `DESCRIPTION:Advisory diagnostic session concerning ${formData.service}. Format: ${
        formData.meetingFormat === 'virtual'
          ? 'Virtual (Google Meet / Zoom)'
          : 'In-Person (Apapa, Lagos)'
      }`,
      `LOCATION:${
        formData.meetingFormat === 'virtual'
          ? 'Virtual Meeting'
          : 'People Growth Africa Office, Apapa, Lagos, Nigeria'
      }`,
      `DTSTART:${dateStr}T100000Z`,
      `DTEND:${dateStr}T104500Z`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'PGA-Consultation.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-charcoal/75 backdrop-blur-md overflow-y-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="fixed inset-0" onClick={closeConsultation} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ duration: 0.25 }}
        className="relative z-10 bg-white rounded-[24px] max-w-[960px] w-full max-h-[92vh] overflow-y-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shadow-elevated border border-charcoal/10 my-auto text-left"
      >
        {/* Close Button: sticky so it stays reachable while the long form
            scrolls. The wrapper has no height, so the button floats over the
            header instead of pushing it down. */}
        <div className="pointer-events-none sticky top-0 z-30 flex h-0 justify-end">
          <button
            type="button"
            onClick={closeConsultation}
            aria-label="Close consultation modal"
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

        {/* Header Bar */}
        <div className="bg-deep-green p-6 md:p-8 text-white relative overflow-hidden">
          <div className="absolute top-[-40px] right-[-40px] w-48 h-48 rounded-full bg-brand-green/20 blur-2xl" />

          <div className="relative z-10 pr-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 text-mint text-xs font-semibold uppercase tracking-wider mb-2.5">
              Book a consultation &bull; free 30-minute diagnostic
            </div>
            <h3 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold leading-tight mb-2">
              Let&apos;s talk about your people setup
            </h3>
            <p className="font-[family-name:var(--font-body)] text-white/80 text-xs md:text-sm max-w-[700px] leading-relaxed">
              {/* Old wording, kept for reference: ... An advisor will review it and come back with clear next steps. */}
              Pick a time that suits you, or send us a written enquiry. An advisor will review it and get back to you with clear next steps.
            </p>

            {/* Operating Hours Summary */}
            <div className="mt-4 pt-3.5 border-t border-white/15 flex flex-wrap items-center gap-5 text-xs text-white/90 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-green" />
                <span>Monday &ndash; Friday: <strong>8:00 AM &ndash; 6:00 PM WAT</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-terracotta" />
                <span>Saturday: <strong>11:00 AM &ndash; 4:00 PM WAT</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white/40" />
                <span>Sunday: <strong>Closed</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Controls. Hidden while the forms are shut: a tab that switches
            between two things that are both unavailable is noise. */}
        {formsAvailability !== 'unavailable' && (
        <div className="flex border-b border-charcoal/10 bg-cream/30 px-6 pt-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('calendar');
              setError('');
            }}
            className={`px-5 py-3 text-xs md:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'calendar'
                ? 'border-deep-green text-deep-green'
                : 'border-transparent text-charcoal/60 hover:text-charcoal'
            }`}
          >
            Book a time
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('direct');
              setError('');
            }}
            className={`px-5 py-3 text-xs md:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'direct'
                ? 'border-deep-green text-deep-green'
                : 'border-transparent text-charcoal/60 hover:text-charcoal'
            }`}
          >
            Send a written enquiry
          </button>
        </div>
        )}

        <div className="p-6 md:p-8">
          <AnimatePresence mode="wait">
            {formsAvailability !== 'available' ? (
              <motion.div
                key="availability"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="py-6"
              >
                {formsAvailability === 'unavailable' ? (
                  <FormsUnavailableNotice />
                ) : (
                  <FormAvailabilityPending className="text-center" />
                )}
              </motion.div>
            ) : activeTab === 'calendar' ? (
              isBooked ? (
                <motion.div
                  key="confirmed"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="py-8 text-center max-w-[580px] mx-auto"
                >
                  <div className="w-14 h-14 rounded-full bg-mint text-deep-green flex items-center justify-center mx-auto mb-4 border-2 border-brand-green">
                    <svg className="w-7 h-7 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h4 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal mb-2">
                    Consultation requested
                  </h4>
                  <p className="font-[family-name:var(--font-body)] text-charcoal/70 text-sm leading-relaxed mb-6">
                    Thank you, <strong>{formData.fullName}</strong>. Your request is with our advisory team, who will confirm the time by email within one working day.
                  </p>

                  <div className="bg-cream/60 rounded-[14px] p-5 border border-charcoal/10 text-left mb-6 space-y-2 text-xs md:text-sm">
                    <div><strong>Date &amp; Time:</strong> {formatFullDate(selectedDate)} at {selectedTimeSlot} (WAT)</div>
                    <div><strong>Service Focus:</strong> {formData.service}</div>
                    <div><strong>Company:</strong> {formData.companyName || 'Not specified'} ({formData.teamSize})</div>
                    <div>
                      <strong>Mode:</strong>{' '}
                      {formData.meetingFormat === 'virtual'
                        ? 'Virtual (Google Meet / Zoom)'
                        : 'In-Person (Apapa, Lagos)'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={downloadICS}
                      className="px-6 py-2.5 bg-deep-green text-white text-xs font-semibold rounded-full hover:bg-brand-green transition-all cursor-pointer"
                    >
                      Download calendar invite (.ics)
                    </button>
                    <button
                      type="button"
                      onClick={closeConsultation}
                      className="px-6 py-2.5 bg-cream text-charcoal text-xs font-semibold rounded-full hover:bg-charcoal/10 transition-all border border-charcoal/15 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.form
                  key="booking-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleBookingSubmit}
                  className="space-y-6"
                >
                  {/* Step 1: Select Consultation Date */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-deep-green">
                        1. Choose a date
                      </label>
                      <span className="text-[0.7rem] text-charcoal/60">
                        Operating Mon-Fri (8am-6pm) &bull; Sat (11am-4pm)
                      </span>
                    </div>

                    {/* The row still scrolls sideways on small screens, without
                        the scrollbar chrome that used to sit under it. */}
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {upcomingDays.map((d, i) => {
                        const isSelected =
                          d.toDateString() === selectedDate.toDateString();
                        const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
                        const dayNum = d.getDate();
                        const monthName = d.toLocaleDateString('en-GB', { month: 'short' });
                        const isSat = d.getDay() === 6;

                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setSelectedDate(d);
                              // Keep the chosen time when the new day still
                              // offers it, otherwise take that day's first slot.
                              const daySlots = bookableSlots(d, new Date());
                              setSelectedTimeSlot((current) =>
                                daySlots.some((slot) => slot.time === current)
                                  ? current
                                  : daySlots[0]?.time ?? '',
                              );
                            }}
                            className={`flex-shrink-0 flex flex-col items-center justify-center w-[78px] py-2.5 px-2 rounded-[12px] border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-deep-green text-white border-deep-green shadow-md scale-[1.02]'
                                : 'bg-cream/40 hover:bg-cream border-charcoal/15 text-charcoal'
                            }`}
                          >
                            <span className={`text-[0.65rem] uppercase font-bold tracking-wider ${isSelected ? 'text-mint' : isSat ? 'text-terracotta' : 'text-charcoal/60'}`}>
                              {dayName}
                            </span>
                            <span className="text-base font-bold font-[family-name:var(--font-heading)] my-0.5">
                              {dayNum}
                            </span>
                            <span className="text-[0.65rem] text-current opacity-80">
                              {monthName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Time Slots */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-deep-green">
                        2. Choose a time &bull; {formatFullDate(selectedDate)}
                      </label>
                      <span className="text-[0.7rem] text-charcoal/50">West Africa Time (WAT)</span>
                    </div>

                    {isSunday || currentSlots.length === 0 ? (
                      /* The Sunday-only wording this used to show, kept for reference:
                        Our office is closed on Sundays. Please choose any weekday (8am&ndash;6pm) or Saturday (11am&ndash;4pm).
                      */
                      <div className="p-3.5 rounded-[10px] bg-charcoal/5 text-charcoal/70 text-xs border border-charcoal/10">
                        Our office is closed on Sundays, and a slot leaves the list once it has started. Please pick another day above; weekdays run 8am&ndash;6pm and Saturdays 11am&ndash;4pm.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                        {currentSlots.map((slot) => {
                          const isSelected = selectedTimeSlot === slot.time;
                          return (
                            <button
                              key={slot.time}
                              type="button"
                              onClick={() => setSelectedTimeSlot(slot.time)}
                              className={`py-2 px-2.5 rounded-[10px] text-xs font-semibold border transition-all text-center cursor-pointer ${
                                isSelected
                                  ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                  : 'bg-white hover:bg-mint hover:border-brand-green/40 border-charcoal/15 text-charcoal'
                              }`}
                            >
                              {slot.time}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Step 3: Enterprise & Contact Details */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-deep-green block mb-3">
                      3. Your details
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label htmlFor={`${formId}-fullName`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                          Full name *
                        </label>
                        <input
                          id={`${formId}-fullName`}
                          type="text"
                          required
                          placeholder="e.g. Adebayo Oladele"
                          value={formData.fullName}
                          onChange={(e) =>
                            setFormData({ ...formData, fullName: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                        />
                      </div>

                      <div>
                        <label htmlFor={`${formId}-email`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                          Work email *
                        </label>
                        <input
                          id={`${formId}-email`}
                          type="email"
                          required
                          placeholder="name@company.com"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                        />
                      </div>

                      <div>
                        <label htmlFor={`${formId}-phone`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                          Phone or WhatsApp *
                        </label>
                        <input
                          id={`${formId}-phone`}
                          type="tel"
                          required
                          placeholder="+234 800 000 0000"
                          value={formData.phone}
                          onChange={(e) =>
                            setFormData({ ...formData, phone: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                        />
                      </div>

                      <div>
                        <label htmlFor={`${formId}-companyName`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                          Organisation or company name *
                        </label>
                        <input
                          id={`${formId}-companyName`}
                          type="text"
                          required
                          placeholder="e.g. Apex Holdings"
                          value={formData.companyName}
                          onChange={(e) =>
                            setFormData({ ...formData, companyName: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                        />
                      </div>

                      <div>
                        <Select
                          id={`${formId}-teamSize`}
                          name="teamSize"
                          label="Team size"
                          options={teamSizeOptions}
                          value={formData.teamSize}
                          onChange={(value) => setFormData({ ...formData, teamSize: value })}
                          size="sm"
                        />
                      </div>

                      <div>
                        <Select
                          id={`${formId}-service`}
                          name="service"
                          label="What you need help with"
                          options={serviceOptions}
                          value={formData.service}
                          onChange={(value) => setFormData({ ...formData, service: value })}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Meeting Format */}
                    <div className="mt-3.5">
                      <label className="block text-xs font-semibold text-charcoal/70 mb-1.5">
                        How we meet
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label
                          className={`flex items-center gap-2.5 p-2.5 rounded-[10px] border cursor-pointer transition-all ${
                            formData.meetingFormat === 'virtual'
                              ? 'bg-mint/40 border-brand-green text-deep-green font-semibold'
                              : 'bg-white border-charcoal/15 text-charcoal'
                          }`}
                        >
                          <input
                            type="radio"
                            name="modalMeetingFormat"
                            checked={formData.meetingFormat === 'virtual'}
                            onChange={() =>
                              setFormData({ ...formData, meetingFormat: 'virtual' })
                            }
                            className="accent-brand-green"
                          />
                          <span className="text-xs">Virtual Meeting (Google Meet / Zoom)</span>
                        </label>
                        <label
                          className={`flex items-center gap-2.5 p-2.5 rounded-[10px] border cursor-pointer transition-all ${
                            formData.meetingFormat === 'in-person'
                              ? 'bg-mint/40 border-brand-green text-deep-green font-semibold'
                              : 'bg-white border-charcoal/15 text-charcoal'
                          }`}
                        >
                          <input
                            type="radio"
                            name="modalMeetingFormat"
                            checked={formData.meetingFormat === 'in-person'}
                            onChange={() =>
                              setFormData({ ...formData, meetingFormat: 'in-person' })
                            }
                            className="accent-brand-green"
                          />
                          <span className="text-xs">In-Person Consultation (Apapa, Lagos)</span>
                        </label>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="mt-3.5">
                      <label htmlFor={`${formId}-notes`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                        Anything we should know? (optional)
                      </label>
                      <textarea
                        id={`${formId}-notes`}
                        rows={2}
                        placeholder="Briefly describe what you would like to resolve or achieve..."
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all resize-none"
                      />
                    </div>
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="rounded-[10px] border border-terracotta/30 bg-terracotta/10 px-3.5 py-2.5 text-xs text-terracotta"
                    >
                      {error}
                    </p>
                  )}

                  {/* Submit Button */}
                  <div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 px-6 bg-brand-green text-white font-semibold rounded-full hover:bg-terracotta transition-all duration-300 shadow-md text-xs md:text-sm cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting
                        ? 'Sending your request…'
                        : `Request ${formatDateLabel(selectedDate)} at ${selectedTimeSlot}`}
                    </button>
                    <p className="text-center text-[0.7rem] text-charcoal/50 mt-2">
                      Consultations are free for African business founders and leadership teams. No card needed.
                    </p>
                  </div>
                </motion.form>
              )
            ) : isMessageSent ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="py-8 text-center max-w-[480px] mx-auto"
              >
                <div className="w-14 h-14 rounded-full bg-mint text-deep-green flex items-center justify-center mx-auto mb-4 border-2 border-brand-green">
                  <svg className="w-7 h-7 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h4 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal mb-2">
                  Enquiry received
                </h4>
                <p className="font-[family-name:var(--font-body)] text-charcoal/70 text-xs md:text-sm leading-relaxed mb-6">
                  Thank you, <strong>{directMessage.name}</strong>. We have your message and will reply within one working day.
                </p>
                <button
                  type="button"
                  onClick={closeConsultation}
                  className="px-6 py-2.5 bg-deep-green text-white text-xs font-semibold rounded-full hover:bg-brand-green transition-all"
                >
                  Close
                </button>
              </motion.div>
            ) : (
              <motion.form
                key="direct-form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleDirectSubmit}
                className="space-y-3.5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor={`${formId}-direct-name`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Your name *
                    </label>
                    <input
                      id={`${formId}-direct-name`}
                      type="text"
                      required
                      placeholder="e.g. Chinelo Nnamdi"
                      value={directMessage.name}
                      onChange={(e) =>
                        setDirectMessage({ ...directMessage, name: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${formId}-direct-email`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Email address *
                    </label>
                    <input
                      id={`${formId}-direct-email`}
                      type="email"
                      required
                      placeholder="chinelo@example.com"
                      value={directMessage.email}
                      onChange={(e) =>
                        setDirectMessage({ ...directMessage, email: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor={`${formId}-direct-phone`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Phone or WhatsApp
                    </label>
                    <input
                      id={`${formId}-direct-phone`}
                      type="tel"
                      placeholder="+234 800 000 0000"
                      value={directMessage.phone}
                      onChange={(e) =>
                        setDirectMessage({ ...directMessage, phone: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${formId}-direct-subject`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Subject *
                    </label>
                    <input
                      id={`${formId}-direct-subject`}
                      type="text"
                      required
                      placeholder="e.g. HR Retainership for Tech Scale-up"
                      value={directMessage.subject}
                      onChange={(e) =>
                        setDirectMessage({ ...directMessage, subject: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={`${formId}-direct-message`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                    Message *
                  </label>
                  <textarea
                    id={`${formId}-direct-message`}
                    rows={3}
                    required
                    placeholder="How can we help your team?"
                    value={directMessage.message}
                    onChange={(e) =>
                      setDirectMessage({ ...directMessage, message: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-charcoal/20 bg-cream/20 text-charcoal text-xs md:text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all resize-none"
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

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-6 bg-deep-green text-white font-semibold rounded-full hover:bg-brand-green transition-all duration-300 shadow-md text-xs md:text-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Sending…' : 'Send enquiry'}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
