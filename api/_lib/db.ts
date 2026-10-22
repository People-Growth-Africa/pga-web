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
 * The three account types.
 *
 * 'manager' is never written by a signup: the signup schemas accept only the
 * talent and employer literals, and a database trigger refuses a manager row
 * unless scripts/promote-manager.mjs is running (see scripts/setup-content.mjs).
 */
export type Role = 'talent' | 'employer' | 'manager';

export const MANAGER_ROLE: Role = 'manager';

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

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  post_count: number;
};

export type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  cover_image_url: string | null;
  link_label: string | null;
  link_url: string | null;
  status: PostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: string | null;
};

const POST_COLUMNS = `p.id, p.slug, p.title, p.excerpt, p.body, p.category_id,
         c.name AS category_name, c.slug AS category_slug,
         p.cover_image_url, p.link_label, p.link_url, p.status,
         ${isoTimestamp('p', 'published_at')} AS published_at,
         ${isoTimestamp('p', 'created_at')} AS created_at,
         ${isoTimestamp('p', 'updated_at')} AS updated_at,
         p.author_id`;

const POST_FROM = `FROM posts p JOIN categories c ON c.id = p.category_id`;

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
export async function listPublishedPosts(): Promise<PostRow[]> {
  return query<PostRow>(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
      WHERE p.status = 'published'
      ORDER BY p.published_at DESC`,
  );
}

export async function findPublishedPostBySlug(slug: string): Promise<PostRow | null> {
  return queryOne<PostRow>(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
      WHERE p.slug = $1 AND p.status = 'published'`,
    [slug],
  );
}

export async function findPostById(id: string): Promise<PostRow | null> {
  return queryOne<PostRow>(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = $1`, [id]);
}

export async function insertPost(input: {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId: string;
  coverImageUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  status: PostStatus;
  authorId: string;
}): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO posts
       (slug, title, excerpt, body, category_id, cover_image_url, link_label, link_url,
        status, published_at, author_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             CASE WHEN $9 = 'published' THEN now() ELSE NULL END, $10)
     RETURNING id`,
    [
      input.slug,
      input.title,
      input.excerpt,
      input.body,
      input.categoryId,
      input.coverImageUrl,
      input.linkLabel,
      input.linkUrl,
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
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId: string;
  coverImageUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  status: PostStatus;
}): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>(
    `UPDATE posts
        SET slug = $2,
            title = $3,
            excerpt = $4,
            body = $5,
            category_id = $6,
            cover_image_url = $7,
            link_label = $8,
            link_url = $9,
            status = $10,
            published_at = CASE
              WHEN $10 = 'published' THEN coalesce(published_at, now())
              ELSE NULL END,
            updated_at = now()
      WHERE id = $1
      RETURNING id`,
    [
      input.id,
      input.slug,
      input.title,
      input.excerpt,
      input.body,
      input.categoryId,
      input.coverImageUrl,
      input.linkLabel,
      input.linkUrl,
      input.status,
    ],
  );
}

export async function deletePost(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>('DELETE FROM posts WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

/** The published slugs, for the sitemap. No bodies, so this stays small. */
export async function listPublishedSlugs(): Promise<string[]> {
  const rows = await query<{ slug: string }>(
    `SELECT slug FROM posts WHERE status = 'published' ORDER BY slug`,
  );
  return rows.map((row) => row.slug);
}
