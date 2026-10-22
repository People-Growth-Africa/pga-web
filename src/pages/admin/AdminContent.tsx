import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import SEO from '../../components/SEO';
import { livePostPath } from '../../lib/published';
import CategoriesDialog from './CategoriesDialog';
import PostEditor from './PostEditor';
import {
  createPost,
  deletePost,
  listContent,
  setPostStatus,
  updatePost,
  type AdminCategory,
  type AdminPost,
  type PostDraft,
} from './contentClient';

/**
 * /admin/content - the manager's control panel.
 *
 * Three views share this file because they share state: the list, the editor
 * and the dialogs all need the same posts, the same categories and the same
 * "something changed" refetch. Splitting them would mean threading that state
 * through three components for no gain in clarity.
 *
 * Feedback is inline banners rather than a toast: the site has no notification
 * system to reuse, and a toast that disappears is the wrong shape for an error
 * a manager needs to read before retrying. Success notices say what happened
 * ("Published", "Draft saved") and stay until the next action.
 *
 * The role check lives in RequireAuth and, more importantly, on every endpoint
 * this calls. This page hides nothing that the server would otherwise allow.
 */

type View = 'list' | 'create' | 'edit';
type Notice = { kind: 'success' | 'error'; text: string } | null;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
] as const;

/**
 * The type switcher replaces the old category filter: a category is a topic on
 * a blog post now, not a content type, so filtering the list by one would answer
 * a question nobody is asking any more.
 */
const TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'blog', label: 'Blog' },
  { value: 'event', label: 'Events' },
] as const;

