import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ApiError, endpoint, parseJsonBody, sendJson } from '../http.js';
import { requireAdmin } from '../staff.js';
import {
  categoryCreateSchema,
  categoryDeleteSchema,
  categoryUpdateSchema,
  parseInput,
} from '../validation.js';
import {
  deleteCategory,
  findCategoryById,
  insertCategory,
  isRestrictViolation,
  isUniqueViolation,
  listCategories,
  movePostsToCategory,
  updateCategory,
} from '../db.js';
import { enforceRateLimit } from '../ratelimit.js';
import { markContentChanged } from '../content/version.js';

/**
 * GET    /api/admin/categories        - list, each carrying its post count
 * POST   /api/admin/categories        - create
 * PUT    /api/admin/category          - rename (id in the body)
 * DELETE /api/admin/category?id=&moveTo= - delete, reassigning posts first
 *
 * Deleting a category that still has posts is the one case worth explaining. It
 * is refused rather than cascaded, because losing the posts is not what anyone
 * means by "delete this category" - and the refusal comes back naming the post
 * count, so the next click is the obvious one. The manager then resends with
 * `moveTo`, which moves every post across and deletes the emptied category.
 * `posts.category_id` is ON DELETE RESTRICT in the database, so this is not the
 * only thing standing between a manager and orphaned rows.
 */

export function makeCategoriesHandler(
  guard: (req: VercelRequest, res: VercelResponse) => Promise<{ userId: string }>,
) {
  return endpoint(
    { methods: ['GET', 'POST', 'PUT', 'DELETE'], csrf: true },
    async (req: VercelRequest, res: VercelResponse) => {
      const manager = await guard(req, res);
      const path = (req.url ?? '').split('?')[0]?.replace(/\/+$/, '') ?? '';
      if (!path.endsWith('/categories') && !path.endsWith('/category')) {
        throw new ApiError(404, 'not_found', 'No such endpoint.');
      }

      if (req.method === 'GET') return listHandler(res);
      if (req.method === 'POST') return createHandler(req, res, manager.userId);
      if (req.method === 'PUT') return renameHandler(req, res, manager.userId);
      return deleteHandler(req, res, manager.userId);
    },
  );
}

export default makeCategoriesHandler(requireAdmin);

async function listHandler(res: VercelResponse): Promise<void> {
  sendJson(res, 200, { categories: await listCategories() });
}

async function writeRateLimit(userId: string, name: string): Promise<void> {
  await enforceRateLimit({ name, identifier: userId, limit: 60, windowSeconds: 60 });
}

async function createHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-category-write');
  const data = parseInput(categoryCreateSchema, parseJsonBody(req));

  try {
    const created = await insertCategory({ name: data.name, slug: data.slug });
    if (!created) throw new ApiError(500, 'not_saved', 'The category could not be created.');
    sendJson(res, 201, { category: await findCategoryById(created.id) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'slug_taken', 'That slug is already in use.', {
        slug: 'That slug is already in use.',
      });
    }
    throw error;
  }
}

async function renameHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-category-write');
  const data = parseInput(categoryUpdateSchema, parseJsonBody(req));

  const existing = await findCategoryById(data.id);
  if (!existing) throw new ApiError(404, 'not_found', 'That category could not be found.');

  try {
    await updateCategory({ id: data.id, name: data.name, slug: data.slug });
    sendJson(res, 200, { category: await findCategoryById(data.id) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'slug_taken', 'That slug is already in use.', {
        slug: 'That slug is already in use.',
      });
    }
    throw error;
  }
}

async function deleteHandler(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  await writeRateLimit(userId, 'admin-category-delete');

  const moveTo = typeof req.query?.moveTo === 'string' ? req.query.moveTo : undefined;
  const data = parseInput(categoryDeleteSchema, { id: req.query?.id, moveTo });

  const existing = await findCategoryById(data.id);
  if (!existing) throw new ApiError(404, 'not_found', 'That category could not be found.');

  if (existing.post_count > 0) {
    const targetId = data.moveTo;
    const target = targetId ? await findCategoryById(targetId) : null;

    if (!target) {
      // Not an ApiError: `fields` is a map of strings for pointing at inputs,
      // and this answer also carries the list the dialog needs to render. It is
      // sent directly so the extra key survives.
      const categories = await listCategories();
      sendJson(res, 409, {
        error: `"${existing.name}" still has ${existing.post_count} post${existing.post_count === 1 ? '' : 's'}. Choose a category to move them to.`,
        code: 'category_in_use',
        fields: { moveTo: 'Choose where these posts should go.' },
        category: { id: existing.id, name: existing.name, postCount: existing.post_count },
        options: categories
          .filter((category) => category.id !== existing.id)
          .map((category) => ({ id: category.id, name: category.name, postCount: category.post_count })),
      });
      return;
    }

    const moved = await movePostsToCategory(existing.id, target.id);
    markContentChanged();
    sendJson(res, 200, {
      ok: true,
      deleted: { id: existing.id, name: existing.name },
      movedPosts: moved,
      into: { id: target.id, name: target.name },
    });
    return;
  }

  let deleted: boolean;
  try {
    deleted = await deleteCategory(data.id);
  } catch (error) {
    // A post was added to this category after the count above. The foreign key
    // stopped it, which is the same answer as the pre-check - so report it that
    // way rather than as a server error.
    if (isRestrictViolation(error)) {
      const count = (await findCategoryById(data.id))?.post_count ?? 1;
      sendJson(res, 409, {
        error: `"${existing.name}" has ${count} post${count === 1 ? '' : 's'}. Choose a category to move them to.`,
        code: 'category_in_use',
        fields: { moveTo: 'Choose where these posts should go.' },
        category: { id: existing.id, name: existing.name, postCount: count },
      });
      return;
    }
    throw error;
  }

  if (!deleted) throw new ApiError(404, 'not_found', 'That category could not be found.');

  sendJson(res, 200, { ok: true, deleted: { id: existing.id, name: existing.name }, movedPosts: 0 });
}
