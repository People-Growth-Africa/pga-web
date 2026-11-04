import type { StoredAnswer } from './registration-form.js';

export type RegistrationEmailEvent = {
  slug: string;
  title: string;
  event_start: string | null;
  event_end: string | null;
  location_text: string | null;
  is_online: boolean;
};

function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEventDate(value: string | null): string {
  const date = parseTimestamp(value);
  if (!date) return 'Not specified';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatEventTime(startValue: string | null, endValue: string | null): string {
  const start = parseTimestamp(startValue);
  if (!start) return 'Not specified';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const startTime = formatter.format(start);
  const end = parseTimestamp(endValue);
  return end ? `${startTime}–${formatter.format(end)} WAT` : `${startTime} WAT`;
}

function formatRegistrationAnswers(answers: StoredAnswer[]): string {
  return answers
    .filter((answer) => !answer.skipped)
    .flatMap((answer) => {
      const values = Array.isArray(answer.value)
        ? answer.value.filter(Boolean)
        : answer.value.trim()
          ? [answer.value.trim()]
          : [];
      return values.length > 0
        ? [`${answer.label}: ${values.join(', ')}`]
        : [];
    })
    .join('; ');
}

export function buildRegistrationEmailVariables(
  event: RegistrationEmailEvent,
  answers: StoredAnswer[],
  siteUrl: string,
): Record<string, string> {
  return {
    eventName: event.title,
    eventDate: formatEventDate(event.event_start),
    eventTime: formatEventTime(event.event_start, event.event_end),
    eventLocation: event.is_online ? 'Online' : event.location_text?.trim() || 'Not specified',
    eventFormat: event.is_online ? 'Online' : 'In person',
    eventUrl: `${siteUrl.replace(/\/+$/, '')}/events/${event.slug}`,
    registrationAnswers: formatRegistrationAnswers(answers),
  };
}
