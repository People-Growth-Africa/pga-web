# Security

This file describes the controls protecting accounts on peoplegrowthafrica.com, how to rotate a
secret, how to inspect the audit log and how to report a problem.

## What is implemented

**Passwords**

- Hashed with bcrypt at cost 12 (roughly 250 ms per check), on top of a SHA-256 base64 digest so
  bcrypt's 72 byte input limit cannot be used to make two long passwords equivalent.
- Checked against the Have I Been Pwned range API using k-anonymity: only the first five characters
  of the SHA-1 hash leave the server. A breached password is refused at signup and at reset. If the
  API is slow or unreachable (1.5 second timeout) the password is allowed through.
- Login answers with one message and one status for an unknown email and a wrong password, and
  spends the same time on both paths so timing cannot reveal which emails are registered.

**Sessions and access**

- A JWT signed with HS256 (jose), with the issuer `peoplegrowthafrica.com` set and checked. The
  algorithm is pinned, so a token claiming `none` or a different algorithm is refused.
- There are three separate cookies and three separate audiences. A token minted for one portal is
  refused by the others even though the same secret signed it, so a content manager session cannot
  be replayed at the administrator API.

  | Portal | Sign-in | Cookie | Audience | Accounts |
  | :--- | :--- | :--- | :--- | :--- |
  | Public | `/auth` | `__Host-session` / `session` | `pga-auth` | talent, employer |
  | Administrator | `/admin/login` | `__Host-pga-admin` / `pga_admin_session` | `pga-admin` | admin, manager, project manager, HR manager |
  | Content desk | `/content/login` | `__Host-pga-content` / `pga_content_session` | `pga-content` | content manager |

- Public sessions last 7 days. Staff sessions have two limits: 30 minutes without an authenticated
  request, sliding on real activity, and a hard 8 hour ceiling per sign-in. Every request re-reads
  the account row, so a disabled, demoted or deleted account stops working immediately, whatever
  its cookie still claims.
- Permissions are checked on the server, not only by hiding pages:

  | Capability | Administrator | Project / HR manager | Content manager |
  | :--- | :---: | :---: | :---: |
  | Dashboard and traffic | yes | yes | no |
  | Registrations and personal data | yes | yes | no |
  | Blog posts, events, categories, uploads | yes | no | yes |
  | Staff accounts and invitations | yes | no | no |

  The content routes accept the content cookie, and also the administrator cookie, because an
  administrator writes content too. They refuse every other portal by reading only the staff
  cookies, and `requireContentManager` still rejects a project or HR manager by role.
- The token carries `token_version`, which is re-checked against the database on every
  authenticated request. Raising the version ends every session at once, which is what password
  reset, "log out on all devices" and ordinary sign-out do.
- The server refuses to start when `JWT_SECRET` is missing or shorter than 32 characters.

**Requests and input**

- Every endpoint validates its body with zod strict schemas: unknown keys are rejected, strings are
  trimmed and length capped, and emails are lowercased. Public sign-up accepts only `talent` or
  `employer`; a staff role can only be created by an administrator, and the database trigger
  refuses a staff row written outside the staff-management path.
- Bodies over 8 KB are refused with 413 before parsing.
- State changing requests must come from the site's own origin (the Origin header is compared with
  the request host), on top of the SameSite cookie.
- SQL is parameterised everywhere (`sql.query(text, params)`); no statement is built by
  concatenating user input. Table and column names are chosen in `api/_lib/db.ts`.
- Redirect targets come from a fixed server side allowlist, so no request value can turn into an
  open redirect.
- User supplied values are rendered as text; nothing uses `dangerouslySetInnerHTML`.

**Abuse and audit**

- Rate limits on signup, login, forgot password, reset password, resend verification, verify email
  and account deletion, counted per IP, per email, per token and per user as appropriate. Upstash
  Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, otherwise a per
  instance counter that logs a warning. A spent budget returns 429 with `Retry-After`.
- Identifiers are pseudonymised before they reach the limiter, so neither Redis nor memory holds a
  raw email address or IP.
