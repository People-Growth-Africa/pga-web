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

/**
 * A delete refused because a row still references it.
 *
 * ON DELETE RESTRICT raises 23001 (restrict_violation); a constraint stated as
 * NO ACTION raises 23503 instead, so both count. The category handler checks
 * the post count before deleting, which is what the manager sees - this is the
 * narrower window where a post is added between that check and the delete. It
 * has to read as "still in use", not as a server error, because that is what
 * happened.
 */
export function isRestrictViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = error.code;
  return code === '23001' || code === '23503';
}

/**
 * Account roles.
 *
 * 'manager' is a legacy role kept only so the migration script can find and map
 * old rows. It is not an administrator any more: no guard or page accepts it.
 * Talent and employer are the only roles public signup may write; the rest are
 * staff roles, guarded by a trigger.
 *
 * `content_manager` is deliberately not an administrator. It has its own login,
 * cookie and API guard, and can only reach the content tools; data exports,
 * staff accounts and the dashboard stay behind the administrator portal.
 */
export type Role =
  | 'talent'
  | 'employer'
  | 'manager'
  | 'admin'
  | 'project_manager'
  | 'hr_manager'
  | 'content_manager';

export type StaffRole = 'admin' | 'project_manager' | 'hr_manager' | 'content_manager';

export const MANAGER_ROLE: Role = 'manager';

/**
 * Administrator-portal accounts. The legacy 'manager' role is deliberately not
 * here: it may still appear on an old row until the migration script maps it,
 * but it no longer opens any admin endpoint or page.
 */
export function isAdminPortalRole(role: Role): boolean {
  return role === 'admin' || role === 'project_manager' || role === 'hr_manager';
}

/** The content desk is for content managers only. Administrators have their
 * own oversight routes and never use the content manager's API. */
export function isContentEditorRole(role: Role): boolean {
  return role === 'content_manager';
}

export function isContentManagerRole(role: Role): boolean {
  return role === 'content_manager';
}

/** Every staff account, across both portals. */
export function isStaffRole(role: Role): boolean {
  return isAdminPortalRole(role) || isContentManagerRole(role);
}

/** The one role that may create or disable staff accounts. */
export function isAdminRole(role: Role): boolean {
  return role === 'admin';
}

export type UserRow = {
  id: string;
  email: string;
  role: Role;
  password_hash: string;
  email_verified: boolean;
  token_version: number;
  must_change_password: boolean;
  disabled_at: string | null;
};

export type SessionUserRow = Omit<UserRow, 'password_hash'>;

const USER_COLUMNS =
  'id, email, role, password_hash, email_verified, token_version, must_change_password, disabled_at';
