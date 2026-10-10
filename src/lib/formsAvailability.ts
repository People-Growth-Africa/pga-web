import { authRequest } from './authClient';

/**
 * Whether the public forms have a database to write to, asked once per page.
 *
 * The forms are gated on `DATABASE_URL` on the server, so without one they
 * answer 503. This asks `/api/forms/availability` on load instead, so a form can
 * show that answer before a visitor fills anything in rather than after they
 * press send. The wording below is the same message the API would return, so the
 * notice up front and the error after a submit never disagree.
 */

/** The address the API points a visitor at while the forms are shut. */
export const FORMS_CONTACT_EMAIL = 'hello@peoplegrowthafrica.com';

/** The same sentence `databaseUnavailable` answers a blocked form with. */
export const FORMS_UNAVAILABLE_MESSAGE = `This form is not available right now. Email ${FORMS_CONTACT_EMAIL} and we will take it from there.`;

export type FormsAvailability = 'checking' | 'available' | 'unavailable';

/**
 * One request for the whole visit. The answer cannot change while a page is
 * open, so the first form to mount runs it and every later form waits on the
 * same promise instead of firing its own. A failure is reported as available:
 * hiding a working form over a dropped probe is worse than the answer a visitor
 * would otherwise get on submit, and matches what the site did before this.
 */
let probe: Promise<boolean> | null = null;

export function checkFormsAvailability(): Promise<boolean> {
  probe ??= authRequest<{ available: boolean }>('/api/forms/availability', {
    method: 'GET',
  }).then((result) => (result.ok ? result.data.available : true));
  return probe;
}
