import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  ApiError,
  MAX_ADMIN_BODY_BYTES,
  clientIp,
  endpoint,
  parseJsonBody,
  sendJson,
} from '../http.js';
import { hasEffectivePermission } from '../access.js';
import { requireAnyPermission, requirePermission, requireSuperAdmin } from '../staff.js';
import { auditActorForUser, logAudit, prepareAuditWrite, recordAuthEvent } from '../audit.js';
import {
  parseInput,
  postByIdSchema,
  postCreateSchema,
  postListQuerySchema,
  postStatusSchema,
  postRestoreSchema,
  postUpdateSchema,
  type PostCreateInput,
} from '../validation.js';
import {
  deletePost,
  permanentlyDeletePost,
  findPostById,
  hasPostSlugConflict,
  insertPost,
  isUniqueViolation,
  listCategories,
  listPostSpeakers,
  listPostsForAdmin,
  listSpeakersForPosts,
  recordPostSlugRedirect,
  restorePost,
  syncPostSpeakers,
  updatePost,
  type Role,
  type SpeakerRow,
  type SpeakerWrite,
} from '../db.js';
import { enforceRateLimit } from '../ratelimit.js';
import { markContentChanged } from '../content/version.js';
import { deleteCoverBlobs, deleteMediaBlobs } from '../cover-blobs.js';
import { announcePostChange } from '../indexnow.js';
import { scheduleBestEffort } from '../best-effort.js';
import { reportRecordDeletion } from '../security-alerts.js';

/**
 * POST /api/admin/posts        - list, with optional status/category/search filters
 * PUT  /api/admin/posts        - create
 * PUT  /api/admin/post         - update (id in the body)
 * POST /api/admin/post-status  - publish or unpublish one post
 * DELETE /api/admin/post?id=   - delete
 *
 * The oversight routes use separate effective-permission guards for listing,
 * editing, and publishing. The content desk keeps its original
 * `requireContentManager` guard. The UI is not an authorization boundary; each
 * route checks the current account and active grants on the server.
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

export function makePostsHandler(
  guard: PostGuard | PostGuards,
) {
  return endpoint({ methods: ['GET', 'PUT', 'POST', 'DELETE'], csrf: true }, async (req, res) => {
    const path = (req.url ?? '').split('?')[0]?.replace(/\/+$/, '') ?? '';
    const statusRoute = path.endsWith('/post-status');
    const itemRoute = path.endsWith('/post');
    const listRoute =
      req.method === 'GET' ||
      (req.method === 'POST' && !statusRoute && !itemRoute);
    const selectedGuard =
      typeof guard === 'function'
        ? guard
        : statusRoute
          ? guard.publish
          : listRoute
            ? guard.read
            : guard.edit;
    const manager = await selectedGuard(req, res);

    if (req.method === 'GET') return listHandler(req, res);
    if (path.endsWith('/post')) {
      if (req.method === 'DELETE') return deleteHandler(req, res, manager);
      if (req.method === 'POST') return restoreHandler(req, res, manager);
      return updateHandler(req, res, manager);
    }
    if (path.endsWith('/post-status')) return statusHandler(req, res, manager);
    if (req.method === 'PUT') return createHandler(req, res, manager);

    return listHandler(req, res);
  });
}

type PostActor = { userId: string; role: Role };
type PostGuard = (
  req: VercelRequest,
  res: VercelResponse,
) => Promise<PostActor>;
type PostGuards = {
  read: PostGuard;
  edit: PostGuard;
  publish: PostGuard;
};

/** /api/admin/posts, /api/admin/post, /api/admin/post-status — admin oversight. */
export default makePostsHandler({
  read: (req, res) =>
    requireAnyPermission(req, res, ['content.edit', 'content.publish']),
  edit: (req, res) => requirePermission(req, res, 'content.edit'),
  publish: (req, res) => requirePermission(req, res, 'content.publish'),
});

