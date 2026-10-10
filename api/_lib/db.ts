import { neon } from '@neondatabase/serverless';

/**
 * Every statement in the app lives in this module. User input is only ever sent
 * as a bind parameter, never interpolated into SQL text, and table or column
 * names are chosen here on the server rather than taken from a request.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Run `vercel env pull .env.development.local` before starting.',
  );
}

const sql = neon(connectionString);

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = await sql.query(text, params);
  return rows as T[];
}

export async function queryOne<T>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export type Role = 'talent' | 'employer';

export type UserRow = {
  id: string;
  email: string;
  role: Role;
  password_hash: string;
  email_verified: boolean;
  token_version: number;
};

export type SessionUserRow = Omit<UserRow, 'password_hash'>;

const USER_COLUMNS = 'id, email, role, password_hash, email_verified, token_version';
const SESSION_USER_COLUMNS = 'id, email, role, email_verified, token_version';

export async function createTalentUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  field: string;
  country: string | null;
  availability: string | null;
}): Promise<{ id: string; role: Role } | null> {
  // One statement, so a user row can never exist without its profile row.
  const row = await queryOne<{ id: string }>(
    `WITH new_user AS (
       INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'talent')
       RETURNING id
     )
     INSERT INTO talent_profiles (user_id, name, field, country, availability)
     SELECT id, $3, $4, $5, $6 FROM new_user
     RETURNING user_id AS id`,
    [input.email, input.passwordHash, input.name, input.field, input.country, input.availability],
  );
  return row ? { id: row.id, role: 'talent' } : null;
}

export async function createEmployerUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  company: string;
  needs: string[];
}): Promise<{ id: string; role: Role } | null> {
  const row = await queryOne<{ id: string }>(
    `WITH new_user AS (
       INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'employer')
       RETURNING id
     )
     INSERT INTO employer_profiles (user_id, name, company, needs)
     SELECT id, $3, $4, $5 FROM new_user
     RETURNING user_id AS id`,
    [input.email, input.passwordHash, input.name, input.company, input.needs],
  );
  return row ? { id: row.id, role: 'employer' } : null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
}

export async function findSessionUserById(id: string): Promise<SessionUserRow | null> {
  return queryOne<SessionUserRow>(
    `SELECT ${SESSION_USER_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );
}

/**
 * The session-safe view of one account by id, for checks that need to know a
 * fact about the account rather than act on it - whether an email was already
 * verified, say - without ever reading the password hash.
 */
export async function findUserById(id: string): Promise<SessionUserRow | null> {
  return findSessionUserById(id);
}