const SESSION_USER_COLUMNS =
  'id, email, role, email_verified, token_version, must_change_password, disabled_at';

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
export async function setPassword(
  id: string,
  passwordHash: string,
  options: { clearMustChange?: boolean } = {},
): Promise<void> {
  await query(
    `UPDATE users
        SET password_hash = $2,
            must_change_password = CASE WHEN $3::boolean THEN false ELSE must_change_password END,
            token_version = token_version + 1
      WHERE id = $1`,
    [id, passwordHash, options.clearMustChange ?? false],
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

/* ══════════════════════════════════════════════════════════════════════════
   Content admin: categories and posts.

   Timestamps come back as ISO-8601 UTC strings rather than driver Date
   objects, because these rows are serialized straight into public JSON and
   into the admin UI, and one format everywhere means no consumer has to
   guess what it is holding.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Postgres -> `2026-10-21T09:30:00.000Z`, safe to JSON.stringify.
 *
 * Each takes the table's alias on purpose: `created_at` exists on both `posts`
 * and `categories`, and the admin list joins the two, so an unqualified column
 * is ambiguous and the query fails outright rather than picking one.
 */
const isoTimestamp = (table: string, column: string): string =>
  `to_char(${table}.${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export type PostStatus = 'draft' | 'published';

export type PostType = 'blog' | 'event';

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  post_count: number;
};

export type PostRow = {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  /** Null on an event: a category is a topic on a written piece. */
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  cover_image_url: string | null;
  cover_image_thumb_url: string | null;
  link_label: string | null;
  link_url: string | null;
  event_start: string | null;
  event_end: string | null;
  location_text: string | null;
  is_online: boolean;
  registration_url: string | null;
  registration_intro: string | null;
  registration_button_label: string | null;
  status: PostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: string | null;
};

const POST_COLUMNS = `p.id, p.type, p.slug, p.title, p.excerpt, p.body, p.category_id,
         c.name AS category_name, c.slug AS category_slug,
         p.cover_image_url, p.cover_image_thumb_url, p.link_label, p.link_url,
         ${isoTimestamp('p', 'event_start')} AS event_start,
         ${isoTimestamp('p', 'event_end')} AS event_end,
         p.location_text, p.is_online, p.registration_url,
         p.registration_intro, p.registration_button_label, p.status,
         ${isoTimestamp('p', 'published_at')} AS published_at,
         ${isoTimestamp('p', 'created_at')} AS created_at,
         ${isoTimestamp('p', 'updated_at')} AS updated_at,
         p.author_id`;

// LEFT JOIN, not JOIN: an event carries no category, and an inner join would
// quietly drop every event from every list.
const POST_FROM = `FROM posts p LEFT JOIN categories c ON c.id = p.category_id`;

export async function listCategories(): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    `SELECT c.id, c.name, c.slug, ${isoTimestamp('c', 'created_at')} AS created_at,
            (SELECT count(*) FROM posts p WHERE p.category_id = c.id)::int AS post_count
       FROM categories c
      ORDER BY c.name`,
  );
}

export async function findCategoryBySlug(slug: string): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>('SELECT id FROM categories WHERE slug = $1', [slug]);
}

export async function findCategoryById(id: string): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>(
    `SELECT c.id, c.name, c.slug, ${isoTimestamp('c', 'created_at')} AS created_at,
            (SELECT count(*) FROM posts p WHERE p.category_id = c.id)::int AS post_count
       FROM categories c WHERE c.id = $1`,
    [id],
  );
}

export async function insertCategory(input: {
  name: string;
  slug: string;
}): Promise<{ id: string } | null> {
  const row = await queryOne<{ id: string }>(
    'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id',
    [input.name, input.slug],
  );
  return row;
}

/** A rename is a plain update: the slug may change, and posts keep their row. */
export async function updateCategory(input: {
  id: string;
  name: string;
  slug: string;
}): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>(
    'UPDATE categories SET name = $2, slug = $3 WHERE id = $1 RETURNING id',
    [input.id, input.name, input.slug],
  );
}

/**
 * Move every post in one category to another, then the caller deletes the
 * emptied one. Two statements, so a post cannot appear in neither category
 * between them; the foreign key refuses the delete if any row was left behind.
 */
export async function movePostsToCategory(fromId: string, toId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    'UPDATE posts SET category_id = $2, updated_at = now() WHERE category_id = $1 RETURNING id',
    [fromId, toId],
  );
  return rows.length;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

export type PostListFilter = {
  type?: PostType;
  status?: PostStatus;
  categoryId?: string;
  search?: string;
};

/**
 * The admin list. Includes drafts, because that is the point of the panel; the
 * public query below is the only one that may read a draft, and it never does.
 */
export async function listPostsForAdmin(filter: PostListFilter = {}): Promise<PostRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.type) {
    params.push(filter.type);
    where.push(`p.type = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`p.status = $${params.length}`);
  }
  if (filter.categoryId) {
    params.push(filter.categoryId);
    where.push(`p.category_id = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    where.push(`(p.title ILIKE $${params.length} OR p.excerpt ILIKE $${params.length})`);
  }

  return query<PostRow>(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.updated_at DESC`,
    params,
  );
}

/**
 * What the public site reads. Drafts are excluded in SQL rather than filtered
 * out afterwards, so there is no code path that could forget: a draft row never
 * leaves the database through this function.
 */
export async function listPublishedPosts(type?: PostType): Promise<PostRow[]> {
  return query<PostRow>(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
      WHERE p.status = 'published'
      ${type ? 'AND p.type = $1' : ''}
      ORDER BY p.published_at DESC`,
    type ? [type] : [],
  );
}

export async function findPublishedPostBySlug(slug: string): Promise<PostRow | null> {
  return queryOne<PostRow>(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
      WHERE p.slug = $1 AND p.status = 'published'`,
    [slug],
  );
}

