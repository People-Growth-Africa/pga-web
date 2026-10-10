/**
 * Dashboard test suite. Two endpoints back the new dashboards, and both are
 * about a signed in person reading and writing their own record: a talent saving
 * their availability and country, and an employer reading back the consultation
 * request they made.
 *
 *   npm run test:dashboard                          # local: needs DATABASE_URL
 *   npm run test:dashboard -- --base-url=https://x   # against a deployment
 *
 * The checks that matter most here are the ones about what these endpoints
 * cannot do: no other account's row, no other role, no column outside the two
 * the dashboard owns. Test rows carry an obvious prefix and are removed at the
 * end.
 */
import { randomBytes } from 'node:crypto';
import { loadEnvFiles, startApiServer } from './api-server.mjs';
import { checkApiImports } from './check-api-imports.mjs';

const PREFIX = `test-dashboard-${Date.now().toString(36)}`;
const TALENT_EMAIL = `${PREFIX}-talent@example.com`;
const LIMIT_EMAIL = `${PREFIX}-limit@example.com`;
const EMPLOYER_EMAIL = `${PREFIX}-employer@example.com`;
const OTHER_EMPLOYER_EMAIL = `${PREFIX}-other-employer@example.com`;
const GOOD_PASSWORD = 'Quiet-Harbour-7712';

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

// --- http helpers ------------------------------------------------------------
function cookieFrom(response) {
  const headers = response.headers.getSetCookie?.() ?? [];
  for (const header of headers) {
    const pair = header.split(';')[0];
    if (pair && !pair.endsWith('=')) return pair;
  }
  return null;
}

async function call(baseUrl, path, options = {}) {
  const { method = 'POST', body, cookie, headers = {} } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
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
  return { status: response.status, json, text, cookie: cookieFrom(response), response };
}

const talentBody = (email = TALENT_EMAIL) => ({
  role: 'talent',
  name: 'Ada Dashboard',
  email,
  password: GOOD_PASSWORD,
  field: 'IT & Software',
  country: 'Ghana',
  availability: 'just_exploring',
  acceptedTerms: true,
});

const employerBody = (email = EMPLOYER_EMAIL) => ({
  role: 'employer',
  name: 'Chidi Dashboard',
  company: 'Dashboard Works Ltd',
  email,
  password: GOOD_PASSWORD,
  needs: ['find_talent'],
  acceptedTerms: true,
});

async function cleanupLocal(sql) {
  if (!sql) return;
  await sql.query('DELETE FROM consultation_bookings WHERE email LIKE $1', [`${PREFIX}%`]);
  await sql.query('DELETE FROM users WHERE email LIKE $1', [`${PREFIX}%`]);
}