export default function AdminContent() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<AdminPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const searchRef = useRef(search);

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
    // Same shape as AuthContext's first load: fetch, then set state. The
    // cancellation only matters for the very first render - navigating away
    // before the list answers should not write state into an unmounted view.
    void (async () => {
      await refresh(controller.signal);
    })();
    return () => controller.abort();
  }, [refresh]);

  // Type a letter, wait, then filter. The query runs against the server's own
  // list so a search still works when the panel is holding a page of posts.
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

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

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
    // The dialog writes the category itself; the parent refetches, so wait one
    // tick for that refetch to land before reading the new id back.
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    const result = await listContent({});
    if (result.ok) {
      setCategories(result.data.categories);
      setPosts(result.data.posts);
      return result.data.categories[result.data.categories.length - 1]?.id ?? null;
    }
    return null;
  }

  return (
    <>
      <SEO
        title="Content Admin | People Growth Africa"
        description="Publish blog posts and events on peoplegrowthafrica.com."
      />

      <section className="min-h-screen bg-cream/50 pt-[130px] pb-20">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* ── Header ─────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <p className="font-[family-name:var(--font-body)] text-[0.78rem] font-semibold uppercase tracking-wider text-brand-green mb-2">
                Manager
              </p>
              <h1 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-charcoal">
                Content
              </h1>
              <p className="font-[family-name:var(--font-body)] text-charcoal/60 mt-2">
                Write a blog post or list an event, and publish it straight to the site without a
                developer.
              </p>
            </div>

            {view === 'list' && (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setCategoriesOpen(true)}
                  className="px-5 py-3 bg-white border border-charcoal/15 rounded-full font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal hover:bg-mint hover:border-brand-green transition-colors cursor-pointer"
                >
                  Manage categories
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setEditorError(null);
                    setView('create');
                  }}
                  className="px-6 py-3 bg-deep-green text-white rounded-full font-[family-name:var(--font-body)] text-sm font-semibold hover:bg-terracotta transition-colors cursor-pointer"
                >
                  ＋ New post
                </button>
              </div>
            )}
          </div>

          {notice && (
            <div
              role={notice.kind === 'error' ? 'alert' : 'status'}
              className={`mb-6 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 font-[family-name:var(--font-body)] text-[0.9rem] ${
                notice.kind === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <span>{notice.text}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className="bg-transparent border-none cursor-pointer opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Views ──────────────────────────────────── */}
          {view !== 'list' ? (
            <PostEditor
              key={editing?.id ?? 'new'}
              mode={view === 'create' ? 'create' : 'edit'}
              post={editing}
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
            />
          ) : (
            <>
              {/* ── Filters ──────────────────────────────── */}
              <div className="bg-white rounded-[20px] shadow-card p-4 sm:p-5 mb-7">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label htmlFor="admin-search" className="sr-only">
                      Search posts
                    </label>
                    <input
                      id="admin-search"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search title or excerpt…"
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
                      className="flex h-full rounded-xl bg-cream/80 p-1"
                    >
                      {TYPE_OPTIONS.map((option) => {
                        const active = type === option.value;
                        return (
                          <button
                            key={option.value || 'all'}
                            type="button"
                            onClick={() => setType(option.value)}
                            aria-pressed={active}
                            className={`flex-1 rounded-lg px-3 py-2 font-[family-name:var(--font-body)] text-[0.85rem] font-semibold transition-colors cursor-pointer border-none ${
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

              {/* ── List ─────────────────────────────────── */}
              {loadError ? (
                <div
                  role="alert"
                  className="bg-white rounded-[20px] shadow-card p-8 text-center font-[family-name:var(--font-body)] text-red-600"
                >
                  {loadError}
                </div>
              ) : loading ? (
                <div className="space-y-3" aria-busy="true">
                  <p role="status" className="sr-only">
                    Loading posts…
                  </p>
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="bg-white rounded-[20px] shadow-card p-5">
                      <div className="h-5 w-1/3 rounded-full bg-charcoal/8 mb-3" />
                      <div className="h-4 w-1/5 rounded-full bg-charcoal/6" />
                    </div>
                  ))}
                </div>
              ) : posts.length === 0 ? (
                <div className="bg-white rounded-[20px] shadow-card p-10 text-center">
                  <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-charcoal mb-2">
                    {search || status || type ? 'No posts match those filters' : 'No posts yet'}
                  </h2>
                  <p className="font-[family-name:var(--font-body)] text-charcoal/60 mb-6">
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
                      className="px-6 py-3 bg-white border border-charcoal/15 rounded-full font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal hover:bg-cream transition-colors cursor-pointer"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setView('create')}
                      className="px-6 py-3 bg-deep-green text-white rounded-full font-[family-name:var(--font-body)] text-sm font-semibold hover:bg-terracotta transition-colors cursor-pointer"
                    >
                      Create the first post
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-3">
                  {posts.map((post) => {
                    const category = post.category_id
                      ? categoryById.get(post.category_id)
                      : undefined;
                    const published = post.status === 'published';
                    return (
                      <li
                        key={post.id}
                        className="bg-white rounded-[20px] shadow-card p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2.5 mb-2">
                            <span
                              className={`inline-flex px-3 py-1 rounded-full font-[family-name:var(--font-body)] text-[0.7rem] font-semibold uppercase tracking-wider ${
                                published ? 'bg-deep-green text-white' : 'bg-cream text-charcoal/55'
                              }`}
                            >
                              {published ? 'Published' : 'Draft'}
                            </span>
                            <span className="inline-flex px-3 py-1 bg-terracotta/10 text-terracotta font-[family-name:var(--font-body)] text-[0.7rem] font-semibold rounded-full uppercase tracking-wider">
                              {post.type === 'event' ? 'Event' : 'Blog'}
                            </span>
                            {category && (
                              <span className="inline-flex px-3 py-1 bg-mint text-deep-green font-[family-name:var(--font-body)] text-[0.7rem] font-semibold rounded-full uppercase tracking-wider">
                                {category.name}
                              </span>
                            )}
                            <span className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45">
                              {formatDate(post.published_at ?? post.updated_at)}
                            </span>
                          </div>
                          <h2 className="font-[family-name:var(--font-heading)] text-[1.05rem] font-semibold text-charcoal leading-snug break-words">
                            {post.title}
                          </h2>
                          <p className="font-[family-name:var(--font-body)] text-[0.78rem] text-charcoal/45 mt-1 break-all">
                            {livePostPath(post)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <ActionButton
                            onClick={() => void handleToggleStatus(post)}
                            tone={published ? 'quiet' : 'primary'}
                          >
                            {published ? 'Unpublish' : 'Publish'}
                          </ActionButton>
                          <ActionButton
                            onClick={() => {
                              setEditing(post);
                              setEditorError(null);
                              setView('edit');
                            }}
                            tone="quiet"
                          >
                            Edit
                          </ActionButton>
                          <ActionButton onClick={() => setPendingDelete(post)} tone="danger">
                            Delete
                          </ActionButton>
                          {published && (
                            <Link
                              to={livePostPath(post)}
                              className="px-4 py-2 rounded-full font-[family-name:var(--font-body)] text-[0.82rem] font-medium text-deep-green hover:bg-mint transition-colors border border-transparent"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      <CategoriesDialog
        open={categoriesOpen}
        categories={categories}
        onClose={() => setCategoriesOpen(false)}
        onChanged={() => {
          void refresh();
        }}
      />

      {/* ── Delete confirmation ──────────────────────── */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 backdrop-blur-sm p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null);
          }}
        >
          <div className="bg-white w-full max-w-[440px] rounded-[24px] shadow-elevated p-7">
            <h2
              id="delete-title"
              className="font-[family-name:var(--font-heading)] text-lg font-semibold text-charcoal mb-2"
            >
              Delete this post?
            </h2>
            <p className="font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal/65 mb-6">
              “{pendingDelete.title}” will be removed from the site and the sitemap. This cannot be
              undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteBusy}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-full font-[family-name:var(--font-body)] text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete post'}
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-6 py-3 bg-white border border-charcoal/15 rounded-full font-[family-name:var(--font-body)] text-sm font-semibold text-charcoal hover:bg-cream transition-colors cursor-pointer"
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

function ActionButton({
  onClick,
  tone,
  children,
}: {
  onClick: () => void;
  tone: 'primary' | 'quiet' | 'danger';
  children: React.ReactNode;
}) {
  const tones = {
    primary: 'bg-deep-green text-white hover:bg-terracotta',
    quiet: 'bg-cream text-charcoal hover:bg-mint hover:text-deep-green',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full font-[family-name:var(--font-body)] text-[0.82rem] font-medium transition-colors border-none cursor-pointer ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const inputClass =
  'w-full rounded-xl border border-charcoal/15 bg-white px-4 py-3 font-[family-name:var(--font-body)] text-[0.9rem] text-charcoal placeholder:text-charcoal/35 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/25 transition-colors';
