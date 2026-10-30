/**
 * Role-boundary suite for the two staff portals.
 *
 *   npm run test:roles
 *
 * The split only counts if the server enforces it, so this drives the real
 * endpoints over HTTP against the real database:
 *
 *   - each door refuses the other portal's roles, and issues only its own cookie;
 *   - a content manager can reach the content tools and nothing else;
 *   - a project or HR manager can read the dashboard and data lists but not edit
 *     content or manage staff;
 *   - an administrator can do both jobs, using the administrator cookie;
 *   - only the super administrator may read the staff list, invite, disable or
 *     edit staff accounts;
 *   - one portal's token cannot be replayed at the other portal.
 *
 * Test accounts carry an obvious prefix and are removed at the end.
 */
import { createHash } from 'node:crypto';
import { loadEnvFiles, startApiServer } from './api-server.mjs';

const EMAIL_PREFIX = `test-roles-${Date.now().toString(36)}`;
const PASSWORD = 'Quiet-Harbour-7712';

const STAFF = {
  admin: `${EMAIL_PREFIX}-admin@example.com`,
  otherAdmin: `${EMAIL_PREFIX}-admin2@example.com`,
  project: `${EMAIL_PREFIX}-project@example.com`,
  hr: `${EMAIL_PREFIX}-hr@example.com`,
  content: `${EMAIL_PREFIX}-content@example.com`,
};

const results = [];
let failures = 0;

