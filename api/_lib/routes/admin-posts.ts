import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  ApiError,
  MAX_ADMIN_BODY_BYTES,
  endpoint,
  parseJsonBody,
  sendJson,
} from '../http.js';
import { requireManager } from '../manager.js';
import { parseInput, postByIdSchema, postCreateSchema, postListQuerySchema, postUpdateSchema } from '../validation.js';
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
  const manager = await requireManager(req);
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

async function createHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-post-write');
  const data = parseInput(postCreateSchema, parseJsonBody(req, MAX_ADMIN_BODY_BYTES));

  await assertCategoryExists(data.categoryId);

  try {
    const id = await insertPost({
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt,
      body: data.body,
      categoryId: data.categoryId,
      coverImageUrl: data.coverImageUrl ?? null,
      linkLabel: data.linkLabel ?? null,
      linkUrl: data.linkUrl ?? null,
      status: data.status,
      authorId: userId,
    });
    if (!id) throw new ApiError(500, 'not_saved', 'The post could not be saved. Try again.');

    markContentChanged();
    const post = await findPostById(id);
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

  await assertCategoryExists(data.categoryId);

  try {
    const updated = await updatePost({
      id: data.id,
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt,
      body: data.body,
      categoryId: data.categoryId,
      coverImageUrl: data.coverImageUrl ?? null,
      linkLabel: data.linkLabel ?? null,
      linkUrl: data.linkUrl ?? null,
      status: data.status,
    });
    if (!updated) throw new ApiError(500, 'not_saved', 'The post could not be saved. Try again.');

    markContentChanged();
    const post = await findPostById(data.id);
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
  const { id, status } = parseInput(
    postUpdateSchema.pick({ id: true, status: true }),
    parseJsonBody(req),
  );

  const existing = await findPostById(id);
  if (!existing) throw new ApiError(404, 'not_found', 'That post could not be found.');

  const updated = await updatePost({
    id,
    slug: existing.slug,
    title: existing.title,
    excerpt: existing.excerpt,
    body: existing.body,
    categoryId: existing.category_id,
    coverImageUrl: existing.cover_image_url,
    linkLabel: existing.link_label,
    linkUrl: existing.link_url,
    status,
  });
  if (!updated) throw new ApiError(500, 'not_saved', 'That change could not be saved. Try again.');

  markContentChanged();
  const post = await findPostById(id);
  sendJson(res, 200, { post });
}

async function deleteHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-post-delete');
  const { id } = parseInput(postByIdSchema, { id: req.query?.id });

  const existing = await findPostById(id);
  if (!existing) throw new ApiError(404, 'not_found', 'That post could not be found.');

  const deleted = await deletePost(id);
  if (!deleted) throw new ApiError(404, 'not_found', 'That post could not be found.');

  markContentChanged();
  sendJson(res, 200, { ok: true, deleted: { id, slug: existing.slug, title: existing.title } });
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const categories = await listCategories();
  if (!categories.some((category) => category.id === categoryId)) {
    throw new ApiError(400, 'validation_failed', 'Choose a category.', {
      categoryId: 'Choose a category.',
    });
  }
}
