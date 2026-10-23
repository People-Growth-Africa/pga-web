/**
 * Auth test suite. Checks the thirteen behaviours the brief calls out, over
 * real HTTP against real endpoints and a real database.
 *
 *   npm run test:auth                          # local: needs DATABASE_URL
 *   npm run test:auth -- --base-url=https://x # against a deployment
 *
 * A local run needs DATABASE_URL (and DATABASE_URL_UNPOOLED for clean up) in
 * .env.development.local, .env.local or .env. JWT_SECRET is only needed to check
 * that forged cookies are refused; a temporary one is generated if it is absent.
 * Test rows are created with an obvious prefix and removed at the end.
 */
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { loadEnvFiles, startApiServer } from './api-server.mjs';
import { checkApiImports } from './check-api-imports.mjs';

const EMAIL_PREFIX = `test-auth-${Date.now().toString(36)}`;
const TALENT_EMAIL = `${EMAIL_PREFIX}-talent@example.com`;
const EMPLOYER_EMAIL = `${EMAIL_PREFIX}-employer@example.com`;
const RESET_EMAIL = `${EMAIL_PREFIX}-reset@example.com`;
const GOOD_PASSWORD = 'Quiet-Harbour-7712';
const NEW_PASSWORD = 'Longer-Table-9931';

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed, detail });
  if (!passed) failures += 1;
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${String(number).padStart(2)}. ${description}${detail ? ` (${detail})` : ''}`);
}

/**
 * For the checks that need something the runner cannot obtain on its own, for
 * example the reset link when the suite runs against a deployment and the link
 * only reaches that deployment's logs. Reported as skipped, with the reason and
 * the flag that supplies it, so it never reads as a pass or a failure.
 */
function skipCheck(number, description, reason) {
  results.push({ number, description, passed: true, skipped: true, detail: reason });
  console.log(`SKIP  ${String(number).padStart(2)}. ${description} (${reason})`);
}

// --- email capture -----------------------------------------------------------
// Without RESEND_API_KEY the emails are printed instead of sent, which is how
// this script recovers the verification and reset links.
const logged = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  logged.push(args.map((value) => String(value)).join(' '));
};

function linksSince(mark, pattern) {
  const text = logged.slice(mark).join('\n');
  // matchAll needs the global flag, so callers pass a /g pattern.
  return [...text.matchAll(pattern)].map((match) => match[1]);
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
  name: 'Ada Test',
  email,
  password: GOOD_PASSWORD,
  // One of the values the signup form's field list offers, so this stays a
  // realistic payload if the API ever starts checking that list.
  field: 'IT & Software',
  country: 'Nigeria',
  availability: 'available_now',
  acceptedTerms: true,
});

const employerBody = () => ({
  role: 'employer',
  name: 'Chidi Test',
  company: 'Test Works Ltd',
  email: EMPLOYER_EMAIL,
  password: GOOD_PASSWORD,
  needs: ['find_talent'],
  acceptedTerms: true,
});

async function cleanupLocal() {
  const connection = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connection) return;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connection);
  await sql.query('DELETE FROM users WHERE email LIKE $1', [`${EMAIL_PREFIX}%`]);
  originalWarn.call(console, `Cleaned up test rows for ${EMAIL_PREFIX}`);
}

async function cleanupRemote(baseUrl, accounts) {
  for (const account of accounts) {
    if (!account.cookie) continue;
    await call(baseUrl, '/api/auth/account', {
      method: 'DELETE',
      body: { password: account.password },
      cookie: account.cookie,
    });
  }
}

async function main() {
  const baseUrlArg = process.argv.find((argument) => argument.startsWith('--base-url='));
  const configuredBaseUrl = baseUrlArg?.split('=')[1] ?? process.env.AUTH_TEST_BASE_URL;
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
          '  npm run test:auth -- --base-url=https://your-preview.vercel.app',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
    // Every run gets its own rate limit counters, so a previous run cannot make
    // this one hit a 429.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }

  // Every route in api/ has to import cleanly as a native ES module before any
  // request is worth making: the deployment runs them that way, and a missing
  // file extension takes out all of them at once. Stopping here beats watching
  // it surface as sixteen unrelated HTTP failures.
  const imports = await checkApiImports({ quiet: true });
  if (!imports.ok) {
    console.error(`\n${imports.summary}\n\nRun \`node scripts/check-api-imports.mjs\` for the details.\n`);
    process.exit(1);
  }

  const server = isLocal ? await startApiServer({ quiet: true }) : null;
  const baseUrl = configuredBaseUrl ?? server.origin;
  const created = [];
  console.log(`\nTesting ${baseUrl} as ${EMAIL_PREFIX}\n`);

  try {
    // 1. Talent signup succeeds and sets a cookie.
    const talent = await call(baseUrl, '/api/auth/signup', { body: talentBody() });
    const talentCookie = talent.cookie;
    const talentMe = talentCookie
      ? await call(baseUrl, '/api/auth/me', { method: 'GET', cookie: talentCookie })
      : { status: 0, json: null };
    check(
      1,
      'Talent signup succeeds and sets a session cookie',
      talent.status === 201 && Boolean(talentCookie) && talentMe.json?.user?.role === 'talent',
      `signup ${talent.status}, cookie ${talentCookie ? 'set' : 'missing'}, me ${talentMe.status}`,
    );
    if (talentCookie) created.push({ cookie: talentCookie, password: GOOD_PASSWORD });
    check(
      1.1,
      'The session cookie is httpOnly and SameSite=Strict',
      (talent.response.headers.getSetCookie?.() ?? []).some(
        (header) => header.includes('HttpOnly') && header.includes('SameSite=Strict'),
      ),
    );

    // 2. Employer signup succeeds.
    const employer = await call(baseUrl, '/api/auth/signup', { body: employerBody() });
    const employerCookie = employer.cookie;
    const employerMe = employerCookie
      ? await call(baseUrl, '/api/auth/me', { method: 'GET', cookie: employerCookie })
      : { status: 0, json: null };
    check(
      2,
      'Employer signup succeeds with an employer session',
      employer.status === 201 && employerMe.json?.user?.role === 'employer',
      `signup ${employer.status}, me ${employerMe.status}`,
    );
    if (employerCookie) created.push({ cookie: employerCookie, password: GOOD_PASSWORD });

    // 3. Duplicate email returns 409.
    const duplicate = await call(baseUrl, '/api/auth/signup', { body: talentBody() });
    check(
      3,
      'Duplicate email returns 409',
      duplicate.status === 409,
      `status ${duplicate.status}, code ${duplicate.json?.code}`,
    );

    // 4. Wrong password and unknown email are indistinguishable.
    const wrongPassword = await call(baseUrl, '/api/auth/login', {
      body: { email: TALENT_EMAIL, password: 'Not-The-Password-1' },
    });
    const unknownEmail = await call(baseUrl, '/api/auth/login', {
      body: { email: `${EMAIL_PREFIX}-nobody@example.com`, password: GOOD_PASSWORD },
    });
    check(
      4,
      'Wrong password and unknown email return the identical 401',
      wrongPassword.status === 401 &&
        unknownEmail.status === 401 &&
        wrongPassword.json?.error === unknownEmail.json?.error &&
        wrongPassword.json?.error === 'Email or password is incorrect.',
      `${wrongPassword.status}/${unknownEmail.status}, "${wrongPassword.json?.error}"`,
    );

    // 4b. A verification link clicked twice is told as success the second time:
    //     the account was already verified, which is what the visitor wanted.
    //     The "used or expired" error this replaced sent people chasing a resend
    //     that never arrived (verified addresses get no resend at all).
    const markVerify = logged.length;
    const verifyEmail = `${EMAIL_PREFIX}-verify@example.com`;
    await call(baseUrl, '/api/auth/signup', { body: talentBody(verifyEmail) });
    const verifyToken =
      linksSince(markVerify, /auth\/verify\?token=([A-Za-z0-9_-]+)/g).at(-1) ?? null;
    if (verifyToken) {
      const firstClick = await call(baseUrl, '/api/auth/verify-email', { body: { token: verifyToken } });
      const secondClick = await call(baseUrl, '/api/auth/verify-email', { body: { token: verifyToken } });
      const me = await call(baseUrl, '/api/auth/login', {
        body: { email: verifyEmail, password: GOOD_PASSWORD },
      });
      const meIsVerified = me.cookie
        ? (await call(baseUrl, '/api/auth/me', { method: 'GET', cookie: me.cookie })).json?.user?.emailVerified
        : null;
      check(
        4.1,
        'A verification link works once, and clicking it again answers already-confirmed',
        firstClick.status === 200 &&
          firstClick.json?.ok === true &&
          secondClick.status === 200 &&
          secondClick.json?.already === true &&
          meIsVerified === true,
        `first ${firstClick.status}, replay ${secondClick.status} (already ${secondClick.json?.already}), verified ${meIsVerified}`,
      );
    } else {
      skipCheck(
        4.1,
        'A verification link works once, and clicking it again answers already-confirmed',
        'no verification link captured; run locally where the link is printed',
      );
    }

    // 5. Any role other than talent or employer is refused.
    const admin = await call(baseUrl, '/api/auth/signup', {
      body: { ...talentBody(`${EMAIL_PREFIX}-admin@example.com`), role: 'admin' },
    });
    check(5, 'Signup with role "admin" returns 400', admin.status === 400, `status ${admin.status}`);

    // 6. Short passwords are refused.
    const short = await call(baseUrl, '/api/auth/signup', {
      body: { ...talentBody(`${EMAIL_PREFIX}-short@example.com`), password: 'short1' },
    });
    check(
      6,
      'Password shorter than 8 characters returns 400',
      short.status === 400 && Boolean(short.json?.fields?.password),
      `status ${short.status}`,
    );

    // 7. A protected endpoint without a cookie is refused. The client side guard
    //    that sends the visitor to /auth#login is checked in the browser.
    const anonymous = await call(baseUrl, '/api/auth/me', { method: 'GET' });
    check(
      7,
      '/api/auth/me without a cookie returns 401',
      anonymous.status === 401,
      `status ${anonymous.status}`,
    );

    // 8. A talent session cannot reach employer data. The route guard is client
    //    side, so what the server can enforce is the role in the session.
    const talentProfile = talentMe.json?.user?.profile ?? {};
    check(
      8,
      'A talent session reports the talent role and never employer fields',
      talentMe.json?.user?.role === 'talent' &&
        'field' in talentProfile &&
        !('company' in talentProfile),
      `role ${talentMe.json?.user?.role}, keys ${Object.keys(talentProfile).join(',')}`,
    );

    // 9. Logout clears the session cookie. Sessions are self contained JWTs, so
    //    what logout can end is the browser's copy: the response must expire it.
    //    A token copied out of the cookie beforehand stays valid until it expires,
    //    which is why reset and log out on all devices bump token_version instead.
    const logout = await call(baseUrl, '/api/auth/logout', { body: {}, cookie: talentCookie });
    const clearedCookies = logout.response.headers.getSetCookie?.() ?? [];
    const cleared = clearedCookies.some(
      (header) => /(^|;\s)session=;/.test(header) && header.includes('Max-Age=0'),
    );
    const withoutCookie = await call(baseUrl, '/api/auth/me', { method: 'GET' });
    check(
      9,
      'Logout expires the session cookie and an anonymous request is refused',
      logout.status === 200 && cleared && withoutCookie.status === 401,
      `logout ${logout.status}, cookie ${cleared ? 'expired' : 'NOT expired'}, without cookie ${withoutCookie.status}`,
    );

    // 10. Unknown keys are rejected rather than ignored.
    const extraField = await call(baseUrl, '/api/auth/signup', {
      body: { ...talentBody(`${EMAIL_PREFIX}-extra@example.com`), isAdmin: true },
    });
    check(
      10,
      'Signup with an unknown field returns 400',
      extraField.status === 400 && extraField.json?.code === 'validation_failed',
      `status ${extraField.status}, code ${extraField.json?.code}`,
    );

    // 11. A state changing request from another origin is refused.
    const foreignOrigin = await call(baseUrl, '/api/auth/login', {
      body: { email: TALENT_EMAIL, password: GOOD_PASSWORD },
      headers: { Origin: 'https://evil.example' },
    });
    check(
      11,
      'A request with a foreign Origin header is rejected',
      foreignOrigin.status === 403,
      `status ${foreignOrigin.status}`,
    );

    // 12. Forged, expired and unsigned tokens are all refused.
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'local-test-secret-value');
    const userId = talentMe.json?.user?.id ?? '00000000-0000-0000-0000-000000000000';
    const claims = { role: 'talent', ver: 0 };
    const base = () =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setIssuer('peoplegrowthafrica.com')
        .setAudience('pga-auth');

    const wrongSecret = await base()
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(randomBytes(32).toString('hex')));
    const now = Math.floor(Date.now() / 1000);
    const expired = await base()
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(secret);
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: userId, role: 'talent', ver: 0, iss: 'peoplegrowthafrica.com', aud: 'pga-auth' }),
    ).toString('base64url')}.`;

    const forgedStatuses = [];
    for (const token of [wrongSecret, expired, unsigned]) {
      const attempt = await call(baseUrl, '/api/auth/me', {
        method: 'GET',
        cookie: `session=${token}`,
      });
      forgedStatuses.push(attempt.status);
    }
    check(
      12,
      'A forged, an expired and an unsigned token are all rejected',
      forgedStatuses.every((status) => status === 401),
      `statuses ${forgedStatuses.join('/')}`,
    );

    // 13. A reset ends sessions that were issued before it.
    const resetSignup = await call(baseUrl, '/api/auth/signup', {
      body: talentBody(RESET_EMAIL),
    });
    const staleCookie = resetSignup.cookie;
    if (staleCookie) created.push({ cookie: staleCookie, password: NEW_PASSWORD });

    const mark = logged.length;
    const forgot = await call(baseUrl, '/api/auth/forgot-password', { body: { email: RESET_EMAIL } });
    // Locally the link is printed, so it can be read straight out of the log.
    // Against a deployment it goes to that deployment's logs instead, and the
    // caller can paste it in with --reset-link.
    const suppliedLink =
      process.argv.find((argument) => argument.startsWith('--reset-link='))?.split('=')[1] ??
      process.env.AUTH_TEST_RESET_LINK;
    const resetToken =
      linksSince(mark, /forgot-password\?token=([A-Za-z0-9_-]+)/g).at(-1) ??
      (suppliedLink ? new URL(suppliedLink).searchParams.get('token') : null);
    const reset = resetToken
      ? await call(baseUrl, '/api/auth/reset-password', {
          body: { token: resetToken, password: NEW_PASSWORD },
        })
      : { status: 0, json: null };
    const stale = staleCookie
      ? await call(baseUrl, '/api/auth/me', { method: 'GET', cookie: staleCookie })
      : { status: 0 };
    const oldPassword = await call(baseUrl, '/api/auth/login', {
      body: { email: RESET_EMAIL, password: GOOD_PASSWORD },
    });
    const newPassword = await call(baseUrl, '/api/auth/login', {
      body: { email: RESET_EMAIL, password: NEW_PASSWORD },
    });
    if (newPassword.cookie) created.push({ cookie: newPassword.cookie, password: NEW_PASSWORD });

    if (resetToken) {
      check(
        13,
        'After a password reset the old session and the old password both fail, the new password works',
        reset.status === 200 &&
          stale.status === 401 &&
          oldPassword.status === 401 &&
          newPassword.status === 200,
        `forgot ${forgot.status}, reset ${reset.status}, stale session ${stale.status}, old ${oldPassword.status}, new ${newPassword.status}`,
      );
    } else {
      skipCheck(
        13,
        'After a password reset the old session and the old password both fail',
        'no reset link captured; pass --reset-link=<full url>, or run locally where the link is printed',
      );
    }

    // Extras: the two remaining behaviours the brief lists in other steps.
    const anonymousForgot = await call(baseUrl, '/api/auth/forgot-password', {
      body: { email: `${EMAIL_PREFIX}-nobody@example.com` },
    });
    check(
      14,
      'Forgot password answers the same for an unknown email',
      anonymousForgot.status === 200 && anonymousForgot.json?.ok === true,
      `status ${anonymousForgot.status}`,
    );

    const deleteWrongPassword = resetSignup.cookie
      ? await call(baseUrl, '/api/auth/account', {
          method: 'DELETE',
          body: { password: 'Not-The-Password-1' },
          cookie: staleCookie,
        })
      : { status: 0 };
    check(
      15,
      'Deleting an account requires the current password',
      deleteWrongPassword.status === 401,
      `status ${deleteWrongPassword.status}`,
    );

    // Every route answers through one catch-all function, so a path with no
    // handler has to say so in JSON. Falling through to the SPA rewrite would
    // hand back the home page with a 200 and hide a typo in a client call.
    const unknown = await call(baseUrl, '/api/auth/nonexistent', { method: 'GET' });
    check(
      16,
      'An unknown API path answers with a JSON 404, not the SPA page',
      unknown.status === 404 && unknown.json?.code === 'not_found',
      `status ${unknown.status}, code ${unknown.json?.code ?? 'none'}`,
    );
  } finally {
    console.warn = originalWarn;
    if (isLocal) await cleanupLocal();
    else await cleanupRemote(baseUrl, created);
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
