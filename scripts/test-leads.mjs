/**
 * Lead test suite. Checks the three public forms the site promises to answer:
 * an event registration, a consultation request and a written enquiry. Each one
 * has to be stored, and the team has to be told about it, over real HTTP against
 * a real database.
 *
 *   npm run test:leads                          # local: needs DATABASE_URL
 *   npm run test:leads -- --base-url=https://x  # against a deployment
 *
 * A local run needs DATABASE_URL (and DATABASE_URL_UNPOOLED for clean up) in
 * .env.development.local, .env.local or .env. Test rows carry an obvious prefix
 * and are removed at the end.
 */
import { randomBytes } from 'node:crypto';
import { loadEnvFiles, startApiServer } from './api-server.mjs';
import { checkApiImports } from './check-api-imports.mjs';

const PREFIX = `test-leads-${Date.now().toString(36)}`;
const EVENT_EMAIL = `${PREFIX}-event@example.com`;
const EVENT_SLUG = `${PREFIX}-event`;
const PAST_EVENT_SLUG = `${PREFIX}-past-event`;
const ACTIVE_EVENT_EMAIL = `${PREFIX}-active-event@example.com`;
const BOOKING_EMAIL = `${PREFIX}-booking@example.com`;
const ENQUIRY_EMAIL = `${PREFIX}-enquiry@example.com`;
const LIMITED_EMAIL = `${PREFIX}-limited@example.com`;

/** Weekday and Saturday slots are the only ones the calendar offers. */
function futureDate(daysAhead, weekday) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
}

function skipCheck(number, description, reason) {
  results.push({ number, description, passed: true, skipped: true, detail: reason });
  console.log(`SKIP  ${String(number).padStart(2)}. ${description} (${reason})`);
}

// --- email capture -----------------------------------------------------------
// With no RESEND_API_KEY the notifications are printed instead of sent, which
// is how this suite reads what the team would have received.
const logged = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  logged.push(args.map((value) => String(value)).join(' '));
};

function logSince(mark) {
  return logged.slice(mark).join('\n');
}

// --- http helpers ------------------------------------------------------------
async function call(baseUrl, path, options = {}) {
  const { method = 'POST', body, headers = {} } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    redirect: 'manual',
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text, response };
}

/**
 * A `date` column comes back as text or as a Date at local midnight, so the
 * day has to be read the same way the browser writes it rather than through
 * toISOString, which would shift it back a day east of Greenwich.
 */