function check(number, description, passed, detail = '') {
  results.push({ number, description, passed });
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${number}. ${description}${detail ? ` (${detail})` : ''}`);
}

function cookieValue(setCookies, name) {
  for (const header of setCookies) {
    const pair = header.split(';')[0];
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator) !== name) continue;
    return pair.slice(separator + 1);
  }
  return '';
}

function sessionCookies(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  return {
    setCookies,
    admin: cookieValue(setCookies, 'pga_admin_session'),
    content: cookieValue(setCookies, 'pga_content_session'),
    public: cookieValue(setCookies, 'session'),
  };
}

async function call(baseUrl, path, options = {}) {
  const { method = 'GET', body, cookie } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: baseUrl,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'manual',
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text, ...sessionCookies(response) };
}

async function main() {
  loadEnvFiles({ quiet: true });
  if (!process.env.DATABASE_URL) {
    console.error('\nDATABASE_URL is not set, so the suite cannot start.\n');
    process.exit(1);
  }
  process.env.AUTH_ENABLED = 'true';
  // The suite's own administrator plays the super administrator, so the test
  // does not depend on the real seeded address existing in this database.
  process.env.SUPER_ADMIN_EMAIL = STAFF.admin;
  process.env.JWT_SECRET ??= 'test-roles-secret-that-is-long-enough-0123456789';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
  const bcrypt = (await import('bcryptjs')).default;

  const accounts = Object.entries(STAFF);
  const roles = {
    admin: 'admin',
    otherAdmin: 'admin',
    project: 'project_manager',
    hr: 'hr_manager',
    content: 'content_manager',
  };

  const ids = [];
  for (const [key, email] of accounts) {
    const preHashed = createHash('sha256').update(PASSWORD, 'utf8').digest('base64');
    const passwordHash = await bcrypt.hash(preHashed, 12);
    const result = await sql.transaction([
      sql`SELECT set_config('pga.staff_write', 'on', true)`,
      sql`INSERT INTO users (name, email, password_hash, role, email_verified, must_change_password)
          VALUES (${`Role test ${key}`}, ${email}, ${passwordHash}, ${roles[key]}, true, false)
          RETURNING id`,
    ]);
    const row = result[1]?.[0];
    if (row?.id) ids.push(row.id);
  }

  let server;
  try {
    server = await startApiServer({ quiet: true });
    const baseUrl = server.origin;

    // --- The two doors -----------------------------------------------------
    const adminLogin = await call(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { email: STAFF.admin, password: PASSWORD },
    });
    check(
      1,
      'An administrator signs in at /api/admin/login and receives only the administrator cookie',
      adminLogin.status === 200 &&
        adminLogin.json?.user?.role === 'admin' &&
        Boolean(adminLogin.admin) &&
        adminLogin.content === '' &&
        adminLogin.public === '',
      `${adminLogin.status}, cookies ${adminLogin.setCookies.length}`,
    );

    const contentLogin = await call(baseUrl, '/api/content/login', {
      method: 'POST',
      body: { email: STAFF.content, password: PASSWORD },
    });
    check(
      2,
      'A content manager signs in at /api/content/login and receives only the content cookie',
      contentLogin.status === 200 &&
        contentLogin.json?.user?.role === 'content_manager' &&
        Boolean(contentLogin.content) &&
        contentLogin.admin === '' &&
        contentLogin.public === '',
      `${contentLogin.status}, redirect ${contentLogin.json?.redirect}`,
    );

    const contentAtAdminDoor = await call(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { email: STAFF.content, password: PASSWORD },
    });
    check(
      3,
      'The administrator door refuses a content manager with the generic message',
      contentAtAdminDoor.status === 401 &&
        contentAtAdminDoor.json?.code === 'invalid_credentials' &&
        contentAtAdminDoor.admin === '',
      `${contentAtAdminDoor.status}`,
    );

    const projectAtContentDoor = await call(baseUrl, '/api/content/login', {
      method: 'POST',
      body: { email: STAFF.project, password: PASSWORD },
    });
    check(
      4,
      'The content door refuses a project manager with the generic message',
      projectAtContentDoor.status === 401 &&
        projectAtContentDoor.json?.code === 'invalid_credentials' &&
        projectAtContentDoor.content === '',
      `${projectAtContentDoor.status}`,
    );

    const staffAtPublicDoor = await call(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: STAFF.admin, password: PASSWORD },
    });
    const contentAtPublicDoor = await call(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: STAFF.content, password: PASSWORD },
    });
    check(
      5,
      'The public sign-in refuses every staff role with the generic message and no cookie',
      staffAtPublicDoor.status === 401 &&
        contentAtPublicDoor.status === 401 &&
        staffAtPublicDoor.json?.code === 'invalid_credentials' &&
        contentAtPublicDoor.json?.code === 'invalid_credentials' &&
        staffAtPublicDoor.admin === '' &&
        staffAtPublicDoor.content === '' &&
        staffAtPublicDoor.public === '' &&
        contentAtPublicDoor.admin === '' &&
        contentAtPublicDoor.content === '' &&
        contentAtPublicDoor.public === '',
      `${staffAtPublicDoor.status}/${contentAtPublicDoor.status}`,
    );

    // --- What each cookie opens --------------------------------------------
    const contentMe = await call(baseUrl, '/api/auth/me', {
      cookie: `pga_content_session=${contentLogin.content}`,
    });
    check(
      6,
      'The content cookie authenticates /api/auth/me as the content manager',
      contentMe.status === 200 && contentMe.json?.user?.role === 'content_manager',
      `${contentMe.status}`,
    );

    const contentPosts = await call(baseUrl, '/api/content/posts', {
      cookie: `pga_content_session=${contentLogin.content}`,
    });
    const contentAtAdminPosts = await call(baseUrl, '/api/admin/posts', {
      cookie: `pga_content_session=${contentLogin.content}`,
    });
    check(
      7,
      'A content manager can open the content desk and is refused by the admin ones',
      contentPosts.status === 200 &&
        Array.isArray(contentPosts.json?.posts) &&
        contentAtAdminPosts.status === 403,
      `${contentPosts.status}/${contentAtAdminPosts.status}`,
    );

    const contentData = await call(baseUrl, '/api/admin/data?type=registrations', {
      cookie: `pga_content_session=${contentLogin.content}`,
    });
    const contentStaff = await call(baseUrl, '/api/admin/staff', {
      cookie: `pga_content_session=${contentLogin.content}`,
    });
    const contentStats = await call(baseUrl, '/api/admin/stats', {
      cookie: `pga_content_session=${contentLogin.content}`,
    });
    check(
      8,
      'A content manager cannot read personal data, staff accounts or the dashboard',
      contentData.status === 403 &&
        contentStaff.status === 403 &&
        contentStats.status === 403,
      `${contentData.status}/${contentStaff.status}/${contentStats.status}`,
    );

    const projectLogin = await call(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { email: STAFF.project, password: PASSWORD },
    });
    const projectCookie = `pga_admin_session=${projectLogin.admin}`;

    const projectData = await call(baseUrl, '/api/admin/data?type=registrations', {
      cookie: projectCookie,
    });
    const projectStats = await call(baseUrl, '/api/admin/stats', {
      cookie: projectCookie,
    });
    check(
      9,
      'A project manager can read the dashboard and the data lists through the administrator cookie',
      projectLogin.status === 200 &&
        projectData.status === 200 &&
        projectStats.status === 200,
      `${projectLogin.status}/${projectData.status}/${projectStats.status}`,
    );

    const projectPosts = await call(baseUrl, '/api/admin/posts', {
      cookie: projectCookie,
    });
    const projectStaff = await call(baseUrl, '/api/admin/staff', {
      cookie: projectCookie,
    });
    check(
      10,
      'A project manager cannot edit content or manage staff accounts',
      projectPosts.status === 403 &&
        projectPosts.json?.code === 'admin_only' &&
        projectStaff.status === 403 &&
        projectStaff.json?.code === 'admin_only',
      `${projectPosts.status}/${projectStaff.status}`,
    );

    const adminPosts = await call(baseUrl, '/api/admin/posts', {
      cookie: `pga_admin_session=${adminLogin.admin}`,
    });
    const adminStaff = await call(baseUrl, '/api/admin/staff', {
      cookie: `pga_admin_session=${adminLogin.admin}`,
    });
    check(
      11,
      'An administrator can reach both the content tools and staff management',
      adminPosts.status === 200 && adminStaff.status === 200,
      `${adminPosts.status}/${adminStaff.status}`,
    );

    // A token minted for the content desk must not be accepted as an
    // administrator token, even though it is signed by the same server.
    const replayed = await call(baseUrl, '/api/admin/data?type=registrations', {
      cookie: `pga_admin_session=${contentLogin.content}`,
    });
    check(
      12,
      'A content token replayed in the administrator cookie is refused',
      replayed.status === 401,
      `${replayed.status}`,
    );

    const hrLogin = await call(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { email: STAFF.hr, password: PASSWORD },
    });
    const hrPosts = await call(baseUrl, '/api/admin/posts', {
      cookie: `pga_admin_session=${hrLogin.admin}`,
    });
    check(
      13,
      'An HR manager also cannot edit content',
      hrLogin.status === 200 && hrPosts.status === 403 && hrPosts.json?.code === 'admin_only',
      `${hrLogin.status}/${hrPosts.status}`,
    );

    // --- Only one administrator manages staff accounts ---------------------
    const superAdminStaff = await call(baseUrl, '/api/admin/staff', {
      cookie: `pga_admin_session=${adminLogin.admin}`,
    });
    check(
      14,
      'The super administrator can read the staff list',
      superAdminStaff.status === 200 && Array.isArray(superAdminStaff.json?.staff) && !('canManage' in (superAdminStaff.json ?? {})),
      `${superAdminStaff.status}, staff ${Array.isArray(superAdminStaff.json?.staff) ? superAdminStaff.json.staff.length : 'missing'}`,
    );

    const otherAdminLogin = await call(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { email: STAFF.otherAdmin, password: PASSWORD },
    });
    const otherAdminCookie = `pga_admin_session=${otherAdminLogin.admin}`;
    const otherAdminStaff = await call(baseUrl, '/api/admin/staff', {
      cookie: otherAdminCookie,
    });
    const otherAdminInvite = await call(baseUrl, '/api/admin/staff', {
      method: 'POST',
      cookie: otherAdminCookie,
      body: {
        name: 'Should Not Exist',
        email: `${EMAIL_PREFIX}-nope@example.com`,
        role: 'content_manager',
      },
    });
    const otherAdminDisable = await call(baseUrl, '/api/admin/staff', {
      method: 'PATCH',
      cookie: otherAdminCookie,
      body: { id: ids[0], disabled: true },
    });
    const otherAdminEdit = await call(baseUrl, '/api/admin/staff-detail', {
      method: 'PATCH',
      cookie: otherAdminCookie,
      body: {
        id: ids[0],
        name: 'Renamed By Nobody',
        email: STAFF.project,
        role: 'project_manager',
      },
    });
    check(
      15,
      'A second administrator receives no staff list and cannot invite, disable or edit',
      otherAdminLogin.status === 200 &&
        otherAdminStaff.status === 403 &&
        otherAdminStaff.json?.code === 'super_admin_only' &&
        !Object.prototype.hasOwnProperty.call(otherAdminStaff.json ?? {}, 'staff') &&
        otherAdminInvite.status === 403 &&
        otherAdminInvite.json?.code === 'super_admin_only' &&
        otherAdminDisable.status === 403 &&
        otherAdminEdit.status === 403,
      `${otherAdminStaff.status}/${otherAdminInvite.status}/${otherAdminDisable.status}/${otherAdminEdit.status}`,
    );
  } finally {
    if (ids.length > 0) {
      await sql.query('DELETE FROM users WHERE id = ANY($1)', [ids]).catch(() => {});
    }
    if (server) await server.close();
  }

  console.log(`\n${results.filter((result) => result.passed).length}/${results.length} checks passed`);
  if (failures > 0) {
    console.log('\nFailing checks:');
    for (const result of results.filter((entry) => !entry.passed)) {
      console.log(`  ${result.number}. ${result.description}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
