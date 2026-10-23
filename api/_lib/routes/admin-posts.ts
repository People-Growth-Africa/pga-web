import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  ApiError,
  MAX_ADMIN_BODY_BYTES,
  clientIp,
  endpoint,
  parseJsonBody,
  sendJson,
} from '../http.js';
import { requireManager } from '../manager.js';
import { recordAuthEvent } from '../audit.js';
import {
  parseInput,
  postByIdSchema,
  postCreateSchema,
  postListQuerySchema,
  postStatusSchema,
  postUpdateSchema,
} from '../validation.js';
import {
  deletePost,
  findPostById,
  insertPost,
  isUniqueViolation,
  listCategories,
  listPostsForAdmin,
  updatePost,
} from '../db.js';
import { enforceRateLimit } from '../ratelimit.js';
import { markContentChanged } from '../content/version.js';
import { deleteCoverBlobs } from '../cover-blobs.js';
import { announcePostChange } from '../indexnow.js';

/**
 * POST /api/admin/posts        - list, with optional status/category/search filters
 * PUT  /api/admin/posts        - create
 * PUT  /api/admin/post         - update (id in the body)
 * POST /api/admin/post-status  - publish or unpublish one post
 * DELETE /api/admin/post?id=   - delete
 *
 * Every one of them starts with `requireManager`, which reads the role out of
 * the signed session. The admin UI is hidden from everyone else, but a talent
 * or employer session is a perfectly valid cookie and could call these directly
 * without it.
 *
 * Slugs are the one thing worth calling out. A collision is reported as a field
 * error rather than silently suffixed: a manager who types a title, gets
 * `my-post-2` back and does not notice has published a URL they did not choose.
 */

/** A message pointing at the exact input, the way the rest of the API does it. */
function fieldError(field: string, message: string): ApiError {
  return new ApiError(409, 'slug_taken', message, { [field]: message });
}

async function writeRateLimit(userId: string, name: string): Promise<void> {
  await enforceRateLimit({
    name,
    identifier: userId,
    limit: 60,
    windowSeconds: 60,
  });
}

export default endpoint({ methods: ['GET', 'PUT', 'POST', 'DELETE'], csrf: true }, async (req, res) => {
  const manager = await requireManager(req, res);
  const path = (req.url ?? '').split('?')[0]?.replace(/\/+$/, '') ?? '';

  if (req.method === 'GET') return listHandler(req, res);
  if (path === '/api/admin/post') {
    if (req.method === 'DELETE') return deleteHandler(req, res, manager.userId);
    return updateHandler(req, res, manager.userId);
  }
  if (path === '/api/admin/post-status') return statusHandler(req, res, manager.userId);
  if (req.method === 'PUT') return createHandler(req, res, manager.userId);

  return listHandler(req, res);
});

async function listHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const query = req.query ?? {};
  const filter = parseInput(postListQuerySchema, {
    ...(typeof query.type === 'string' ? { type: query.type } : {}),
    ...(typeof query.status === 'string' ? { status: query.status } : {}),
    ...(typeof query.categoryId === 'string' ? { categoryId: query.categoryId } : {}),
    ...(typeof query.search === 'string' ? { search: query.search } : {}),
  });

  const [posts, categories] = await Promise.all([
    listPostsForAdmin(filter),
    listCategories(),
  ]);

  sendJson(res, 200, { posts, categories });
}

/**
 * The columns a write always carries, whichever handler is saving.
 *
 * Kept in one place so create and update cannot drift: an event field added to
 * insertPost but forgotten in updatePost is the kind of bug that only shows up
 * when someone edits the event they just made.
 */
function postColumnsFrom(data: {
  type: 'blog' | 'event';
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId?: string | null;
  coverImageUrl?: string | null;
  coverImageThumbUrl?: string | null;
  linkLabel?: string | null;
  linkUrl?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  locationText?: string | null;
  isOnline?: boolean;
  registrationUrl?: string | null;
  status: 'draft' | 'published';
}) {
  return {
    type: data.type,
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    body: data.body,
    categoryId: data.categoryId ?? null,
    coverImageUrl: data.coverImageUrl ?? null,
    coverImageThumbUrl: data.coverImageThumbUrl ?? null,
    linkLabel: data.linkLabel ?? null,
    linkUrl: data.linkUrl ?? null,
    eventStart: data.eventStart ?? null,
    eventEnd: data.eventEnd ?? null,
    locationText: data.locationText ?? null,
    isOnline: Boolean(data.isOnline),
    registrationUrl: data.registrationUrl ?? null,
    status: data.status,
  };
}