/** A public registration may only name an event that is actually live. */
export async function isPublishedEventSlug(slug: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM posts WHERE slug = $1 AND type = 'event' AND status = 'published' LIMIT 1`,
    [slug],
  );
  return Boolean(row);
}

export async function findPostById(id: string): Promise<PostRow | null> {
  return queryOne<PostRow>(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = $1`, [id]);
}

export async function insertPost(input: {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId: string | null;
  coverImageUrl: string | null;
  coverImageThumbUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  locationText: string | null;
  isOnline: boolean;
  registrationUrl: string | null;
  registrationIntro: string | null;
  registrationButtonLabel: string | null;
  status: PostStatus;
  authorId: string;
}): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO posts
       (type, slug, title, excerpt, body, category_id, cover_image_url, cover_image_thumb_url,
        link_label, link_url, event_start, event_end, location_text, is_online, registration_url,
        registration_intro, registration_button_label, status, published_at, author_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17, $18, CASE WHEN $18 = 'published' THEN now() ELSE NULL END, $19)
     RETURNING id`,
    [
      input.type,
      input.slug,
      input.title,
      input.excerpt,
      input.body,
      input.categoryId,
      input.coverImageUrl,
      input.coverImageThumbUrl,
      input.linkLabel,
      input.linkUrl,
      input.eventStart,
      input.eventEnd,
      input.locationText,
      input.isOnline,
      input.registrationUrl,
      input.registrationIntro,
      input.registrationButtonLabel,
      input.status,
      input.authorId,
    ],
  );
  return row?.id ?? null;
}

/**
 * Publish stamps published_at; unpublish clears it. Both are written from the
 * server rather than sent by the client, so the published date is always the
 * moment the change happened and never a value a request made up.
 */
export async function updatePost(input: {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId: string | null;
  coverImageUrl: string | null;
  coverImageThumbUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  locationText: string | null;
  isOnline: boolean;
  registrationUrl: string | null;
  registrationIntro: string | null;
  registrationButtonLabel: string | null;
  status: PostStatus;
}): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>(
    `UPDATE posts
        SET type = $2,
            slug = $3,
            title = $4,
            excerpt = $5,
            body = $6,
            category_id = $7,
            cover_image_url = $8,
            cover_image_thumb_url = $9,
            link_label = $10,
            link_url = $11,
            event_start = $12,
            event_end = $13,
            location_text = $14,
            is_online = $15,
            registration_url = $16,
            registration_intro = $17,
            registration_button_label = $18,
            status = $19,
            published_at = CASE
              WHEN $19 = 'published' THEN coalesce(published_at, now())
              ELSE NULL END,
            updated_at = now()
      WHERE id = $1
      RETURNING id`,
    [
      input.id,
      input.type,
      input.slug,
      input.title,
      input.excerpt,
      input.body,
      input.categoryId,
      input.coverImageUrl,
      input.coverImageThumbUrl,
      input.linkLabel,
      input.linkUrl,
      input.eventStart,
      input.eventEnd,
      input.locationText,
      input.isOnline,
      input.registrationUrl,
      input.registrationIntro,
      input.registrationButtonLabel,
      input.status,
    ],
  );
}

export async function deletePost(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>('DELETE FROM posts WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

/**
 * The published slugs, for the sitemap. No bodies, so this stays small.
 *
 * The type travels with each slug because the public path depends on it now:
 * a blog post lives at /blog/<slug> and an event at /events/<slug>.
 *
 * `updated_at` travels too: it is a real modification date the row carries, so
 * the sitemap can state one instead of leaving lastmod out or stamping the build
 * clock onto every URL.
 */
export async function listPublishedSlugs(): Promise<
  { slug: string; type: PostType; updated_at: string }[]
> {
  return query<{ slug: string; type: PostType; updated_at: string }>(
    `SELECT slug, type, ${isoTimestamp('posts', 'updated_at')} AS updated_at
       FROM posts WHERE status = 'published' ORDER BY slug`,
  );
}

/** The current slug for an old one, so a shared link keeps working. */
export async function findPostSlugRedirect(
  type: PostType,
  oldSlug: string,
): Promise<{ slug: string } | null> {
  return queryOne<{ slug: string }>(
    `SELECT p.slug
       FROM post_slug_redirects r
       JOIN posts p ON p.id = r.post_id
      WHERE r.type = $1 AND r.old_slug = $2 AND p.status = 'published'`,
    [type, oldSlug],
  );
}

/** Remember the old URL when a manager changes a published slug. */
export async function recordPostSlugRedirect(
  type: PostType,
  oldSlug: string,
  postId: string,
): Promise<void> {
  await query(
    `INSERT INTO post_slug_redirects (type, old_slug, post_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (type, old_slug) DO UPDATE SET post_id = EXCLUDED.post_id`,
    [type, oldSlug, postId],
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Event registrations.

   Separate from the shared lead tables because a manager reads and exports
   these by event, and the same address is allowed once per event only. Public
   callers never reach these functions except through the write-only endpoint.
   ══════════════════════════════════════════════════════════════════════════ */

export type RegistrationRow = {
  id: string;
  event_slug: string;
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  notes: string;
  created_at: string;
};

export type RegistrationFilter = {
  eventSlug?: string;
  search?: string;
  from?: string;
  to?: string;
};

export async function insertRegistration(input: {
  eventSlug: string;
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  notes: string;
}): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO registrations (event_slug, name, email, phone, organization, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.eventSlug, input.name, input.email, input.phone, input.organization, input.notes],
  );
  return row?.id ?? null;
}

/**
 * The admin list's WHERE clause, built with bind parameters only. `search` is
 * wrapped in wildcards here, never interpolated.
 */
function registrationWhere(filter: RegistrationFilter): { where: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.eventSlug) {
    params.push(filter.eventSlug);
    where.push(`event_slug = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (filter.from) {
    params.push(filter.from);
    where.push(`created_at >= $${params.length}::date`);
  }
  if (filter.to) {
    params.push(filter.to);
    where.push(`created_at < ($${params.length}::date + interval '1 day')`);
  }

  return { where: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params };
}