export async function deleteUser(id: string): Promise<void> {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

export async function markEmailVerified(id: string): Promise<void> {
  await query('UPDATE users SET email_verified = true WHERE id = $1', [id]);
}

/**
 * Ends every session for this account, including the current one. Used by "log
 * out everywhere" and by the password reset flow.
 */
export async function bumpTokenVersion(id: string): Promise<void> {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
}

/** Bumping token_version invalidates every session issued before it. */
export async function setPassword(id: string, passwordHash: string): Promise<void> {
  await query(
    'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1',
    [id, passwordHash],
  );
}

export type TalentProfile = {
  name: string;
  field: string;
  country: string | null;
  availability: string | null;
};

export type EmployerProfile = {
  name: string;
  company: string;
  needs: string[];
};

export async function getTalentProfile(userId: string): Promise<TalentProfile | null> {
  return queryOne<TalentProfile>(
    'SELECT name, field, country, availability FROM talent_profiles WHERE user_id = $1',
    [userId],
  );
}

export async function getEmployerProfile(userId: string): Promise<EmployerProfile | null> {
  return queryOne<EmployerProfile>(
    'SELECT name, company, needs FROM employer_profiles WHERE user_id = $1',
    [userId],
  );
}

/**
 * Saves the two talent fields the dashboard owns. Each column is written only
 * when the caller supplied it, so changing availability cannot blank a country
 * the talent set earlier, and an undefined value is not the same instruction as
 * an empty one: an empty country clears the column (see talentProfileSchema).
 * The user id always comes from the session, never from a request body. Returns
 * the row as it now stands, or null when the account has no talent profile.
 */
export async function updateTalentProfile(input: {
  userId: string;
  availability?: string;
  country?: string;
}): Promise<TalentProfile | null> {
  return queryOne<TalentProfile>(
    `UPDATE talent_profiles
        SET availability = CASE WHEN $2::boolean THEN $3 ELSE availability END,
            country = CASE WHEN $4::boolean THEN $5 ELSE country END
      WHERE user_id = $1
      RETURNING name, field, country, availability`,
    [
      input.userId,
      input.availability !== undefined,
      input.availability ?? null,
      input.country !== undefined,
      input.country ? input.country : null,
    ],
  );
}

export type TokenType = 'verify' | 'reset';

export async function insertAuthToken(input: {
  userId: string;
  type: TokenType;
  tokenHash: string;
  ttlSeconds: number;
}): Promise<void> {
  await query(
    `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [input.userId, input.type, input.tokenHash, input.ttlSeconds],
  );
}

/**
 * Marks a token used and returns its owner, in a single statement, so a token
 * cannot be redeemed twice even if two requests arrive at the same moment.
 */
export async function consumeAuthToken(tokenHash: string, type: TokenType): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE auth_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND type = $2
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id`,
    [tokenHash, type],
  );
  return row?.user_id ?? null;
}

/**
 * The owner of a token that has already been redeemed. A link works once, but
 * the person holding it deserves to be told "this was already done" rather
 * than "expired", and only the stored hash is needed to recognise their link.
 */
export async function findSpentAuthToken(
  tokenHash: string,
  type: TokenType,
): Promise<{ userId: string } | null> {
  const row = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM auth_tokens WHERE token_hash = $1 AND type = $2 AND used_at IS NOT NULL',
    [tokenHash, type],
  );
  return row ? { userId: row.user_id } : null;
}

export async function logAuthEvent(input: {
  userId: string | null;
  event: string;
  ipHash: string | null;
}): Promise<void> {
  await query('INSERT INTO auth_events (user_id, event, ip_hash) VALUES ($1, $2, $3)', [
    input.userId,
    input.event,
    input.ipHash,
  ]);
}

export type NewsletterStatus = 'pending' | 'confirmed' | 'unsubscribed';

export type LeadContact = {
  name: string;
  email: string;
  phone: string | null;
  organisation: string;
};

/**
 * A stored lead. The id comes back so the notification email can name the row
 * the team will find, and so a caller can tell a write from a no-op.
 */
export async function insertEventRegistration(
  input: LeadContact & {
    eventSlug: string;
    role: string | null;
    question: string | null;
  },
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO event_registrations (event_slug, name, email, phone, organisation, role, question)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.eventSlug,
      input.name,
      input.email,
      input.phone,
      input.organisation,
      input.role,
      input.question,
    ],
  );
  return row?.id ?? null;
}

export async function insertConsultationBooking(
  input: LeadContact & {
    teamSize: string | null;
    service: string | null;
    meetingFormat: string;
    preferredDate: string;
    preferredSlot: string;
    notes: string | null;
  },
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO consultation_bookings
       (name, email, phone, organisation, team_size, service, meeting_format,
        preferred_date, preferred_slot, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      input.name,
      input.email,
      input.phone,
      input.organisation,
      input.teamSize,
      input.service,
      input.meetingFormat,
      input.preferredDate,
      input.preferredSlot,
      input.notes,
    ],
  );
  return row?.id ?? null;
}

/**
 * The signed in employer's own most recent consultation request.
 *
 * Matched on the address the account signed up with, so a caller cannot name a
 * row: the only input is the session's own email. There is no status column on
 * consultation_bookings and nothing here reads the team's diary, so the caller
 * presents this as a request the team confirms by email, never as a booked
 * meeting. The date is formatted in SQL so it arrives as a plain calendar day
 * rather than as a driver-specific Date.
 */