async function createHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-post-write');
  const data = parseInput(postCreateSchema, parseJsonBody(req, MAX_ADMIN_BODY_BYTES));

  await assertCategoryExists(data.categoryId ?? null);

  try {
    const id = await insertPost({
      ...postColumnsFrom(data),
      authorId: userId,
    });
    if (!id) throw new ApiError(500, 'not_saved', 'The post could not be saved. Try again.');

    markContentChanged();
    const post = await findPostById(id);
    // A post saved straight to published has a URL from this moment, so Bing and
    // Yandex are told rather than left to find it on their next crawl. A new
    // draft changes nothing public and sends nothing.
    if (post) {
      announcePostChange({ type: post.type, slug: post.slug, status: post.status, previous: null });
    }
    sendJson(res, 201, { post });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw fieldError('slug', 'That slug is already in use. Try another one.');
    }
    throw error;
  }
}

async function updateHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-post-write');
  const data = parseInput(postUpdateSchema, parseJsonBody(req, MAX_ADMIN_BODY_BYTES));

  const existing = await findPostById(data.id);
  if (!existing) throw new ApiError(404, 'not_found', 'That post could not be found.');

  await assertCategoryExists(data.categoryId ?? null);

  try {
    const updated = await updatePost({
      id: data.id,
      ...postColumnsFrom(data),
    });
    if (!updated) throw new ApiError(500, 'not_saved', 'The post could not be saved. Try again.');

    // The two files a cover is made of are replaced together. Whatever the row
    // used to point at and no longer does is deleted here: object storage has no
    // cascade, and a replaced cover would otherwise sit in the store forever.
    await deleteCoverBlobs([
      existing.cover_image_url !== data.coverImageUrl ? existing.cover_image_url : null,
      existing.cover_image_thumb_url !== data.coverImageThumbUrl
        ? existing.cover_image_thumb_url
        : null,
    ]);

    markContentChanged();
    const post = await findPostById(data.id);
    if (post) {
      announcePostChange({
        type: post.type,
        slug: post.slug,
        status: post.status,
        previous: existing.status,
      });
    }
    sendJson(res, 200, { post });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw fieldError('slug', 'That slug is already in use. Try another one.');
    }
    throw error;
  }
}

/**
 * Publish and unpublish on their own, so the list can flip a post without
 * uploading its body again. The date is stamped in SQL (see updatePost), so a
 * publish time is never a value the client chose.
 */
async function statusHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-post-write');
  // The status schema rather than a `.pick` of the update one: that schema is
  // now a refinement plus a transform, which has nothing left to pick from.
  const { id, status } = parseInput(postStatusSchema, parseJsonBody(req));

  const existing = await findPostById(id);
  if (!existing) throw new ApiError(404, 'not_found', 'That post could not be found.');

  const updated = await updatePost({
    id,
    slug: existing.slug,
    title: existing.title,
    excerpt: existing.excerpt,
    body: existing.body,
    type: existing.type,
    categoryId: existing.category_id,
    coverImageUrl: existing.cover_image_url,
    coverImageThumbUrl: existing.cover_image_thumb_url,
    linkLabel: existing.link_label,
    linkUrl: existing.link_url,
    eventStart: existing.event_start,
    eventEnd: existing.event_end,
    locationText: existing.location_text,
    isOnline: existing.is_online,
    registrationUrl: existing.registration_url,
    status,
  });
  if (!updated) throw new ApiError(500, 'not_saved', 'That change could not be saved. Try again.');

  markContentChanged();
  const post = await findPostById(id);
  if (post) {
    announcePostChange({
      type: post.type,
      slug: post.slug,
      status: post.status,
      previous: existing.status,
    });
  }
  await recordAuthEvent(status === 'published' ? 'admin_post_publish' : 'admin_post_unpublish', {
    userId,
    ip: clientIp(req),
  });
  sendJson(res, 200, { post });
}

async function deleteHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-post-delete');
  const { id } = parseInput(postByIdSchema, { id: req.query?.id });

  const existing = await findPostById(id);
  if (!existing) throw new ApiError(404, 'not_found', 'That post could not be found.');

  const deleted = await deletePost(id);
  if (!deleted) throw new ApiError(404, 'not_found', 'That post could not be found.');

  // Deleting the row is the point; the cover files go with it.
  await deleteCoverBlobs([existing.cover_image_url, existing.cover_image_thumb_url]);
  await recordAuthEvent('admin_post_delete', { userId, ip: clientIp(req) });

  // A published URL is about to 404. IndexNow has no delete verb: submitting the
  // URL is how an engine is told to recrawl and drop it. A draft never had a
  // public URL, so this announces nothing for it.
  announcePostChange({
    type: existing.type,
    slug: existing.slug,
    status: 'draft',
    previous: existing.status,
  });

  markContentChanged();
  sendJson(res, 200, { ok: true, deleted: { id, slug: existing.slug, title: existing.title } });
}

/**
 * Only a blog post has a category, so there is nothing to check for an event.
 * The foreign key would still refuse an unknown id; this turns that into a
 * message under the field instead of a constraint error.
 */
async function assertCategoryExists(categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const categories = await listCategories();
  if (!categories.some((category) => category.id === categoryId)) {
    throw new ApiError(400, 'validation_failed', 'Choose a category.', {
      categoryId: 'Choose a category.',
    });
  }
}
