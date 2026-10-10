/**
 * Browser end to end test for the site's forms: signing up and logging in, the
 * newsletter signup, event registration, consultation requests, written
 * enquiries, the mobile menu and the phone logo intro. Drives the real forms in headless Chrome or
 * Edge, over the same local server test:auth uses, so a client side change
 * cannot silently break them (that bug shipped once already: see the isSignup
 * note in Auth.tsx).
 *
 *   npm run test:auth:ui
 *
 * Needs dist/ (run `npm run build` first when the UI changed) and DATABASE_URL
 * in .env.development.local, .env.local or .env. No browser download happens:
 * playwright-core drives an installed Chrome or Edge. The account the signup
 * check creates is deleted through the API at the end, success or failure.
 *
 * The form checks here are deliberately the ones an API test cannot see: what
 * a visitor's click actually submits, what the validation banner says, and
 * which page they land on afterwards.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadEnvFiles, startApiServer } from './api-server.mjs';
import { checkApiImports } from './check-api-imports.mjs';

const EMAIL_PREFIX = `test-auth-ui-${Date.now().toString(36)}`;
const EMAIL = `${EMAIL_PREFIX}@example.com`;
const PASSWORD = 'Quiet-Harbour-7712';
const NAME = 'Ada UI Test';
const NEWSLETTER_EMAIL = `${EMAIL_PREFIX}-newsletter@example.com`;
/** The one answer the newsletter endpoint gives, whatever state the address is in. */
const NEWSLETTER_MESSAGE =
  'Thanks. If that address is not already on the list, a confirmation link is on its way. Check your inbox and spam folder.';

// --- email capture -----------------------------------------------------------
// With no RESEND_API_KEY the API prints the message instead of sending it, and
// that is how the newsletter check recovers the confirmation link.
const logged = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  logged.push(args.map((value) => String(value)).join(' '));
};

