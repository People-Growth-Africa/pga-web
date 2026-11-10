import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { useAuth } from '../../hooks/useAuth';
import { onSessionEnded } from '../../lib/authClient';
import { livePostPath } from '../../lib/published';
import PostEditor from './PostEditor';
import CategoriesDialog from './CategoriesDialog';
import AccessRequestDialog from './AccessRequestDialog';
import {
  ACCESS_PERMISSIONS,
  listAccess,
  requestAccess,
  type AccessDuration,
  type AccessOverview,
  type AccessPermission,
} from './AccessClient';
import {
  createCategory,
  createPost,
  deleteCategory,
  deletePost,
  purgePost,
  listContent,
  pingSession,
  setPostStatus,
  updateCategory,
  updatePost,
  restorePost,
  uploadCover,
  type AdminCategory,
  type AdminPost,
  type PostDraft,
  type PostType,
} from './oversightClient';

/* Row actions read as buttons, not as prose: the same pill shapes the content
   desk uses, so the two panels feel like one product. */
const smallOutline =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-charcoal/15 bg-white px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint';

const smallPrimary =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-deep-green bg-deep-green px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta';

const smallDanger =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-red-200 bg-white px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-red-600 transition-colors hover:bg-red-50';

type View = 'list' | 'create' | 'edit';

/**
 * /admin/oversight - content tools for staff with content permissions.
 *
 * It deliberately uses its own page and the /api/admin/* oversight endpoints,
 * never the content manager's /content page or /api/content/* routes. The
 * server checks effective permissions on every request; this page only
 * controls which actions are offered.
 */
