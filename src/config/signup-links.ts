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
export const TALENT_FORM_URL = 'https://forms.gle/JdbM7Q6KT4DjCG2B7';
export const EMPLOYER_FORM_URL = 'https://forms.gle/t9W3bkrFfNW1pX3j6';

// Typed as a plain boolean rather than a literal so the checks below stay
// honest: they are real conditions that a single edit can turn around.
export const AUTH_ENABLED: boolean = true;