function linksSince(mark) {
  const text = logged.slice(mark).join('\n');
  return [...text.matchAll(/newsletter\/confirm\?token=([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
}

/** Removes the rows this run created, success or failure. */
async function cleanupTestRows() {
  const connection = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connection) return;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connection);
  await sql.query('DELETE FROM newsletter_subscribers WHERE email LIKE $1', [`${EMAIL_PREFIX}%`]);
  for (const table of ['event_registrations', 'consultation_bookings', 'enquiries']) {
    await sql.query(`DELETE FROM ${table} WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);
  }
}

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed });
  if (!passed) failures += 1;
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
}

/**
 * Launches headless Chrome or Edge. Only what playwright-core can drive
 * without downloading anything: a channel browser if one is installed, then a
 * bare executable, then lastly a full playwright install's bundled Chromium.
 */
async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  const options = { headless: true };
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ ...options, channel });
    } catch {
      // Try the next way.
    }
  }
  for (const executablePath of [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : null,
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe') : null,
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe') : null,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe') : null,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe') : null,
  ].filter(Boolean)) {
    try {
      return await chromium.launch({ ...options, executablePath });
    } catch {
      // Try the next way.
    }
  }
  return chromium.launch(options);
}

// How many same-origin requests the page has made so far. The shell calls
// /api/auth/me once per page load, so success waits are framed with these
// counters rather than a timeout guess: waiting until requests settle would
// otherwise also catch the /me call and pass before the submit went out.
async function requestCount(page) {
  return page.evaluate(() => window.__pgaRequestCount ?? null);
}

/** Waits until the page has made a request beyond `from` and is idle again. */
async function settle(page, from, description) {
  try {
    await page.waitForFunction(
      (mark) => window.__pgaSettled >= mark,
      await requestCount(page),
      { timeout: 15000, polling: 100 },
    );
  } catch {
    throw new Error(`Timed out waiting for the ${description} to finish`);
  }
}

/**
 * Clicks a submit button and waits for the outcome. A submit that passes the
 * client validation fires a request and the wait covers its whole round trip;
 * a submit the client validation rejects sends nothing at all, which is a
 * result to assert on, not a hang. Returns whether a request went out.
 */
async function submit(page, button, description) {
  const before = await requestCount(page);
  await button.click();
  let sent = true;
  try {
    await page.waitForFunction(
      (mark) => (window.__pgaRequestCount ?? 0) > mark,
      before,
      { timeout: 3000, polling: 50 },
    );
  } catch {
    sent = false;
  }
  if (sent) await settle(page, before, description);
  return sent;
}

/**
 * Watches fetch on the page. __pgaRequestCount rises with every call;
 * __pgaSettled mirrors the highest count at which no call was still in
 * flight, which is what settle() waits on.
 */
async function installRequestWatch(page) {
  await page.addInitScript(() => {
    const window = globalThis;
    window.__pgaRequestCount = 0;
    window.__pgaActive = 0;
    window.__pgaSettled = 0;
    const originalFetch = window.fetch.bind(window);
    // One wrapper: count every call and track in-flight ones, so "settled"
    // means every call finished, not just that the last one was dispatched.
    window.fetch = async (...args) => {
      window.__pgaRequestCount += 1;
      window.__pgaActive += 1;
      try {
        return await originalFetch(...args);
      } finally {
        window.__pgaActive -= 1;
        if (window.__pgaActive === 0) window.__pgaSettled = window.__pgaRequestCount;
      }
    };
  });
}

function assertTrustedUrl(page, prefix, description) {
  const url = new URL(page.url());
  if (!(url.origin === 'http://localhost' || /^https?:$/.test(url.protocol))) {
    throw new Error(`${description} landed on an unexpected origin: ${page.url()}`);
  }
  if (prefix && !page.url().startsWith(prefix)) {
    throw new Error(`${description} expected ${prefix}, got ${page.url()}`);
  }
}

async function main() {
  loadEnvFiles({ quiet: true });
  if (!process.env.DATABASE_URL) {
    console.error(
      [
        '',
        'DATABASE_URL is not set, so the suite cannot start the API locally.',
        'Pull the Vercel environment first:',
        '  vercel env pull .env.development.local --yes',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
  // Same reason test:auth does this: a previous run must not leave rate limit
  // counters behind that would 429 this one.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  const imports = await checkApiImports({ quiet: true });
  if (!imports.ok) {
    console.error(`\n${imports.summary}\n\nRun \`node scripts/check-api-imports.mjs\` for the details.\n`);
    process.exit(1);
  }

  const server = await startApiServer({ quiet: true });
  const baseUrl = server.origin;
  const userDataDir = mkdtempSync(join(tmpdir(), 'pga-auth-ui-'));
  console.log(`\nTesting ${baseUrl} as ${EMAIL_PREFIX}\n`);

  try {
    const browser = await launchBrowser();
    try {
      // Reduced motion is emulated for the whole run: every form check below
      // asserts what a visitor sees, and an animating shell would only add
      // timing noise. The logo intro is the one thing that reduced motion
      // switches off entirely, so the checks at the end turn it back on.
      const context = await browser.newContext({
        viewport: { width: 1280, height: 860 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await installRequestWatch(page);

      // --- 1. The regression: an empty log in submit --------------------------
      // The form once required a name on this tab too, so nothing could ever
      // pass validation. Every message here is asserted exactly.
      await page.goto(`${baseUrl}/auth#login`, { waitUntil: 'networkidle' });
      await page.getByRole('tab', { name: 'Log in' }).click();

      const emptySent = await submit(page, page.getByRole('button', { name: 'Log in', exact: true }), 'empty log in submit');

      const banner = await page.locator('[role=alert]').first().textContent();
      check(
        1.1,
        'The rejected log in never reached the server',
        emptySent === false,
        emptySent ? 'a request went out' : 'no request',
      );
      check(
        1,
        'Empty log in submit shows "Enter your email address." and nothing about a name',
        banner?.trim() === 'Enter your email address.',
        `banner "${banner?.trim()}"`,
      );

      // aria-invalid marks every offending field (both were empty); the banner
      // and focus go to the first one.
      const invalid = await page.locator('[aria-invalid="true"]');
      const flagged = await invalid.evaluateAll((nodes) => nodes.map((node) => node.id));
      const emailInvalid = await page.locator('#auth-email').getAttribute('aria-invalid');
      const emailInline = (await page.locator('#auth-email-error').textContent())?.trim();
      const focused = await page
        .locator('#auth-email')
        .evaluate((node) => node === document.activeElement);
      check(
        2,
        'Email is flagged with its inline error and holds focus (password flagged too)',
        emailInvalid === 'true' &&
          flagged.includes('auth-email') &&
          emailInline === 'Enter your email address.' &&
          focused,
        `flagged ${flagged.join(',')}, focused ${focused}`,
      );

      // --- 2. Filling the fields -----------------------
      // Errors are deliberately not cleared while typing: they stay up until
      // the next submit revalidates. Asserting that keeps a change either way
      // a visible decision rather than a silent one.
      await page.locator('#auth-email').fill(EMAIL);
      await page.locator('#auth-password').fill(PASSWORD);
      const bannersWhileTyping = await page.locator('[role=alert]').count();
      check(
        3,
        'The error banner stays up while typing; the next submit revalidates',
        bannersWhileTyping === 1,
        `${bannersWhileTyping} banners`,
      );

      // --- 3. Log in through the form with the wrong password first ----------
      // The password here is right for an account that does not exist yet, so
      // the server rejects it; this exercises the server error path in the UI.
      const wrongSent = await submit(page, page.getByRole('button', { name: 'Log in', exact: true }), 'wrong-password log in');
      const wrongBanner = (await page.locator('[role=alert]').first().textContent())?.trim();
      check(
        4.1,
        'The accepted log in reached the server',
        wrongSent === true,
        wrongSent ? 'request sent' : 'no request',
      );
      check(
        4,
        'Log in with an unknown account shows the server error banner',
        wrongBanner === 'Email or password is incorrect.',
        `banner "${wrongBanner}"`,
      );

      // --- 4. Sign up through the form ---------------------------------------
      // Tab switch first; selectTab must clear the login attempt's banner.
      await page.getByRole('tab', { name: 'Create account' }).click();
      const signupBanner = await page.locator('[role=alert]').count();
      check(5, 'Switching to the signup tab clears the login error banner', signupBanner === 0, `${signupBanner} banners`);
      await page.waitForURL(/#signup/);
      assertTrustedUrl(page, null, 'the signup tab');

      // An empty signup submit shows the first offender, the name.
      const emptySignupSent = await submit(
        page,
        page.getByRole('button', { name: 'Create talent account', exact: true }),
        'empty signup submit',
      );
      const signupEmptyBanner = (await page.locator('[role=alert]').first().textContent())?.trim();
      check(
        6,
        'Empty talent signup submit shows "Enter your full name." first',
        signupEmptyBanner === 'Enter your full name.',
        `banner "${signupEmptyBanner}"`,
      );
      check(
        6.1,
        'The rejected signup never reached the server',
        emptySignupSent === false,
        emptySignupSent ? 'a request went out' : 'no request',
      );

      // The field and the country are selects, not free text boxes: the field
      // list is what the dashboard and any future matching read, and a country
      // should not be a spelling test.
      const fieldSelect = page.locator('#auth-field');
      const countrySelect = page.locator('#auth-country');
      const fieldOptions = await fieldSelect.locator('option').allTextContents();
      const countryOptions = await countrySelect.locator('option').allTextContents();
      check(
        6.2,
        'The signup form offers a field list and a country list instead of free text',
        fieldOptions.length >= 20 && countryOptions.length >= 100,
        `${fieldOptions.length} fields, ${countryOptions.length} countries`,
      );

      await page.locator('#auth-name').fill(NAME);
      await page.locator('#auth-email').fill(EMAIL);
      await fieldSelect.selectOption('IT & Software');
      await countrySelect.selectOption('Nigeria');
      await page.locator('#auth-password').fill(PASSWORD);
      await page.locator('#auth-acceptedTerms').check();

      await page.getByRole('button', { name: 'Create talent account', exact: true }).click();
      await page.waitForURL(/\/talent\/dashboard/, { timeout: 15000 });

      await page.locator('h1').filter({ hasText: `Hello ${NAME}` }).waitFor({ timeout: 15000 });
      check(
        7,
        'Submitting the signup form creates the account and lands on /talent/dashboard',
        true,
        page.url(),
      );
      check(8, 'The dashboard greets the account by name', true, `Hello ${NAME}`);

      const savedDetails = await page.evaluate(() => {
        const list = document.querySelector('dl');
        if (!list) return null;
        return Object.fromEntries(
          [...list.querySelectorAll('dt')].map((term) => [
            term.textContent?.trim() ?? '',
            term.nextElementSibling?.textContent?.trim() ?? '',
          ]),
        );
      });
      check(
        8.1,
        'The field and country picked from the dropdowns are saved and shown back',
        savedDetails?.['Field or main skill'] === 'IT & Software' &&
          savedDetails?.['Country'] === 'Nigeria',
        `field "${savedDetails?.['Field or main skill']}", country "${savedDetails?.['Country']}"`,
      );

      // --- 5. Log out and log back in through the form -----------------------
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await page.waitForURL(/\/($|\?|#)/, { timeout: 15000 });
      check(9, 'Log out returns to the home page', page.url() === `${baseUrl}/`, page.url());

      await page.goto(`${baseUrl}/auth#login`, { waitUntil: 'networkidle' });
      await page.locator('#auth-email').fill(EMAIL);
      await page.locator('#auth-password').fill(PASSWORD);
      await submit(page, page.getByRole('button', { name: 'Log in', exact: true }), 'final log in');
      await page.waitForURL(/\/talent\/dashboard/, { timeout: 15000 });
      await page.locator('h1').filter({ hasText: `Hello ${NAME}` }).waitFor({ timeout: 15000 });
      check(
        10,
        'Logging in through the form lands on the dashboard, greeted by name',
        true,
        page.url(),
      );

      // Delete the account through the dashboard, with the confirm password. The
      // delete form sits behind a disclosure at the bottom of the page, so the row
      // is opened first: the destructive control is not on screen (and so not one
      // stray click away) until someone has asked for it (9.6).
      const deleteRow = page.getByRole('button', { name: 'Delete your account', exact: true });
      const deleteFormHiddenBeforeOpen = (await page.locator('#delete-password').count()) === 0;
      await deleteRow.click();
      const deleteRowExpanded = await deleteRow.getAttribute('aria-expanded');
      await page.locator('#delete-password').fill(PASSWORD);
      const beforeDelete = await requestCount(page);
      await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
      await settle(page, beforeDelete, 'account deletion');
      await page.waitForURL(`${baseUrl}/`, { timeout: 15000 });
      check(
        11,
        'The delete form is behind a disclosure, and deleting the account returns to the home page',
        page.url() === `${baseUrl}/` && deleteFormHiddenBeforeOpen && deleteRowExpanded === 'true',
        `${page.url()}, hidden before open ${deleteFormHiddenBeforeOpen}, aria-expanded ${deleteRowExpanded}`,
      );

      // The deletion response cleared the session cookie, so the browser now
      // counts as signed out: /me must refuse the stale session.
      const sessionStatus = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        return response.status;
      });
      check(
        12,
        'After deletion the browser session no longer authenticates',
        sessionStatus === 401,
        `/api/auth/me ${sessionStatus}`,
      );

      // --- 6. The newsletter form actually submits ---------------------------
      // It once showed "Subscribed ✓" on a four second timer without sending a
      // thing. These checks are what stops that coming back.
      await page.goto(`${baseUrl}/blog`, { waitUntil: 'networkidle' });

      const emptySubscribeSent = await submit(
        page,
        page.getByRole('button', { name: 'Subscribe', exact: true }),
        'empty newsletter submit',
      );
      check(
        13,
        'An empty newsletter submit never reaches the server',
        emptySubscribeSent === false,
        emptySubscribeSent ? 'a request went out' : 'no request',
      );

      const mark = logged.length;
      const newsletterInput = page.getByLabel('Email address for newsletter');
      await newsletterInput.fill(NEWSLETTER_EMAIL);
      const subscribeSent = await submit(
        page,
        page.getByRole('button', { name: 'Subscribe', exact: true }),
        'newsletter subscribe',
      );
      const noticeShown = await page
        .waitForFunction(
          (expected) =>
            [...document.querySelectorAll('[role=status]')].some(
              (node) => node.textContent?.trim() === expected,
            ),
          NEWSLETTER_MESSAGE,
          { timeout: 10000 },
        )
        .then(() => true)
        .catch(() => false);
      const clearedField = await newsletterInput.inputValue();
      check(
        14,
        'Submitting the newsletter form sends a request, shows the server answer and clears the field',
        subscribeSent === true && noticeShown && clearedField === '',
        `sent ${subscribeSent}, notice ${noticeShown ? 'shown' : 'missing'}, field "${clearedField}"`,
      );

      const confirmToken = linksSince(mark).at(-1);
      let confirmedInBrowser = false;
      if (confirmToken) {
        await page.goto(`${baseUrl}/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`);
        confirmedInBrowser = await page
          .getByRole('heading', { name: 'Your subscription is confirmed.' })
          .waitFor({ timeout: 15000 })
          .then(() => true)
          .catch(() => false);
      }
      check(
        15,
        'The emailed link confirms the subscription on its own page',
        confirmedInBrowser,
        confirmToken ? page.url() : 'no confirmation link was captured',
      );

      // --- 7. The lead forms actually submit --------------------------------
      // Registration, booking and enquiry each used to answer from a timer. The
      // request is what is asserted here, not the copy on the success card.
      const leadEmails = {
        event: `${EMAIL_PREFIX}-lead-event@example.com`,
        booking: `${EMAIL_PREFIX}-lead-booking@example.com`,
        enquiry: `${EMAIL_PREFIX}-lead-enquiry@example.com`,
      };

      await page.goto(`${baseUrl}/events`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Register free|Apply for a place/ }).first().click();
      await page.getByLabel('Full name *').fill('Ada Lead');
      await page.getByLabel('Work email *').fill(leadEmails.event);
      await page.getByLabel('Organisation / company *').fill('Lead Test Ltd');
      const registrationSent = await submit(
        page,
        page.getByRole('button', { name: /Reserve my free place|Apply for a place/ }).last(),
        'event registration',
      );
      const registrationShown = await page
        .getByRole('heading', { name: 'Registration received' })
        .waitFor({ timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      check(
        16,
        'Registering for an event sends the details and shows the received card',
        registrationSent === true && registrationShown,
        `sent ${registrationSent}, confirmed ${registrationShown}`,
      );

      await page.goto(`${baseUrl}/consultation`, { waitUntil: 'networkidle' });
      await page.getByLabel('Full name *').fill('Chidi Lead');
      await page.getByLabel('Work email *').fill(leadEmails.booking);
      await page.getByLabel('Phone or WhatsApp *').fill('+234 800 000 0001');
      await page.getByLabel('Organisation or company name *').fill('Lead Test Ltd');
      const bookingSent = await submit(
        page,
        page.getByRole('button', { name: /^Request / }),
        'consultation request',
      );
      const bookingShown = await page
        .getByRole('heading', { name: 'Consultation requested' })
        .waitFor({ timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      check(
        17,
        'Requesting a consultation sends the slot and shows the requested card',
        bookingSent === true && bookingShown,
        `sent ${bookingSent}, confirmed ${bookingShown}`,
      );

      await page.getByRole('button', { name: 'Send a written enquiry' }).click();
      await page.getByLabel('Your name *').fill('Chinelo Lead');
      await page.getByLabel('Email address *').fill(leadEmails.enquiry);
      await page.getByLabel('Subject *').fill('HR Retainership for a tech scale-up');
      await page.getByLabel('Message *').fill('We need help formalising our people practices.');
      const enquirySent = await submit(
        page,
        page.getByRole('button', { name: 'Send enquiry' }),
        'written enquiry',
      );
      const enquiryShown = await page
        .getByRole('heading', { name: 'Enquiry received' })
        .waitFor({ timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      check(
        18,
        'Sending a written enquiry sends the message and shows the received card',
        enquirySent === true && enquiryShown,
        `sent ${enquirySent}, confirmed ${enquiryShown}`,
      );

      // --- 8. The mobile menu can be dismissed ------------------------------
      // The panel briefly carried a close button of its own while the header
      // toggle rotated its bars into an X, which left two controls with the same
      // accessible name stacked in one column. The header control is a drawn
      // cross now and the only close on screen, so what is pinned here is that
      // there is exactly one of them, that it is the toggle the panel belongs
      // to, that it shows a cross rather than rotated bars, and that it is still
      // big enough to hit.
      await page.setViewportSize({ width: 390, height: 844 });
      const menuPanel = page.locator('#mobile-menu');
      const menuGone = () =>
        page
          .waitForFunction(() => !document.querySelector('#mobile-menu'), null, {
            timeout: 5000,
          })
          .then(() => true)
          .catch(() => false);

      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Open menu' }).click();
      await menuPanel.waitFor({ state: 'visible', timeout: 5000 });
      // The panel animates its height open, so measuring it the instant it is
      // visible records whichever frame the machine happened to be on - 186px
      // on a loaded one, against the ~300px it settles at. Wait for two readings
      // a beat apart to agree. A stalled animation still fails the height check
      // below, because a panel that never grows never agrees with itself at
      // full height either.
      await page
        .waitForFunction(
          () => {
            const panel = document.querySelector('#mobile-menu');
            if (!panel) return false;
            const height = panel.getBoundingClientRect().height;
            const now = performance.now();
            const previous = window.__pgaMenuHeight;
            window.__pgaMenuHeight = { height, now };
            return (
              Boolean(previous) &&
              now - previous.now > 250 &&
              Math.abs(previous.height - height) < 1
            );
          },
          null,
          { timeout: 8000, polling: 100 },
        )
        .catch(() => false);
      // The two glyphs sit on top of each other and only the opacity swaps, so
      // read them once the swap has finished rather than on whichever frame the
      // machine happened to be on.
      await page
        .waitForFunction(
          () => {
            const button = document.querySelector('nav button[aria-controls="mobile-menu"]');
            const glyphs = button ? [...button.querySelectorAll('svg')] : [];
            return glyphs.length === 2 && Number(getComputedStyle(glyphs[1]).opacity) > 0.99;
          },
          null,
          { timeout: 3000 },
        )
        .catch(() => false);

      const toggle = page.locator('nav button[aria-controls="mobile-menu"]');
      const closeCount = await page.getByRole('button', { name: 'Close menu' }).count();
      const panelOwnClose = await menuPanel.getByRole('button', { name: 'Close menu' }).count();
      const closeBox = await toggle.boundingBox();
      const panelBox = await menuPanel.boundingBox();
      const glyphs = await page.evaluate(() => {
        const button = document.querySelector('nav button[aria-controls="mobile-menu"]');
        const svgs = button ? [...button.querySelectorAll('svg')] : [];
        if (svgs.length !== 2) return null;
        return svgs.map((svg) => Number(getComputedStyle(svg).opacity).toFixed(2));
      });
      check(
        19,
        'The mobile menu opens full height under a single close control, a cross in the header, at least 40px square',
        closeCount === 1 &&
          panelOwnClose === 0 &&
          glyphs !== null &&
          glyphs[0] === '0.00' &&
          glyphs[1] === '1.00' &&
          Boolean(closeBox) &&
          closeBox.width >= 40 &&
          closeBox.height >= 40 &&
          Boolean(panelBox) &&
          panelBox.height > 200,
        `panel ${Math.round(panelBox?.height ?? 0)}px, close controls ${closeCount} (panel has ${panelOwnClose}), toggle ${closeBox ? `${closeBox.width}x${closeBox.height}` : 'missing'}, bars/cross ${glyphs ? glyphs.join('/') : 'missing'}`,
      );

      await page.getByRole('button', { name: 'Close menu' }).click();
      const closedByButton = await menuGone();
      await page.getByRole('button', { name: 'Open menu' }).click();
      await menuPanel.waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
      const closedByEscape = await menuGone();
      check(
        20,
        'The header close control and the Escape key both dismiss the menu',
        closedByButton && closedByEscape,
        `button ${closedByButton}, escape ${closedByEscape}`,
      );

      await page.getByRole('button', { name: 'Open menu' }).click();
      await menuPanel.waitFor({ state: 'visible', timeout: 5000 });
      // A real tap on the page behind the panel, using raw mouse input so the
      // pointerdown listener is what is being tested.
      await page.mouse.click(20, 800);
      const closedByOutsideTap = await menuGone();
      check(
        21,
        'Tapping outside the mobile menu closes it',
        closedByOutsideTap,
        closedByOutsideTap ? 'closed' : 'stayed open',
      );

      // --- 9. The modal's close button survives a scroll --------------------
      // The booking card scrolls internally. The close button used to sit in
      // the header of that scrolling element, so on a phone one flick of the
      // thumb took it off screen with no other way out but the backdrop.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('button', { name: 'Schedule Consultation' }).click();
      const modalClose = page.getByRole('button', { name: 'Close consultation modal' });
      await modalClose.waitFor({ state: 'visible', timeout: 5000 });
      const scrollState = await page.evaluate(() => {
        const button = document.querySelector('[aria-label="Close consultation modal"]');
        let node = button?.parentElement ?? null;
        while (
          node &&
          !(node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY === 'auto')
        ) {
          node = node.parentElement;
        }
        if (!node) return null;
        node.scrollTop = node.scrollHeight;
        return { scrolled: node.scrollTop, height: node.scrollHeight };
      });
      const closeBoxAfterScroll = await modalClose.boundingBox();
      const viewportHeight = page.viewportSize()?.height ?? 0;
      check(
        22,
        'The consultation modal close button stays on screen while the form scrolls',
        Boolean(scrollState) &&
          scrollState.scrolled > 40 &&
          Boolean(closeBoxAfterScroll) &&
          closeBoxAfterScroll.y >= 0 &&
          closeBoxAfterScroll.y + closeBoxAfterScroll.height <= viewportHeight,
        `scrolled ${Math.round(scrollState?.scrolled ?? 0)}px, button at y=${Math.round(
          closeBoxAfterScroll?.y ?? -1,
        )} of ${viewportHeight}`,
      );

      await modalClose.click();
      const modalClosed = await page
        .getByRole('heading', { name: "Let's talk about your people setup" })
        .waitFor({ state: 'detached', timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      check(
        23,
        'The close button still dismisses the booking card after scrolling',
        modalClosed,
        modalClosed ? 'closed' : 'stayed open',
      );

      // --- 10. Phones reveal the logo with CSS, not with SVG dots ------------
      // The scatter animates dozens of SVG children from JavaScript, every one
      // of them inside a scaled, promoted layer, so a phone pays a paint for
      // every frame it shows. A phone is meant to get a single <img> carrying a
      // transform/opacity animation instead: no dot layer, no per-frame script.
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => sessionStorage.removeItem('pga_logo_animated'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('a[aria-label="People Growth Africa Home"] img', {
        timeout: 10000,
      });
      const phoneIntro = await page.evaluate(() => {
        const link = document.querySelector('a[aria-label="People Growth Africa Home"]');
        const img = link.querySelector('img');
        const style = getComputedStyle(img);
        return {
          svgs: link.querySelectorAll('svg').length,
          dots: link.querySelectorAll('svg circle').length,
          animation: style.animationName,
          duration: style.animationDuration,
          // The dot path drives itself with inline styles (the promoted mark,
          // the dots' opacity). None of them should exist on a phone.
          tweened: link.querySelectorAll('[style*="transform"], [style*="will-change"]').length,
        };
      });
      check(
        24,
        'On a phone the logo intro is a CSS fade and scale with no dot layer at all',
        phoneIntro.svgs === 0 &&
          phoneIntro.dots === 0 &&
          phoneIntro.animation === 'logo-reveal' &&
          phoneIntro.tweened === 0,
        `no svg (${phoneIntro.svgs}), animation "${phoneIntro.animation}" ${phoneIntro.duration}, ${phoneIntro.tweened} script tweened nodes`,
      );

      const phoneSettled = await page
        .waitForFunction(
          () => {
            const img = document.querySelector(
              'a[aria-label="People Growth Africa Home"] img',
            );
            return (
              sessionStorage.getItem('pga_logo_animated') === 'true' &&
              Boolean(img) &&
              getComputedStyle(img).opacity === '1'
            );
          },
          null,
          { timeout: 5000, polling: 50 },
        )
        .then(() => true)
        .catch(() => false);
      check(
        25,
        'The reveal lands on the full logo and is not replayed again that session',
        phoneSettled,
        phoneSettled ? 'landed at full opacity' : 'timed out',
      );

      // --- 11. The desktop scatter is left alone -----------------------------
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.evaluate(() => sessionStorage.removeItem('pga_logo_animated'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('a[aria-label="People Growth Africa Home"] img', {
        timeout: 10000,
      });
      const desktopIntro = await page.evaluate(() => {
        const link = document.querySelector('a[aria-label="People Growth Africa Home"]');
        return {
          dots: link.querySelectorAll('svg circle').length,
          animation: getComputedStyle(link.querySelector('img')).animationName,
        };
      });
      check(
        26,
        'Above the phone breakpoint the logo still runs the sampled dot scatter',
        desktopIntro.dots > 0 && desktopIntro.animation === 'none',
        `${desktopIntro.dots} dots, mark animation "${desktopIntro.animation}"`,
      );

      // --- 12. Every text field on a form carries a placeholder --------------
      // A placeholder is what tells a visitor the shape of an answer
      // ("name@company.com", "At least 8 characters") without another line of
      // help text. The reset form has two states, so both are visited.
      const formPages = [
        '/auth#signup',
        '/auth#login',
        '/forgot-password',
        '/forgot-password?token=pga-ui-test-token',
      ];
      const placeholderReport = {};
      for (const path of formPages) {
        await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
        placeholderReport[path] = await page.evaluate(() => {
          const textLike = ['text', 'email', 'tel', 'password', 'search', 'url', 'number'];
          const fields = [...document.querySelectorAll('input, textarea')].filter(
            (element) => {
              const type = (element.getAttribute('type') ?? 'text').toLowerCase();
              return textLike.includes(type) && element.offsetParent !== null;
            },
          );
          return {
            checked: fields.length,
            missing: fields
              .filter((element) => !element.getAttribute('placeholder'))
              .map((element) => element.id || element.name || element.type),
          };
        });
      }
      const emptyPages = Object.entries(placeholderReport)
        .filter(([, report]) => report.checked === 0)
        .map(([path]) => path);
      const missingPlaceholders = Object.entries(placeholderReport).flatMap(
        ([path, report]) => report.missing.map((field) => `${path} ${field}`),
      );
      const fieldsChecked = Object.values(placeholderReport).reduce(
        (total, report) => total + report.checked,
        0,
      );
      check(
        27,
        'Every visible text field on the signup, login and reset forms has a placeholder',
        emptyPages.length === 0 && missingPlaceholders.length === 0,
        missingPlaceholders.length
          ? `missing on ${missingPlaceholders.join(', ')}`
          : `${fieldsChecked} fields across ${formPages.length} pages`,
      );

      // --- 13. Client-side navigation cross-fades to the new page ------------
      // The route table sits in a PageTransition keyed on the path, so the old
      // page is deliberately still on screen for a moment after the click and
      // the new one starts invisible. What must still hold is that a click
      // arrives: the new page mounts, fades in, and the scroll starts at the
      // top rather than wherever the visitor had left the previous page.
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => window.scrollTo(0, 1400));
      const scrollBefore = await page.evaluate(() => window.scrollY);

      await page.getByRole('link', { name: 'Events', exact: true }).first().click();
      await page.waitForURL('**/events', { timeout: 15000 });
      const transitionSettled = await page
        .waitForFunction(
          () => {
            const main = document.querySelector('main');
            const first = main?.firstElementChild;
            return (
              Boolean(first) &&
              getComputedStyle(first).opacity === '1' &&
              window.scrollY === 0 &&
              Boolean(document.querySelector('h1'))
            );
          },
          null,
          { timeout: 8000, polling: 100 },
        )
        .then(() => true)
        .catch(() => false);
      const scrollAfter = await page.evaluate(() => window.scrollY);
      check(
        28,
        'A nav click cross-fades to the new page and starts it at the top',
        scrollBefore > 500 && transitionSettled && scrollAfter === 0,
        `from ${Math.round(scrollBefore)}px, settled ${transitionSettled}, now ${scrollAfter}px`,
      );
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (error) {
    failures += 1;
    console.error(`\nERROR  ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) console.error(error.stack);
  } finally {
    console.warn = originalWarn;
    await cleanupTestRows().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
    await server.close();
  }

  const passed = results.filter((entry) => entry.passed).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (failures > 0) {
    console.log('\nFailing checks:');
    for (const result of results.filter((entry) => !entry.passed)) {
      console.log(`  ${result.number}. ${result.description}`);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
}

await main();
