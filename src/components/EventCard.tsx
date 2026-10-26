import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { EventItem } from '../data/events';
import { todayInLagos } from '../lib/contentMerge';
import EventShareButton from './EventShareButton';

interface EventCardProps {
  event: EventItem;
  /** Kept for callers that still open the registration modal from a card. */
  onRegister?: (event: EventItem) => void;
  featured?: boolean;
  /** The event's own page. Omitted only by the home carousel, which has none. */
  detailHref?: string;
  /** A past event offers its page, not a registration button. */
  isPast?: boolean;
  /** A sheet event's external registration page, when it has one. */
  registrationUrl?: string | null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function eventDay(isoDate: string): { month: string; day: string } {
  const [, month = '1', day = '1'] = isoDate.split('-');
  return {
    month: MONTHS[Number(month) - 1] ?? 'EVENT',
    day: String(Number(day)),
  };
}

/** A calendar date's day number, counted from UTC midnight so DST never moves it. */
function dateNumber(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(stamp) ? Math.round(stamp / 86_400_000) : null;
}

/**
 * Whole calendar days from today in Lagos to the event day.
 *
 * Both sides are plain calendar dates in Africa/Lagos, so a viewer in another
 * timezone never changes the countdown.
 */
function daysUntil(isoDate: string): number {
  const today = dateNumber(todayInLagos());
  const event = dateNumber(isoDate);
  return today === null || event === null ? 0 : event - today;
}

function startsLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `Starts in ${days} days`;
}

/** True once the event's start time has passed, for a same-day event. */
function hasStarted(isoDate: string, time: string): boolean {
  const match = time.match(/(\d{1,2}):(\d{2})\s*([AP]M)?/i);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;

  let hour = Number(match[1]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  const start = Date.parse(
    `${isoDate}T${String(hour).padStart(2, '0')}:${match[2]}:00+01:00`,
  );
  return Number.isFinite(start) && Date.now() >= start;
}

/** `Sunday 1 November 2026` -> `Sun, 1 Nov`, from the ISO date, not the viewer's clock. */
function shortDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(date.getTime())) return '';
  const weekday = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(date)
    .replace('.', '');
  return `${weekday}, ${Number(match[3])} ${MONTH_NAMES[Number(match[2]) - 1]}`;
}

/**
 * `6:00 PM – 8:15 PM WAT` -> `6:00 to 8:15 PM WAT`.
 *
 * The date tile already carries the day, so the meta line only needs the
 * weekday, date and time. A time that a manager has not set yet is left alone
 * rather than dressed up as a real schedule.
 */