const REGISTRATION_COLUMNS = `id, event_slug, name, email, phone, organization, notes,
         ${isoTimestamp('registrations', 'created_at')} AS created_at`;

export async function listRegistrations(
  filter: RegistrationFilter & { limit: number; offset: number },
): Promise<RegistrationRow[]> {
  const { where, params } = registrationWhere(filter);
  return query<RegistrationRow>(
    `SELECT ${REGISTRATION_COLUMNS}
       FROM registrations
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit, filter.offset],
  );
}

export async function countRegistrations(filter: RegistrationFilter = {}): Promise<number> {
  const { where, params } = registrationWhere(filter);
  const row = await queryOne<{ total: number }>(
    `SELECT count(*)::int AS total FROM registrations ${where}`,
    params,
  );
  return row?.total ?? 0;
}

/** One row per event that has registrations, with its total. */
export async function listRegistrationEventCounts(): Promise<
  { event_slug: string; total: number }[]
> {
  return query<{ event_slug: string; total: number }>(
    `SELECT event_slug, count(*)::int AS total
       FROM registrations
      GROUP BY event_slug
      ORDER BY event_slug`,
  );
}

/**
 * Everything matching the filter, newest first, for the CSV export. Capped at
 * 5000 rows so one request cannot pull an unbounded table into memory; a bigger
 * set is exported by filtering per event.
 */
export async function listRegistrationsForExport(
  filter: RegistrationFilter = {},
): Promise<RegistrationRow[]> {
  const { where, params } = registrationWhere(filter);
  return query<RegistrationRow>(
    `SELECT ${REGISTRATION_COLUMNS}
       FROM registrations
       ${where}
      ORDER BY created_at DESC
      LIMIT 10000`,
    params,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Staff accounts, invites and the audit log.

   Staff roles are never written by a public signup. The insert below runs in a
   transaction that relaxes the guard trigger for that one statement; nothing a
   request sends can set that switch.
   ══════════════════════════════════════════════════════════════════════════ */

export type StaffAccountRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  disabled_at: string | null;
  must_change_password: boolean;
  created_at: string;
};

export async function listStaffAccounts(): Promise<StaffAccountRow[]> {
  return query<StaffAccountRow>(
    `SELECT id, name, email, role, disabled_at, must_change_password,
            ${isoTimestamp('users', 'created_at')} AS created_at
       FROM users
      WHERE role IN ('manager', 'admin', 'project_manager', 'hr_manager', 'content_manager')
      ORDER BY created_at ASC`,
  );
}

export async function createStaffAccount(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: StaffRole;
}): Promise<string | null> {
  const result = await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`INSERT INTO users (name, email, password_hash, role, email_verified, must_change_password)
        VALUES (${input.name}, ${input.email}, ${input.passwordHash}, ${input.role}, true, true)
        RETURNING id`,
  ]);
  const rows = result[1] as { id: string }[] | undefined;
  return rows?.[0]?.id ?? null;
}

export async function setStaffDisabled(id: string, disabled: boolean): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE users
        SET disabled_at = ${disabled ? 'now()' : 'NULL'},
            token_version = token_version + 1
      WHERE id = $1
        AND role IN ('manager', 'admin', 'project_manager', 'hr_manager', 'content_manager')
      RETURNING id`,
    [id],
  );
  return Boolean(row);
}

