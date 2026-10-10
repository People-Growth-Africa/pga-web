import { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Select from './Select';
import { useFormsAvailability } from '../hooks/useFormsAvailability';
import FormsUnavailableNotice, { FormAvailabilityPending } from './FormsUnavailableNotice';
import {
  leadFailureMessage,
  localIsoDate,
  submitConsultationBooking,
  submitWrittenEnquiry,
} from '../lib/leadClient';

// Availability rules
// Mon-Fri: 8:00 AM - 6:00 PM WAT
// Saturday: 11:00 AM - 4:00 PM WAT
// Sunday: Closed

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

const serviceOptions = [
  'HR Advisory & Consulting',
  'Learning & Development',
  'Organisational Design',
  'Culture Development',
  'Performance Management',
  'HR Audits & Compliance',
  'Agribusiness Workforce Development',
  'Career Development Programmes',
  'Recruitment & Talent Management',
  'HR Retainerships',
  'People Strategy for SMEs',
  'Workforce Formalisation',
  'Nigerian Labour Law Compliance',
  'Team Effectiveness',
  'Leadership Development',
  'General Consultation & Enquiry',
];

const teamSizeOptions = [
  '1 – 10 Employees',
  '11 – 50 Employees',
  '51 – 100 Employees',
  '100+ Employees',
];

interface BookingFormData {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  teamSize: string;
  service: string;
  meetingFormat: 'virtual' | 'in-person';
  notes: string;
}

export default function BookingCalendar() {
  const formId = useId();
  const [activeTab, setActiveTab] = useState<'calendar' | 'direct'>('calendar');

  // Booking state
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    // Default to tomorrow or next business day
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + 1);
    if (nextDay.getDay() === 0) {
      nextDay.setDate(nextDay.getDate() + 1); // skip Sunday
    }
    return nextDay;
  });

  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('10:00 AM');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBooked, setIsBooked] = useState(false);
  const [isMessageSent, setIsMessageSent] = useState(false);
  const [error, setError] = useState('');
  // Asked once on mount, so neither tab puts a form in front of a visitor that
  // the server will refuse to accept.
  const formsAvailability = useFormsAvailability();

  // Form Fields
  const [formData, setFormData] = useState<BookingFormData>({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    teamSize: '11 – 50 Employees',
    service: 'HR Advisory & Consulting',
    meetingFormat: 'virtual',
    notes: '',
  });

  // Direct contact message state
  const [directMessage, setDirectMessage] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });

  const isSunday = selectedDate.getDay() === 0;
  const isSaturday = selectedDate.getDay() === 6;

  const currentSlots = isSunday
    ? []
    : isSaturday
    ? SATURDAY_SLOTS
    : WEEKDAY_SLOTS;

  // Generate upcoming 14 available days for fast selection
  const upcomingDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  }).filter((d) => d.getDay() !== 0); // exclude Sundays

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
      source: 'consultation-page',
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
      `DESCRIPTION:Advisory consultation with People Growth Africa concerning ${formData.service}. Meeting format: ${formData.meetingFormat === 'virtual' ? 'Google Meet / Zoom' : 'In-Person (Apapa, Lagos Office)'}.`,
      `LOCATION:${formData.meetingFormat === 'virtual' ? 'Virtual (Link will be emailed)' : 'People Growth Africa Office, Apapa, Lagos, Nigeria'}`,
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

  const getGoogleCalendarUrl = () => {
    const dateStr = localIsoDate(selectedDate).replace(/-/g, '');
    const startTime = `${dateStr}T100000Z`;
    const endTime = `${dateStr}T104500Z`;
    const title = encodeURIComponent(`People Growth Africa Consultation - ${formData.fullName || 'Client'}`);
    const details = encodeURIComponent(
      `Advisory consultation with People Growth Africa concerning ${formData.service}. Meeting format: ${
        formData.meetingFormat === 'virtual' ? 'Google Meet / Zoom' : 'In-Person (Lagos Office)'
      }.`
    );
    const location = encodeURIComponent(
      formData.meetingFormat === 'virtual'
        ? 'Virtual (Link will be emailed)'
        : 'People Growth Africa Office, Lagos, Nigeria'
    );
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&details=${details}&location=${location}`;
  };

  return (
    <div className="bg-white rounded-[24px] shadow-elevated border border-charcoal/10 overflow-hidden max-w-[1060px] mx-auto text-left">
      {/* Header Bar */}
      <div className="bg-deep-green p-7 md:p-9 text-white relative overflow-hidden">
        <div className="absolute top-[-40px] right-[-40px] w-48 h-48 rounded-full bg-brand-green/20 blur-2xl" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 text-mint text-xs font-semibold uppercase tracking-wider mb-3">
            Book a consultation &bull; free 30-minute diagnostic
          </div>
          <h3 className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold leading-tight mb-2">
            Let&apos;s talk about your people setup
          </h3>
          <p className="font-[family-name:var(--font-body)] text-white/80 text-sm md:text-base max-w-[700px] leading-relaxed">
            Pick a time that suits you, or send us a written enquiry. An advisor will review it and come back with clear next steps.
          </p>

          {/* Operating Hours Summary */}
          <div className="mt-4 pt-4 border-t border-white/15 flex flex-wrap items-center gap-6 text-xs text-white/90 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-green" />
              <span>Monday &ndash; Friday: <strong>8:00 AM &ndash; 6:00 PM WAT</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-terracotta" />
              <span>Saturday: <strong>11:00 AM &ndash; 4:00 PM WAT</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white/40" />
              <span>Sunday: <strong>Closed</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Controls. Hidden while the forms are shut: a tab that switches
          between two things that are both unavailable is noise. */}
      {formsAvailability !== 'unavailable' && (
      <div className="flex border-b border-charcoal/10 bg-cream/30 px-6 pt-3 gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab('calendar');
            setError('');
          }}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
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
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'direct'
              ? 'border-deep-green text-deep-green'
              : 'border-transparent text-charcoal/60 hover:text-charcoal'
          }`}
        >
          Send a written enquiry
        </button>
      </div>
      )}

      <div className="p-6 md:p-9">
        <AnimatePresence mode="wait">
          {formsAvailability !== 'available' ? (
            <motion.div
              key="availability"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="py-8"
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
                className="py-10 text-center max-w-[620px] mx-auto"
              >
                <div className="w-16 h-16 rounded-full bg-mint text-deep-green flex items-center justify-center mx-auto mb-5 border-2 border-brand-green">
                  <svg className="w-8 h-8 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h4 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal mb-2">
                  Consultation requested
                </h4>
                <p className="font-[family-name:var(--font-body)] text-charcoal/70 text-sm md:text-base leading-relaxed mb-6">
                  Thank you, <strong>{formData.fullName}</strong>. Your request is with the People Growth Africa advisory team, who will confirm the time by email within one working day.
                </p>

                {/* Booking Receipt Card */}
                <div className="bg-cream/60 rounded-[16px] p-6 border border-charcoal/10 text-left mb-7">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs uppercase font-semibold text-charcoal/50 block mb-0.5">Date &amp; Time</span>
                      <strong className="text-charcoal block">{formatFullDate(selectedDate)}</strong>
                      <span className="text-brand-green font-semibold">{selectedTimeSlot} (WAT)</span>
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-charcoal/50 block mb-0.5">Consultation Focus</span>
                      <strong className="text-charcoal block">{formData.service}</strong>
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-charcoal/50 block mb-0.5">Organisation</span>
                      <strong className="text-charcoal block">{formData.companyName || 'Not specified'} ({formData.teamSize})</strong>
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-charcoal/50 block mb-0.5">Meeting Mode</span>
                      <strong className="text-charcoal block">
                        {formData.meetingFormat === 'virtual' ? 'Virtual (Google Meet / Zoom)' : 'In-Person (Apapa, Lagos)'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={getGoogleCalendarUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-brand-green text-white text-sm font-semibold rounded-full hover:bg-terracotta transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/>
                    </svg>
                    Add to Google Calendar
                  </a>
                  <button
                    type="button"
                    onClick={downloadICS}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-deep-green text-white text-sm font-semibold rounded-full hover:bg-brand-green transition-all"
                  >
                    Download calendar invite (.ics)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBooked(false);
                      setError('');
                      setFormData({
                        fullName: '',
                        email: '',
                        phone: '',
                        companyName: '',
                        teamSize: '11 – 50 Employees',
                        service: 'HR Advisory & Consulting',
                        meetingFormat: 'virtual',
                        notes: '',
                      });
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-cream text-charcoal text-sm font-semibold rounded-full hover:bg-charcoal/10 transition-all border border-charcoal/15"
                  >
                    Book another session
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
                className="space-y-8"
              >
                {/* Step 1: Date & Time Picker */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-deep-green">
                      1. Select Consultation Date
                    </label>
                    <span className="text-xs text-charcoal/60">
                      Operating Mon-Fri (8am-6pm) &bull; Sat (11am-4pm)
                    </span>
                  </div>

                  {/* Horizontal date selector */}
                  <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
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
                            // Adjust default time if switching between weekday and saturday
                            if (d.getDay() === 6) {
                              setSelectedTimeSlot('11:00 AM');
                            }
                          }}
                          className={`flex-shrink-0 flex flex-col items-center justify-center w-[84px] py-3 px-2 rounded-[14px] border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-deep-green text-white border-deep-green shadow-md scale-[1.02]'
                              : 'bg-cream/40 hover:bg-cream border-charcoal/15 text-charcoal'
                          }`}
                        >
                          <span className={`text-[0.7rem] uppercase font-bold tracking-wider ${isSelected ? 'text-mint' : isSat ? 'text-terracotta' : 'text-charcoal/60'}`}>
                            {dayName}
                          </span>
                          <span className="text-lg font-bold font-[family-name:var(--font-heading)] my-0.5">
                            {dayNum}
                          </span>
                          <span className="text-[0.7rem] text-current opacity-80">
                            {monthName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Time Slots */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-deep-green">
                      2. Select Available Time Slot &bull; {formatFullDate(selectedDate)}
                    </label>
                    <span className="text-xs text-charcoal/50">West Africa Time (WAT)</span>
                  </div>

                  {isSunday ? (
                    <div className="p-4 rounded-[12px] bg-charcoal/5 text-charcoal/70 text-sm border border-charcoal/10">
                      Our office is closed on Sundays. Please select any weekday (8:00 AM &ndash; 6:00 PM) or Saturday (11:00 AM &ndash; 4:00 PM).
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                      {currentSlots.map((slot) => {
                        const isSelected = selectedTimeSlot === slot.time;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            onClick={() => setSelectedTimeSlot(slot.time)}
                            className={`py-2.5 px-3 rounded-[12px] text-xs md:text-sm font-semibold border transition-all text-center cursor-pointer ${
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

                {/* Step 3: Information & Requirements Form */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-deep-green block mb-4">                      3. Your details
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
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
                        className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
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
                        className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
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
                        className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
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
                        size="md"
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
                        size="md"
                      />
                    </div>
                  </div>

                  {/* Meeting Format */}
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-charcoal/70 mb-2">
                      How we meet
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label
                        className={`flex items-center gap-3 p-3 rounded-[12px] border cursor-pointer transition-all ${
                          formData.meetingFormat === 'virtual'
                            ? 'bg-mint/40 border-brand-green text-deep-green font-semibold'
                            : 'bg-white border-charcoal/15 text-charcoal'
                        }`}
                      >
                        <input
                          type="radio"
                          name="meetingFormat"
                          checked={formData.meetingFormat === 'virtual'}
                          onChange={() =>
                            setFormData({ ...formData, meetingFormat: 'virtual' })
                          }
                          className="accent-brand-green"
                        />
                        <span className="text-xs md:text-sm">Virtual Meeting (Google Meet / Zoom)</span>
                      </label>
                      <label
                        className={`flex items-center gap-3 p-3 rounded-[12px] border cursor-pointer transition-all ${
                          formData.meetingFormat === 'in-person'
                            ? 'bg-mint/40 border-brand-green text-deep-green font-semibold'
                            : 'bg-white border-charcoal/15 text-charcoal'
                        }`}
                      >
                        <input
                          type="radio"
                          name="meetingFormat"
                          checked={formData.meetingFormat === 'in-person'}
                          onChange={() =>
                            setFormData({ ...formData, meetingFormat: 'in-person' })
                          }
                          className="accent-brand-green"
                        />
                        <span className="text-xs md:text-sm">In-Person Consultation (Apapa, Lagos)</span>
                      </label>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="mt-4">
                    <label htmlFor={`${formId}-notes`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                      Anything we should know? (optional)
                    </label>
                    <textarea
                      id={`${formId}-notes`}
                      rows={3}
                      placeholder="Briefly describe what you would like to resolve or achieve…"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all resize-none"
                    />
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta"
                  >
                    {error}
                  </p>
                )}

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 px-8 bg-brand-green text-white font-semibold rounded-full hover:bg-terracotta transition-all duration-300 shadow-md text-sm md:text-base cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting
                      ? 'Sending your request…'
                      : `Request ${formatDateLabel(selectedDate)} at ${selectedTimeSlot}`}
                  </button>
                  <p className="text-center text-xs text-charcoal/50 mt-3">
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
              className="py-10 text-center max-w-[500px] mx-auto"
            >
              <div className="w-16 h-16 rounded-full bg-mint text-deep-green flex items-center justify-center mx-auto mb-5 border-2 border-brand-green">
                <svg className="w-8 h-8 stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h4 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-charcoal mb-2">
                Enquiry received
              </h4>
              <p className="font-[family-name:var(--font-body)] text-charcoal/70 text-sm md:text-base leading-relaxed mb-6">
                Thank you, <strong>{directMessage.name}</strong>. We have your message and will reply within one working day.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsMessageSent(false);
                  setError('');
                  setDirectMessage({ name: '', email: '', phone: '', subject: '', message: '' });
                }}
                className="px-6 py-3 bg-deep-green text-white text-sm font-semibold rounded-full hover:bg-brand-green transition-all"
              >
                Send another message
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="direct-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleDirectSubmit}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
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
                    className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
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
                    className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${formId}-direct-message`} className="block text-xs font-semibold text-charcoal/70 mb-1">
                  Message *
                </label>
                <textarea
                  id={`${formId}-direct-message`}
                  rows={4}
                  required
                  placeholder="How can we help your team?"
                  value={directMessage.message}
                  onChange={(e) =>
                    setDirectMessage({ ...directMessage, message: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-[12px] border border-charcoal/20 bg-cream/20 text-charcoal text-sm focus:outline-none focus:border-brand-green focus:bg-white transition-all resize-none"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 px-8 bg-deep-green text-white font-semibold rounded-full hover:bg-brand-green transition-all duration-300 shadow-md text-sm md:text-base cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Sending…' : 'Send enquiry'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
