/**
 * Where the two signup buttons send people while the accounts feature is off.
 *
 * The site no longer collects talent and employer signups itself: the client is
 * handling both with Google Forms, so the two links below are the live forms.
 * Every entry point reads them from here - the nav bar, the mobile menu, the
 * `/auth` page - so a new form is a change to these two lines and nothing else.
 *
 * `AUTH_ENABLED` is the one switch for the whole accounts feature. It is `true`
 * while accounts are being demonstrated: localhost and `*.vercel.app` previews
 * show the real forms, and the public domain still answers `/auth` with the
 * coming soon page (see `src/lib/accountGate.ts`). Setting it back to `false`
 * turns the form links back on for every host and closes the accounts routes.
 */
export const TALENT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdHrr0XUxa44bhh6ZXjlIdxDKm-uGjCQIxSJkmeMAtwz3bG-Q/viewform?usp=dialog';
export const EMPLOYER_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSe_slu3UKGYnur0CFdFFXI23IMJZ-KfF6aO3WP1Staueo_52g/viewform?usp=dialog';

// Typed as a plain boolean rather than a literal so the checks below stay
// honest: they are real conditions that a single edit can turn around.
export const AUTH_ENABLED: boolean = true;