export default function AdminOversight() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [access, setAccess] = useState<AccessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [showDeleted, setShowDeleted] = useState(false);
  const [postStatus, setPostStatusFilter] = useState('');
  const [editing, setEditing] = useState<AdminPost | null>(null);
  const [createType, setCreateType] = useState<PostType>('blog');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [selectedPermission, setSelectedPermission] = useState<AccessPermission | null>(null);
  const navigate = useNavigate();

  const endSession = useCallback(() => {
    navigate('/admin/login?expired=1', {
      replace: true,
      state: { from: '/admin/oversight' },
    });
  }, [navigate]);
  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const refresh = useCallback(async () => {
    const accessResult = await listAccess();
    if (!accessResult.ok) {
      setError(accessResult.failure.error);
      setLoading(false);
      return;
    }
    setAccess(accessResult.data);

    const effectivePermissions = accessResult.data.effectivePermissions;
    const canEdit = effectivePermissions.includes('content.edit');
    const canPublish = effectivePermissions.includes('content.publish');
    if (!canEdit && !canPublish) {
      setPosts([]);
      setCategories([]);
      setError(null);
      setLoading(false);
      return;
    }

    const result = await listContent({ deletedOnly: showDeleted, status: postStatus || undefined });
    if (!result.ok) {
      setError(result.failure.error);
      setLoading(false);
      return;
    }
    setPosts(result.data.posts);
    setCategories(result.data.categories);
    setError(null);
    setLoading(false);
  }, [showDeleted, postStatus]);

  const canEdit = access?.effectivePermissions.includes('content.edit') ?? false;
  const canPublish = access?.effectivePermissions.includes('content.publish') ?? false;
  const latestRequests = useMemo(() => {
    const requests = [...(access?.requests ?? [])].sort(
      (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
    );
    const latest = new Map<AccessPermission, AccessOverview['requests'][number]>();
    for (const request of requests) {
      if (!latest.has(request.permission)) latest.set(request.permission, request);
    }
    return latest;
  }, [access?.requests]);

  async function submitAccessRequest(reason: string, requestedDuration: AccessDuration) {
    if (!selectedPermission) {
      return {
        ok: false as const,
        failure: { error: 'Choose a permission to request.', code: 'invalid_permission' },
      };
    }
    const result = await requestAccess({
      permission: selectedPermission,
      reason,
      requestedDuration,
    });
    if (result.ok) {
      setNotice('Your request was sent for review.');
      await refresh();
    }
    return result;
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Writing an article for an hour sends no requests, and a staff session ends
  // after thirty minutes without one. Real interaction is what says otherwise,
  // so the save at the end of a long edit is not the first request in half an
  // hour - which the server would answer with a 401 and a lost draft.
  useEffect(() => {
    let lastPing = Date.now();
    const ping = () => {
      const now = Date.now();
      if (now - lastPing < 5 * 60 * 1000) return;
      lastPing = now;
      void pingSession();
    };
    const events = ['pointerdown', 'keydown', 'focus'] as const;
    for (const event of events) window.addEventListener(event, ping);
    return () => {
      for (const event of events) window.removeEventListener(event, ping);
    };
  }, []);

  async function save(draft: PostDraft) {
    setSaving(true);
    setEditorError(null);
    const result = editing ? await updatePost(editing.id, draft) : await createPost(draft);
    setSaving(false);
    if (!result.ok) {
      setEditorError(result.failure.fields?.slug ?? result.failure.error);
      return;
    }
    await refresh();
    setView('list');
    setEditing(null);
    setNotice(draft.status === 'scheduled' ? 'Scheduled.' : draft.status === 'published' ? 'Published.' : 'Saved as a draft.');
  }

  async function toggle(post: AdminPost) {
    const next = post.status === 'published' ? 'draft' : 'published';
    const result = await setPostStatus(post.id, next);
    if (!result.ok) {
      setNotice(result.failure.error);
      return;
    }
    await refresh();
    setNotice(next === 'published' ? 'Republished.' : 'Unpublished.');
  }

  async function remove(post: AdminPost) {
    if (!window.confirm(`Delete “${post.title}”? It will be moved to Deleted and can be restored.`)) return;
    const result = await deletePost(post.id);
    if (!result.ok) {
      setNotice(result.failure.error);
      return;
    }
    await refresh();
    setNotice('Deleted.');
  }

  async function restore(post: AdminPost) {
    const result = await restorePost(post.id);
    if (!result.ok) {
      setNotice(result.failure.error);
      return;
    }
    await refresh();
    setNotice('Restored.');
  }

  async function purge(post: AdminPost) {
    const result = await purgePost(post.id);
    if (!result.ok) {
      setNotice(result.failure.error);
      return;
    }
    await refresh();
    setNotice('Permanently purged.');
  }

  return (
    <>
      <SEO title="Content oversight | People Growth Africa" description="Admin content oversight." />
      <AdminShell
        title={view === 'list' ? 'Content oversight' : editing ? 'Edit post' : 'New post'}
        subtitle="Create and manage blog posts and events. Editing and publishing access are checked separately."
        actions={
          view === 'list' && canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setCategoriesOpen(true)}
                className={secondaryAction}
              >
                Categories
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreateType('event');
                  setView('create');
                }}
                className={secondaryAction}
              >
                New event
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreateType('blog');
                  setView('create');
                }}
                className={primaryAction}
              >
                New post
              </button>
            </>
          ) : null
        }
      >
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-[12px] border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-[12px] border border-brand-green/30 bg-mint/40 px-4 py-3 text-sm text-charcoal"
          >
            {notice}
          </p>
        )}

        {access && (!canEdit || !canPublish) && (
          <section className="mb-6 grid gap-3 xl:grid-cols-2" aria-label="Locked content permissions">
            {(!canEdit || !canPublish) &&
              ACCESS_PERMISSIONS.filter((permission) =>
                permission.id === 'content.edit'
                  ? !canEdit
                  : permission.id === 'content.publish' && !canPublish,
              ).map((permission) => {
                const request = latestRequests.get(permission.id);
                const pending = request?.status === 'pending';
                return (
                  <article
                    key={permission.id}
                    className="flex flex-col justify-between gap-4 rounded-[14px] border border-charcoal/10 bg-white p-5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-deep-green">
                        Access needed
                      </p>
                      <h2 className="mt-1 font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal">
                        {permission.label}
                      </h2>
                      {pending ? (
                        <p className="mt-1 text-xs text-[#754A21]">Request pending review.</p>
                      ) : request?.status === 'declined' ? (
                        <p className="mt-1 text-xs text-terracotta">
                          Declined: {request.decision_note || 'No note was provided.'}
                        </p>
                      ) : request?.status === 'approved' ? (
                        <p className="mt-1 text-xs text-charcoal/55">
                          Previously approved
                          {request.grant_expires_at
                            ? ` until ${formatDate(request.grant_expires_at)}`
                            : ' permanently'}
                          ; that access is no longer active.
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-charcoal/60">{permission.description}</p>
                      )}
                    </div>
                    {!pending && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPermission(permission.id);
                          setError(null);
                          setNotice(null);
                        }}
                        className={smallOutline}
                      >
                        Request access
                      </button>
                    )}
                  </article>
                );
              })}
          </section>
        )}

        {view !== 'list' ? (
          <PostEditor
            key={editing?.id ?? `new-${createType}`}
            mode={view === 'create' ? 'create' : 'edit'}
            post={editing}
            initialType={createType}
            categories={categories}
            saving={saving}
            error={editorError}
            canPublish={canPublish}
            onCancel={() => {
              setView('list');
              setEditing(null);
              setEditorError(null);
            }}
            onSubmit={(draft) => void save(draft)}
            onAddCategory={async () => {
              // The dialog owns the form; the editor stays behind it and the
              // refreshed list is ready when the reader closes it.
              setCategoriesOpen(true);
              return null;
            }}
            uploadCover={uploadCover}
          />
        ) : loading || (access === null && !error) ? (
          <p className="rounded-[16px] border border-charcoal/10 bg-white p-10 text-center text-sm text-charcoal/50">
            Loading content permissions…
          </p>
        ) : access && !canEdit && !canPublish ? (
          <p className="rounded-[16px] border border-charcoal/10 bg-white p-10 text-center text-sm text-charcoal/55">
            Request content access above to use these tools.
          </p>
        ) : access === null ? (
          <p className="rounded-[16px] border border-charcoal/10 bg-white p-10 text-center text-sm text-charcoal/55">
            Content permissions could not be verified. Try refreshing the page.
          </p>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              {[false, true].map((deleted) => (
                <button key={String(deleted)} type="button" aria-pressed={showDeleted === deleted}
                  onClick={() => setShowDeleted(deleted)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${showDeleted === deleted ? 'bg-deep-green text-white' : 'bg-cream text-charcoal/70'}`}>
                  {deleted ? 'Deleted' : 'Active'}
                </button>
              ))}
              <select value={postStatus} onChange={(event) => setPostStatusFilter(event.target.value)} aria-label="Filter content status"
                className="ml-auto min-h-10 rounded-full border border-charcoal/15 bg-white px-4 text-sm">
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
            {posts.length === 0 ? (
          <p className="rounded-[16px] border border-charcoal/10 bg-white p-10 text-center text-sm text-charcoal/50">
            {showDeleted ? 'No deleted posts or events.' : 'No posts or events yet.'}
          </p>
            ) : (
          <ul className="space-y-3.5">
            {posts.map((post) => {
              const published = post.status === 'published';
              return (
                <li
                  key={post.id}
                  className="rounded-[16px] border border-charcoal/10 bg-white px-5 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.035)] sm:px-6"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2.5">
                        <PublishBadge published={published} />
                        <TypeBadge type={post.type} />
                        <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                          {published ? 'Live on the site' : post.status === 'scheduled' ? `Scheduled for ${post.publish_at ? new Date(post.publish_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }) : 'later'}` : 'Not published'}
                        </span>
                      </div>
                      <h2 className="break-words font-[family-name:var(--font-heading)] text-[1.25rem] font-semibold leading-snug text-charcoal sm:text-[1.35rem]">
                        {post.title}
                      </h2>
                      <p className="mt-1 break-all font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/45">
                        /{post.type}/{post.slug}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      {canEdit && !showDeleted && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(post);
                            setEditorError(null);
                            setView('edit');
                          }}
                          className={smallOutline}
                        >
                          Edit
                        </button>
                      )}
                      {canPublish && !showDeleted && (
                        <button
                          type="button"
                          onClick={() => void toggle(post)}
                          className={published ? smallOutline : smallPrimary}
                        >
                          {published ? 'Unpublish' : 'Publish'}
                        </button>
                      )}
                      {canEdit && !showDeleted && (
                        <button type="button" onClick={() => void remove(post)} className={smallDanger}>
                          Delete
                        </button>
                      )}
                      {showDeleted && canEdit && (
                        <button type="button" onClick={() => void restore(post)} className={smallOutline}>Restore</button>
                      )}
                      {showDeleted && user?.isSuperAdmin && (
                        <button type="button" onClick={() => {
                          if (window.confirm(`Permanently purge “${post.title}”? This cannot be undone.`)) void purge(post);
                        }} className={smallDanger}>Purge</button>
                      )}
                      {!showDeleted && published && (
                        <a
                          href={livePostPath(post)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[38px] items-center rounded-full px-3 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green underline decoration-brand-green/40 underline-offset-2 hover:bg-mint"
                        >
                          View
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
            )}
          </>
        )}
      </AdminShell>

      <CategoriesDialog
        open={categoriesOpen}
        categories={categories}
        onClose={() => setCategoriesOpen(false)}
        onChanged={() => {
          void refresh();
        }}
        client={{ createCategory, updateCategory, deleteCategory }}
      />
      {selectedPermission && (
        <AccessRequestDialog
          permission={selectedPermission}
          currentStatus={latestRequests.get(selectedPermission)?.status ?? null}
          onSubmit={submitAccessRequest}
          onCancel={() => setSelectedPermission(null)}
        />
      )}
    </>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

function PublishBadge({ published }: { published: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 font-[family-name:var(--font-body)] text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${
        published ? 'bg-mint text-deep-green' : 'bg-[#EAE5DC] text-charcoal/55'
      }`}
    >
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 font-[family-name:var(--font-body)] text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${
        type === 'event' ? 'bg-[#F8E6D6] text-[#A3571F]' : 'bg-[#F3EBDD] text-[#8B6A40]'
      }`}
    >
      {type}
    </span>
  );
}

/* The same rounded action blocks the Data page uses in its header. */
const secondaryAction =
  'inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-[10px] border border-charcoal/10 bg-white px-5 py-2.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint';

const primaryAction =
  'inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-[10px] border border-deep-green bg-deep-green px-5 py-2.5 font-[family-name:var(--font-body)] text-[0.95rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta';