async function listHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const query = req.query ?? {};
  const parsedFilter = parseInput(postListQuerySchema, {
    ...(typeof query.type === 'string' ? { type: query.type } : {}),
    ...(typeof query.status === 'string' ? { status: query.status } : {}),
    ...(typeof query.categoryId === 'string' ? { categoryId: query.categoryId } : {}),
    ...(typeof query.search === 'string' ? { search: query.search } : {}),
    ...(typeof query.deleted === 'string' ? { deleted: query.deleted } : {}),
  });

  const filter = {
    ...parsedFilter,
    deletedOnly: parsedFilter.deleted === 'true',
  };

  const [posts, categories] = await Promise.all([
    listPostsForAdmin(filter),
    listCategories(),
  ]);

  const speakers = await listSpeakersForPosts(posts.map((post) => post.id));
  sendJson(res, 200, { posts: withSpeakers(posts, speakers), categories });
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
  registrationIntro?: string | null;
  registrationButtonLabel?: string | null;
  registrationForm?: unknown;
  showSpeakers?: boolean;
  status: 'draft' | 'published' | 'scheduled';
  publishAt?: string | null;
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
    registrationIntro: data.registrationIntro ?? null,
    registrationButtonLabel: data.registrationButtonLabel ?? null,
    registrationForm: data.registrationForm ?? null,
    showSpeakers: data.showSpeakers ?? true,
    status: data.status,
    publishAt: data.status === 'scheduled' ? data.publishAt ?? null : null,
  };
}

/** The list rows, each carrying its own speakers in position order. */
function withSpeakers<T extends { id: string }>(posts: T[], speakers: SpeakerRow[]) {
  const byPost = new Map<string, SpeakerRow[]>();
  for (const row of speakers) {
    const list = byPost.get(row.post_id);
    if (list) list.push(row);
    else byPost.set(row.post_id, [row]);
  }
  return posts.map((post) => ({ ...post, speakers: byPost.get(post.id) ?? [] }));
}

/** One post, as create and update answer with it: the row plus its speakers. */
async function postWithSpeakers(id: string) {
  const post = await findPostById(id);
  if (!post) return post;
  return { ...post, speakers: await listPostSpeakers(id) };
}

/**
 * The validated request, as the row writes expect it.
 *
 * The schema's optional fields are `undefined` when they were left out; the
 * database columns want a value, so every one is normalised to null here rather
 * than in six places.
 */
function speakerWrites(speakers: PostCreateInput['speakers']): SpeakerWrite[] {
  return (speakers ?? []).map((speaker) => ({
    id: speaker.id ?? null,
    name: speaker.name,
    role: speaker.role ?? null,
    organisation: speaker.organisation ?? null,
    bio: speaker.bio ?? null,
    photoUrl: speaker.photoUrl ?? null,
    photoThumbUrl: speaker.photoThumbUrl ?? null,
    linkedinUrl: speaker.linkedinUrl ?? null,
    photoFocusX: speaker.photoFocusX,
    photoFocusY: speaker.photoFocusY,
  }));
}

/**
 * Saves a post's speakers and says who changed what.
 *
 * The audit is written per speaker rather than per request: a manager reading
 * the log wants to see "Ada Obi removed", not "speakers saved". Reordering
 * gets one entry of its own, because it changes the page without changing any
 * speaker's details.
 */
async function saveSpeakers(input: {
  req: VercelRequest;
  userId: string;
  postId: string;
  speakers: SpeakerWrite[];
}): Promise<void> {
  const before = await listPostSpeakers(input.postId);
  const { removed } = await syncPostSpeakers(input.postId, input.speakers);
  const after = await listPostSpeakers(input.postId);
  await logSpeakerChanges({ ...input, before, after, removed });

  // Photos of a speaker that is gone, or that was given a different photo, are
  // no longer pointed at by anything: object storage has no cascade.
  const replaced = before.flatMap((row) => {
    const now = after.find((entry) => entry.id === row.id);
    if (!now) return [];
    return [
      now.photo_url !== row.photo_url ? row.photo_url : null,
      now.photo_thumb_url !== row.photo_thumb_url ? row.photo_thumb_url : null,
    ];
  });
  await deleteMediaBlobs([
    ...removed.flatMap((row) => [row.photo_url, row.photo_thumb_url]),
    ...replaced,
  ]);
}

