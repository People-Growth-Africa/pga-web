import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import SEO from '../../components/SEO';
import AdminShell from '../../components/admin/AdminShell';
import { onSessionEnded } from '../../lib/authClient';
import { livePostPath } from '../../lib/published';
import CategoriesDialog from './CategoriesDialog';
import PostEditor from './PostEditor';
import {
  createPost,
  deletePost,
  listContent,
  pingSession,
  setPostStatus,
  updatePost,
  uploadCover,
  type AdminCategory,
  type AdminPost,
  type PostDraft,
  type PostType,
} from './contentClient';

/**
 * The content workspace, shared by `/admin/content` (administrators) and
 * `/content` (content managers).
 *
 * The list, editor and dialogs share state, so they stay in one file. The page
 * only chooses what to show; every request it makes is checked again by
 * `requireContentManager`, which is also what stops a project or HR manager
 * from reaching this screen through the administrator cookie.
 */

type View = 'list' | 'create' | 'edit';
type Notice = { kind: 'success' | 'error'; text: string } | null;
type Portal = 'admin' | 'content';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
] as const;

const TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'blog', label: 'Blog' },
  { value: 'event', label: 'Events' },
] as const;

export default function AdminContent({ portal = 'admin' }: { portal?: Portal }) {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<AdminPost | null>(null);
  const [createType, setCreateType] = useState<PostType>('blog');
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const searchRef = useRef(search);
  const navigate = useNavigate();

  const endSession = useCallback(() => {
    // Carry the page being edited through the sign-in, so a session that ends
    // mid-edit comes back to the content workspace rather than the dashboard.
    navigate(portal === 'content' ? '/content/login?expired=1' : '/admin/login?expired=1', {
      replace: true,
      state: { from: portal === 'content' ? '/content' : '/admin/content' },
    });
  }, [navigate, portal]);

  useEffect(() => onSessionEnded(() => endSession()), [endSession]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await listContent({ signal });
    if (!result.ok) {
      setLoadError(result.failure.error);
      setLoading(false);
      return;
    }

    setPosts(result.data.posts);
    setCategories(result.data.categories);
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    searchRef.current = search;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await listContent({
          search: searchRef.current || undefined,
          status: status || undefined,
          type: type || undefined,
        });
        if (result.ok) setPosts(result.data.posts);
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, status, type]);

  // Writing an article for an hour sends no requests, and a staff session ends
  // after thirty minutes without one. Real interaction is what says otherwise.
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

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  function openCreate(nextType: PostType) {
    setEditing(null);
    setCreateType(nextType);
    setEditorError(null);
    setView('create');
  }

  async function handleSubmit(draft: PostDraft) {
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
    setNotice({
      kind: 'success',
      text:
        draft.status === 'published'
          ? `“${draft.title}” is published.`
          : `Draft “${draft.title}” saved.`,
    });
  }

  async function handleToggleStatus(post: AdminPost) {
    const next = post.status === 'published' ? 'draft' : 'published';
    const result = await setPostStatus(post.id, next);

    if (!result.ok) {
      setNotice({ kind: 'error', text: result.failure.error });
      return;
    }
    await refresh();
    setNotice({
      kind: 'success',
      text: next === 'published' ? `“${post.title}” is published.` : `“${post.title}” is a draft again.`,
    });
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);

    const result = await deletePost(pendingDelete.id);
    setDeleteBusy(false);

    if (!result.ok) {
      setNotice({ kind: 'error', text: result.failure.error });
      setPendingDelete(null);
      return;
    }

    await refresh();
    setPendingDelete(null);
    setNotice({ kind: 'success', text: `“${pendingDelete.title}” was deleted.` });
  }

  async function handleAddCategory(): Promise<string | null> {
    setCategoriesOpen(true);
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    const result = await listContent({});
    if (result.ok) {
      setCategories(result.data.categories);
      setPosts(result.data.posts);
      return result.data.categories[result.data.categories.length - 1]?.id ?? null;
    }
    return null;
  }

  const heading =
    view === 'list' ? 'Content' : editing ? 'Edit post' : createType === 'event' ? 'New event' : 'New post';
  const subtitle =
    view === 'list'
      ? 'Oversee every blog post, event and announcement. Edit, unpublish or remove anything here.'
      : undefined;

  return (
    <>
      <SEO
        title={portal === 'content' ? 'Content desk | People Growth Africa' : 'Content | People Growth Africa'}
        description="Publish blog posts and events on peoplegrowthafrica.com."
      />

      <AdminShell
        portal={portal}
        title={heading}
        subtitle={subtitle}
        actions={
          view === 'list' ? (
            <>
              <button type="button" onClick={() => setCategoriesOpen(true)} className={secondaryButton}>
                Categories
              </button>
              <button type="button" onClick={() => openCreate('event')} className={secondaryButton}>
                + New event
              </button>
              <button type="button" onClick={() => openCreate('blog')} className={primaryButton}>
                + New post
              </button>
            </>
          ) : null
        }
      >
        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`mb-6 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 font-[family-name:var(--font-body)] text-[0.9rem] ${
              notice.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="cursor-pointer border-0 bg-transparent opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
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
            onCancel={() => {
              setView('list');
              setEditing(null);
              setEditorError(null);
            }}
            onSubmit={(draft) => void handleSubmit(draft)}
            onAddCategory={handleAddCategory}
            uploadCover={uploadCover}
          />
        ) : (
          <>
            <div className="mb-5 rounded-[16px] border border-charcoal/10 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.035)] sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(200px,0.7fr)_auto]">
                <div>
                  <label htmlFor="admin-search" className="sr-only">
                    Search posts
                  </label>
                  <input
                    id="admin-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search title or excerpt"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="admin-status" className="sr-only">
                    Filter by status
                  </label>
                  <select
                    id="admin-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="sr-only" id="admin-type-label">
                    Filter by type
                  </span>
                  <div
                    role="group"
                    aria-labelledby="admin-type-label"
                    className="flex h-full min-h-[46px] rounded-xl bg-cream/80 p-1"
                  >
                    {TYPE_OPTIONS.map((option) => {
                      const active = type === option.value;
                      return (
                        <button
                          key={option.value || 'all'}
                          type="button"
                          onClick={() => setType(option.value)}
                          aria-pressed={active}
                          className={`flex-1 cursor-pointer rounded-lg border-none px-3 py-2 font-[family-name:var(--font-body)] text-[0.85rem] font-semibold transition-colors ${
                            active
                              ? 'bg-deep-green text-white shadow-card'
                              : 'bg-transparent text-charcoal/60 hover:text-deep-green'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {loadError ? (
              <div
                role="alert"
                className="rounded-[16px] border border-red-200 bg-white p-8 text-center font-[family-name:var(--font-body)] text-red-600"
              >
                {loadError}
              </div>
            ) : loading ? (
              <div className="space-y-3" aria-busy="true">
                <p role="status" className="sr-only">
                  Loading posts…
                </p>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="rounded-[16px] border border-charcoal/10 bg-white p-5">
                    <div className="mb-3 h-5 w-1/3 rounded-full bg-charcoal/8" />
                    <div className="h-4 w-1/5 rounded-full bg-charcoal/6" />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-[16px] border border-charcoal/10 bg-white p-10 text-center">
                <h2 className="mb-2 font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal">
                  {search || status || type ? 'No posts match those filters' : 'No posts yet'}
                </h2>
                <p className="mb-6 font-[family-name:var(--font-body)] text-charcoal/60">
                  {search || status || type
                    ? 'Try clearing the search or filters.'
                    : 'Write your first post and it will appear on /blog or /events when you publish it.'}
                </p>
                {search || status || type ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setStatus('');
                      setType('');
                    }}
                    className={secondaryButton}
                  >
                    Clear filters
                  </button>
                ) : (
                  <button type="button" onClick={() => openCreate('blog')} className={primaryButton}>
                    Create the first post
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-3.5">
                {posts.map((post) => {
                  const category = post.category_id ? categoryById.get(post.category_id) : undefined;
                  const published = post.status === 'published';
                  return (
                    <li
                      key={post.id}
                      className="rounded-[16px] border border-charcoal/10 bg-white px-5 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.035)] sm:px-6"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2.5">
                            <Badge tone={published ? 'published' : 'draft'}>
                              {published ? 'Published' : 'Draft'}
                            </Badge>
                            <Badge tone={post.type === 'event' ? 'event' : 'blog'}>
                              {post.type === 'event' ? 'Event' : 'Blog'}
                            </Badge>
                            {category && <Badge tone="category">{category.name}</Badge>}
                            <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                              {published
                                ? formatDate(post.published_at ?? post.updated_at)
                                : 'Not published'}
                            </span>
                          </div>
                          <h2 className="break-words font-[family-name:var(--font-heading)] text-[1.25rem] font-semibold leading-snug text-charcoal sm:text-[1.35rem]">
                            {post.title}
                          </h2>
                          <p className="mt-1 break-all font-[family-name:var(--font-body)] text-[0.8rem] text-charcoal/45">
                            {livePostPath(post)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(post)}
                            className={published ? smallOutline : smallPrimary}
                          >
                            {published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(post)}
                            className={smallDanger}
                          >
                            Delete
                          </button>
                          {published && (
                            <Link
                              to={livePostPath(post)}
                              className="inline-flex min-h-[38px] items-center rounded-full px-3 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green underline decoration-brand-green/40 underline-offset-2 hover:bg-mint"
                            >
                              View
                            </Link>
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
      />

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null);
          }}
        >
          <div className="w-full max-w-[440px] rounded-[24px] bg-white p-7 shadow-elevated">
            <h2
              id="delete-title"
              className="mb-2 font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal"
            >
              Delete this post?
            </h2>
            <p className="mb-6 font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/65">
              “{pendingDelete.title}” will be removed from the site and the sitemap. This cannot be
              undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteBusy}
                className="flex-1 cursor-pointer rounded-full bg-red-600 px-6 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete post'}
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="cursor-pointer rounded-full border border-charcoal/15 bg-white px-6 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal hover:bg-cream"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'published' | 'draft' | 'event' | 'blog' | 'category';
  children: React.ReactNode;
}) {
  const tones = {
    published: 'bg-mint text-deep-green',
    draft: 'bg-[#EAE5DC] text-charcoal/55',
    event: 'bg-[#F8E6D6] text-[#A3571F]',
    blog: 'bg-[#F3EBDD] text-[#8B6A40]',
    category: 'bg-cream text-charcoal/60',
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 font-[family-name:var(--font-body)] text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const primaryButton =
  'inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full border border-deep-green bg-deep-green px-5 py-2.5 font-[family-name:var(--font-body)] text-[0.85rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta';

const secondaryButton =
  'inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full border border-charcoal/15 bg-white px-5 py-2.5 font-[family-name:var(--font-body)] text-[0.85rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint';

const inputClass =
  'w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal placeholder:text-charcoal/35 transition-colors focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/25';

const smallOutline =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-charcoal/15 bg-white px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-deep-green transition-colors hover:border-brand-green hover:bg-mint';

const smallPrimary =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-deep-green bg-deep-green px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-white transition-colors hover:border-terracotta hover:bg-terracotta';

const smallDanger =
  'inline-flex min-h-[38px] cursor-pointer items-center rounded-full border border-red-200 bg-white px-4 font-[family-name:var(--font-body)] text-[0.82rem] font-semibold text-red-600 transition-colors hover:bg-red-50';