const CONSULTATION_SUMMARY = `SELECT organisation,
         meeting_format,
         to_char(preferred_date, 'YYYY-MM-DD') AS preferred_date,
         preferred_slot,
         to_char(created_at, 'YYYY-MM-DD') AS requested_on`;

export type ConsultationRequestRow = {
  organisation: string;
  meeting_format: string;
  preferred_date: string;
  preferred_slot: string;
  requested_on: string;
};

export async function findLatestConsultationByEmail(
  email: string,
): Promise<ConsultationRequestRow | null> {
  return queryOne<ConsultationRequestRow>(
    `${CONSULTATION_SUMMARY}
       FROM consultation_bookings
      WHERE email = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [email],
  );
}

export async function insertEnquiry(input: {
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  source: string;
}): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO enquiries (name, email, phone, subject, message, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.name, input.email, input.phone, input.subject, input.message, input.source],
  );
  return row?.id ?? null;
}

/**
 * Adds an address to the list, or refreshes its confirmation link when the row
 * has not been confirmed yet. A confirmed row is left alone and no row comes
 * back, which is the signal not to send another confirmation email. One
 * statement, so two simultaneous signups cannot create two rows for one address
 * and the returned row is always the one that was actually written.
 */
export async function upsertNewsletterSubscriber(input: {
  email: string;
  tokenHash: string;
  ttlSeconds: number;
}): Promise<{ status: NewsletterStatus } | null> {
  return queryOne<{ status: NewsletterStatus }>(
    `INSERT INTO newsletter_subscribers (email, status, confirm_token_hash, confirm_expires_at)
     VALUES ($1, 'pending', $2, now() + make_interval(secs => $3))
     ON CONFLICT (email) DO UPDATE
       SET status = 'pending',
           confirm_token_hash = EXCLUDED.confirm_token_hash,
           confirm_expires_at = EXCLUDED.confirm_expires_at
       WHERE newsletter_subscribers.status <> 'confirmed'
     RETURNING status`,
    [input.email, input.tokenHash, input.ttlSeconds],
  );
}

/**
 * The subscription a confirmation link belongs to, whatever its state. The link
 * itself is never stored - only this hash - so answering a replayed link needs
 * the hash to still be here after success.
 */
export async function findNewsletterSubscriberByTokenHash(
  tokenHash: string,
): Promise<{ email: string; status: NewsletterStatus } | null> {
  return queryOne<{ email: string; status: NewsletterStatus }>(
    'SELECT email, status FROM newsletter_subscribers WHERE confirm_token_hash = $1',
    [tokenHash],
  );
}

/**
 * The state of one address, for telling a confirmed subscriber that they are
 * already on the list instead of sending them into a confirmation loop.
 */
export async function findNewsletterSubscriberByEmail(
  email: string,
): Promise<{ status: NewsletterStatus } | null> {
  return queryOne<{ status: NewsletterStatus }>(
    'SELECT status FROM newsletter_subscribers WHERE email = $1',
    [email],
  );
}

/**
 * Turns a pending subscription into a confirmed one. Single statement, so a
 * link cannot be redeemed twice even if two requests arrive at the same moment,
 * and an expired link confirms nothing. The link's hash is deliberately kept
 * rather than cleared: it is one-way, and a row that still carries it is how a
 * replayed link is answered with "already confirmed" instead of an error.
 */
export async function confirmNewsletterSubscriber(tokenHash: string): Promise<string | null> {
  const row = await queryOne<{ email: string }>(
    `UPDATE newsletter_subscribers
        SET status = 'confirmed',
            confirmed_at = now(),
            confirm_expires_at = NULL
      WHERE confirm_token_hash = $1
        AND status = 'pending'
        AND confirm_expires_at > now()
      RETURNING email`,
    [tokenHash],
  );
  return row?.email ?? null;
}