async function logSpeakerChanges(input: {
  req: VercelRequest;
  userId: string;
  postId: string;
  before: SpeakerRow[];
  after: SpeakerRow[];
  removed: SpeakerRow[];
}): Promise<void> {
  const actor = await auditActorForUser(input.userId);
  const beforeById = new Map(input.before.map((row) => [row.id, row]));
  const afterById = new Map(input.after.map((row) => [row.id, row]));

  for (const row of input.after) {
    const previous = beforeById.get(row.id);
    const entity = { type: 'speaker', id: input.postId, label: row.name };

    if (!previous) {
      await logAudit({
        req: input.req,
        actor,
        action: 'content.speaker_add',
        entity,
        after: { name: row.name, position: row.position },
      });
      continue;
    }

    const fields = [
      'name',
      'role',
      'organisation',
      'bio',
      'photo_url',
      'photo_thumb_url',
      'linkedin_url',
      'photo_focus_x',
      'photo_focus_y',
    ] as const;
    if (fields.some((key) => previous[key] !== row[key])) {
      await logAudit({
        req: input.req,
        actor,
        action: 'content.speaker_edit',
        entity,
        before: { name: previous.name, position: previous.position },
        after: { name: row.name, position: row.position },
      });
    }
  }

  for (const row of input.removed) {
    await logAudit({
      req: input.req,
      actor,
      action: 'content.speaker_remove',
      entity: { type: 'speaker', id: input.postId, label: row.name },
      before: { name: row.name, position: row.position },
    });
  }

  const commonBefore = input.before.filter((row) => afterById.has(row.id)).map((row) => row.id);
  const commonAfter = input.after.filter((row) => beforeById.has(row.id)).map((row) => row.id);
  if (commonBefore.length > 1 && commonBefore.join('|') !== commonAfter.join('|')) {
    await logAudit({
      req: input.req,
      actor,
      action: 'content.speaker_reorder',
      entity: { type: 'speaker', id: input.postId, label: null },
      before: { count: commonBefore.length },
      after: { count: commonAfter.length },
    });
  }
}