async function main() {
  const baseUrlArg = process.argv.find((argument) => argument.startsWith('--base-url='));
  const configuredBaseUrl = baseUrlArg?.split('=')[1] ?? process.env.DASHBOARD_TEST_BASE_URL;
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
          '  npm run test:dashboard -- --base-url=https://your-preview.vercel.app',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
    // A previous run must not leave rate limit counters behind.
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
  console.log(`\nTesting ${baseUrl} as ${PREFIX}\n`);

  try {
    // --- talent profile ------------------------------------------------------
    const talent = await call(baseUrl, '/api/auth/signup', { body: talentBody() });
    const talentCookie = talent.cookie;
    check(
      1,
      'A talent signs up and gets a session cookie',
      talent.status === 201 && Boolean(talentCookie),
      `status ${talent.status}`,
    );

    // 2. The two fields the dashboard owns are saved, and nothing else moves.
    const saved = await call(baseUrl, '/api/talent/profile', {
      body: { availability: 'available_now' },
      cookie: talentCookie,
    });
    const afterSave = await call(baseUrl, '/api/auth/me', { method: 'GET', cookie: talentCookie });

    if (sql) {
      const rows = await sql.query(
        'SELECT name, field, country, availability FROM talent_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)',
        [TALENT_EMAIL],
      );
      const row = rows[0] ?? {};
      check(
        2,
        'Saving availability updates that column and leaves name, field and country alone',
        saved.status === 200 &&
          row.availability === 'available_now' &&
          row.country === 'Ghana' &&
          row.name === 'Ada Dashboard' &&
          row.field === 'IT & Software' &&
          afterSave.json?.user?.profile?.availability === 'available_now',
        `row ${JSON.stringify(row)}`,
      );
    } else {
      skipCheck(2, 'Saving availability updates one column', 'no database access');
    }

    // 3. An empty country clears the answer rather than storing an empty string.
    await call(baseUrl, '/api/talent/profile', { body: { country: '' }, cookie: talentCookie });
    if (sql) {
      const rows = await sql.query(
        'SELECT country FROM talent_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)',
        [TALENT_EMAIL],
      );
      check(
        3,
        'An empty country clears the column instead of storing a blank',
        rows[0]?.country === null,
        `country ${JSON.stringify(rows[0]?.country)}`,
      );
    } else {
      skipCheck(3, 'An empty country clears the column', 'no database access');
    }

    // 4. Both answers can come in one request, and each is trimmed.
    const both = await call(baseUrl, '/api/talent/profile', {
      body: { country: '  Kenya  ', availability: 'within_30_days' },
      cookie: talentCookie,
    });
    check(
      4,
      'One request can set both fields, and values are trimmed',
      both.status === 200 &&
        both.json?.profile?.country === 'Kenya' &&
        both.json?.profile?.availability === 'within_30_days',
      `status ${both.status}, ${JSON.stringify(both.json?.profile)}`,
    );

    // 5. The schema is strict: anything the dashboard does not own is refused.
    const unknownKey = await call(baseUrl, '/api/talent/profile', {
      body: { name: 'Somebody Else' },
      cookie: talentCookie,
    });
    const badAvailability = await call(baseUrl, '/api/talent/profile', {
      body: { availability: 'whenever' },
      cookie: talentCookie,
    });
    const emptyBody = await call(baseUrl, '/api/talent/profile', { body: {}, cookie: talentCookie });
    const longCountry = await call(baseUrl, '/api/talent/profile', {
      body: { country: 'x'.repeat(61) },
      cookie: talentCookie,
    });
    check(
      5,
      'An unknown key, an unknown availability, an empty body and an over long country are all refused',
      unknownKey.status === 400 &&
        unknownKey.json?.code === 'validation_failed' &&
        badAvailability.status === 400 &&
        Boolean(badAvailability.json?.fields?.availability) &&
        emptyBody.status === 400 &&
        longCountry.status === 400,
      `unknown key ${unknownKey.status}, availability ${badAvailability.status}, empty ${emptyBody.status}, long ${longCountry.status}`,
    );

    if (sql) {
      const rows = await sql.query(
        'SELECT name FROM talent_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)',
        [TALENT_EMAIL],
      );
      check(
        6,
        'A refused save changed nothing',
        rows[0]?.name === 'Ada Dashboard',
        `name ${JSON.stringify(rows[0]?.name)}`,
      );
    } else {
      skipCheck(6, 'A refused save changed nothing', 'no database access');
    }

    // --- guards --------------------------------------------------------------
    const anonymous = await call(baseUrl, '/api/talent/profile', { body: { country: 'Kenya' } });
    const employer = await call(baseUrl, '/api/auth/signup', { body: employerBody() });
    const employerCookie = employer.cookie;
    const wrongRole = await call(baseUrl, '/api/talent/profile', {
      body: { country: 'Kenya' },
      cookie: employerCookie,
    });
    const foreignOrigin = await call(baseUrl, '/api/talent/profile', {
      body: { country: 'Kenya' },
      cookie: talentCookie,
      headers: { Origin: 'https://evil.example' },
    });
    const wrongMethod = await call(baseUrl, '/api/talent/profile', {
      method: 'GET',
      cookie: talentCookie,
    });
    check(
      7,
      'Saving a profile needs a session, a talent account, this origin and POST',
      anonymous.status === 401 &&
        wrongRole.status === 403 &&
        wrongRole.json?.code === 'wrong_role' &&
        foreignOrigin.status === 403 &&
        wrongMethod.status === 405 &&
        (wrongMethod.response.headers.get('allow') ?? '').includes('POST'),
      `anonymous ${anonymous.status}, employer ${wrongRole.status}, other origin ${foreignOrigin.status}, GET ${wrongMethod.status}`,
    );

    // --- employer consultation ----------------------------------------------
    const beforeBooking = await call(baseUrl, '/api/employer/consultation', {
      method: 'GET',
      cookie: employerCookie,
    });
    check(
      8,
      'An employer with no request yet gets a null consultation rather than an error',
      beforeBooking.status === 200 && beforeBooking.json?.consultation === null,
      `status ${beforeBooking.status}, ${JSON.stringify(beforeBooking.json?.consultation)}`,
    );

    const talentReadsEmployerRoute = await call(baseUrl, '/api/employer/consultation', {
      method: 'GET',
      cookie: talentCookie,
    });
    const anonymousRead = await call(baseUrl, '/api/employer/consultation', { method: 'GET' });
    const writeAttempt = await call(baseUrl, '/api/employer/consultation', {
      body: {},
      cookie: employerCookie,
    });
    check(
      9,
      'The consultation read needs an employer session, and only accepts GET',
      talentReadsEmployerRoute.status === 403 &&
        anonymousRead.status === 401 &&
        writeAttempt.status === 405,
      `talent ${talentReadsEmployerRoute.status}, anonymous ${anonymousRead.status}, POST ${writeAttempt.status}`,
    );

    if (sql) {
      // An older request and a newer one, so "the latest" is a real decision.
      const insert = (email, organisation, createdAt) =>
        sql.query(
          `INSERT INTO consultation_bookings
             (name, email, organisation, meeting_format, preferred_date, preferred_slot, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, ${createdAt})`,
          [
            'Chidi Dashboard',
            email,
            organisation,
            'virtual',
            '2030-01-15',
            '10:00 AM',
            'Dashboard suite',
          ],
        );

      await insert(EMPLOYER_EMAIL, 'Older Request Ltd', "now() - interval '3 days'");
      await insert(EMPLOYER_EMAIL, 'Newer Request Ltd', 'now()');
      // Another employer's request, made later, which must never show up here.
      await insert(OTHER_EMPLOYER_EMAIL, 'Somebody Else Ltd', "now() + interval '1 hour'");

      const read = await call(baseUrl, '/api/employer/consultation', {
        method: 'GET',
        cookie: employerCookie,
      });
      const body = read.json?.consultation ?? {};
      check(
        10,
        'An employer reads back their own latest request, in camelCase, and never another account',
        read.status === 200 &&
          body.organisation === 'Newer Request Ltd' &&
          body.meetingFormat === 'virtual' &&
          body.preferredDate === '2030-01-15' &&
          body.preferredSlot === '10:00 AM' &&
          typeof body.requestedOn === 'string' &&
          body.requestedOn.length === 10,
        JSON.stringify(body),
      );
    } else {
      skipCheck(10, 'An employer reads back their own latest request', 'no database access');
    }

    // --- rate limit ----------------------------------------------------------
    const limited = await call(baseUrl, '/api/auth/signup', { body: talentBody(LIMIT_EMAIL) });
    const limitedCookie = limited.cookie;
    const statuses = [];
    let refusal = null;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const response = await call(baseUrl, '/api/talent/profile', {
        body: { availability: 'available_now' },
        cookie: limitedCookie,
      });
      statuses.push(response.status);
      if (response.status === 429) {
        refusal = response;
        break;
      }
    }
    check(
      11,
      'Saving a profile is rate limited, and the refusal says how long to wait',
      statuses.filter((status) => status === 200).length === 30 &&
        refusal?.json?.code === 'rate_limited' &&
        Number(refusal?.response.headers.get('retry-after')) > 0,
      `${statuses.filter((status) => status === 200).length} saved, then ${refusal?.status}`,
    );
  } finally {
    await cleanupLocal(sql);
    if (server) await server.close();
  }

  const skipped = results.filter((result) => result.skipped).length;
  const passed = results.length - failures - skipped;
  console.log(`\n${passed}/${results.length} checks passed${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
  if (failures > 0) {
    console.log('\nFailing checks:');
    for (const result of results.filter((entry) => !entry.passed)) {
      console.log(`  ${result.number}. ${result.description} (${result.detail})`);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
}

await main();
