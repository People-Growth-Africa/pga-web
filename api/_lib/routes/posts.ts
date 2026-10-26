import type { VercelRequest, VercelResponse } from '@vercel/node';

import { endpoint, sendPublicJson } from '../http.js';
import { listPublishedPosts, type PostRow } from '../db.js';
import { contentVersion } from '../content/version.js';

/**
 * GET /api/posts - every published post, blog and event alike, newest first.
 *
 * One response for both public sections. They read the same rows, the detail
 * pages read their body straight out of this payload rather than fetching a
 * second time, and splitting it into /api/blog and /api/events would double the
 * cache entries and the queries for no gain. The `type` on each row is what the
 * two pages filter on.
 *
 * Drafts cannot appear: `listPublishedPosts` excludes them in SQL, and it is the
 * only query the public side has. A draft slug is therefore absent from this
 * payload, which is exactly what makes the detail page answer 404 instead of
 * rendering something the manager has not published.
 *
 * The CDN keeps the answer for 30 seconds and may serve a stale copy for a
 * minute while it refreshes. The second number is kept at twice the first on
 * purpose: it absorbs a traffic spike without leaving a freshly published post
 * invisible for long.
 */

/** Short enough that a publish is live within seconds, long enough to matter. */
export const POSTS_CACHE_SECONDS = 30;

/** How long a shared cache may answer with a copy it is already refreshing. */
const POSTS_STALE_SECONDS = 60;

/** Never more than this many rows in one response, so the payload stays bounded. */
const MAX_POSTS = 300;

type PublicPost = {
  type: 'blog' | 'event';
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string | null;
  categorySlug: string | null;
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
  publishedAt: string | null;
  updatedAt: string;
};

function toPublicPost(row: PostRow): PublicPost {
  return {
    type: row.type,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category: row.category_name,
    categorySlug: row.category_slug,
    coverImageUrl: row.cover_image_url,
    coverImageThumbUrl: row.cover_image_thumb_url,
    linkLabel: row.link_label,
    linkUrl: row.link_url,
    eventStart: row.event_start,
    eventEnd: row.event_end,
    locationText: row.location_text,
    isOnline: row.is_online,
    registrationUrl: row.registration_url,
    registrationIntro: row.registration_intro,
    registrationButtonLabel: row.registration_button_label,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

export default endpoint({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const rows = await listPublishedPosts();

  sendPublicJson(
    res,
    200,
    {
      posts: rows.slice(0, MAX_POSTS).map(toPublicPost),
      version: contentVersion(),
    },
    POSTS_CACHE_SECONDS,
    POSTS_STALE_SECONDS,
  );
});