async function createHandler(req: VercelRequest, res: VercelResponse, manager: PostActor): Promise<void> {
  const { userId, role } = manager;
  await writeRateLimit(userId, 'admin-post-write');
  const data = parseInput(postCreateSchema, parseJsonBody(req, MAX_ADMIN_BODY_BYTES));
  const status = (await hasEffectivePermission(userId, role, 'content.publish'))
    ? data.status
    : 'draft';

  await assertCategoryExists(data.categoryId ?? null);
  if (await hasPostSlugConflict(data.type, data.slug, null)) {
    throw fieldError('slug', 'That slug is already in use by a page or an old link. Choose another slug.');
  }

  try {
    const audit = prepareAuditWrite({
      req,
      actor: await auditActorForUser(userId),
      action: status === 'scheduled' ? 'content.scheduled' : 'content.create',
      entity: { type: data.type === 'event' ? 'event' : 'post', label: data.title },
      after: {
        type: data.type,
        slug: data.slug,
        title: data.title,
        status,
        ...(status === 'scheduled' ? { publish_at: data.publishAt } : {}),
      },
    });
    const id = await insertPost({
      ...postColumnsFrom({ ...data, status }),
      authorId: userId,
      audit,
    });
    if (!id) throw new ApiError(500, 'not_saved', 'The post could not be saved. Try again.');
    if (data.speakers !== undefined) {
      await saveSpeakers({ req, userId, postId: id, speakers: speakerWrites(data.speakers) });
    }

    markContentChanged();
    const post = await postWithSpeakers(id);
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

async function updateHandler(req: VercelRequest, res: VercelResponse, manager: PostActor): Promise<void> {
  const { userId, role } = manager;
  await writeRateLimit(userId, 'admin-post-write');
  const data = parseInput(postUpdateSchema, parseJsonBody(req, MAX_ADMIN_BODY_BYTES));
  const status = (await hasEffectivePermission(userId, role, 'content.publish'))
    ? data.status
    : 'draft';

  const existing = await findPostById(data.id);
  if (!existing || existing.deleted_at) throw new ApiError(404, 'not_found', 'That post could not be found.');

  await assertCategoryExists(data.categoryId ?? null);
  if (await hasPostSlugConflict(data.type, data.slug, data.id)) {
    throw fieldError('slug', 'That slug is already in use by a page or another post’s old link. Choose another slug.');
  }

  try {
    const next = {
      type: data.type,
      slug: data.slug,
      title: data.title,
      status,
      publish_at: status === 'scheduled' ? data.publishAt ?? null : null,
    };
    const previous = {
      type: existing.type,
      slug: existing.slug,
      title: existing.title,
      status: existing.status,
      publish_at: existing.publish_at,
    };
    const auditAction = status === 'scheduled'
      ? existing.status === 'scheduled' ? 'content.rescheduled' : 'content.scheduled'
      : existing.status === 'scheduled' && status === 'draft'
        ? 'content.unscheduled'
        : 'content.edit';
    const audit = prepareAuditWrite({
      req,
      actor: await auditActorForUser(userId),
      action: auditAction,
      entity: {
        type: existing.type === 'event' ? 'event' : 'post',
        id: existing.id,
        label: data.title,
      },
      before: previous,
      after: next,
    });
    const updated = await updatePost({
      id: data.id,
      ...postColumnsFrom({ ...data, status }),
      audit,
    });
    if (!updated) throw new ApiError(500, 'not_saved', 'The post could not be saved. Try again.');
    if (data.speakers !== undefined) {
      await saveSpeakers({
        req,
        userId,
        postId: data.id,
        speakers: speakerWrites(data.speakers),
      });
    }

    if (existing.slug !== data.slug || existing.type !== data.type) {
      await recordPostSlugRedirect(existing.type, existing.slug, data.slug, existing.id);
    }

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
    const post = await postWithSpeakers(data.id);
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
async function statusHandler(req: VercelRequest, res: VercelResponse, manager: PostActor): Promise<void> {
  const { userId } = manager;
  await writeRateLimit(userId, 'admin-post-write');
  // The status schema rather than a `.pick` of the update one: that schema is
  // now a refinement plus a transform, which has nothing left to pick from.
  const { id, status } = parseInput(postStatusSchema, parseJsonBody(req));
  const existing = await findPostById(id);
  if (!existing) throw new ApiError(404, 'not_found', 'That post could not be found.');

  const audit = prepareAuditWrite({
    req,
    actor: await auditActorForUser(userId),
    action: existing.status === 'scheduled' && status === 'draft'
      ? 'content.unscheduled'
      : status === 'published' ? 'content.publish' : 'content.unpublish',
    entity: {
      type: existing.type === 'event' ? 'event' : 'post',
      id: existing.id,
      label: existing.title,
    },
    before: { type: existing.type, slug: existing.slug, title: existing.title, status: existing.status },
    after: {
      type: existing.type,
      slug: existing.slug,
      title: existing.title,
      status,
      ...(existing.status === 'scheduled' ? { publish_at: null } : {}),
    },
  });
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
    registrationIntro: existing.registration_intro,
    registrationButtonLabel: existing.registration_button_label,
    registrationForm: existing.registration_form,
    showSpeakers: existing.show_speakers,
    status,
    publishAt: null,
    audit,
  });
  if (!updated) throw new ApiError(500, 'not_saved', 'That change could not be saved. Try again.');

  markContentChanged();
  const post = await postWithSpeakers(id);
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

async function deleteHandler(req: VercelRequest, res: VercelResponse, manager: PostActor): Promise<void> {
  const { userId } = manager;
  await writeRateLimit(userId, 'admin-post-delete');
  const { id } = parseInput(postByIdSchema, { id: req.query?.id });

  const existing = await findPostById(id);
  if (!existing) throw new ApiError(404, 'not_found', 'That post could not be found.');

  const permanent = req.query?.purge === 'true';
  if (permanent) await requireSuperAdmin(req, res);
  // Read before the delete: the rows cascade away with the post, and their
  // photos are not in the database at all.
  const speakerPhotos = permanent
    ? (await listPostSpeakers(id)).flatMap((row) => [row.photo_url, row.photo_thumb_url])
    : [];
  const audit = prepareAuditWrite({
    req,
    actor: await auditActorForUser(userId),
    action: permanent ? 'content.purge' : 'content.delete',
    entity: { type: existing.type === 'event' ? 'event' : 'post', id: existing.id, label: existing.title },
    before: { type: existing.type, slug: existing.slug, title: existing.title, status: existing.status },
  });
  const deleted = permanent
    ? await permanentlyDeletePost(id, audit)
    : await deletePost(id, audit);
  if (!deleted) throw new ApiError(404, 'not_found', 'That post could not be found.');
  scheduleBestEffort(() => reportRecordDeletion(userId), 'security-alert');

  if (permanent) {
    await deleteCoverBlobs([existing.cover_image_url, existing.cover_image_thumb_url]);
    await deleteMediaBlobs(speakerPhotos);
  }
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

async function restoreHandler(req: VercelRequest, res: VercelResponse, manager: PostActor): Promise<void> {
  const { userId } = manager;
  const { id } = parseInput(postRestoreSchema, parseJsonBody(req));
  const existing = await findPostById(id);
  if (!existing) throw new ApiError(404, 'not_found', 'That post could not be found.');
  const audit = prepareAuditWrite({
    req,
    actor: await auditActorForUser(userId),
    action: 'content.restore',
    entity: { type: existing.type === 'event' ? 'event' : 'post', id, label: existing.title },
    before: { type: existing.type, slug: existing.slug, title: existing.title, status: existing.status },
    after: { type: existing.type, slug: existing.slug, title: existing.title, status: existing.status },
  });
  if (!(await restorePost(id, audit))) throw new ApiError(404, 'not_found', 'That post could not be restored.');
  markContentChanged();
  sendJson(res, 200, { ok: true, id });
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
