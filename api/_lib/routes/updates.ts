import type { VercelRequest, VercelResponse } from '@vercel/node';

import { endpoint, sendPublicJson } from '../http.js';
import { listPublishedPosts, type PostRow } from '../db.js';
import { contentVersion } from '../content/version.js';

/**
 * GET /api/updates - every published post, newest first, for the public pages.
 *
 * This is the same shape the sheet feed already has: one cached response for
 * everybody, read server side, rendered by the browser. It is the only route
 * that reads posts for the public, and `listPublishedPosts` excludes drafts in
 * SQL, so there is no filter further down that could be forgotten.
 *
 * On caching. The edge keeps this for UPDATES_CACHE_SECONDS, which is the
 * whole of the revalidation story: a manager pressing Publish does not need any
 * code to run, the cached copy simply turns over. There is no in-memory copy on
 * top of it, because a second cache would only add a way for an instance to
 * disagree with the edge. Thirty seconds is short enough that a change is live
 * before the manager has finished checking it, and long enough that a busy list
 * page does not query on every scroll.
 *
 * Bodies are included, deliberately: the detail page needs one and the whole
 * point of caching the list is that it needs no second request, exactly as the
 * sheet feed works.
 */

/** Short enough that a publish is live within seconds, long enough to matter. */
export const UPDATES_CACHE_SECONDS = 30;

/** Never more than this many posts in one response, so the payload stays bounded. */
const MAX_POSTS = 200;

type PublicPost = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  categorySlug: string;
  coverImageUrl: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

function toPublicPost(row: PostRow): PublicPost {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category: row.category_name,
    categorySlug: row.category_slug,
    coverImageUrl: row.cover_image_url,
    linkLabel: row.link_label,
    linkUrl: row.link_url,
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
    UPDATES_CACHE_SECONDS,
  );
});
