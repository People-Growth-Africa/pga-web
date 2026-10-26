export type EventType = 'webinar' | 'mentorship' | 'workshop';

export interface EventSpeaker {
  name: string;
  title: string;
  organization: string;
  avatar?: string;
}

export interface EventItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  type: EventType;
  typeLabel: string;
  date: string;
  isoDate: string;
  time: string;
  duration: string;
  format: string;
  description: string;
  /** Manager-written copy for the registration form, when one is set. */
  registrationIntro?: string | null;
  registrationButtonLabel?: string | null;
  detailedAgenda?: string[];
  learningOutcomes: string[];
  targetAudience: string;
  speaker: EventSpeaker;
  seatsTotal: number;
  seatsRemaining: number;
  price: string;
  featured?: boolean;
  status: 'upcoming' | 'ongoing' | 'completed';
}

export const eventCategories = [
  { id: 'all', label: 'All Programmes' },
  { id: 'webinar', label: 'Live Webinars' },
  { id: 'mentorship', label: 'Mentorship Cohorts' },
  { id: 'workshop', label: 'Executive Workshops' },
];

/**
 * No built-in programmes ship with the site.
 *
 * Like the blog, every row on /events now comes from the posts table (or the
 * content sheet). The array stays as the empty base the merge rules extend.
 */
export const eventsList: EventItem[] = [];