- `auth_events` records signup, login success and failure, logout, log out everywhere, password
  reset requested and completed, email verified, verification resent and account deleted, with a
  keyed hash of the IP address instead of the address itself. A refused attempt is recorded as
  `rate_limited:<bucket>`, for example `rate_limited:login-ip`: the per IP buckets carry the same
  keyed hash as the other rows so they line up, and the others carry no address at all because
  their key stands for an email, a token or a user id rather than an IP.
- Passwords, tokens, cookies and request bodies are never logged. Error lines mask anything that
  looks like an email address.

**Headers and transport**

- `vercel.json` sets Strict-Transport-Security (`max-age=63072000; includeSubDomains`),
  X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy
  strict-origin-when-cross-origin and a Permissions-Policy denying camera, microphone, geolocation,
  payment and USB.
- The Content Security Policy currently ships as `Content-Security-Policy-Report-Only`. See the
  limitation below: the site still has one inline script, so an enforcing policy would break it.
- Auth responses set `Cache-Control: no-store` and there is no wildcard CORS: the endpoints are
  same origin only.
- Emails are only sent with `RESEND_API_KEY`; without it the link is printed to the console outside
  production only, never in production.

## Rotating JWT_SECRET

`JWT_SECRET` signs session cookies. Treat it like a password to the whole site.

1. Generate a new value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Update it in the Vercel dashboard for Production, Preview and Development (`npm run setup:auth`
   can add it for Production and Development when the CLI is linked).
3. Redeploy. **Rotating the secret signs every user out immediately**, because no existing cookie
   can be verified any more. Users simply log in again; nothing else is lost.

The same applies to deleting the secret: the endpoints refuse to run without it.

## Switching to a least privilege database role

The migration script creates tables as whatever role `DATABASE_URL_UNPOOLED` points at, which is
usually the Neon owner role. To have the application run as a narrower role:

```sql
CREATE ROLE pga_app LOGIN PASSWORD 'use-a-long-random-password';
GRANT USAGE ON SCHEMA public TO pga_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, talent_profiles, employer_profiles, auth_tokens TO pga_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_events TO pga_app;
GRANT USAGE, SELECT ON SEQUENCE auth_events_id_seq TO pga_app;
```

Then point `DATABASE_URL` (the pooled string only, never `DATABASE_URL_UNPOOLED`) at the new role.
Note that this role cannot run `npm run setup:auth`, which needs DDL rights, so keep the owner
string for migrations. On Neon's free plan, creating an extra role is allowed but the role still
inherits the plan's limits, and pooled connections may require the role to exist on the branch
Neon created for the integration. If the grants above are rejected, stay on the owner role and note
it as a known gap rather than forcing it.

Verify encryption in transit by keeping `sslmode=require` in `DATABASE_URL`; Neon encrypts data at
rest on its side.

## Querying the audit log

Run these in the Neon SQL editor. Nothing in `auth_events` contains a password, a token or a raw IP
address.

Failed sign in attempts in the last 24 hours, grouped by source:

```sql
SELECT ip_hash, count(*) AS attempts, min(created_at) AS first_seen, max(created_at) AS last_seen
FROM auth_events
WHERE event LIKE 'login_failed%' AND created_at > now() - interval '24 hours'
GROUP BY ip_hash
ORDER BY attempts DESC;
```

One account's security history, newest first:

```sql
SELECT created_at, event
FROM auth_events
WHERE user_id = '00000000-0000-0000-0000-000000000000'
ORDER BY created_at DESC
LIMIT 50;
```

## Reporting a vulnerability

Email <hello@peoplegrowthafrica.com> with the steps to reproduce it. Please do not open a public
issue or test against other people's accounts. We will acknowledge within 3 working days and tell
you when a fix ships.

## Known limitations

- The Content Security Policy is report-only until the inline service worker script in `index.html`
  is moved to its own file or given a hash.
- Rate limiting falls back to per instance counters until Upstash credentials exist, which a
  distributed attacker can partly work around.
- Breach checking fails open if Have I Been Pwned is unreachable.
- Password reset requests take marginally longer when the email exists (the reset email is sent
  before responding); the identical response and the 3 per hour per email limit make this
  impractical to use for enumeration.
- Preview deployments share the production database unless a Neon branch is attached, so test
  signups would be real rows.- The staff idle window is measured per request, not per keystroke. The panel sends a keep-alive
  while someone is genuinely typing, but a background tab with no interaction still ages out.

