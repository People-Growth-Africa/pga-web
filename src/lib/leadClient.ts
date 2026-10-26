import { authRequest, type ApiFailure, type ApiResult } from './authClient';
import type { RegistrationAnswers } from './registrationForm';

/**
 * The public lead forms: event registration, consultation booking and written
 * enquiry. They are three copies of the same job, so the payload each one sends
 * lives here and the modal and the standalone page cannot drift apart.
 */

export type LeadAcknowledged = { ok: boolean };

export type RegistrationInput = {
  eventSlug: string;
  /** Answers keyed by the id of the question that asked them. */
  answers: RegistrationAnswers;
  /**
   * The same answers in the fixed columns the lead table still keeps, derived
   * for the list and the notification email. The server re-derives them from
   * `answers`; sending them keeps an older server answerable during a deploy.
   */
  name: string;
  email: string;
  phone: string;
  organization: string;
  notes: string;
  /** Honeypot. Always empty in a real browser and rejected by the server if not. */
  website?: string;
};

export type ConsultationBookingInput = {
  name: string;
  email: string;
  phone: string;
  organisation: string;
  teamSize: string;
  service: string;
  meetingFormat: 'virtual' | 'in-person';
  preferredDate: string;
  preferredSlot: string;
  notes: string;
};

export type EnquiryInput = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  source: 'consultation-modal' | 'consultation-page';
};

/**
 * The calendar day as the visitor sees it. toISOString converts to UTC first,
 * which turns a booking made in Lagos into the day before.
 */
export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function submitRegistration(
  input: RegistrationInput,
): Promise<ApiResult<LeadAcknowledged>> {
  return authRequest<LeadAcknowledged>('/api/registrations', { body: input });
}

export function submitConsultationBooking(
  input: ConsultationBookingInput,
): Promise<ApiResult<LeadAcknowledged>> {
  return authRequest<LeadAcknowledged>('/api/leads/consultation-booking', { body: input });
}

export function submitWrittenEnquiry(input: EnquiryInput): Promise<ApiResult<LeadAcknowledged>> {
  return authRequest<LeadAcknowledged>('/api/leads/enquiry', { body: input });
}

/** The server's note for one field, falling back to its overall message. */
export function leadFailureMessage(failure: ApiFailure, field?: string): string {
  if (field && failure.fields?.[field]) return failure.fields[field];
  return failure.error;
}
