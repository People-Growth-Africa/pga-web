import type { VercelRequest, VercelResponse } from '@vercel/node';

import { endpoint, sendPublicJson } from '../http.js';
import { listPublishedPosts, listSpeakersForPosts, type PostRow, type SpeakerRow } from '../db.js';
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

type PublicSpeaker = {
  name: string;
  role: string | null;
  organisation: string | null;
  bio: string | null;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  linkedinUrl: string | null;
  photoFocusX: number;
  photoFocusY: number;
};

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
  /** The event's form, so the public modal renders what the panel saved. */
  registrationForm: unknown | null;
  /** Whether the speakers section is shown on the page. */
  showSpeakers: boolean;
  /** In position order; an empty list means the page renders no section. */
  speakers: PublicSpeaker[];
  publishedAt: string | null;
  updatedAt: string;
};

/**
 * One speaker, reduced to what a page draws.
 *
 * The row id stays on the server: a public reader links to a LinkedIn profile,
 * not to a speaker record, and the editor is the only caller that needs ids.
 */
function toPublicSpeaker(row: SpeakerRow): PublicSpeaker {
  return {
    name: row.name,
    role: row.role,
    organisation: row.organisation,
    bio: row.bio,
    photoUrl: row.photo_url,
    photoThumbUrl: row.photo_thumb_url,
    linkedinUrl: row.linkedin_url,
    photoFocusX: row.photo_focus_x,
    photoFocusY: row.photo_focus_y,
  };
}

function toPublicPost(row: PostRow, speakers: PublicSpeaker[]): PublicPost {
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
    registrationForm: row.registration_form,
    showSpeakers: row.show_speakers,
    speakers,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/** The speakers, grouped by post, in the order the table returned them. */
function groupSpeakers(rows: SpeakerRow[]): Map<string, PublicSpeaker[]> {
  const byPost = new Map<string, PublicSpeaker[]>();
  for (const row of rows) {
    const list = byPost.get(row.post_id);
    if (list) list.push(toPublicSpeaker(row));
    else byPost.set(row.post_id, [toPublicSpeaker(row)]);
  }
  return byPost;
}

export default endpoint({ methods: ['GET'] }, async (_req: VercelRequest, res: VercelResponse) => {
  const listed = (await listPublishedPosts()).slice(0, MAX_POSTS);
  // One query for every page's speakers, not one per post: the feed carries all
  // of them, and a hundred posts would otherwise cost a hundred round trips.
  const speakers = groupSpeakers(await listSpeakersForPosts(listed.map((row) => row.id)));

  sendPublicJson(
    res,
    200,
    {
      posts: listed.map((row) => toPublicPost(row, speakers.get(row.id) ?? [])),
      version: contentVersion(),
    },
    POSTS_CACHE_SECONDS,
    POSTS_STALE_SECONDS,
  );
});