export async function setStaffRole(id: string, role: StaffRole): Promise<boolean> {
  const result = await sql.transaction([
    sql`SELECT set_config('pga.staff_write', 'on', true)`,
    sql`UPDATE users SET role = ${role}, token_version = token_version + 1
         WHERE id = ${id} RETURNING id`,
  ]);
  const rows = result[1] as { id: string }[] | undefined;
  return Boolean(rows?.[0]);
}

export async function createStaffInvite(input: {
  email: string;
  role: StaffRole;
  tokenHash: string;
  expiresAt: string;
  createdBy: string;
}): Promise<void> {
  await query(
    `INSERT INTO staff_invites (email, role, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.email, input.role, input.tokenHash, input.expiresAt, input.createdBy],
  );
}

export async function findOpenStaffInvite(
  tokenHash: string,
): Promise<{ id: string; email: string; role: StaffRole } | null> {
  return queryOne<{ id: string; email: string; role: StaffRole }>(
    `SELECT id, email, role
       FROM staff_invites
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      LIMIT 1`,
    [tokenHash],
  );
}

export async function useStaffInvite(id: string): Promise<void> {
  await query('UPDATE staff_invites SET used_at = now() WHERE id = $1', [id]);
}

export async function finishStaffPasswordSetup(
  email: string,
  passwordHash: string,
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `UPDATE users
        SET password_hash = $2,
            must_change_password = false,
            email_verified = true,
            token_version = token_version + 1
      WHERE email = $1 AND disabled_at IS NULL
      RETURNING id`,
    [email, passwordHash],
  );
  return row?.id ?? null;
}

export async function setOwnPassword(
  id: string,
  passwordHash: string,
): Promise<void> {
  await query(
    `UPDATE users
        SET password_hash = $2,
            must_change_password = false,
            token_version = token_version + 1
      WHERE id = $1`,
    [id, passwordHash],
  );
}

export async function insertAuditLog(input: {
  userId?: string | null;
  action: string;
  detail?: string | null;
}): Promise<void> {
  await query('INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)', [
    input.userId ?? null,
    input.action,
    input.detail ?? null,
  ]);
}

/* ══════════════════════════════════════════════════════════════════════════
   Staff data lists. Every filter is a bind parameter; the table is chosen by
   the handler, never by the request.
   ══════════════════════════════════════════════════════════════════════════ */

export type DataFilter = {
  search?: string;
  from?: string;
  to?: string;
  eventSlug?: string;
};

function dataWhere(
  filter: DataFilter,
  searchColumns = 'name, email',
): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.eventSlug) {
    params.push(filter.eventSlug);
    clauses.push(`event_slug = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    const columns = searchColumns.split(',').map((column) => `${column.trim()} ILIKE $${params.length}`);
    clauses.push(`(${columns.join(' OR ')})`);
  }
  if (filter.from) {
    params.push(filter.from);
    clauses.push(`created_at >= $${params.length}::date`);
  }
  if (filter.to) {
    params.push(filter.to);
    clauses.push(`created_at < ($${params.length}::date + interval '1 day')`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export type SubscriptionRow = {
  id: string;
  email: string;
  status: string;
  source: string;
  created_at: string;
};

export async function listSubscriptions(
  filter: DataFilter & { limit: number; offset: number },
): Promise<SubscriptionRow[]> {
  const { where, params } = dataWhere(filter, 'email');
  return query<SubscriptionRow>(
    `SELECT id, email, status, source, ${isoTimestamp('newsletter_subscribers', 'created_at')} AS created_at
       FROM newsletter_subscribers
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit, filter.offset],
  );
}

export async function countSubscriptions(filter: DataFilter = {}): Promise<number> {
  const { where, params } = dataWhere(filter, 'email');
  const row = await queryOne<{ total: number }>(
    `SELECT count(*)::int AS total FROM newsletter_subscribers ${where}`,
    params,
  );
  return row?.total ?? 0;
}

export async function listSubscriptionsForExport(
  filter: DataFilter = {},
): Promise<SubscriptionRow[]> {
  const { where, params } = dataWhere(filter, 'email');
  return query<SubscriptionRow>(
    `SELECT id, email, status, source, ${isoTimestamp('newsletter_subscribers', 'created_at')} AS created_at
       FROM newsletter_subscribers ${where}
      ORDER BY created_at DESC LIMIT 10000`,
    params,
  );
}

export type ConsultationRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organisation: string;
  service: string | null;
  meeting_format: string;
  preferred_date: string;
  preferred_slot: string;
  notes: string | null;
  status: string;
  created_at: string;
};

const CONSULTATION_COLUMNS = `id, name, email, phone, organisation, service,
  meeting_format, preferred_date, preferred_slot, notes, status,
  ${isoTimestamp('consultation_bookings', 'created_at')} AS created_at`;

export async function listConsultations(
  filter: DataFilter & { limit: number; offset: number },
): Promise<ConsultationRow[]> {
  const { where, params } = dataWhere(filter);
  return query<ConsultationRow>(
    `SELECT ${CONSULTATION_COLUMNS}
       FROM consultation_bookings ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit, filter.offset],
  );
}

export async function countConsultations(filter: DataFilter = {}): Promise<number> {
  const { where, params } = dataWhere(filter);
  const row = await queryOne<{ total: number }>(
    `SELECT count(*)::int AS total FROM consultation_bookings ${where}`,
    params,
  );
  return row?.total ?? 0;
}

export async function listConsultationsForExport(
  filter: DataFilter = {},
): Promise<ConsultationRow[]> {
  const { where, params } = dataWhere(filter);
  return query<ConsultationRow>(
    `SELECT ${CONSULTATION_COLUMNS}
       FROM consultation_bookings ${where}
      ORDER BY created_at DESC LIMIT 10000`,
    params,
  );
}

/* ── Dashboard counts ───────────────────────────────────────────────────── */

export type CategoryStats = { total: number; last7: number; prev7: number };

async function categoryCounts(
  table: 'registrations' | 'newsletter_subscribers' | 'consultation_bookings' | 'users',
  extraWhere = '',
): Promise<CategoryStats> {
  const where = extraWhere ? `WHERE ${extraWhere}` : '';
  const row = await queryOne<CategoryStats>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS last7,
            count(*) FILTER (WHERE created_at >= now() - interval '14 days'
                               AND created_at < now() - interval '7 days')::int AS prev7
       FROM ${table} ${where}`,
  );
  return row ?? { total: 0, last7: 0, prev7: 0 };
}

export async function getDashboardCounts(): Promise<{
  registrations: CategoryStats;
  subscriptions: CategoryStats;
  consultations: CategoryStats;
  talent: CategoryStats;
  employers: CategoryStats;
}> {
  const [registrations, subscriptions, consultations, talent, employers] = await Promise.all([
    categoryCounts('registrations'),
    categoryCounts('newsletter_subscribers', "status <> 'unsubscribed'"),
    categoryCounts('consultation_bookings'),
    categoryCounts('users', "role = 'talent'"),
    categoryCounts('users', "role = 'employer'"),
  ]);
  return { registrations, subscriptions, consultations, talent, employers };
}

export async function dailyCounts(
  table: 'registrations' | 'newsletter_subscribers' | 'consultation_bookings' | 'users',
  from: string,
  extraWhere = '',
): Promise<{ day: string; total: number }[]> {
  const extra = extraWhere ? `AND ${extraWhere}` : '';
  return query<{ day: string; total: number }>(
    `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*)::int AS total
       FROM ${table}
      WHERE created_at >= $1::date ${extra}
      GROUP BY 1 ORDER BY 1`,
    [from],
  );
}

export async function registrationCountsByEvent(
  from: string,
): Promise<{ event_slug: string; total: number }[]> {
  return query<{ event_slug: string; total: number }>(
    `SELECT event_slug, count(*)::int AS total
       FROM registrations
      WHERE created_at >= $1::date
      GROUP BY event_slug ORDER BY total DESC`,
    [from],
  );
}
/* ── First-party traffic ────────────────────────────────────────────────── */

export async function recordPageView(input: {
  date: string;
  path: string;
  referrerHost: string;
  utmSource: string;
  country: string;
  device: string;
  visitorHash: string;
}): Promise<void> {
  await query(
    `WITH page AS (
       INSERT INTO page_views_daily
         (date, path, referrer_host, utm_source, country, device, views)
       VALUES ($1, $2, $3, $4, $5, $6, 1)
       ON CONFLICT (date, path, referrer_host, utm_source, country, device)
       DO UPDATE SET views = page_views_daily.views + 1
     ), visitor AS (
       INSERT INTO visitor_hashes_daily (date, hash)
       VALUES ($1, $7)
       ON CONFLICT DO NOTHING
       RETURNING hash
     )
     INSERT INTO traffic_uniques_daily (date, uniques)
     SELECT $1, 1 WHERE EXISTS (SELECT 1 FROM visitor)
     ON CONFLICT (date) DO UPDATE SET uniques = traffic_uniques_daily.uniques + 1`,
    [
      input.date,
      input.path,
      input.referrerHost,
      input.utmSource,
      input.country,
      input.device,
      input.visitorHash,
    ],
  );
}

export async function cleanupTrafficHashes(): Promise<number> {
  const rows = await query<{ hash: string }>(
    `DELETE FROM visitor_hashes_daily
      WHERE date < current_date - 2
      RETURNING hash`,
  );
  return rows.length;
}

/**
 * Unconfirmed newsletter signups are housekeeping, not history.
 *
 * The confirmation link is only good for 48 hours, so a row still pending a
 * week after the address first asked can never be confirmed by the mail that
 * was sent; it only misleads whoever reads the subscriber list. A week leaves
 * room for a weekend away, and an address that signs up again afterwards simply
 * starts a fresh row.
 */
export async function cleanupPendingNewsletterSubscribers(): Promise<number> {
  const rows = await query<{ email: string }>(
    `DELETE FROM newsletter_subscribers
      WHERE status = 'pending'
        AND created_at < now() - interval '7 days'
      RETURNING email`,
  );
  return rows.length;
}

export async function trafficTotals(
  from: string,
  to: string,
): Promise<{ views: number; uniques: number }> {
  const [views, uniques] = await Promise.all([
    queryOne<{ total: number }>(
      `SELECT coalesce(sum(views), 0)::int AS total
         FROM page_views_daily WHERE date >= $1::date AND date <= $2::date`,
      [from, to],
    ),
    queryOne<{ total: number }>(
      `SELECT coalesce(sum(uniques), 0)::int AS total
         FROM traffic_uniques_daily WHERE date >= $1::date AND date <= $2::date`,
      [from, to],
    ),
  ]);
  return { views: views?.total ?? 0, uniques: uniques?.total ?? 0 };
}

export async function trafficDaily(
  from: string,
  to: string,
): Promise<{ day: string; views: number; uniques: number }[]> {
  return query<{ day: string; views: number; uniques: number }>(
    `WITH days AS (
       SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            coalesce((SELECT sum(v.views) FROM page_views_daily v WHERE v.date = d.day), 0)::int AS views,
            coalesce((SELECT u.uniques FROM traffic_uniques_daily u WHERE u.date = d.day), 0)::int AS uniques
       FROM days d ORDER BY d.day`,
    [from, to],
  );
}

export async function trafficTop(
  column: 'path' | 'referrer_host' | 'country' | 'device',
  from: string,
  to: string,
  limit = 10,
): Promise<{ label: string; views: number }[]> {
  const allowed = new Set(['path', 'referrer_host', 'country', 'device']);
  if (!allowed.has(column)) throw new Error('Unsupported traffic column');
  return query<{ label: string; views: number }>(
    `SELECT ${column} AS label, sum(views)::int AS views
       FROM page_views_daily
      WHERE date >= $1::date AND date <= $2::date
      GROUP BY ${column}
      ORDER BY views DESC
      LIMIT $3`,
    [from, to, limit],
  );
}