function storedDate(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const eventBody = () => ({
  eventSlug: EVENT_SLUG,
  name: 'Ada Lead',
  email: EVENT_EMAIL,
  phone: '+234 800 000 0000',
  organisation: 'Lead Test Ltd',
  role: 'Head of People',
  question: 'How do we audit our contracts?',
});

const bookingBody = () => ({
  name: 'Chidi Lead',
  email: BOOKING_EMAIL,
  phone: '+234 800 000 0001',
  organisation: 'Lead Test Ltd',
  teamSize: '11 – 50 Employees',
  service: 'HR Audits & Compliance',
  meetingFormat: 'virtual',
  preferredDate: futureDate(1, 3),
  preferredSlot: '10:00 AM',
  notes: 'We have grown fast and our contracts are out of date.',
});

const enquiryBody = () => ({
  name: 'Chinelo Lead',
  email: ENQUIRY_EMAIL,
  phone: '+234 800 000 0002',
  subject: 'HR Retainership for a tech scale-up',
  message: 'We need help formalising our people practices before our next funding round.',
  source: 'consultation-page',
});

async function cleanup(sql) {
  if (!sql) return;
  for (const table of ['event_registrations', 'registrations', 'consultation_bookings', 'enquiries']) {
    await sql.query(`DELETE FROM ${table} WHERE email LIKE $1`, [`${PREFIX}%`]);
  }
  await sql.query('DELETE FROM posts WHERE slug IN ($1, $2)', [EVENT_SLUG, PAST_EVENT_SLUG]);
  originalWarn.call(console, `Cleaned up test rows for ${PREFIX}`);
}

async function main() {
  const baseUrlArg = process.argv.find((argument) => argument.startsWith('--base-url='));
  const configuredBaseUrl = baseUrlArg?.split('=')[1] ?? process.env.LEADS_TEST_BASE_URL;
  const isLocal = !configuredBaseUrl;

  if (isLocal) {
    loadEnvFiles({ quiet: true });
    if (!process.env.DATABASE_URL) {
      console.error(
        [
          '',
          'DATABASE_URL is not set, so the suite cannot start the API locally.',
          '',
          'Either pull the Vercel environment (vercel env pull .env.development.local --yes)',
          'or point the suite at a deployment:',
          '  npm run test:leads -- --base-url=https://your-preview.vercel.app',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
    // A previous run must not leave rate limit counters behind, and the
    // notification has to reach this process's log.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.RESEND_API_KEY;
  }

  const imports = await checkApiImports({ quiet: true });
  if (!imports.ok) {
    console.error(`\n${imports.summary}\n\nRun \`node scripts/check-api-imports.mjs\` for the details.\n`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? null;
  const server = isLocal ? await startApiServer({ quiet: true }) : null;
  const baseUrl = configuredBaseUrl ?? server.origin;

  let sql = null;
  if (databaseUrl) {
    const { neon } = await import('@neondatabase/serverless');
    sql = neon(databaseUrl);
  }

  if (sql) {
    await sql.query(
      `INSERT INTO posts (slug, title, excerpt, body, type, status, published_at, event_start, is_online)
       VALUES
         ($1, 'Registration cutoff test', 'Test event', 'Test event body', 'event', 'published', now(), now() + interval '1 hour', true),
         ($2, 'Past registration cutoff test', 'Test event', 'Test event body', 'event', 'published', now(), now() - interval '1 minute', true)`,
      [EVENT_SLUG, PAST_EVENT_SLUG],
    );
  }

  console.log(`\nTesting ${baseUrl} as ${PREFIX}\n`);

  try {
    // 1. An event registration is stored, and the team is told about it.
    const mark = logged.length;
    const registration = await call(baseUrl, '/api/leads/event-registration', {
      body: eventBody(),
    });
    const registrationNotice = logSince(mark);

    if (sql) {
      const rows = await sql.query(
        'SELECT event_slug, name, phone, organisation, role, question FROM event_registrations WHERE email = $1',
        [EVENT_EMAIL],
      );
      const row = rows[0];
      check(
        1,
        'An event registration is stored with the event and the contact details',
        registration.status === 201 &&
          rows.length === 1 &&
          row.event_slug === EVENT_SLUG &&
          row.name === 'Ada Lead' &&
          row.organisation === 'Lead Test Ltd' &&
          row.role === 'Head of People' &&
          row.question === 'How do we audit our contracts?',
        `status ${registration.status}, ${rows.length} row(s)`,
      );
    } else {
      skipCheck(1, 'An event registration is stored', 'no database access');
    }

    if (sql) {
      check(
        2,
        'The team is emailed about the registration, with the sender as reply-to',
        registrationNotice.includes(`Subject: Event registration: ${EVENT_EMAIL}`) &&
          registrationNotice.includes('Organisation: Lead Test Ltd') &&
          /To: [^\s]+@[^\s]+/.test(registrationNotice),
        registrationNotice ? 'notification printed' : 'nothing printed',
      );
    } else {
      skipCheck(2, 'The team is emailed about the registration', 'no database fixture available');
    }

    // The main registration endpoint accepts a future event and rejects one
    // that has already started, independently of the visitor's clock.
    const activeRegistration = await call(baseUrl, '/api/registrations', {
      body: {
        eventSlug: EVENT_SLUG,
        name: 'Ada Active',
        email: ACTIVE_EVENT_EMAIL,
        phone: '+234 800 000 0003',
        organization: 'Lead Test Ltd',
        notes: 'A future event registration.',
      },
    });
    const expiredRegistration = await call(baseUrl, '/api/registrations', {
      body: {
        eventSlug: PAST_EVENT_SLUG,
        name: 'Ada Expired',
        email: `${PREFIX}-expired@example.com`,
        phone: '+234 800 000 0004',
        organization: 'Lead Test Ltd',
        notes: 'A registration after the event start.',
      },
    });
    if (sql) {
      const activeRows = await sql.query(
        'SELECT id FROM registrations WHERE email = $1',
        [ACTIVE_EVENT_EMAIL],
      );
      check(
        15,
        'The first-party endpoint accepts a registration before the event starts',
        activeRegistration.status === 201 && activeRows.length === 1,
        `status ${activeRegistration.status}`,
      );
      check(
        16,
        'The first-party endpoint rejects registration after the event starts',
        expiredRegistration.status === 409 &&
          expiredRegistration.json?.code === 'registration_closed',
        `status ${expiredRegistration.status}`,
      );
    } else {
      skipCheck(15, 'The first-party endpoint accepts a future event registration', 'no database fixture available');
      skipCheck(16, 'The first-party endpoint rejects a past event registration', 'no database fixture available');
    }

    const availability = await call(baseUrl, '/api/registration-availability', { method: 'GET' });
    if (sql) {
      const eventAvailability = availability.json?.events?.find((event) => event.slug === EVENT_SLUG);
      check(
        17,
        'Registration availability is computed for published events without caching',
        availability.status === 200 &&
          eventAvailability?.open === true &&
          availability.response.headers.get('cache-control')?.includes('no-store'),
        `status ${availability.status}`,
      );
    } else {
      skipCheck(17, 'Registration availability is computed for published events', 'no database fixture available');
    }

    const expiredLegacyRegistration = await call(baseUrl, '/api/leads/event-registration', {
      body: { ...eventBody(), eventSlug: PAST_EVENT_SLUG, email: `${PREFIX}-legacy-expired@example.com` },
    });
    if (sql) {
      check(
        18,
        'The legacy event-registration endpoint rejects a registration after start',
        expiredLegacyRegistration.status === 409 &&
          expiredLegacyRegistration.json?.code === 'registration_closed',
        `status ${expiredLegacyRegistration.status}`,
      );
    } else {
      skipCheck(18, 'The legacy event endpoint rejects a past event registration', 'no database fixture available');
    }

    // 3. The event is named by slug, so a made up one is refused.
    const badSlug = await call(baseUrl, '/api/leads/event-registration', {
      body: { ...eventBody(), eventSlug: 'Not A Slug' },
    });
    check(
      3,
      'A registration for an event that is not a slug is refused',
      badSlug.status === 400 &&
        badSlug.json?.code === 'validation_failed' &&
        Boolean(badSlug.json?.fields?.eventSlug),
      `status ${badSlug.status}`,
    );

    // 4. Missing required fields come back field by field.
    const missingOrganisation = await call(baseUrl, '/api/leads/event-registration', {
      body: { ...eventBody(), organisation: '' },
    });
    const unknownField = await call(baseUrl, '/api/leads/event-registration', {
      body: { ...eventBody(), isAdmin: true },
    });
    check(
      4,
      'An empty organisation and an unknown field are both refused with 400',
      missingOrganisation.status === 400 &&
        Boolean(missingOrganisation.json?.fields?.organisation) &&
        unknownField.status === 400 &&
        unknownField.json?.code === 'validation_failed',
      `organisation ${missingOrganisation.status}, unknown field ${unknownField.status}`,
    );

    // 5. A consultation request is stored as a request, with its slot.
    const bookingMark = logged.length;
    const booking = await call(baseUrl, '/api/leads/consultation-booking', { body: bookingBody() });
    const bookingNotice = logSince(bookingMark);

    if (sql) {
      const rows = await sql.query(
        'SELECT team_size, service, meeting_format, preferred_date, preferred_slot, notes, phone FROM consultation_bookings WHERE email = $1',
        [BOOKING_EMAIL],
      );
      const row = rows[0];
      const stored = row
        ? {
            meeting_format: row.meeting_format,
            preferred_date: storedDate(row.preferred_date),
            preferred_slot: row.preferred_slot,
            service: row.service,
            team_size: row.team_size,
            phone: row.phone,
          }
        : null;
      check(
        5,
        'A consultation request is stored with its date, slot, format and service',
        booking.status === 201 &&
          rows.length === 1 &&
          stored.meeting_format === 'virtual' &&
          stored.preferred_date === bookingBody().preferredDate &&
          stored.preferred_slot === '10:00 AM' &&
          stored.service === 'HR Audits & Compliance' &&
          stored.team_size === '11 – 50 Employees' &&
          stored.phone === '+234 800 000 0001',
        `status ${booking.status}, ${JSON.stringify(stored)}`,
      );
    } else {
      skipCheck(5, 'A consultation request is stored', 'no database access');
    }

    check(
      6,
      'The team is emailed about the request, with the slot in the body',
      bookingNotice.includes(`Subject: Consultation request: ${BOOKING_EMAIL}`) &&
        bookingNotice.includes('Requested slot:') &&
        bookingNotice.includes('How we meet: virtual'),
      bookingNotice ? 'notification printed' : 'nothing printed',
    );

    // 7. The office is closed on Sundays, and that is enforced here too.
    const sunday = await call(baseUrl, '/api/leads/consultation-booking', {
      body: { ...bookingBody(), email: `${PREFIX}-sunday@example.com`, preferredDate: futureDate(1, 0) },
    });
    check(
      7,
      'A Sunday request is refused with a note on the date field',
      sunday.status === 400 && Boolean(sunday.json?.fields?.preferredDate),
      `status ${sunday.status}, field "${sunday.json?.fields?.preferredDate}"`,
    );

    // 8. So is a date the calendar would never have offered.
    const stale = await call(baseUrl, '/api/leads/consultation-booking', {
      body: { ...bookingBody(), email: `${PREFIX}-stale@example.com`, preferredDate: '2020-03-03' },
    });
    const faraway = await call(baseUrl, '/api/leads/consultation-booking', {
      body: { ...bookingBody(), email: `${PREFIX}-faraway@example.com`, preferredDate: futureDate(400, 3) },
    });
    check(
      8,
      'A date in the past and one beyond three months are both refused',
      stale.status === 400 && faraway.status === 400,
      `past ${stale.status}, far ahead ${faraway.status}`,
    );

    // 9. A written enquiry is stored, and the form it came from is recorded.
    const enquiryMark = logged.length;
    const enquiry = await call(baseUrl, '/api/leads/enquiry', { body: enquiryBody() });
    const enquiryNotice = logSince(enquiryMark);

    if (sql) {
      const rows = await sql.query(
        'SELECT subject, message, source, phone FROM enquiries WHERE email = $1',
        [ENQUIRY_EMAIL],
      );
      const row = rows[0];
      check(
        9,
        'A written enquiry is stored with its message and the form it came from',
        enquiry.status === 201 &&
          rows.length === 1 &&
          row.subject === 'HR Retainership for a tech scale-up' &&
          row.message.startsWith('We need help formalising') &&
          row.source === 'consultation-page',
        `status ${enquiry.status}, ${rows.length} row(s)`,
      );
    } else {
      skipCheck(9, 'A written enquiry is stored', 'no database access');
    }

    check(
      10,
      'The team is emailed the enquiry, message included',
      enquiryNotice.includes(`Subject: Written enquiry: ${ENQUIRY_EMAIL}`) &&
        enquiryNotice.includes('We need help formalising our people practices'),
      enquiryNotice ? 'notification printed' : 'nothing printed',
    );

    // 11. The source is a closed set, so an unknown one is refused.
    const badSource = await call(baseUrl, '/api/leads/enquiry', {
      body: { ...enquiryBody(), source: 'somewhere-else' },
    });
    check(
      11,
      'An enquiry claiming an unknown form is refused',
      badSource.status === 400 && Boolean(badSource.json?.fields?.source),
      `status ${badSource.status}`,
    );

    // 12. All three are guarded the way the auth routes are.
    const foreign = [];
    for (const path of [
      '/api/leads/event-registration',
      '/api/leads/consultation-booking',
      '/api/leads/enquiry',
    ]) {
      const attempt = await call(baseUrl, path, {
        body: { email: `${PREFIX}-evil@example.com` },
        headers: { Origin: 'https://evil.example' },
      });
      foreign.push(attempt.status);
    }
    const get = await call(baseUrl, '/api/leads/enquiry', { method: 'GET' });
    check(
      12,
      'Every lead endpoint refuses another origin, and the wrong method',
      foreign.every((status) => status === 403) &&
        get.status === 405 &&
        (get.response.headers.get('allow') ?? '').includes('POST'),
      `origins ${foreign.join('/')}, GET ${get.status}`,
    );

    // 13. Three requests an hour per address, then a 429 to back off from.
    const statuses = [];
    let limited = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await call(baseUrl, '/api/leads/enquiry', {
        body: { ...enquiryBody(), email: LIMITED_EMAIL },
      });
      statuses.push(response.status);
      if (response.status === 429) limited = response;
    }
    const retryAfter = limited?.response.headers.get('retry-after') ?? null;
    check(
      13,
      'The fourth enquiry from one address in an hour is refused with 429 and Retry-After',
      statuses.join('/') === '201/201/201/429' &&
        limited?.json?.code === 'rate_limited' &&
        Number(retryAfter) > 0,
      `statuses ${statuses.join('/')}, Retry-After ${retryAfter}`,
    );

    if (sql) {
      const rows = await sql.query(
        'SELECT count(*)::int AS count FROM enquiries WHERE email = $1',
        [`${PREFIX}-evil@example.com`],
      );
      check(14, 'The refused requests stored nothing', rows[0].count === 0, `${rows[0].count} row(s)`);
    } else {
      skipCheck(14, 'The refused requests stored nothing', 'no database access');
    }
  } finally {
    console.warn = originalWarn;
    await cleanup(sql);
    if (server) await server.close();
  }

  const skipped = results.filter((result) => result.skipped).length;
  const passed = results.length - failures - skipped;
  console.log(
    `\n${passed}/${results.length} checks passed${skipped > 0 ? ` (${skipped} skipped)` : ''}`,
  );
  if (failures > 0) {
    console.log('\nFailing checks:');
    for (const result of results.filter((entry) => !entry.passed)) {
      console.log(`  ${result.number}. ${result.description} (${result.detail})`);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
}

await main();