function compactTime(time: string): string {
  const cleaned = time.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (/announc|tbc|confirm/i.test(cleaned)) return cleaned;

  const zone = cleaned.match(/\b(WAT|GMT|UTC)\b/i)?.[1]?.toUpperCase() ?? 'WAT';
  const core = cleaned
    .replace(/\b(WAT|GMT|UTC)\b/gi, '')
    .replace(/\s*[–—]\s*/g, '|')
    .trim();
  const [startText, endText] = core.split('|').map((part) => part.trim());
  const start = startText?.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  const end = endText?.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!start) return cleaned;

  const startMeridiem = start[3]?.toUpperCase();
  const endMeridiem = end?.[3]?.toUpperCase();
  if (!end) {
    return `${start[1]}:${start[2]}${startMeridiem ? ` ${startMeridiem}` : ''} ${zone}`;
  }

  const startLabel = `${start[1]}:${start[2]}${
    startMeridiem && startMeridiem !== endMeridiem ? ` ${startMeridiem}` : ''
  }`;
  const endLabel = `${end[1]}:${end[2]}${endMeridiem ? ` ${endMeridiem}` : ''}`;
  return `${startLabel} to ${endLabel} ${zone}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Memoised because the carousel re-renders on every auto-advance. */
function EventCard({ event, featured = false, detailHref, isPast = false }: EventCardProps) {
  const href = detailHref ?? `/events/${event.slug}`;
  const { month, day } = eventDay(event.isoDate);
  const days = daysUntil(event.isoDate);
  const showCountdown =
    !isPast && event.status !== 'completed' && days >= 0 && !hasStarted(event.isoDate, event.time);
  const isFree = !event.price || /free/i.test(event.price);
  const isOnline = /online|virtual|remote/i.test(event.format);
  const rawTypeLabel = event.typeLabel?.trim();
  const typeLabel =
    rawTypeLabel &&
    !['online', 'in person', 'event'].includes(rawTypeLabel.toLowerCase())
      ? rawTypeLabel
      : event.type === 'webinar'
        ? 'Live webinar'
        : event.type === 'mentorship'
          ? 'Mentorship cohort'
          : isOnline
            ? 'Online workshop'
            : 'Workshop';
  const speakerName = event.speaker.name?.trim();
  const hasSpeaker =
    Boolean(speakerName) &&
    speakerName !== 'People Growth Africa' &&
    Boolean(event.speaker.title || event.speaker.organization);
  const venue = event.format.trim();
  const meta = [shortDate(event.isoDate) || event.date, compactTime(event.time) || event.time]
    .concat(isOnline || !venue ? [] : [venue])
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      className={`group flex h-full w-full min-w-0 flex-col rounded-[20px] border bg-white ${
        featured
          ? 'border-brand-green/40 shadow-card-hover ring-1 ring-brand-green/20'
          : 'border-charcoal/10 shadow-card'
      }`}
    >
      <div className="relative h-[144px] shrink-0 overflow-hidden rounded-t-[19px] bg-deep-green">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-20"
          viewBox="0 0 400 144"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M-20 124C70 66 150 154 240 94S370 46 430 74" fill="none" stroke="white" strokeWidth="1.4" />
          <path d="M-20 108C70 50 150 138 240 78S370 30 430 58" fill="none" stroke="white" strokeWidth="1.1" />
          <path d="M-20 140C70 82 150 170 240 110S370 62 430 90" fill="none" stroke="white" strokeWidth="0.9" />
        </svg>

        <div className="relative z-10 flex items-start justify-between gap-3 p-5">
          <span className="inline-flex rounded-full border border-white/20 bg-white/15 px-3.5 py-1.5 font-[family-name:var(--font-body)] text-[0.72rem] font-semibold text-white backdrop-blur-sm">
            {typeLabel}
          </span>
          {isFree && (
            <span className="inline-flex rounded-full bg-white px-3.5 py-1.5 font-[family-name:var(--font-body)] text-[0.72rem] font-semibold text-deep-green">
              Free
            </span>
          )}
        </div>

        <div className="absolute bottom-4 left-5 z-10 flex items-center gap-3">
          <time
            dateTime={event.isoDate}
            className="block rounded-xl bg-white px-3 py-2 text-center shadow-sm"
            aria-label={`${event.date}, ${event.time}`}
          >
            <span className="block font-[family-name:var(--font-body)] text-[0.6rem] font-bold uppercase tracking-[0.16em] text-deep-green">
              {month}
            </span>
            <span className="block font-[family-name:var(--font-heading)] text-[1.7rem] font-semibold leading-none text-deep-green">
              {day}
            </span>
          </time>
          {showCountdown && (
            <span className="font-[family-name:var(--font-body)] text-sm font-medium text-white/90">
              {startsLabel(days)}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-6">
        <Link
          to={href}
          className="group/title rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
        >
          <h3 className="font-[family-name:var(--font-heading)] text-[1.3rem] font-semibold leading-[1.3] text-charcoal transition-colors group-hover/title:text-deep-green">
            {event.title}
          </h3>
        </Link>

        <p className="mt-3 flex min-w-0 items-center gap-2 font-[family-name:var(--font-body)] text-[0.82rem] leading-5 text-charcoal/65">
          {isOnline ? (
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 self-center stroke-brand-green fill-none stroke-[1.8] stroke-linecap-round"
              aria-hidden="true"
            >
              <rect x="3" y="6" width="13" height="12" rx="2" />
              <path d="m16 10 5-3v10l-5-3" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 self-center stroke-brand-green fill-none stroke-[1.8] stroke-linecap-round"
              aria-hidden="true"
            >
              <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          )}
          <span className="min-w-0 truncate" title={meta}>
            {meta}
          </span>
        </p>

        <p className="mt-3 line-clamp-2 font-[family-name:var(--font-body)] text-[0.9rem] leading-relaxed text-charcoal/65">
          {event.subtitle}
        </p>

        {hasSpeaker && (
          <div className="mt-4 flex items-center gap-2.5">
            {event.speaker.avatar ? (
              <img
                src={event.speaker.avatar}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint text-[0.65rem] font-bold text-deep-green">
                {initials(event.speaker.name)}
              </span>
            )}
            <span className="font-[family-name:var(--font-body)] text-[0.78rem] font-medium text-charcoal/70">
              {event.speaker.name}
            </span>
          </div>
        )}

        <div className="mt-auto flex items-center gap-2.5 pt-5">
          <Link
            to={href}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-deep-green px-5 font-[family-name:var(--font-body)] text-[0.9rem] font-semibold text-white transition-colors hover:bg-brand-green focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
          >
            {isPast ? 'View event' : 'Register free'}
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current fill-none stroke-2 stroke-linecap-round" aria-hidden="true">
              <line x1="4" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </Link>
          <EventShareButton slug={event.slug} title={event.title} />
        </div>
      </div>
    </article>
  );
}

export default memo(EventCard);
